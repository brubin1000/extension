/**
 * Service Worker - Main Orchestrator
 * Coordinates email fetching, AI parsing, calendar creation, and MongoDB sync
 */

import { POLL_INTERVAL_MINUTES, ALARMS, NOTIFICATIONS, STORAGE_KEYS } from '../config/constants.js';
import { info, error as logError, warn, logLifecycle, group, startTimer } from '../utils/logger.js';
import { initializeAuth, authenticate, ensureAuthenticated, getGoogleUserId, isSetupComplete } from './auth-manager.js';
import { fetchNewEmails, isEmailProcessed, markEmailAsProcessed, updateLastPollTime } from './gmail-client.js';
import { extractScheduleFromEmail } from './ai-parser.js';
import { createCalendarEventWithRetry } from './calendar-client.js';
import { syncEventWithRetry, updateEventSyncStatus } from './mongo-sync.js';
import { createEvent } from '../models/event-schema.js';

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
  // Clear existing alarm
  await chrome.alarms.clear(ALARMS.CHECK_EMAILS);
  
  // Create new alarm
  await chrome.alarms.create(ALARMS.CHECK_EMAILS, {
    periodInMinutes: POLL_INTERVAL_MINUTES,
    delayInMinutes: 1 // Start first check after 1 minute
  });
  
  info(`Alarm set to check emails every ${POLL_INTERVAL_MINUTES} minutes`);
}

/**
 * Handle alarm triggers
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARMS.CHECK_EMAILS) {
    info('Alarm triggered: checking for new emails');
    await processNewEmails();
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
    
    // Step 4: Sync to MongoDB
    info('Syncing to MongoDB...');
    await syncEventWithRetry(eventData);
    
    info('Event fully processed and synced');
    
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
 * Handle messages from popup or content scripts (future use)
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.action) {
        case 'processEmails':
          await processNewEmails();
          sendResponse({ success: true });
          break;
          
        case 'getStatus':
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

