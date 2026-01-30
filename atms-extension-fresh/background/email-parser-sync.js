/**
 * Email Parser API Sync
 * Syncs processed email data with the MongoDB email parser backend
 */

import { info, error as logError, warn } from '../utils/logger.js';
import {
  EMAIL_TRANSPORT,
  createEmailParserPayload,
  transformEventForATMS,
  validateContact,
  validateEventType,
  getEventTypeDisplayName
} from '../types/shared.js';

// Email parser API configuration
const EMAIL_PARSER_API_URL = 'http://localhost:3000/api'; // Your email parser API
const ATMS_API_URL = 'http://localhost:8080/api'; // ATMS web app API

/**
 * Send email data to the email parser backend
 * @param {Object} email - Email object from Gmail
 * @param {Object} aiResult - AI extraction results
 * @param {Object} eventData - Created event data
 * @param {string} userId - Google user ID
 * @returns {Promise<Object>} API response
 */
export async function syncToEmailParser(email, aiResult, eventData, userId) {
  try {
    info('Syncing email data to email parser backend...');

    // Use shared function to create standardized payload
    const payload = createEmailParserPayload(email, aiResult, eventData, userId);

    // Send to email parser ingest API
    const response = await fetch(`${EMAIL_PARSER_API_URL}/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': userId,
        'X-Source': 'atms-extension'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Email parser API error: ${response.status} - ${errorData.message || 'Unknown error'}`);
    }

    const result = await response.json();
    info('Email successfully synced to parser backend:', result.data);

    return {
      success: true,
      rawId: result.data.rawId,
      jobId: result.data.jobId
    };

  } catch (error) {
    logError('Failed to sync email to parser backend:', error);
    
    // Don't fail the main workflow if sync fails
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send processed event data directly to ATMS backend
 * @param {Object} eventData - Event data
 * @param {string} userId - User ID
 * @returns {Promise<Object>} API response
 */
export async function syncToATMS(eventData, userId) {
  try {
    info('Syncing event data to ATMS backend...');

    // Transform event data for ATMS format
    const atmsEventData = transformEventForATMS(eventData);

    // Send to ATMS API
    const response = await fetch(`${ATMS_API_URL}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userId}`, // You might need proper auth tokens
        'X-Source': 'extension'
      },
      body: JSON.stringify(atmsEventData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`ATMS API error: ${response.status} - ${errorData.message || 'Unknown error'}`);
    }

    const result = await response.json();
    info('Event successfully synced to ATMS:', result);

    return {
      success: true,
      atmsEventId: result.id || result._id
    };

  } catch (error) {
    logError('Failed to sync event to ATMS backend:', error);
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get events from email parser backend
 * @param {string} userId - User ID
 * @param {Object} filters - Query filters
 * @returns {Promise<Array>} Processed emails/events
 */
export async function getEmailsFromParser(userId, filters = {}) {
  try {
    const params = new URLSearchParams({
      limit: 50,
      ...filters
    });

    const response = await fetch(`${EMAIL_PARSER_API_URL}/messages?${params}`, {
      headers: {
        'X-User-ID': userId
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch emails: ${response.status}`);
    }

    const data = await response.json();
    return data.data.messages || [];

  } catch (error) {
    logError('Failed to fetch emails from parser:', error);
    return [];
  }
}

/**
 * Get events from ATMS backend
 * @param {string} userId - User ID
 * @returns {Promise<Array>} ATMS events
 */
export async function getEventsFromATMS(userId) {
  try {
    const response = await fetch(`${ATMS_API_URL}/events`, {
      headers: {
        'Authorization': `Bearer ${userId}`,
        'X-Source': 'extension'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ATMS events: ${response.status}`);
    }

    const data = await response.json();
    return data.events || data.data || [];

  } catch (error) {
    logError('Failed to fetch events from ATMS:', error);
    return [];
  }
}

/**
 * Format email as RFC-822 for email parser
 * @param {Object} email - Gmail email object
 * @returns {string} RFC-822 formatted email
 */
function formatEmailAsRFC822(email) {
  const headers = [
    `Message-ID: ${email.id}`,
    `Subject: ${email.subject || 'No Subject'}`,
    `From: ${email.from || 'Unknown Sender'}`,
    `Date: ${email.date || new Date().toISOString()}`,
    `Content-Type: text/plain; charset=utf-8`
  ];

  if (email.to && email.to.length > 0) {
    headers.push(`To: ${Array.isArray(email.to) ? email.to.join(', ') : email.to}`);
  }

  if (email.cc && email.cc.length > 0) {
    headers.push(`Cc: ${Array.isArray(email.cc) ? email.cc.join(', ') : email.cc}`);
  }

  const headerSection = headers.join('\r\n');
  const bodySection = email.body || email.snippet || '';

  return `${headerSection}\r\n\r\n${bodySection}`;
}

// Note: transformEventForATMS is now imported from shared types

// Note: Event transformation and utility functions are now imported from shared types

/**
 * Sync local storage with backend data
 * @param {string} userId - User ID
 */
export async function syncLocalStorageWithBackend(userId) {
  try {
    info('Syncing local storage with backend data...');

    // Get both email parser and ATMS data
    const [emailParserData, atmsData] = await Promise.all([
      getEmailsFromParser(userId, { limit: 100 }),
      getEventsFromATMS(userId)
    ]);

    // Store in local storage for offline access
    await chrome.storage.local.set({
      'emailParserData': emailParserData,
      'atmsData': atmsData,
      'lastSync': new Date().toISOString()
    });

    info(`Synced ${emailParserData.length} emails and ${atmsData.length} events to local storage`);

    return {
      success: true,
      emailCount: emailParserData.length,
      eventCount: atmsData.length
    };

  } catch (error) {
    logError('Failed to sync local storage with backend:', error);
    return {
      success: false,
      error: error.message
    };
  }
}