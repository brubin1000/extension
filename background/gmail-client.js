/**
 * Gmail API Client
 * Fetches and parses emails from Gmail
 */

import {
  GMAIL_API_BASE,
  EMAIL_LOOKBACK_HOURS,
  MAX_EMAILS_PER_POLL,
  LOGISTICS_KEYWORDS,
  PRIORITY_DOMAINS,
  IGNORE_DOMAINS,
  STORAGE_KEYS,
  MAX_PROCESSED_EMAIL_IDS
} from '../config/constants.js';
import { debug, error as logError, warn, logApiCall, logApiResponse, logEmailProcessing } from '../utils/logger.js';
import { getGoogleToken } from './auth-manager.js';

/**
 * Fetch new emails from Gmail
 * @param {string} token - Google OAuth access token
 * @param {number} maxResults - Maximum number of emails to fetch
 * @returns {Promise<Array>} Array of email objects
 */
export async function fetchNewEmails(token, maxResults = MAX_EMAILS_PER_POLL) {
  try {
    // Calculate lookback time
    const after = Math.floor((Date.now() - EMAIL_LOOKBACK_HOURS * 60 * 60 * 1000) / 1000);
    
    // Build query
    const query = buildGmailQuery(after);
    
    const url = `${GMAIL_API_BASE}/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
    
    logApiCall('Gmail', url);
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    logApiResponse('Gmail', response.status, response.ok);
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Gmail API authentication failed. Token may be expired.');
      }
      throw new Error(`Gmail API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.messages || data.messages.length === 0) {
      debug('No new emails found');
      return [];
    }
    
    debug(`Found ${data.messages.length} potential emails`);
    
    // Fetch full details for each message
    const emails = await Promise.all(
      data.messages.map(msg => fetchEmailDetails(token, msg.id))
    );
    
    // Filter out nulls (failed fetches)
    const validEmails = emails.filter(Boolean);
    
    // Filter by logistics keywords
    const logisticsEmails = validEmails.filter(email => mightBeLogistics(email));
    
    debug(`${logisticsEmails.length} emails match logistics criteria`);
    
    return logisticsEmails;
    
  } catch (err) {
    logError('Failed to fetch emails from Gmail', err);
    throw err;
  }
}

/**
 * Build Gmail search query
 * @param {number} afterTimestamp - Unix timestamp to search after
 * @returns {string} Gmail query string
 */
function buildGmailQuery(afterTimestamp) {
  const queries = [];
  
  // Time filter
  queries.push(`after:${afterTimestamp}`);
  
  // Exclude spam and trash
  queries.push('-in:spam');
  queries.push('-in:trash');
  
  // Include unread or important emails (more likely to be logistics)
  // Using OR: (is:unread OR is:important)
  // queries.push('(is:unread OR is:important)');
  
  return queries.join(' ');
}

/**
 * Fetch full details for a single email
 * @param {string} token - Google OAuth access token
 * @param {string} messageId - Gmail message ID
 * @returns {Promise<Object|null>} Email object or null if failed
 */
async function fetchEmailDetails(token, messageId) {
  try {
    const url = `${GMAIL_API_BASE}/messages/${messageId}?format=full`;
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!response.ok) {
      warn(`Failed to fetch email ${messageId}: ${response.status}`);
      return null;
    }
    
    const message = await response.json();
    
    // Parse headers
    const headers = {};
    if (message.payload && message.payload.headers) {
      message.payload.headers.forEach(h => {
        headers[h.name.toLowerCase()] = h.value;
      });
    }
    
    // Extract body
    const body = extractBody(message.payload);
    
    const email = {
      id: message.id,
      threadId: message.threadId,
      subject: headers.subject || '(no subject)',
      from: headers.from || '',
      to: headers.to || '',
      date: headers.date || new Date().toISOString(),
      body: body,
      snippet: message.snippet || '',
      labels: message.labelIds || []
    };
    
    logEmailProcessing(email);
    
    return email;
    
  } catch (err) {
    warn(`Error fetching email ${messageId}`, err);
    return null;
  }
}

/**
 * Extract email body from Gmail message payload
 * @param {Object} payload - Gmail message payload
 * @returns {string} Email body text
 */
function extractBody(payload) {
  if (!payload) return '';
  
  // Check if body is directly in payload
  if (payload.body && payload.body.data) {
    return decodeBase64(payload.body.data);
  }
  
  // Check parts
  if (payload.parts && payload.parts.length > 0) {
    // Try to find text/plain first
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        return decodeBase64(part.body.data);
      }
    }
    
    // Fallback to text/html
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body && part.body.data) {
        const html = decodeBase64(part.body.data);
        return stripHtml(html);
      }
    }
    
    // Check nested parts (multipart)
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }
  
  return '';
}

/**
 * Decode base64url encoded string
 * @param {string} data - Base64url encoded data
 * @returns {string} Decoded string
 */
function decodeBase64(data) {
  try {
    // Replace URL-safe characters
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    
    // Decode
    const decoded = atob(base64);
    
    return decoded;
  } catch (err) {
    warn('Failed to decode base64 data', err);
    return '';
  }
}

