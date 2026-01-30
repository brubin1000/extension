/**
 * Date parsing utilities
 * Helps convert relative dates (tomorrow, next week) to absolute dates
 * Used by AI parser to provide context about email date
 */

import { TIMEZONE } from '../config/constants.js';

/**
 * Parse email date string to Date object
 * @param {string} dateString - Email date string
 * @returns {Date} Parsed date
 */
export function parseEmailDate(dateString) {
  if (!dateString) return new Date();
  
  try {
    return new Date(dateString);
  } catch (e) {
    return new Date();
  }
}

/**
 * Get date context for AI parsing
 * Provides today, tomorrow, day of week, etc. to help AI parse relative dates
 * @param {Date} emailDate - Date the email was received
 * @returns {string} Date context string
 */
export function getDateContext(emailDate = new Date()) {
  const today = new Date(emailDate);
  const tomorrow = new Date(emailDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const nextWeek = new Date(emailDate);
  nextWeek.setDate(nextWeek.getDate() + 7);
  
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  
  const context = `
Current Date Context (use this to convert relative dates to absolute ISO 8601 dates):
- Email received: ${today.toISOString()}
- Today is: ${daysOfWeek[today.getDay()]}, ${months[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}
- Tomorrow is: ${daysOfWeek[tomorrow.getDay()]}, ${months[tomorrow.getMonth()]} ${tomorrow.getDate()}, ${tomorrow.getFullYear()}
- Timezone: ${TIMEZONE}

When you see relative dates like "tomorrow", "next Monday", "this Friday", convert them to absolute ISO 8601 format.
  `.trim();
  
  return context;
}

/**
 * Get the next occurrence of a day of week
 * @param {Date} fromDate - Starting date
 * @param {number} dayOfWeek - Day of week (0 = Sunday, 6 = Saturday)
 * @returns {Date} Next occurrence of that day
 */
export function getNextDayOfWeek(fromDate, dayOfWeek) {
  const date = new Date(fromDate);
  const currentDay = date.getDay();
  const daysUntil = (dayOfWeek + 7 - currentDay) % 7 || 7;
  
  date.setDate(date.getDate() + daysUntil);
  return date;
}

/**
 * Parse a time string and combine with a date
 * @param {Date} date - Date to combine with
 * @param {string} timeString - Time string (e.g., "3:00 PM", "15:00")
 * @returns {Date} Combined date and time
 */
export function combineDateTime(date, timeString) {
  if (!timeString) return date;
  
  const baseDate = new Date(date);
  
  // Try to parse time formats
  const time24Pattern = /(\d{1,2}):(\d{2})/;
  const time12Pattern = /(\d{1,2}):(\d{2})\s*(AM|PM)/i;
  
  let hours = 0;
  let minutes = 0;
  
  const match12 = timeString.match(time12Pattern);
  if (match12) {
    hours = parseInt(match12[1]);
    minutes = parseInt(match12[2]);
    const period = match12[3].toUpperCase();
    
    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
  } else {
    const match24 = timeString.match(time24Pattern);
    if (match24) {
      hours = parseInt(match24[1]);
      minutes = parseInt(match24[2]);
    }
  }
  
  baseDate.setHours(hours, minutes, 0, 0);
  return baseDate;
}

/**
 * Check if a date string appears to be all-day (no time specified)
 * @param {string} dateString - ISO date string
 * @returns {boolean} True if all-day
 */
export function isAllDay(dateString) {
  if (!dateString) return false;
  
  // Check if it's just a date (YYYY-MM-DD) without time
  const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnlyPattern.test(dateString)) return true;
  
  // Check if time is midnight
  const date = new Date(dateString);
  return date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0;
}

/**
 * Format date for display
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
  if (!date) return '';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

/**
 * Calculate duration between two dates
 * @param {Date|string} start - Start date
 * @param {Date|string} end - End date
 * @returns {Object} Duration object with hours and minutes
 */
export function calculateDuration(start, end) {
  const startDate = typeof start === 'string' ? new Date(start) : start;
  const endDate = typeof end === 'string' ? new Date(end) : end;
  
  const durationMs = endDate - startDate;
  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  
  return { hours, minutes };
}

/**
 * Check if a date is in the past
 * @param {Date|string} date - Date to check
 * @returns {boolean} True if in the past
 */
export function isPast(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d < new Date();
}

/**
 * Check if a date is within the next N days
 * @param {Date|string} date - Date to check
 * @param {number} days - Number of days
 * @returns {boolean} True if within range
 */
export function isWithinDays(date, days) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const future = new Date();
  future.setDate(future.getDate() + days);
  
  return d >= new Date() && d <= future;
}

/**
 * Add business days to a date (skips weekends)
 * @param {Date} date - Starting date
 * @param {number} days - Number of business days to add
 * @returns {Date} New date
 */
export function addBusinessDays(date, days) {
  const result = new Date(date);
  let addedDays = 0;
  
  while (addedDays < days) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    
    // Skip weekends
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      addedDays++;
    }
  }
  
  return result;
}

/**
 * Parse common relative date expressions
 * @param {string} expression - Relative date expression
 * @param {Date} baseDate - Base date to calculate from
 * @returns {Date|null} Parsed date or null
 */
export function parseRelativeDate(expression, baseDate = new Date()) {
  if (!expression) return null;
  
  const lower = expression.toLowerCase().trim();
  const result = new Date(baseDate);
  
  // Today
  if (lower === 'today') {
    return result;
  }
  
  // Tomorrow
  if (lower === 'tomorrow') {
    result.setDate(result.getDate() + 1);
    return result;
  }
  
  // Yesterday
  if (lower === 'yesterday') {
    result.setDate(result.getDate() - 1);
    return result;
  }
  
  // Next week
  if (lower === 'next week') {
    result.setDate(result.getDate() + 7);
    return result;
  }
  
  // Days of week
  const daysMap = {
    'monday': 1, 'mon': 1,
    'tuesday': 2, 'tue': 2, 'tues': 2,
    'wednesday': 3, 'wed': 3,
    'thursday': 4, 'thu': 4, 'thurs': 4,
    'friday': 5, 'fri': 5,
    'saturday': 6, 'sat': 6,
    'sunday': 0, 'sun': 0
  };
  
  for (const [day, num] of Object.entries(daysMap)) {
    if (lower.includes(day)) {
      return getNextDayOfWeek(baseDate, num);
    }
  }
  
  // In N days
  const inDaysMatch = lower.match(/in (\d+) days?/);
  if (inDaysMatch) {
    result.setDate(result.getDate() + parseInt(inDaysMatch[1]));
    return result;
  }
  
  return null;
}

