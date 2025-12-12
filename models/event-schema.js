/**
 * Event data schema and validation utilities
 * Defines the structure for events stored in MongoDB and processed by the extension
 */

import { EVENT_TYPES, SYNC_STATUS, PROCESSING_STATUS } from '../config/constants.js';

/**
 * @typedef {Object} EventData
 * @property {string} _id - MongoDB ObjectId
 * @property {string} userId - Google user ID
 * @property {string} emailId - Gmail message ID
 * @property {string} emailSubject - Email subject line
 * @property {string} emailFrom - Email sender
 * @property {Date} emailDate - Date email was received
 * @property {string} eventTitle - Event title
 * @property {string} eventDescription - Event description
 * @property {string} eventType - Type of event (delivery, pickup, etc.)
 * @property {Date} startDateTime - Event start date/time
 * @property {Date} endDateTime - Event end date/time
 * @property {string} location - Event location
 * @property {string} calendarEventId - Google Calendar event ID
 * @property {string} calendarSyncStatus - Sync status (pending, synced, failed)
 * @property {Date} calendarSyncDate - When synced to calendar
 * @property {Date} createdAt - When record was created
 * @property {Date} updatedAt - When record was last updated
 * @property {string} processingStatus - Processing status (processed, skipped, error)
 * @property {number} aiConfidence - AI confidence score (0-1)
 */

/**
 * @typedef {Object} AIParseResult
 * @property {boolean} isLogisticsEvent - Whether this is a logistics event
 * @property {string} title - Event title
 * @property {string} description - Event description
 * @property {string} startDateTime - ISO 8601 date-time or null
 * @property {string} endDateTime - ISO 8601 date-time or null
 * @property {string} location - Location or address
 * @property {string} eventType - Type of event
 * @property {number} confidence - Confidence score (0-1)
 */

/**
 * Creates a new event object with default values
 * @param {Object} emailData - Email data from Gmail
 * @param {AIParseResult} aiResult - AI parsing result
 * @param {string} userId - Google user ID
 * @returns {EventData} Event object ready for MongoDB
 */
export function createEvent(emailData, aiResult, userId) {
  const now = new Date();
  
  return {
    // User & Email info
    userId: userId,
    emailId: emailData.id,
    emailSubject: emailData.subject || '',
    emailFrom: emailData.from || '',
    emailDate: new Date(emailData.date),
    
    // Event details
    eventTitle: aiResult.title || emailData.subject || 'Untitled Event',
    eventDescription: aiResult.description || '',
    eventType: validateEventType(aiResult.eventType),
    startDateTime: aiResult.startDateTime ? new Date(aiResult.startDateTime) : null,
    endDateTime: aiResult.endDateTime ? new Date(aiResult.endDateTime) : null,
    location: aiResult.location || '',
    
    // Calendar sync
    calendarEventId: null,
    calendarSyncStatus: SYNC_STATUS.PENDING,
    calendarSyncDate: null,
    
    // Metadata
    createdAt: now,
    updatedAt: now,
    processingStatus: PROCESSING_STATUS.PROCESSED,
    aiConfidence: aiResult.confidence || 0
  };
}

/**
 * Updates an existing event with calendar sync information
 * @param {EventData} event - Existing event
 * @param {string} calendarEventId - Google Calendar event ID
 * @returns {EventData} Updated event
 */
export function updateEventWithCalendarSync(event, calendarEventId) {
  return {
    ...event,
    calendarEventId: calendarEventId,
    calendarSyncStatus: SYNC_STATUS.SYNCED,
    calendarSyncDate: new Date(),
    updatedAt: new Date()
  };
}

/**
 * Marks an event as failed to sync
 * @param {EventData} event - Existing event
 * @returns {EventData} Updated event
 */
export function markEventSyncFailed(event) {
  return {
    ...event,
    calendarSyncStatus: SYNC_STATUS.FAILED,
    updatedAt: new Date()
  };
}

/**
 * Validates and normalizes event type
 * @param {string} eventType - Raw event type from AI
 * @returns {string} Validated event type
 */