/**
 * Strip HTML tags from text
 * @param {string} html - HTML string
 * @returns {string} Plain text
 */
function stripHtml(html) {
  if (!html) return '';
  
  // Remove script and style tags with their content
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
  
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  
  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  
  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
}

/**
 * Check if email might contain logistics information
 * @param {Object} email - Email object
 * @returns {boolean} True if might be logistics
 */
function mightBeLogistics(email) {
  // Check if sender is in ignore list
  const fromLower = email.from.toLowerCase();
  for (const ignoreDomain of IGNORE_DOMAINS) {
    if (fromLower.includes(ignoreDomain)) {
      debug(`Ignoring email from: ${email.from}`);
      return false;
    }
  }
  
  // Combine subject and body for searching
  const searchText = `${email.subject} ${email.body} ${email.snippet}`.toLowerCase();
  
  // Check for logistics keywords
  const hasKeyword = LOGISTICS_KEYWORDS.some(keyword => 
    searchText.includes(keyword.toLowerCase())
  );
  
  if (!hasKeyword) {
    debug(`No logistics keywords in email: ${email.subject}`);
    return false;
  }
  
  // Check if from priority domain (boost score)
  const isPriority = PRIORITY_DOMAINS.some(domain => 
    fromLower.includes(domain.toLowerCase())
  );
  
  if (isPriority) {
    debug(`Priority domain email: ${email.from}`);
  }
  
  return true;
}

/**
 * Get list of processed email IDs
 * @returns {Promise<Set>} Set of processed email IDs
 */
export async function getProcessedEmailIds() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.PROCESSED_EMAILS);
    const ids = result[STORAGE_KEYS.PROCESSED_EMAILS] || [];
    return new Set(ids);
  } catch (err) {
    logError('Failed to get processed email IDs', err);
    return new Set();
  }
}

/**
 * Mark email as processed
 * @param {string} emailId - Email ID to mark
 * @returns {Promise<void>}
 */
export async function markEmailAsProcessed(emailId) {
  try {
    const processedIds = await getProcessedEmailIds();
    processedIds.add(emailId);
    
    // Keep only last N IDs to prevent unbounded growth
    const idsArray = Array.from(processedIds);
    const trimmedIds = idsArray.slice(-MAX_PROCESSED_EMAIL_IDS);
    
    await chrome.storage.local.set({
      [STORAGE_KEYS.PROCESSED_EMAILS]: trimmedIds
    });
    
  } catch (err) {
    logError('Failed to mark email as processed', err);
  }
}

/**
 * Mark multiple emails as processed
 * @param {Array<string>} emailIds - Array of email IDs
 * @returns {Promise<void>}
 */
export async function markEmailsAsProcessed(emailIds) {
  try {
    const processedIds = await getProcessedEmailIds();
    
    emailIds.forEach(id => processedIds.add(id));
    
    // Keep only last N IDs
    const idsArray = Array.from(processedIds);
    const trimmedIds = idsArray.slice(-MAX_PROCESSED_EMAIL_IDS);
    
    await chrome.storage.local.set({
      [STORAGE_KEYS.PROCESSED_EMAILS]: trimmedIds
    });
    
    debug(`Marked ${emailIds.length} emails as processed`);
    
  } catch (err) {
    logError('Failed to mark emails as processed', err);
  }
}

/**
 * Check if email has been processed
 * @param {string} emailId - Email ID to check
 * @returns {Promise<boolean>} True if processed
 */
export async function isEmailProcessed(emailId) {
  const processedIds = await getProcessedEmailIds();
  return processedIds.has(emailId);
}

/**
 * Clear all processed email IDs (for testing)
 * @returns {Promise<void>}
 */
export async function clearProcessedEmails() {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.PROCESSED_EMAILS]: []
    });
    debug('Cleared all processed email IDs');
  } catch (err) {
    logError('Failed to clear processed emails', err);
  }
}

/**
 * Get email statistics
 * @returns {Promise<Object>} Email statistics
 */
export async function getEmailStats() {
  try {
    const processedIds = await getProcessedEmailIds();
    const lastPoll = await chrome.storage.local.get(STORAGE_KEYS.LAST_POLL_TIME);
    
    return {
      totalProcessed: processedIds.size,
      lastPollTime: lastPoll[STORAGE_KEYS.LAST_POLL_TIME] || null
    };
  } catch (err) {
    logError('Failed to get email stats', err);
    return {
      totalProcessed: 0,
      lastPollTime: null
    };
  }
}

/**
 * Update last poll time
 * @returns {Promise<void>}
 */
export async function updateLastPollTime() {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.LAST_POLL_TIME]: Date.now()
    });
  } catch (err) {
    logError('Failed to update last poll time', err);
  }
}

/**
 * Test Gmail API connection
 * @returns {Promise<boolean>} True if connection successful
 */
export async function testGmailConnection() {
  try {
    const token = await getGoogleToken(false);
    if (!token) {
      return false;
    }
    
    const response = await fetch(`${GMAIL_API_BASE}/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    return response.ok;
  } catch (err) {
    logError('Gmail connection test failed', err);
    return false;
  }
}

