/**
 * Service Worker - Main Orchestrator
 * Coordinates email fetching, AI parsing, calendar creation, and MongoDB sync
 */

import { POLL_INTERVAL_MINUTES, ALARMS, NOTIFICATIONS, STORAGE_KEYS } from '../config/constants.js';
import { info, error as logError, warn, logLifecycle, group, startTimer } from '../utils/logger.js';
import { initializeAuth, authenticate, ensureAuthenticated, getGoogleUserId, isSetupComplete } from './auth-manager.js';
import { fetchNewEmails, isEmailProcessed, markEmailAsProcessed, updateLastPollTime, getThread, extractThreadParticipants } from './gmail-client.js';
import { extractScheduleFromEmail } from './ai-parser.js';
import { createCalendarEventWithRetry, updateCalendarAttendees } from './calendar-client.js';
import { syncEventWithRetry, updateEventSyncStatus, getEvents, getEventParticipants, getEventsNeedingThreadSync, updateEventThread, syncEventParticipants } from './supabase-sync.js';
import { createEvent } from '../models/event-schema.js';
import { syncToEmailParser, syncToATMS, syncLocalStorageWithBackend, getEmailsFromParser, getEventsFromATMS } from './email-parser-sync.js';

/**
 * Extension installed/updated
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  logLifecycle(`Extension installed/updated: ${details.reason}`);
  
  try {
    // Set up polling alarm
    await setupAlarm();
    
    // Initialize authentication (silent, no interaction)
    const authResult = await initializeAuth();
    
    if (authResult.success) {
      info('Extension ready and authenticated');
      
      // Run initial email check
      await processNewEmails();
    } else {
      warn('Extension installed but authentication not complete. User setup required.');
      
      // Show notification to prompt user setup
      if (details.reason === 'install') {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Email Calendar Agent Installed',
          message: 'Please click the extension icon to complete setup.'
        });
      }
    }
  } catch (err) {
    logError('Error during extension initialization', err);
  }
});

/**
 * Extension startup (browser/Chrome restart)
 */
chrome.runtime.onStartup.addListener(async () => {
  logLifecycle('Extension starting up (browser restart)');
  
  try {
    // Ensure alarm is set
    await setupAlarm();
    
    // Re-authenticate
    const authResult = await initializeAuth();
    
    if (authResult.success) {
      info('Extension authenticated on startup');
    } else {
      warn('Authentication failed on startup');
    }
  } catch (err) {
    logError('Error during extension startup', err);
  }
});

/**
 * Set up periodic alarm for polling emails
 */
async function setupAlarm() {
  // Clear existing alarms
  await chrome.alarms.clear(ALARMS.CHECK_EMAILS);
  await chrome.alarms.clear(ALARMS.SYNC_THREADS);

  // Create email polling alarm
  await chrome.alarms.create(ALARMS.CHECK_EMAILS, {
    periodInMinutes: POLL_INTERVAL_MINUTES,
    delayInMinutes: 1 // Start first check after 1 minute
  });

  // Create thread sync alarm (every 5 minutes)
  await chrome.alarms.create(ALARMS.SYNC_THREADS, {
    periodInMinutes: 5,
    delayInMinutes: 2 // Offset from email check
  });

  info(`Alarms set: emails every ${POLL_INTERVAL_MINUTES} min, threads every 5 min`);
}

/**
 * Handle alarm triggers
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARMS.CHECK_EMAILS) {
    info('Alarm triggered: checking for new emails');
    await processNewEmails();
  } else if (alarm.name === ALARMS.SYNC_THREADS) {
    info('Alarm triggered: syncing Gmail threads');
    await syncGmailThreads();
  }
});

/**
 * Main email processing function
 * This is the core workflow that runs on each poll
 */
