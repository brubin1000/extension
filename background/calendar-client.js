/**
 * Google Calendar API Client
 * Creates and manages calendar events
 */

import {
  CALENDAR_API_BASE,
  CALENDAR_DEFAULTS,
  RETRY_CONFIG
} from '../config/constants.js';
import { debug, info, error as logError, warn, logEventCreated, logApiCall, logApiResponse, logRetry } from '../utils/logger.js';
import { transformToCalendarEvent } from '../models/event-schema.js';
import { getGoogleToken } from './auth-manager.js';

/**
 * Create a new calendar event
 * @param {string} token - Google OAuth access token
 * @param {Object} eventData - Event data from schema
 * @returns {Promise<string>} Calendar event ID
 */
export async function createCalendarEvent(token, eventData) {
  try {
    // Transform event data to Calendar API format
    const calendarEvent = transformToCalendarEvent(eventData);
    
    // Create event via API
    const url = `${CALENDAR_API_BASE}/calendars/primary/events`;
    
    logApiCall('Calendar', url, { method: 'POST' });
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(calendarEvent)
    });
    
    logApiResponse('Calendar', response.status, response.ok);
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Calendar API authentication failed. Token may be expired.');
      }
      
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Calendar API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }
    
    const createdEvent = await response.json();
    
    logEventCreated(createdEvent.id, eventData.eventTitle);
    
    return createdEvent.id;
    
  } catch (err) {
    logError('Failed to create calendar event', err);
    throw err;
  }
}

/**
 * Create calendar event with retry logic
 * @param {string} token - Google OAuth access token
 * @param {Object} eventData - Event data
 * @returns {Promise<string>} Calendar event ID
 */
export async function createCalendarEventWithRetry(token, eventData) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= RETRY_CONFIG.MAX_RETRIES; attempt++) {
    try {
      return await createCalendarEvent(token, eventData);
    } catch (err) {
      lastError = err;
      
      // Don't retry on authentication errors (need token refresh)
      if (err.message && err.message.includes('authentication')) {
        throw err;
      }
      
      // Don't retry on client errors (400-499)
      if (err.message && err.message.match(/error: 4\d{2}/)) {
        throw err;
      }
      
      if (attempt < RETRY_CONFIG.MAX_RETRIES) {
        const delay = calculateBackoff(attempt);
        logRetry(attempt, RETRY_CONFIG.MAX_RETRIES, 'create calendar event');
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}

/**
 * Update an existing calendar event
 * @param {string} token - Google OAuth access token
 * @param {string} eventId - Calendar event ID
 * @param {Object} eventData - Updated event data
 * @returns {Promise<void>}
 */
export async function updateCalendarEvent(token, eventId, eventData) {
  try {
    const calendarEvent = transformToCalendarEvent(eventData);
    
    const url = `${CALENDAR_API_BASE}/calendars/primary/events/${eventId}`;
    
    logApiCall('Calendar', url, { method: 'PUT' });
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(calendarEvent)
    });
    
    logApiResponse('Calendar', response.status, response.ok);
    
    if (!response.ok) {
      throw new Error(`Failed to update calendar event: ${response.status}`);
    }
    
    info(`Calendar event updated: ${eventId}`);
    
  } catch (err) {
    logError('Failed to update calendar event', err);
    throw err;
  }
}

/**
 * Delete a calendar event
 * @param {string} token - Google OAuth access token
 * @param {string} eventId - Calendar event ID
 * @returns {Promise<void>}
 */
