/**
 * Logger utility for consistent logging across the extension
 * Respects DEBUG settings from constants.js
 */

import { DEBUG } from '../config/constants.js';

const LOG_PREFIX = '[Email Calendar Agent]';

/**
 * Log levels
 */
const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
};

/**
 * Format timestamp for logs
 * @returns {string} Formatted timestamp
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Format log message with metadata
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} data - Additional data to log
 * @returns {string} Formatted message
 */
function formatMessage(level, message, data = null) {
  const timestamp = getTimestamp();
  let formatted = `${LOG_PREFIX} [${timestamp}] [${level}] ${message}`;
  
  if (data && Object.keys(data).length > 0) {
    formatted += '\n' + JSON.stringify(data, null, 2);
  }
  
  return formatted;
}

/**
 * Debug level logging (only when DEBUG.ENABLED is true)
 * @param {string} message - Log message
 * @param {Object} data - Additional data
 */
export function debug(message, data = null) {
  if (DEBUG.ENABLED) {
    console.log(formatMessage(LogLevel.DEBUG, message, data));
  }
}

/**
 * Info level logging
 * @param {string} message - Log message
 * @param {Object} data - Additional data
 */
export function info(message, data = null) {
  console.log(formatMessage(LogLevel.INFO, message, data));
}

/**
 * Warning level logging
 * @param {string} message - Log message
 * @param {Object} data - Additional data
 */
export function warn(message, data = null) {
  console.warn(formatMessage(LogLevel.WARN, message, data));
}

/**
 * Error level logging
 * @param {string} message - Log message
 * @param {Error|Object} error - Error object or additional data
 */
export function error(message, error = null) {
  const errorData = error instanceof Error ? {
    message: error.message,
    stack: error.stack,
    name: error.name
  } : error;
  
  console.error(formatMessage(LogLevel.ERROR, message, errorData));
}

/**
 * Log API call (only when DEBUG.LOG_API_CALLS is true)
 * @param {string} api - API name
 * @param {string} endpoint - Endpoint called
 * @param {Object} options - Request options
 */
export function logApiCall(api, endpoint, options = {}) {
  if (DEBUG.ENABLED && DEBUG.LOG_API_CALLS) {
    debug(`API Call: ${api}`, {
      endpoint,
      method: options.method || 'GET',
      hasBody: !!options.body
    });
  }
}

/**
 * Log API response (only when DEBUG.LOG_API_CALLS is true)
 * @param {string} api - API name
 * @param {number} status - HTTP status code
 * @param {boolean} success - Whether call was successful
 */
export function logApiResponse(api, status, success) {
  if (DEBUG.ENABLED && DEBUG.LOG_API_CALLS) {
    const level = success ? LogLevel.DEBUG : LogLevel.WARN;
    const message = `API Response: ${api} - Status ${status}`;
    
    if (success) {
      debug(message);
    } else {
      warn(message);
    }
  }
}

/**
 * Log email processing (only when DEBUG.LOG_EMAIL_CONTENT is true)
 * @param {Object} email - Email object
 */
export function logEmailProcessing(email) {
  if (DEBUG.ENABLED) {
    const data = {
      emailId: email.id,
      subject: email.subject,
      from: email.from,
      date: email.date
    };
    
    if (DEBUG.LOG_EMAIL_CONTENT) {
      data.bodyPreview = email.body ? email.body.substring(0, 200) + '...' : '';
    }
    
    debug('Processing email', data);
  }
}

/**
 * Log AI parsing result (only when DEBUG.LOG_AI_RESPONSES is true)
 * @param {Object} result - AI parsing result
 */
export function logAIResult(result) {
  if (DEBUG.ENABLED && DEBUG.LOG_AI_RESPONSES) {
    debug('AI Parse Result', {
      isLogisticsEvent: result.isLogisticsEvent,
      eventType: result.eventType,
      hasStartTime: !!result.startDateTime,
      confidence: result.confidence
    });
  }
}

/**
 * Log event creation
 * @param {string} eventId - Calendar event ID
 * @param {string} title - Event title
 */
export function logEventCreated(eventId, title) {
  info(`Calendar event created: ${title}`, { eventId });
}

/**
 * Log MongoDB sync
 * @param {string} eventId - Event ID
 * @param {boolean} success - Whether sync was successful
 */
export function logMongoSync(eventId, success) {
  if (success) {
    info(`Event synced to MongoDB`, { eventId });
  } else {
    error(`Failed to sync event to MongoDB`, { eventId });
  }
}

/**
 * Log extension lifecycle events
 * @param {string} event - Lifecycle event name
 */
export function logLifecycle(event) {
  info(`Extension lifecycle: ${event}`);
}

/**
 * Log authentication events
 * @param {string} event - Auth event name
 * @param {Object} data - Additional data
 */
export function logAuth(event, data = null) {
  info(`Authentication: ${event}`, data);
}

/**
 * Create a performance timer
 * @param {string} label - Timer label
 * @returns {Function} Function to call when done
 */
export function startTimer(label) {
  const startTime = performance.now();
  
  return () => {
    const duration = performance.now() - startTime;
    debug(`Timer: ${label} completed in ${duration.toFixed(2)}ms`);
  };
}

/**
 * Log with retry context
 * @param {number} attempt - Current attempt number
 * @param {number} maxAttempts - Maximum attempts
 * @param {string} operation - Operation being retried
 */
export function logRetry(attempt, maxAttempts, operation) {
  warn(`Retry ${attempt}/${maxAttempts} for: ${operation}`);
}

/**
 * Group related logs
 * @param {string} label - Group label
 * @param {Function} fn - Function to execute in group
 */
export async function group(label, fn) {
  if (DEBUG.ENABLED) {
    console.group(`${LOG_PREFIX} ${label}`);
  }
  
  try {
    return await fn();
  } finally {
    if (DEBUG.ENABLED) {
      console.groupEnd();
    }
  }
}