export async function processNewEmails() {
  const timer = startTimer('processNewEmails');
  
  try {
    // Check if extension is enabled
    const { extensionEnabled = true } = await chrome.storage.local.get(STORAGE_KEYS.EXTENSION_ENABLED);
    if (!extensionEnabled) {
      info('Extension is disabled, skipping email processing');
      return;
    }
    
    // Ensure authenticated
    const authResult = await ensureAuthenticated();
    if (!authResult.success) {
      warn('Not authenticated, skipping email processing');
      return;
    }
    
    const googleToken = authResult.googleToken;
    const userId = await getGoogleUserId();
    
    if (!userId) {
      throw new Error('Failed to get Google user ID');
    }
    
    await group('Email Processing Cycle', async () => {
      // Step 1: Fetch new emails from Gmail
      info('Fetching new emails from Gmail...');
      const emails = await fetchNewEmails(googleToken);
      
      if (!emails || emails.length === 0) {
        info('No new emails to process');
        await updateLastPollTime();
        return;
      }
      
      info(`Processing ${emails.length} emails`);
      
      // Step 2: Process each email
      let processedCount = 0;
      let eventsCreated = 0;
      
      for (const email of emails) {
        try {
          // Check if already processed
          if (await isEmailProcessed(email.id)) {
            info(`Email ${email.id} already processed, skipping`);
            continue;
          }
          
          // Process single email
          const created = await processSingleEmail(email, googleToken, userId);
          
          if (created) {
            eventsCreated++;
          }
          
          processedCount++;
          
          // Mark as processed
          await markEmailAsProcessed(email.id);
          
        } catch (err) {
          logError(`Failed to process email ${email.id}`, err);
          // Continue with next email even if this one fails
          
          // Still mark as processed to avoid retry loops
          await markEmailAsProcessed(email.id);
        }
      }
      
      info(`Processing complete: ${processedCount} emails processed, ${eventsCreated} events created`);
      
      // Update last poll time
      await updateLastPollTime();
    });
    
  } catch (err) {
    logError('Error in email processing cycle', err);
  } finally {
    timer();
  }
}

/**
 * Sync Gmail threads for tracked events
 * Runs every 5 minutes via alarm
 */
export async function syncGmailThreads() {
  const timer = startTimer('syncGmailThreads');

  try {
    // Check if extension is enabled
    const { extensionEnabled = true } = await chrome.storage.local.get(STORAGE_KEYS.EXTENSION_ENABLED);
    if (!extensionEnabled) {
      info('Extension is disabled, skipping thread sync');
      return;
    }

    // Ensure authenticated
    const authResult = await ensureAuthenticated();
    if (!authResult.success) {
      warn('Not authenticated, skipping thread sync');
      return;
    }

    const googleToken = authResult.googleToken;

    await group('Thread Sync Cycle', async () => {
      // Get events that need thread polling
      const events = await getEventsNeedingThreadSync(5);

      if (!events || events.length === 0) {
        info('No events need thread sync');
        return;
      }

      info(`Syncing ${events.length} event threads`);

      let updatedCount = 0;

      for (const event of events) {
        try {
          // Get thread from Gmail
          const thread = await getThread(googleToken, event.thread_id);

          // Extract current participants
          const currentParticipants = extractThreadParticipants(thread);

          // Get existing participants from Supabase
          const existingParticipants = await getEventParticipants(event.id);

          // Check if participants changed
          const participantsChanged = hasParticipantsChanged(
            existingParticipants,
            currentParticipants
          );

          if (participantsChanged) {
            info(`Thread ${event.thread_id} participants changed, updating event`);

            // Update participants in Supabase
            await syncEventParticipants(event.id, currentParticipants);

            // Update Google Calendar attendees
            if (event.calendar_event_id) {
              await updateCalendarAttendees(
                googleToken,
                event.calendar_event_id,
                currentParticipants
              );
            }

            updatedCount++;
          }

          // Update last_thread_sync timestamp
          await updateEventThread(event.email_id, event.thread_id);

        } catch (err) {
          logError(`Failed to sync thread ${event.thread_id}`, err);
          // Continue with next thread
        }
      }

      info(`Thread sync complete: ${updatedCount} events updated`);
    });

  } catch (err) {
    logError('Error in thread sync cycle', err);
  } finally {
    timer();
  }
}

/**
 * Check if participants array has changed
 * @param {Array} existing - Existing participants
 * @param {Array} current - Current participants
 * @returns {boolean} True if changed
 */
function hasParticipantsChanged(existing, current) {
  if (existing.length !== current.length) return true;

  const existingEmails = new Set(existing.map(p => p.email.toLowerCase()));
  const currentEmails = new Set(current.map(p => p.email.toLowerCase()));

  for (const email of currentEmails) {
    if (!existingEmails.has(email)) return true;
  }

  return false;
}

/**
 * Process a single email
 * @param {Object} email - Email object
 * @param {string} googleToken - Google OAuth token
 * @param {string} userId - Google user ID
 * @returns {Promise<boolean>} True if event was created
 */
