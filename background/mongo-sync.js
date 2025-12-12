/**
 * MongoDB Sync Client
 * Syncs event data to MongoDB Atlas using Realm Web SDK
 */

import {
  MONGODB_DATABASE_NAME,
  MONGODB_COLLECTION_NAME,
  RETRY_CONFIG,
  SYNC_STATUS
} from '../config/constants.js';
import { debug, info, error as logError, warn, logMongoSync, logRetry } from '../utils/logger.js';
import { getCurrentRealmUser, ensureAuthenticated } from './auth-manager.js';
import { prepareForMongoDB } from '../models/event-schema.js';

/**
 * Get MongoDB collection
 * @returns {Promise<Object>} MongoDB collection
 */
async function getCollection() {
  const user = getCurrentRealmUser();
  
  if (!user) {
    throw new Error('No Realm user authenticated');
  }
  
  const mongodb = user.mongoClient('mongodb-atlas');
  const db = mongodb.db(MONGODB_DATABASE_NAME);
  const collection = db.collection(MONGODB_COLLECTION_NAME);
  
  return collection;
}

/**
 * Sync event to MongoDB
 * @param {Object} eventData - Event data to sync
 * @returns {Promise<string>} MongoDB document ID
 */
export async function syncEvent(eventData) {
  try {
    // Ensure authenticated
    await ensureAuthenticated();
    
    const collection = await getCollection();
    
    // Prepare data for MongoDB
    const document = prepareForMongoDB(eventData);
    
    // Check if event already exists (by emailId)
    const existing = await collection.findOne({ emailId: eventData.emailId });
    
    if (existing) {
      // Update existing event
      debug(`Updating existing event for email ${eventData.emailId}`);
      
      await collection.updateOne(
        { _id: existing._id },
        { $set: { ...document, updatedAt: new Date() } }
      );
      
      logMongoSync(existing._id.toString(), true);
      return existing._id.toString();
      
    } else {
      // Insert new event
      debug(`Inserting new event for email ${eventData.emailId}`);
      
      const result = await collection.insertOne(document);
      
      logMongoSync(result.insertedId.toString(), true);
      return result.insertedId.toString();
    }
    
  } catch (err) {
    logError('Failed to sync event to MongoDB', err);
    logMongoSync(eventData.emailId, false);
    throw err;
  }
}

/**
 * Sync event with retry logic
 * @param {Object} eventData - Event data to sync
 * @returns {Promise<string>} MongoDB document ID
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
        logRetry(attempt, RETRY_CONFIG.MAX_RETRIES, 'sync to MongoDB');
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}

/**
 * Update event sync status in MongoDB
 * @param {string} emailId - Email ID
 * @param {string} calendarEventId - Calendar event ID
 * @param {string} status - Sync status
 * @returns {Promise<void>}
 */
export async function updateEventSyncStatus(emailId, calendarEventId, status) {
  try {
    await ensureAuthenticated();
    
    const collection = await getCollection();
    
    await collection.updateOne(
      { emailId: emailId },
      {
        $set: {
          calendarEventId: calendarEventId,
          calendarSyncStatus: status,
          calendarSyncDate: new Date(),
          updatedAt: new Date()
        }
      }
    );
    
    debug(`Updated sync status for email ${emailId}: ${status}`);
    
  } catch (err) {
    logError('Failed to update event sync status', err);
    throw err;
  }
}

/**
 * Get events from MongoDB
 * @param {Object} query - MongoDB query
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Events
 */
export async function getEvents(query = {}, options = {}) {
  try {
    await ensureAuthenticated();
    
    const collection = await getCollection();
    
    // Add userId to query to ensure user only sees their own events
    const user = getCurrentRealmUser();
    const fullQuery = {
      ...query,
      userId: user.id
    };
    
    const cursor = collection.find(fullQuery);
    
    // Apply sort
    if (options.sort) {
      cursor.sort(options.sort);
    } else {
      cursor.sort({ createdAt: -1 });
    }
    
    // Apply limit
    if (options.limit) {
      cursor.limit(options.limit);
    }
    
    const events = await cursor;
    
    debug(`Retrieved ${events.length} events from MongoDB`);
    
    return events;
    
  } catch (err) {
    logError('Failed to get events from MongoDB', err);
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
    await ensureAuthenticated();
    
    const collection = await getCollection();
    const user = getCurrentRealmUser();
    
    const event = await collection.findOne({
      emailId: emailId,
      userId: user.id
    });
    
    return event;
    
  } catch (err) {
    logError('Failed to get event from MongoDB', err);
    return null;
  }
}

/**
 * Delete an event from MongoDB
 * @param {string} emailId - Email ID
 * @returns {Promise<void>}
 */
export async function deleteEvent(emailId) {
  try {
    await ensureAuthenticated();
    
    const collection = await getCollection();
    const user = getCurrentRealmUser();
    
    await collection.deleteOne({
      emailId: emailId,
      userId: user.id
    });
    
    info(`Deleted event for email ${emailId}`);
    
  } catch (err) {
    logError('Failed to delete event from MongoDB', err);
    throw err;
  }
}

/**
 * Get event statistics from MongoDB
 * @returns {Promise<Object>} Statistics
 */
export async function getEventStats() {
  try {
    await ensureAuthenticated();
    
    const collection = await getCollection();
    const user = getCurrentRealmUser();
    
    // Get total count
    const total = await collection.count({ userId: user.id });
    
    // Get count by status
    const synced = await collection.count({
      userId: user.id,
      calendarSyncStatus: SYNC_STATUS.SYNCED
    });
    
    const pending = await collection.count({
      userId: user.id,
      calendarSyncStatus: SYNC_STATUS.PENDING
    });
    
    const failed = await collection.count({
      userId: user.id,
      calendarSyncStatus: SYNC_STATUS.FAILED
    });
    
    // Get count by event type
    const pipeline = [
      { $match: { userId: user.id } },
      { $group: { _id: '$eventType', count: { $sum: 1 } } }
    ];
    
    const typeStats = await collection.aggregate(pipeline);
    
    return {
      total,
      synced,
      pending,
      failed,
      byType: typeStats.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {})
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
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return await getEvents(
      { createdAt: { $gte: cutoffDate } },
      { sort: { createdAt: -1 }, limit }
    );
    
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
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + days);
    
    return await getEvents(
      {
        startDateTime: { $gte: now, $lte: future },
        calendarSyncStatus: SYNC_STATUS.SYNCED
      },
      { sort: { startDateTime: 1 }, limit }
    );
    
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
    return await getEvents(
      { calendarSyncStatus: SYNC_STATUS.FAILED },
      { sort: { updatedAt: -1 }, limit: 10 }
    );
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
 * Test MongoDB connection
 * @returns {Promise<boolean>} True if connection successful
 */
export async function testMongoConnection() {
  try {
    await ensureAuthenticated();
    
    const collection = await getCollection();
    const user = getCurrentRealmUser();
    
    // Try a simple count query
    await collection.count({ userId: user.id });
    
    info('MongoDB connection test successful');
    return true;
    
  } catch (err) {
    logError('MongoDB connection test failed', err);
    return false;
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
    await ensureAuthenticated();
    
    const collection = await getCollection();
    const user = getCurrentRealmUser();
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const result = await collection.deleteMany({
      userId: user.id,
      createdAt: { $lt: cutoffDate }
    });
    
    info(`Cleaned up ${result.deletedCount} old events`);
    
    return result.deletedCount;
    
  } catch (err) {
    logError('Failed to cleanup old events', err);
    return 0;
  }
}

