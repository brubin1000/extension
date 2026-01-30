/**
 * Supabase Sync Client
 * Syncs event data to Supabase (replaces MongoDB Realm)
 */

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/secrets.js';
import {
  RETRY_CONFIG,
  SYNC_STATUS
} from '../config/constants.js';
import { debug, info, error as logError, warn, logMongoSync, logRetry } from '../utils/logger.js';
import { prepareForMongoDB } from '../models/event-schema.js';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Table name for events
const EVENTS_TABLE = 'calendar_events';

/**
 * Get current user ID from Chrome identity
 * @returns {Promise<string>} User email/ID
 */
async function getCurrentUserId() {
  try {
    // Get user email from Chrome identity API
    const result = await chrome.storage.local.get('userEmail');
    if (result.userEmail) {
      return result.userEmail;
    }

    // Fallback: try to get from Chrome identity
    return new Promise((resolve, reject) => {
      chrome.identity.getProfileUserInfo((userInfo) => {
        if (userInfo && userInfo.email) {
          chrome.storage.local.set({ userEmail: userInfo.email });
          resolve(userInfo.email);
        } else {
          reject(new Error('No user authenticated'));
        }
      });
    });
  } catch (err) {
    throw new Error('No user authenticated');
  }
}

/**
 * Sync event to Supabase
 * @param {Object} eventData - Event data to sync
 * @returns {Promise<string>} Supabase record ID
 */