async function processSingleEmail(email, googleToken, userId) {
  info(`Processing email: ${email.subject}`);
  
  try {
    // Step 1: Extract schedule data using AI
    const aiResult = await extractScheduleFromEmail(email);
    
    // Check if it's a logistics event
    if (!aiResult.isLogisticsEvent) {
      info('AI determined this is not a logistics event');
      return false;
    }
    
    // Check if we have a start date/time
    if (!aiResult.startDateTime) {
      warn('Logistics event detected but no start time found');
      return false;
    }
    
    info(`Logistics event detected: ${aiResult.title} (${aiResult.eventType})`);
    
    // Step 2: Create event data object
    const eventData = createEvent(email, aiResult, userId);
    
    // Step 3: Create calendar event
    info('Creating calendar event...');
    const calendarEventId = await createCalendarEventWithRetry(googleToken, eventData);
    
    if (!calendarEventId) {
      throw new Error('Failed to create calendar event');
    }
    
    info(`Calendar event created: ${calendarEventId}`);
    
    // Update event data with calendar ID
    eventData.calendarEventId = calendarEventId;
    eventData.calendarSyncStatus = 'synced';
    eventData.calendarSyncDate = new Date();
    
    // Step 4: Sync to MongoDB (existing)
    info('Syncing to MongoDB...');
    await syncEventWithRetry(eventData);
    
    // Step 5: Sync to Email Parser Backend
    const emailParserResult = await syncToEmailParser(email, aiResult, eventData, userId);
    if (emailParserResult.success) {
      info('Email synced to parser backend:', emailParserResult.rawId);
    } else {
      warn('Email parser sync failed:', emailParserResult.error);
    }
    
    // Step 6: Sync to ATMS Backend
    const atmsResult = await syncToATMS(eventData, userId);
    if (atmsResult.success) {
      info('Event synced to ATMS backend:', atmsResult.atmsEventId);
    } else {
      warn('ATMS sync failed:', atmsResult.error);
    }
    
    info('Event fully processed and synced to all backends');
    
    // Step 5: Show notification (if enabled)
    if (NOTIFICATIONS.ENABLED && NOTIFICATIONS.SHOW_ON_EVENT_CREATED) {
      showEventCreatedNotification(aiResult.title, aiResult.startDateTime);
    }
    
    return true;
    
  } catch (err) {
    logError('Failed to process email', err);
    
    // Show error notification if enabled
    if (NOTIFICATIONS.ENABLED && NOTIFICATIONS.SHOW_ON_ERROR) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Email Calendar Agent - Error',
        message: `Failed to process email: ${err.message}`
      });
    }
    
    throw err;
  }
}

/**
 * Show notification when event is created
 * @param {string} title - Event title
 * @param {string} startDateTime - Start date/time
 */
function showEventCreatedNotification(title, startDateTime) {
  const date = new Date(startDateTime);
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: 'Event Added to Calendar',
    message: `${title}\n${dateStr}`
  });
}

/**
 * Build comprehensive event description from extracted data
 * @param {Object} eventData - Event data with all extracted fields
 * @returns {string} Formatted description for calendar event
 */