export async function deleteCalendarEvent(token, eventId) {
  try {
    const url = `${CALENDAR_API_BASE}/calendars/primary/events/${eventId}`;
    
    logApiCall('Calendar', url, { method: 'DELETE' });
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    logApiResponse('Calendar', response.status, response.ok);
    
    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete calendar event: ${response.status}`);
    }
    
    info(`Calendar event deleted: ${eventId}`);
    
  } catch (err) {
    logError('Failed to delete calendar event', err);
    throw err;
  }
}

/**
 * Get a calendar event
 * @param {string} token - Google OAuth access token
 * @param {string} eventId - Calendar event ID
 * @returns {Promise<Object>} Calendar event
 */
export async function getCalendarEvent(token, eventId) {
  try {
    const url = `${CALENDAR_API_BASE}/calendars/primary/events/${eventId}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to get calendar event: ${response.status}`);
    }
    
    return await response.json();
    
  } catch (err) {
    logError('Failed to get calendar event', err);
    throw err;
  }
}

/**
 * List calendar events
 * @param {string} token - Google OAuth access token
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Calendar events
 */
export async function listCalendarEvents(token, options = {}) {
  try {
    const params = new URLSearchParams({
      maxResults: options.maxResults || 50,
      singleEvents: 'true',
      orderBy: 'startTime'
    });
    
    if (options.timeMin) {
      params.append('timeMin', new Date(options.timeMin).toISOString());
    }
    
    if (options.timeMax) {
      params.append('timeMax', new Date(options.timeMax).toISOString());
    }
    
    if (options.q) {
      params.append('q', options.q);
    }
    
    const url = `${CALENDAR_API_BASE}/calendars/primary/events?${params.toString()}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to list calendar events: ${response.status}`);
    }
    
    const data = await response.json();
    return data.items || [];
    
  } catch (err) {
    logError('Failed to list calendar events', err);
    throw err;
  }
}

/**
 * Check if event already exists in calendar
 * @param {string} token - Google OAuth access token
 * @param {Object} eventData - Event to check
 * @returns {Promise<string|null>} Event ID if exists, null otherwise
 */
export async function findExistingEvent(token, eventData) {
  try {
    // Search by title in the date range
    const options = {
      q: eventData.eventTitle,
      timeMin: eventData.startDateTime,
      timeMax: eventData.endDateTime || eventData.startDateTime,
      maxResults: 10
    };
    
    const events = await listCalendarEvents(token, options);
    
    // Look for exact match
    for (const event of events) {
      if (event.summary === eventData.eventTitle) {
        // Check if created by this extension
        if (event.description && event.description.includes('Auto-created from email')) {
          debug(`Found existing event: ${event.id}`);
          return event.id;
        }
      }
    }
    
    return null;
    
  } catch (err) {
    warn('Failed to check for existing event', err);
    return null;
  }
}

/**
 * Create or update calendar event (upsert)
 * @param {string} token - Google OAuth access token
 * @param {Object} eventData - Event data
 * @returns {Promise<string>} Calendar event ID
 */
export async function upsertCalendarEvent(token, eventData) {
  try {
    // Check if event already exists
    const existingId = await findExistingEvent(token, eventData);
    
    if (existingId) {
      // Update existing event
      await updateCalendarEvent(token, existingId, eventData);
      return existingId;
    } else {
      // Create new event
      return await createCalendarEventWithRetry(token, eventData);
    }
    
  } catch (err) {
    logError('Failed to upsert calendar event', err);
    throw err;
  }
}

/**
 * Test Calendar API connection
 * @returns {Promise<boolean>} True if connection successful
 */
export async function testCalendarConnection() {
  try {
    const token = await getGoogleToken(false);
    if (!token) {
      return false;
    }
    
    const response = await fetch(`${CALENDAR_API_BASE}/users/me/calendarList`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    return response.ok;
  } catch (err) {
    logError('Calendar connection test failed', err);
    return false;
  }
}

/**
 * Get calendar list
 * @param {string} token - Google OAuth access token
 * @returns {Promise<Array>} List of calendars
 */
export async function getCalendarList(token) {
  try {
    const response = await fetch(`${CALENDAR_API_BASE}/users/me/calendarList`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get calendar list: ${response.status}`);
    }
    
    const data = await response.json();
    return data.items || [];
    
  } catch (err) {
    logError('Failed to get calendar list', err);
    throw err;
  }
}

/**
 * Calculate exponential backoff delay
 * @param {number} attempt - Attempt number
 * @returns {number} Delay in milliseconds
 */
function calculateBackoff(attempt) {
  const delay = RETRY_CONFIG.INITIAL_DELAY_MS * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, attempt - 1);
  return Math.min(delay, RETRY_CONFIG.MAX_DELAY_MS);
}

/**
 * Sleep utility
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get calendar event statistics
 * @param {string} token - Google OAuth access token
 * @param {number} days - Number of days to look back
 * @returns {Promise<Object>} Statistics
 */
export async function getCalendarStats(token, days = 7) {
  try {
    const timeMin = new Date();
    timeMin.setDate(timeMin.getDate() - days);
    
    const events = await listCalendarEvents(token, {
      timeMin: timeMin,
      maxResults: 250,
      q: 'Auto-created from email'
    });
    
    return {
      totalEvents: events.length,
      timeRange: `Last ${days} days`,
      events: events.map(e => ({
        id: e.id,
        title: e.summary,
        start: e.start.dateTime || e.start.date
      }))
    };
    
  } catch (err) {
    logError('Failed to get calendar stats', err);
    return {
      totalEvents: 0,
      timeRange: '',
      events: []
    };
  }
}

