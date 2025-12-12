/**
 * Configuration constants for Email to Calendar AI Agent
 * 
 * SETUP INSTRUCTIONS:
 * 1. Replace MONGODB_REALM_APP_ID with your actual Realm App ID from MongoDB Atlas
 * 2. Update TIMEZONE if needed (defaults to system timezone)
 * 3. Adjust POLL_INTERVAL_MINUTES based on your needs (default: 5 minutes)
 */

// ============= MONGODB CONFIGURATION =============
export const MONGODB_REALM_APP_ID = 'YOUR_MONGODB_REALM_APP_ID'; // e.g., 'email-calendar-xxxxx'
export const MONGODB_DATABASE_NAME = 'email_calendar';
export const MONGODB_COLLECTION_NAME = 'events';

// ============= API ENDPOINTS =============
export const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
export const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
export const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// ============= OPENAI CONFIGURATION =============
export const OPENAI_MODEL = 'gpt-4o-mini'; // Cost-effective model for parsing
export const OPENAI_TEMPERATURE = 0.1; // Low temperature for consistent extraction
export const OPENAI_MAX_TOKENS = 500;

// ============= POLLING CONFIGURATION =============
export const POLL_INTERVAL_MINUTES = 5; // How often to check for new emails
export const EMAIL_LOOKBACK_HOURS = 24; // How far back to look for emails on each poll
export const MAX_EMAILS_PER_POLL = 20; // Maximum emails to process in one poll

// ============= STORAGE KEYS =============
export const STORAGE_KEYS = {
  PROCESSED_EMAILS: 'processedEmailIds',
  OPENAI_API_KEY: 'openaiApiKey',
  REALM_USER_ID: 'realmUserId',
  LAST_POLL_TIME: 'lastPollTime',
  EXTENSION_ENABLED: 'extensionEnabled'
};

// ============= ALARM NAMES =============
export const ALARMS = {
  CHECK_EMAILS: 'checkEmails'
};

// ============= TIMEZONE =============
export const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

// ============= LOGISTICS KEYWORDS =============
// Pre-filter emails that might contain logistics information
export const LOGISTICS_KEYWORDS = [
  // Delivery & Shipping
  'delivery', 'delivered', 'delivering',
  'shipped', 'shipment', 'shipping',
  'package', 'parcel',
  'tracking', 'tracking number',
  'eta', 'estimated arrival', 'estimated delivery',
  'arriving', 'arrives', 'arrival',
  
  // Pickup & Returns
  'pickup', 'pick up', 'pick-up',
  'collection', 'collect',
  'return', 'returning',
  
  // Appointments & Meetings
  'appointment', 'scheduled', 'schedule',
  'meeting', 'conference',
  'reservation', 'booking', 'booked',
  'confirmed', 'confirmation',
  
  // Travel & Transportation
  'flight', 'boarding', 'departure',
  'check-in', 'check in', 'checkout', 'check out',
  'hotel', 'accommodation',
  'train', 'bus', 'taxi', 'uber', 'lyft',
  
  // Services
  'service appointment',
  'installation',
  'maintenance',
  'repair',
  
  // E-commerce
  'order confirmed', 'order confirmation',
  'order status',
  'out for delivery',
  'dispatched'
];

// ============= EMAIL FILTERS =============
// Domains to prioritize (common logistics senders)
export const PRIORITY_DOMAINS = [
  'amazon.com',
  'fedex.com',
  'ups.com',
  'usps.com',
  'dhl.com',
  'shopify.com',
  'booking.com',
  'airbnb.com',
  'expedia.com',
  'uber.com',
  'lyft.com'
];

// Domains to ignore (newsletters, marketing, etc.)
export const IGNORE_DOMAINS = [
  'noreply@',
  'newsletter@',
  'marketing@',
  'unsubscribe@',
  'notifications@facebook.com',
  'notifications@twitter.com',
  'notifications@linkedin.com'
];

// ============= CALENDAR SETTINGS =============
export const CALENDAR_DEFAULTS = {
  REMINDER_POPUP_MINUTES: 30,
  REMINDER_EMAIL_MINUTES: 60,
  DEFAULT_EVENT_DURATION_HOURS: 1
};

// ============= ERROR RETRY CONFIGURATION =============
export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY_MS: 1000,
  BACKOFF_MULTIPLIER: 2, // Exponential backoff: 1s, 2s, 4s
  MAX_DELAY_MS: 10000
};

// ============= NOTIFICATION SETTINGS =============
export const NOTIFICATIONS = {
  ENABLED: true,
  SHOW_ON_EVENT_CREATED: true,
  SHOW_ON_ERROR: false // Set to true for debugging
};

// ============= DEBUG SETTINGS =============
export const DEBUG = {
  ENABLED: true, // Enable detailed console logging
  LOG_EMAIL_CONTENT: false, // Set to true to log full email content (privacy concern)
  LOG_AI_RESPONSES: true,
  LOG_API_CALLS: true
};

// ============= PROCESSED EMAIL CACHE =============
export const MAX_PROCESSED_EMAIL_IDS = 1000; // Keep last 1000 processed email IDs

// ============= AI PARSING CONFIGURATION =============
export const AI_CONFIG = {
  MIN_CONFIDENCE_THRESHOLD: 0.5, // Only create events if AI confidence > 50%
  MAX_EMAIL_CHARS_TO_PARSE: 4000, // Truncate long emails to save tokens
  INCLUDE_EMAIL_METADATA: true // Include from/subject in AI prompt
};

// ============= EVENT TYPES =============
export const EVENT_TYPES = {
  DELIVERY: 'delivery',
  PICKUP: 'pickup',
  MEETING: 'meeting',
  APPOINTMENT: 'appointment',
  SHIPMENT: 'shipment',
  FLIGHT: 'flight',
  HOTEL: 'hotel',
  SERVICE: 'service',
  OTHER: 'other'
};

// ============= SYNC STATUS =============
export const SYNC_STATUS = {
  PENDING: 'pending',
  SYNCED: 'synced',
  FAILED: 'failed'
};

// ============= PROCESSING STATUS =============
export const PROCESSING_STATUS = {
  PROCESSED: 'processed',
  SKIPPED: 'skipped',
  ERROR: 'error'
};