function buildEventDescription(eventData) {
  const sections = [];

  // User-provided description (if any)
  if (eventData.description && eventData.description.trim()) {
    sections.push(eventData.description.trim());
    sections.push('\n' + '─'.repeat(50) + '\n');
  }

  // SET INFORMATION (Primary performance details)
  if (eventData.extractedData?.stages && eventData.extractedData.stages.length > 0) {
    const stage = eventData.extractedData.stages[0];
    if (stage.sets && stage.sets.length > 0) {
      const set = stage.sets[0];
      sections.push('🎵 SET INFORMATION');
      if (stage.stage_name) sections.push(`Stage: ${stage.stage_name}`);
      if (set.set_date) sections.push(`Date: ${set.set_date}`);
      if (set.start_time && set.end_time) {
        sections.push(`Time: ${set.start_time} - ${set.end_time}`);
      } else if (set.start_time) {
        sections.push(`Start Time: ${set.start_time}`);
      }
      if (set.soundcheck_time) sections.push(`Soundcheck: ${set.soundcheck_time}`);
      if (set.crew_list) sections.push(`Crew: ${set.crew_list}`);
      if (set.guest_list_spots) sections.push(`Guest List: ${set.guest_list_spots} spots`);
      if (set.technical_notes) sections.push(`Tech Notes: ${set.technical_notes}`);
      if (set.hospitality_notes) sections.push(`Hospitality: ${set.hospitality_notes}`);
      sections.push('');
    }
  }

  // VENUE INFORMATION
  if (eventData.extractedData?.venue && hasContent(eventData.extractedData.venue)) {
    const venue = eventData.extractedData.venue;
    sections.push('📍 VENUE');
    if (venue.venue_name) sections.push(`Name: ${venue.venue_name}`);
    if (venue.venue_address) sections.push(`Address: ${venue.venue_address}`);
    if (venue.city || venue.state) {
      const location = [venue.city, venue.state].filter(Boolean).join(', ');
      sections.push(`Location: ${location}`);
    }
    if (venue.country) sections.push(`Country: ${venue.country}`);
    sections.push('');
  }

  // EVENT DATES & TIMEZONE
  if (eventData.extractedData?.dates && hasContent(eventData.extractedData.dates)) {
    const dates = eventData.extractedData.dates;
    sections.push('📅 EVENT DATES');
    if (dates.start_date) sections.push(`Start: ${dates.start_date}`);
    if (dates.end_date) sections.push(`End: ${dates.end_date}`);
    if (dates.timezone) sections.push(`Timezone: ${dates.timezone}`);
    sections.push('');
  }

  // IMPORTANT DEADLINES
  if (eventData.extractedData?.important_deadlines && eventData.extractedData.important_deadlines.length > 0) {
    sections.push('⏰ IMPORTANT DEADLINES');
    eventData.extractedData.important_deadlines.forEach(deadline => {
      sections.push(`• ${deadline.date}: ${deadline.description}`);
    });
    sections.push('');
  }

  // CONTACTS
  if (eventData.extractedData?.contacts && eventData.extractedData.contacts.length > 0) {
    sections.push('👤 CONTACTS');
    eventData.extractedData.contacts.forEach(contact => {
      let contactLine = `• ${contact.name}`;
      if (contact.role) contactLine += ` (${contact.role})`;
      sections.push(contactLine);
      if (contact.email) sections.push(`  Email: ${contact.email}`);
      if (contact.phone) sections.push(`  Phone: ${contact.phone}`);
      if (contact.company) sections.push(`  Company: ${contact.company}`);
    });
    sections.push('');
  }

  // EVENT LINKS
  if (eventData.extractedData?.event_links && eventData.extractedData.event_links.length > 0) {
    sections.push('🔗 EVENT LINKS');
    eventData.extractedData.event_links.forEach(link => {
      sections.push(`• ${link.description}: ${link.url}`);
    });
    sections.push('');
  }

  // LOGISTICS NOTES
  if (eventData.extractedData?.logistics_notes && eventData.extractedData.logistics_notes.trim()) {
    sections.push('📝 LOGISTICS NOTES');
    sections.push(eventData.extractedData.logistics_notes.trim());
    sections.push('');
  }

  // ARTIST INFORMATION
  if (eventData.extractedData?.artist_information && hasContent(eventData.extractedData.artist_information)) {
    const artist = eventData.extractedData.artist_information;
    sections.push('🎤 ARTIST INFORMATION');
    if (artist.artist_name) sections.push(`Artist: ${artist.artist_name}`);
    if (artist.email) sections.push(`Email: ${artist.email}`);
    if (artist.dos_contact_phone) sections.push(`Day-of-Show Phone: ${artist.dos_contact_phone}`);
    if (artist.genre) sections.push(`Genre: ${artist.genre}`);
    sections.push('');
  }

  // ORGANIZER
  if (eventData.extractedData?.organizer && hasContent(eventData.extractedData.organizer)) {
    const org = eventData.extractedData.organizer;
    sections.push('🏢 ORGANIZER');
    if (org.name) sections.push(`Name: ${org.name}`);
    if (org.email) sections.push(`Email: ${org.email}`);
    if (org.phone) sections.push(`Phone: ${org.phone}`);
    sections.push('');
  }

  // Footer
  sections.push('─'.repeat(50));
  sections.push('✨ Created with ATMS Extension');

  return sections.join('\n');
}

/**
 * Check if an object has any meaningful content
 */
function hasContent(obj) {
  if (!obj || typeof obj !== 'object') return false;
  return Object.values(obj).some(val => val !== null && val !== undefined && val !== '');
}