export async function syncEvent(eventData) {
  try {
    const userId = await getCurrentUserId();

    // Prepare data for Supabase
    const document = prepareForMongoDB(eventData);

    // Add userId, thread_id to document
    const record = {
      ...document,
      user_id: userId,
      email_id: eventData.emailId,
      thread_id: eventData.threadId || null,
      last_thread_sync: eventData.threadId ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    };

    // Upsert: insert or update if exists
    const { data, error } = await supabase
      .from(EVENTS_TABLE)
      .upsert(record, {
        onConflict: 'email_id',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Sync participants if provided
    if (eventData.participants && eventData.participants.length > 0) {
      await syncEventParticipants(data.id, eventData.participants);
    }

    debug(`Synced event to Supabase: ${data.id}`);
    logMongoSync(data.id, true);

    return data.id;

  } catch (err) {
    logError('Failed to sync event to Supabase', err);
    logMongoSync(eventData.emailId, false);
    throw err;
  }
}

/**
 * Sync event with retry logic
 * @param {Object} eventData - Event data to sync
 * @returns {Promise<string>} Supabase record ID
 */
export async function syncEventWithRetry(eventData) {
  let lastError = null;

  for (let attempt = 1; attempt <= RETRY_CONFIG.MAX_RETRIES; attempt++) {
    try {
      return await syncEvent(eventData);
    } catch (err) {
      lastError = err;

      if (attempt < RETRY_CONFIG.MAX_RETRIES) {
        const delay = calculateBackoff(attempt);
        logRetry(attempt, RETRY_CONFIG.MAX_RETRIES, 'sync to Supabase');
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Update event sync status in Supabase
 * @param {string} emailId - Email ID
 * @param {string} calendarEventId - Calendar event ID
 * @param {string} status - Sync status
 * @returns {Promise<void>}
 */
export async function updateEventSyncStatus(emailId, calendarEventId, status) {
  try {
    const userId = await getCurrentUserId();

    const { error } = await supabase
      .from(EVENTS_TABLE)
      .update({
        calendar_event_id: calendarEventId,
        calendar_sync_status: status,
        calendar_sync_date: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('email_id', emailId)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    debug(`Updated sync status for email ${emailId}: ${status}`);

  } catch (err) {
    logError('Failed to update event sync status', err);
    throw err;
  }
}

/**
 * Get events from Supabase
 * @param {Object} query - Query filters
 * @param {Object} options - Query options (sort, limit)
 * @returns {Promise<Array>} Events
 */
export async function getEvents(query = {}, options = {}) {
  try {
    const userId = await getCurrentUserId();

    let queryBuilder = supabase
      .from(EVENTS_TABLE)
      .select('*')
      .eq('user_id', userId);

    // Apply filters from query
    Object.entries(query).forEach(([key, value]) => {
      if (key !== 'userId') {
        queryBuilder = queryBuilder.eq(key, value);
      }
    });

    // Apply sort
    if (options.sort) {
      const sortField = Object.keys(options.sort)[0];
      const sortOrder = options.sort[sortField] === 1 ? 'asc' : 'desc';
      queryBuilder = queryBuilder.order(sortField, { ascending: sortOrder === 'asc' });
    } else {
      queryBuilder = queryBuilder.order('created_at', { ascending: false });
    }

    // Apply limit
    if (options.limit) {
      queryBuilder = queryBuilder.limit(options.limit);
    }

    const { data, error } = await queryBuilder;

    if (error) {
      throw error;
    }

    debug(`Retrieved ${data?.length || 0} events from Supabase`);

    return data || [];

  } catch (err) {
    logError('Failed to get events from Supabase', err);
    throw err;
  }
}

/**
 * Get a single event by email ID
 * @param {string} emailId - Email ID
 * @returns {Promise<Object|null>} Event or null
 */
export async function getEventByEmailId(emailId) {
  try {
    const userId = await getCurrentUserId();

    const { data, error } = await supabase
      .from(EVENTS_TABLE)
      .select('*')
      .eq('email_id', emailId)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw error;
    }

    return data;

  } catch (err) {
    logError('Failed to get event from Supabase', err);
    return null;
  }
}

/**
 * Delete an event from Supabase
 * @param {string} emailId - Email ID
 * @returns {Promise<void>}
 */
export async function deleteEvent(emailId) {
  try {
    const userId = await getCurrentUserId();

    const { error } = await supabase
      .from(EVENTS_TABLE)
      .delete()
      .eq('email_id', emailId)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    info(`Deleted event for email ${emailId}`);

  } catch (err) {
    logError('Failed to delete event from Supabase', err);
    throw err;
  }
}

/**
 * Get event statistics from Supabase
 * @returns {Promise<Object>} Statistics
 */
export async function getEventStats() {
  try {
    const userId = await getCurrentUserId();

    // Get total count
    const { count: total } = await supabase
      .from(EVENTS_TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // Get count by status
    const { count: synced } = await supabase
      .from(EVENTS_TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('calendar_sync_status', SYNC_STATUS.SYNCED);

    const { count: pending } = await supabase
      .from(EVENTS_TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('calendar_sync_status', SYNC_STATUS.PENDING);

    const { count: failed } = await supabase
      .from(EVENTS_TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('calendar_sync_status', SYNC_STATUS.FAILED);

    return {
      total: total || 0,
      synced: synced || 0,
      pending: pending || 0,
      failed: failed || 0,
      byType: {}
    };

  } catch (err) {
    logError('Failed to get event statistics', err);
    return {
      total: 0,
      synced: 0,
      pending: 0,
      failed: 0,
      byType: {}
    };
  }
}

/**
 * Get recent events
 * @param {number} days - Number of days to look back
 * @param {number} limit - Maximum number of events
 * @returns {Promise<Array>} Recent events
 */
export async function getRecentEvents(days = 7, limit = 50) {
  try {
    const userId = await getCurrentUserId();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { data, error } = await supabase
      .from(EVENTS_TABLE)
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', cutoffDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return data || [];

  } catch (err) {
    logError('Failed to get recent events', err);
    return [];
  }
}

/**
 * Get upcoming events
 * @param {number} days - Number of days to look ahead
 * @param {number} limit - Maximum number of events
 * @returns {Promise<Array>} Upcoming events
 */
export async function getUpcomingEvents(days = 30, limit = 50) {
  try {
    const userId = await getCurrentUserId();
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + days);

    const { data, error } = await supabase
      .from(EVENTS_TABLE)
      .select('*')
      .eq('user_id', userId)
      .eq('calendar_sync_status', SYNC_STATUS.SYNCED)
      .gte('start_date_time', now.toISOString())
      .lte('start_date_time', future.toISOString())
      .order('start_date_time', { ascending: true })
      .limit(limit);

    if (error) {
      throw error;
    }

    return data || [];

  } catch (err) {
    logError('Failed to get upcoming events', err);
    return [];
  }
}

/**
 * Get failed sync events (for retry)
 * @returns {Promise<Array>} Failed events
 */
export async function getFailedSyncEvents() {
  try {
    const userId = await getCurrentUserId();

    const { data, error } = await supabase
      .from(EVENTS_TABLE)
      .select('*')
      .eq('user_id', userId)
      .eq('calendar_sync_status', SYNC_STATUS.FAILED)
      .order('updated_at', { ascending: false })
      .limit(10);

    if (error) {
      throw error;
    }

    return data || [];

  } catch (err) {
    logError('Failed to get failed sync events', err);
    return [];
  }
}

/**
 * Retry failed syncs
 * @returns {Promise<Object>} Retry results
 */
export async function retryFailedSyncs() {
  try {
    const failedEvents = await getFailedSyncEvents();

    if (failedEvents.length === 0) {
      info('No failed syncs to retry');
      return { retried: 0, succeeded: 0, failed: 0 };
    }

    info(`Retrying ${failedEvents.length} failed syncs`);

    let succeeded = 0;
    let failed = 0;

    for (const event of failedEvents) {
      try {
        await syncEventWithRetry(event);
        succeeded++;
      } catch (err) {
        failed++;
      }
    }

    return {
      retried: failedEvents.length,
      succeeded,
      failed
    };

  } catch (err) {
    logError('Failed to retry syncs', err);
    return { retried: 0, succeeded: 0, failed: 0 };
  }
}

/**
 * Test Supabase connection
 * @returns {Promise<boolean>} True if connection successful
 */
export async function testSupabaseConnection() {
  try {
    const userId = await getCurrentUserId();

    // Try a simple count query
    const { error } = await supabase
      .from(EVENTS_TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    info('Supabase connection test successful');
    return true;

  } catch (err) {
    logError('Supabase connection test failed', err);
    return false;
  }
}

/**
 * Batch sync multiple events
 * @param {Array<Object>} events - Events to sync
 * @returns {Promise<Object>} Batch sync results
 */
export async function batchSyncEvents(events) {
  const results = {
    total: events.length,
    succeeded: 0,
    failed: 0,
    errors: []
  };

  for (const event of events) {
    try {
      await syncEventWithRetry(event);
      results.succeeded++;
    } catch (err) {
      results.failed++;
      results.errors.push({
        emailId: event.emailId,
        error: err.message
      });
    }
  }

  info(`Batch sync complete: ${results.succeeded}/${results.total} succeeded`);

  return results;
}

/**
 * Clean up old events (optional maintenance)
 * @param {number} days - Delete events older than this many days
 * @returns {Promise<number>} Number of events deleted
 */
export async function cleanupOldEvents(days = 90) {
  try {
    const userId = await getCurrentUserId();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { error, count } = await supabase
      .from(EVENTS_TABLE)
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .lt('created_at', cutoffDate.toISOString());

    if (error) {
      throw error;
    }

    info(`Cleaned up ${count || 0} old events`);

    return count || 0;

  } catch (err) {
    logError('Failed to cleanup old events', err);
    return 0;
  }
}

/**
 * Sync participants for an event
 * @param {string} eventId - Supabase event ID
 * @param {Array} participants - Array of {email, name, role}
 * @returns {Promise<void>}
 */
export async function syncEventParticipants(eventId, participants) {
  try {
    const userId = await getCurrentUserId();

    // Delete existing participants
    const { error: deleteError } = await supabase
      .from('event_participants')
      .delete()
      .eq('event_id', eventId);

    if (deleteError) throw deleteError;

    // Insert new participants
    if (participants && participants.length > 0) {
      const participantRecords = participants.map(p => ({
        event_id: eventId,
        user_id: userId,
        email: p.email,
        name: p.name || null,
        role: p.role || 'to',
        rsvp_status: 'needsAction'
      }));

      const { error: insertError } = await supabase
        .from('event_participants')
        .insert(participantRecords);

      if (insertError) throw insertError;
    }

    debug(`Synced ${participants?.length || 0} participants for event ${eventId}`);

  } catch (err) {
    logError('Failed to sync event participants', err);
    throw err;
  }
}

/**
 * Get participants for an event
 * @param {string} eventId - Supabase event ID
 * @returns {Promise<Array>} Array of participants
 */
export async function getEventParticipants(eventId) {
  try {
    const { data, error } = await supabase
      .from('event_participants')
      .select('*')
      .eq('event_id', eventId)
      .order('role', { ascending: true });

    if (error) throw error;

    return data || [];

  } catch (err) {
    logError('Failed to get event participants', err);
    return [];
  }
}

/**
 * Update event with thread tracking
 * @param {string} emailId - Email ID
 * @param {string} threadId - Gmail thread ID
 * @returns {Promise<void>}
 */
export async function updateEventThread(emailId, threadId) {
  try {
    const userId = await getCurrentUserId();

    const { error } = await supabase
      .from(EVENTS_TABLE)
      .update({
        thread_id: threadId,
        last_thread_sync: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('email_id', emailId)
      .eq('user_id', userId);

    if (error) throw error;

    debug(`Updated thread tracking for email ${emailId}`);

  } catch (err) {
    logError('Failed to update event thread', err);
    throw err;
  }
}

/**
 * Get events that need thread polling
 * @param {number} minutesSinceLastSync - How old the last sync can be
 * @returns {Promise<Array>} Events needing sync
 */
export async function getEventsNeedingThreadSync(minutesSinceLastSync = 5) {
  try {
    const userId = await getCurrentUserId();
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - minutesSinceLastSync);

    const { data, error } = await supabase
      .from(EVENTS_TABLE)
      .select('*')
      .eq('user_id', userId)
      .not('thread_id', 'is', null)
      .or(`last_thread_sync.is.null,last_thread_sync.lt.${cutoffTime.toISOString()}`)
      .order('last_thread_sync', { ascending: true, nullsFirst: true })
      .limit(10);

    if (error) throw error;

    return data || [];

  } catch (err) {
    logError('Failed to get events needing thread sync', err);
    return [];
  }
}

/**
 * Get event by thread ID
 * @param {string} threadId - Gmail thread ID
 * @returns {Promise<Object|null>} Event or null
 */
export async function getEventByThreadId(threadId) {
  try {
    const userId = await getCurrentUserId();

    const { data, error } = await supabase
      .from(EVENTS_TABLE)
      .select('*')
      .eq('thread_id', threadId)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data;

  } catch (err) {
    logError('Failed to get event by thread ID', err);
    return null;
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

// Export the Supabase client for direct use if needed
export { supabase };