export function validateEventType(eventType) {
  if (!eventType) return EVENT_TYPES.OTHER;
  
  const normalized = eventType.toLowerCase();
  const validTypes = Object.values(EVENT_TYPES);
  
  if (validTypes.includes(normalized)) {
    return normalized;
  }
  
  return EVENT_TYPES.OTHER;
}

/**
 * Validates if an event has required fields
 * @param {EventData} event - Event to validate
 * @returns {boolean} True if valid
 */
export function isValidEvent(event) {
  if (!event) return false;
  
  // Required fields
  if (!event.userId) return false;
  if (!event.emailId) return false;
  if (!event.eventTitle) return false;
  
  // Must have a start date/time
  if (!event.startDateTime) return false;
  
  return true;
}

/**
 * Validates AI parse result
 * @param {AIParseResult} result - AI parsing result
 * @returns {boolean} True if valid
 */
export function isValidAIResult(result) {
  if (!result) return false;
  if (typeof result.isLogisticsEvent !== 'boolean') return false;
  
  // If it's a logistics event, it must have a start time
  if (result.isLogisticsEvent && !result.startDateTime) return false;
  
  return true;
}

/**
 * Transforms event for MongoDB storage (removes undefined values)
 * @param {EventData} event - Event object
 * @returns {Object} Clean object for MongoDB
 */
export function prepareForMongoDB(event) {
  const cleaned = {};
  
  for (const [key, value] of Object.entries(event)) {
    if (value !== undefined && value !== null) {
      cleaned[key] = value;
    }
  }
  
  return cleaned;
}

/**
 * Transforms event data for Google Calendar API
 * @param {EventData} event - Event object
 * @returns {Object} Google Calendar event format
 */
export function transformToCalendarEvent(event) {
  const calendarEvent = {
    summary: event.eventTitle,
    description: `${event.eventDescription}\n\n---\nAuto-created from email: ${event.emailSubject}`,
    location: event.location || undefined,
    start: formatDateTimeForCalendar(event.startDateTime),
    end: formatDateTimeForCalendar(event.endDateTime || addHours(event.startDateTime, 1)),
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 30 },
        { method: 'email', minutes: 60 }
      ]
    },
    source: {
      title: 'Email Calendar Agent',
      url: `https://mail.google.com/mail/u/0/#all/${event.emailId}`
    }
  };
  
  // Remove undefined values
  return JSON.parse(JSON.stringify(calendarEvent));
}

/**
 * Formats a date for Google Calendar API
 * @param {Date|string} dateTime - Date to format
 * @returns {Object} Formatted date for Calendar API
 */
export function formatDateTimeForCalendar(dateTime) {
  if (!dateTime) return null;
  
  const date = typeof dateTime === 'string' ? new Date(dateTime) : dateTime;
  const isoString = date.toISOString();
  
  // Check if it's an all-day event (midnight UTC)
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  
  if (hours === 0 && minutes === 0 && seconds === 0) {
    // All-day event
    return { date: isoString.split('T')[0] };
  }
  
  // Timed event
  return {
    dateTime: isoString,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
}

/**
 * Adds hours to a date
 * @param {Date|string} dateTime - Starting date/time
 * @param {number} hours - Hours to add
 * @returns {Date} New date
 */
export function addHours(dateTime, hours) {
  const date = typeof dateTime === 'string' ? new Date(dateTime) : new Date(dateTime);
  date.setHours(date.getHours() + hours);
  return date;
}

/**
 * Checks if an event is recent (within last 7 days)
 * @param {EventData} event - Event to check
 * @returns {boolean} True if recent
 */
export function isRecentEvent(event) {
  if (!event.createdAt) return false;
  
  const now = Date.now();
  const created = new Date(event.createdAt).getTime();
  const daysDiff = (now - created) / (1000 * 60 * 60 * 24);
  
  return daysDiff <= 7;
}

/**
 * Generates a unique event identifier for deduplication
 * @param {EventData} event - Event object
 * @returns {string} Unique identifier
 */
export function generateEventFingerprint(event) {
  const parts = [
    event.emailId,
    event.eventTitle,
    event.startDateTime ? new Date(event.startDateTime).getTime() : ''
  ];
  
  return parts.join('|');
}