/**
 * Handle extension icon click
 * Could show status or trigger manual sync
 */
chrome.action.onClicked.addListener(async () => {
  logLifecycle('Extension icon clicked');
  
  try {
    // Check if setup is complete
    const setupComplete = await isSetupComplete();
    
    if (!setupComplete) {
      // Trigger interactive authentication
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Setup Required',
        message: 'Starting authentication flow...'
      });
      
      const result = await authenticate(true);
      
      if (result.success) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Setup Complete',
          message: 'Extension is now running. Will check emails every 5 minutes.'
        });

        // Notify panel to refresh user profile
        chrome.runtime.sendMessage({
          type: 'AUTH_STATE_CHANGED',
          authenticated: true
        }).catch(() => {
          // Panel might not be open, that's okay
        });
      } else {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Setup Failed',
          message: `Error: ${result.error}`
        });
      }
    } else {
      // Trigger manual sync
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Manual Sync',
        message: 'Checking for new emails...'
      });
      
      await processNewEmails();
      
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Sync Complete',
        message: 'Finished checking emails'
      });
    }
  } catch (err) {
    logError('Error handling icon click', err);
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Error',
      message: err.message
    });
  }
});

/**
 * Handle messages from popup or content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const action = message.type || message.action;
  
  (async () => {
    try {
      switch (action) {
        case 'processEmails':
          await processNewEmails();
          sendResponse({ success: true });
          break;
          
        case 'getStatus':
        case 'GET_STATUS':
          const setupComplete = await isSetupComplete();
          const stats = await getStats();
          sendResponse({
            success: true,
            setupComplete,
            stats
          });
          break;
          
        case 'toggleEnabled':
          await toggleEnabled();
          sendResponse({ success: true });
          break;
        
        case 'SEARCH_EMAIL_BY_SUBJECT':
          // Search for email by subject/sender to get valid threadId
          // Used when opening email from search results (search IDs are not valid thread IDs)
          try {
            const auth = await ensureAuthenticated();
            if (!auth.success) {
              throw new Error('Not authenticated');
            }

            const { subject, sender } = message;
            if (!subject) {
              throw new Error('No subject provided for search');
            }

            info('Searching for email with subject:', subject);
            if (sender) {
              info('From sender:', sender);
            }

            // Build Gmail search query
            // Use quotes for exact subject match, extract email from sender if present
            let query = `subject:"${subject}"`;
            if (sender) {
              const senderEmail = sender.match(/<(.+?)>/)?.[1] || sender;
              query += ` from:${senderEmail}`;
            }

            info('Gmail search query:', query);

            // Search using messages.list API
            const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=1`;
            const searchResponse = await fetch(searchUrl, {
              headers: { 'Authorization': `Bearer ${auth.googleToken}` }
            });

            if (!searchResponse.ok) {
              const errorBody = await searchResponse.text();
              logError('Gmail search error:', {
                status: searchResponse.status,
                body: errorBody
              });
              throw new Error(`Gmail search failed: ${searchResponse.status}`);
            }

            const searchData = await searchResponse.json();

            if (!searchData.messages || searchData.messages.length === 0) {
              throw new Error('No messages found matching search criteria');
            }

            const foundMessage = searchData.messages[0];
            const validThreadId = foundMessage.threadId;

            info('Found valid threadId:', validThreadId);

            sendResponse({
              success: true,
              threadId: validThreadId
            });
          } catch (searchErr) {
            logError('Search email error:', searchErr);
            sendResponse({ success: false, error: searchErr.message });
          }
          break;

        case 'FETCH_FULL_EMAIL':
          // Fetch complete email data from Gmail API (subject, body, links, everything!)
          try {
            const auth = await ensureAuthenticated();
            if (!auth.success) {
              throw new Error('Not authenticated');
            }

            const { threadId } = message;
            if (!threadId) {
              throw new Error('No threadId provided');
            }

            info('Fetching full email for threadId:', threadId);

            // Fetch thread with full message format from Gmail API
            const response = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
              {
                headers: { 'Authorization': `Bearer ${auth.googleToken}` }
              }
            );

            if (!response.ok) {
              const errorBody = await response.text();
              logError('Gmail API error response:', {
                status: response.status,
                statusText: response.statusText,
                body: errorBody,
                url: `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`
              });
              throw new Error(`Gmail API error: ${response.status} - ${errorBody}`);
            }

            const threadData = await response.json();

            if (!threadData.messages || threadData.messages.length === 0) {
              throw new Error('No messages found in thread');
            }

            // Get the latest message (last in array)
            const latestMessage = threadData.messages[threadData.messages.length - 1];

            // Extract headers
            const headers = {};
            if (latestMessage.payload && latestMessage.payload.headers) {
              latestMessage.payload.headers.forEach(h => {
                headers[h.name.toLowerCase()] = h.value;
              });
            }

            // Extract links and body text from HTML
            const links = [];
            const seenUrls = new Set();
            let bodyHtml = '';
            let bodyText = '';

            function extractFromPart(part) {
              if (part.mimeType === 'text/html' && part.body?.data) {
                // Decode base64url
                const html = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
                bodyHtml += html;

                // Extract links
                const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
                let match;

                while ((match = linkRegex.exec(html)) !== null) {
                  const url = match[1];
                  const text = match[2].replace(/<[^>]+>/g, '').trim();

                  if (url && !url.startsWith('mailto:') && !url.startsWith('#') && !seenUrls.has(url)) {
                    seenUrls.add(url);
                    links.push({ url, text: text || url });
                  }
                }
              }

              if (part.mimeType === 'text/plain' && part.body?.data) {
                // Decode base64url
                bodyText += atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
              }

              // Recursively process multipart
              if (part.parts) {
                part.parts.forEach(extractFromPart);
              }
            }

            if (latestMessage.payload) {
              extractFromPart(latestMessage.payload);
            }

            // Prefer plain text body, fallback to stripped HTML
            let finalBody = bodyText;
            if (!finalBody && bodyHtml) {
              // Strip HTML tags to get text
              finalBody = bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            }

            // Append links to body
            if (links.length > 0) {
              const linksList = links.map(link => `${link.text}: ${link.url}`).join('\n');
              finalBody += '\n\n=== LINKS EXTRACTED FROM EMAIL ===\n' + linksList;
            }

            const emailData = {
              subject: headers.subject || 'No Subject',
              sender: headers.from || 'Unknown',
              senderEmail: headers.from?.match(/<(.+?)>/)?.[1] || headers.from || '',
              body: finalBody.substring(0, 12000), // Limit to 12K chars
              messageId: latestMessage.id,
              threadId: threadId,
              date: headers.date || new Date().toISOString()
            };

            info('Email fetched successfully:', {
              subject: emailData.subject,
              bodyLength: emailData.body.length,
              linksFound: links.length
            });

            sendResponse({
              success: true,
              email: emailData,
              links: links.length
            });
          } catch (fetchErr) {
            logError('Fetch full email error:', fetchErr);
            sendResponse({ success: false, error: fetchErr.message });
          }
          break;

        case 'FETCH_EMAIL_HTML':
          // Fetch full email HTML via Gmail API to extract links
          try {
            const auth = await ensureAuthenticated();
            if (!auth.success) {
              throw new Error('Not authenticated');
            }

            let { messageId } = message;
            if (!messageId) {
              throw new Error('No messageId provided');
            }

            // Strip Gmail prefixes like #msg-f:, #msg-a:, etc.
            messageId = messageId.replace(/^#msg-[a-z]:/i, '');

            info('Fetching email HTML for messageId:', messageId);

            // Fetch full message from Gmail API
            const response = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
              {
                headers: { 'Authorization': `Bearer ${auth.googleToken}` }
              }
            );

            if (!response.ok) {
              throw new Error(`Gmail API error: ${response.status}`);
            }

            const emailData = await response.json();

            // Extract links from HTML parts
            const links = [];

            function extractLinksFromPart(part) {
              if (part.mimeType === 'text/html' && part.body?.data) {
                // Decode base64url
                const html = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));

                // Parse links from HTML
                const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
                let match;

                while ((match = linkRegex.exec(html)) !== null) {
                  const url = match[1];
                  const text = match[2].replace(/<[^>]+>/g, '').trim(); // Strip inner HTML tags

                  // Filter out mailto links and empty links
                  if (url && !url.startsWith('mailto:') && !url.startsWith('#')) {
                    links.push({ url, text: text || url });
                  }
                }
              }

              // Recursively process multipart
              if (part.parts) {
                part.parts.forEach(extractLinksFromPart);
              }
            }

            if (emailData.payload) {
              extractLinksFromPart(emailData.payload);
            }

            info('Extracted', links.length, 'links from email HTML');
            sendResponse({ success: true, links });
          } catch (fetchErr) {
            logError('Fetch email HTML error:', fetchErr);
            sendResponse({ success: false, error: fetchErr.message, links: [] });
          }
          break;

        case 'EXTRACT_EVENT':
          // Extract event from email using AI
          try {
            info('Extracting event from email...');
            const eventDetails = await extractScheduleFromEmail(message.email);
            sendResponse({ success: true, eventDetails });
          } catch (extractErr) {
            logError('Extract event error:', extractErr);
            sendResponse({ success: false, error: extractErr.message });
          }
          break;
        
        case 'CREATE_EVENT':
          // Create calendar event
          try {
            const auth = await ensureAuthenticated();
            if (!auth.success) {
              throw new Error('Not authenticated');
            }
            
            const { eventData } = message;
            
            // Parse date for all-day event
            const dateStr = eventData.date || new Date().toISOString().split('T')[0];

            // Calculate end date (next day for all-day events)
            const [year, month, day] = dateStr.split('-').map(Number);
            const startDate = new Date(year, month - 1, day);
            const endDate = new Date(year, month - 1, day + 1);

            const formatDateForAllDay = (date) => {
              const y = date.getFullYear();
              const m = String(date.getMonth() + 1).padStart(2, '0');
              const d = String(date.getDate()).padStart(2, '0');
              return `${y}-${m}-${d}`;
            };

            // Build comprehensive description from all extracted data
            const description = buildEventDescription(eventData);

            const calendarEvent = {
              summary: eventData.title || 'New Event',
              description: description,
              location: eventData.location || undefined,
              start: {
                date: formatDateForAllDay(startDate)
              },
              end: {
                date: formatDateForAllDay(endDate)
              },
              attendees: eventData.attendees?.map(email => ({ email })) || []
            };
            
            info('Creating calendar event:', calendarEvent.summary);
            
            const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${auth.googleToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(calendarEvent)
            });
            
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              throw new Error(errorData.error?.message || `Calendar API error: ${response.status}`);
            }
            
            const createdEvent = await response.json();
            info('Event created:', createdEvent.id);
            
            sendResponse({ success: true, eventId: createdEvent.id });
          } catch (createErr) {
            logError('Create event error:', createErr);
            sendResponse({ success: false, error: createErr.message });
          }
          break;
        
        case 'GET_UPCOMING_EVENTS':
          // Get upcoming calendar events
          try {
            const auth = await ensureAuthenticated();
            if (!auth.success) {
              throw new Error('Not authenticated');
            }
            
            const now = new Date();
            const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            
            const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&timeMax=${thirtyDays.toISOString()}&maxResults=20&orderBy=startTime&singleEvents=true`;
            
            const response = await fetch(url, {
              headers: { 'Authorization': `Bearer ${auth.googleToken}` }
            });
            
            if (!response.ok) {
              throw new Error(`Calendar API error: ${response.status}`);
            }
            
            const data = await response.json();
            const events = (data.items || []).map(e => ({
              id: e.id,
              title: e.summary || 'Untitled',
              start: e.start?.dateTime || e.start?.date,
              location: e.location
            }));
            
            sendResponse({ success: true, events });
          } catch (eventsErr) {
            logError('Get events error:', eventsErr);
            sendResponse({ success: false, error: eventsErr.message, events: [] });
          }
          break;
        
        case 'GET_USER_PROFILE':
          // Get user profile
          try {
            const auth = await ensureAuthenticated();
            if (!auth.success) {
              sendResponse({ success: false, error: 'Not authenticated' });
              break;
            }
            
            const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
              headers: { 'Authorization': `Bearer ${auth.googleToken}` }
            });
            
            if (response.ok) {
              const profile = await response.json();
              sendResponse({ success: true, profile });
            } else {
              sendResponse({ success: false, error: 'Failed to get profile' });
            }
          } catch (profileErr) {
            logError('Get profile error:', profileErr);
            sendResponse({ success: false, error: profileErr.message });
          }
          break;
        
        case 'AUTHENTICATE':
          // Trigger interactive authentication
          try {
            const result = await authenticate(true);
            sendResponse(result);
          } catch (authErr) {
            sendResponse({ success: false, error: authErr.message });
          }
          break;
        
        case 'GET_PARSED_EMAILS':
          // Get emails from email parser backend
          try {
            const auth = await ensureAuthenticated();
            if (!auth.success) {
              sendResponse({ success: false, error: 'Not authenticated' });
              break;
            }
            
            const userId = await getGoogleUserId();
            const emails = await getEmailsFromParser(userId, message.filters);
            sendResponse({ success: true, emails });
          } catch (emailsErr) {
            logError('Get parsed emails error:', emailsErr);
            sendResponse({ success: false, error: emailsErr.message, emails: [] });
          }
          break;
        
        case 'GET_ATMS_EVENTS':
          // Get events from ATMS backend
          try {
            const auth = await ensureAuthenticated();
            if (!auth.success) {
              sendResponse({ success: false, error: 'Not authenticated' });
              break;
            }
            
            const userId = await getGoogleUserId();
            const events = await getEventsFromATMS(userId);
            sendResponse({ success: true, events });
          } catch (atmsErr) {
            logError('Get ATMS events error:', atmsErr);
            sendResponse({ success: false, error: atmsErr.message, events: [] });
          }
          break;
        
        case 'SYNC_WITH_BACKEND':
          // Sync local storage with backend data
          try {
            const auth = await ensureAuthenticated();
            if (!auth.success) {
              sendResponse({ success: false, error: 'Not authenticated' });
              break;
            }

            const userId = await getGoogleUserId();
            const syncResult = await syncLocalStorageWithBackend(userId);
            sendResponse(syncResult);
          } catch (syncErr) {
            logError('Sync with backend error:', syncErr);
            sendResponse({ success: false, error: syncErr.message });
          }
          break;

        case 'GET_SUPABASE_EVENTS':
          // Get events from Supabase
          try {
            const auth = await ensureAuthenticated();
            if (!auth.success) {
              sendResponse({ success: false, error: 'Not authenticated', events: [] });
              break;
            }

            const userId = await getGoogleUserId();
            const events = await getEvents(message.filters || {}, {
              limit: message.filters?.limit || 50,
              sort: {
                [message.filters?.orderBy || 'created_at']: message.filters?.direction === 'asc' ? 1 : -1
              }
            });

            // For each event, load participants
            const eventsWithParticipants = await Promise.all(
              events.map(async (event) => {
                const participants = await getEventParticipants(event.id);
                return { ...event, participants };
              })
            );

            sendResponse({ success: true, events: eventsWithParticipants });
          } catch (err) {
            logError('Get Supabase events error:', err);
            sendResponse({ success: false, error: err.message, events: [] });
          }
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (err) {
      logError('Error handling message', err);
      sendResponse({ success: false, error: err.message });
    }
  })();
  
  return true; // Keep message channel open for async response
});

/**
 * Get extension statistics
 * @returns {Promise<Object>} Statistics
 */
async function getStats() {
  try {
    const { totalProcessed, lastPollTime } = await chrome.storage.local.get([
      STORAGE_KEYS.PROCESSED_EMAILS,
      STORAGE_KEYS.LAST_POLL_TIME
    ]);
    
    return {
      emailsProcessed: totalProcessed?.length || 0,
      lastPollTime: lastPollTime || null,
      nextPollIn: POLL_INTERVAL_MINUTES
    };
  } catch (err) {
    logError('Failed to get stats', err);
    return {};
  }
}

/**
 * Toggle extension enabled/disabled
 */
async function toggleEnabled() {
  try {
    const { extensionEnabled = true } = await chrome.storage.local.get(STORAGE_KEYS.EXTENSION_ENABLED);
    const newState = !extensionEnabled;
    
    await chrome.storage.local.set({
      [STORAGE_KEYS.EXTENSION_ENABLED]: newState
    });
    
    info(`Extension ${newState ? 'enabled' : 'disabled'}`);
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Email Calendar Agent',
      message: `Extension ${newState ? 'enabled' : 'disabled'}`
    });
  } catch (err) {
    logError('Failed to toggle enabled state', err);
  }
}

/**
 * Handle service worker errors
 */
self.addEventListener('error', (event) => {
  logError('Service worker error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  });
});

/**
 * Handle unhandled promise rejections
 */
self.addEventListener('unhandledrejection', (event) => {
  logError('Unhandled promise rejection', {
    reason: event.reason
  });
});

// Log service worker loaded
logLifecycle('Service worker loaded');

