/**
 * Shared Data Models (JavaScript)
 * Common data structures used across ATMS, Email Parser, and Chrome Extension
 */

// =====================================
// CORE EMAIL PROCESSING TYPES
// =====================================

/**
 * Email Transport Types - How the email arrived in the system
 */
export const EMAIL_TRANSPORT = {
  EXTENSION: 'extension',
  IMAP: 'imap',
  WEBHOOK: 'webhook',
  API: 'api',
  MANUAL: 'manual'
};

/**
 * Processing Status for emails and events
 */
export const PROCESSING_STATUS = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS', 
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  RETRY: 'RETRY',
  CANCELLED: 'CANCELLED'
};

/**
 * Priority levels for emails and events
 */
export const PRIORITY_LEVELS = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent'
};

/**
 * Event types recognized by the system
 */
export const EVENT_TYPES = {
  // Equipment & Logistics
  EQUIPMENT_DELIVERY: 'equipment_delivery',
  EQUIPMENT_REQUEST: 'equipment_request',
  LOGISTICS_DELIVERY: 'logistics_delivery',
  
  // Meetings & Appointments
  MEETING: 'meeting',
  APPOINTMENT: 'appointment',
  
  // Venue & Booking
  VENUE_BOOKING: 'venue_booking',
  SOUNDCHECK: 'soundcheck',
  
  // Performance & Shows
  SHOW: 'show',
  PERFORMANCE: 'performance',
  
  // Travel & Accommodation
  TRAVEL: 'travel',
  ACCOMMODATION: 'accommodation',
  
  // General
  GENERAL: 'general'
};

/**
 * Intent categories for AI classification
 */
export const INTENT_CATEGORIES = {
  ATMS_EVENT: 'atms_event',
  EQUIPMENT_REQUEST: 'equipment_request',
  VENUE_BOOKING: 'venue_booking',
  MEETING_REQUEST: 'meeting_request',
  STATUS_UPDATE: 'status_update',
  NOTIFICATION: 'notification',
  SPAM: 'spam',
  UNKNOWN: 'unknown'
};

/**
 * Contact types
 */
export const CONTACT_TYPES = {
  EMAIL: 'email',
  PERSON: 'person',
  COMPANY: 'company',
  VENUE: 'venue',
  ARTIST: 'artist'
};

// =====================================
// TRANSFORMATION UTILITIES
// =====================================

/**
 * Transform extension email to RFC-822 format for email parser
 * @param {Object} email - Gmail email object from extension
 * @returns {string} RFC-822 formatted email
 */
export function transformToRFC822(email) {
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

/**
 * Transform AI result to standardized entity format
 * @param {Object} aiResult - AI processing result from extension
 * @returns {Object} Standardized entities object
 */
export function transformAIResultToEntities(aiResult) {
  return {
    intent: mapIntentToCategory(aiResult.eventIntent || aiResult.intent),
    eventType: mapEventTypeToStandard(aiResult.eventType),
    urgency: mapUrgencyToPriority(aiResult.urgency),
    confidence: aiResult.confidence || 0.8,
    
    contacts: extractContacts(aiResult),
    locations: extractLocations(aiResult),
    dates: aiResult.dates || aiResult.eventDate ? [aiResult.eventDate] : [],
    times: aiResult.times || aiResult.eventTime ? [aiResult.eventTime] : [],
    equipment: aiResult.equipment || aiResult.equipmentMentioned || [],
    keywords: aiResult.keywords || []
  };
}

/**
 * Transform event data for ATMS format
 * @param {Object} eventData - Event data from extension
 * @returns {Object} ATMS-formatted event data
 */
export function transformEventForATMS(eventData) {
  return {
    title: eventData.eventTitle || eventData.title,
    description: eventData.eventDescription || eventData.description,
    type: mapEventTypeToATMS(eventData.eventType),
    startDate: eventData.startDateTime,
    endDate: eventData.endDateTime,
    location: eventData.location,
    contacts: extractContactsFromEvent(eventData),
    metadata: {
      source: EMAIL_TRANSPORT.EXTENSION,
      originalEmailId: eventData.emailId,
      calendarEventId: eventData.calendarEventId,
      aiConfidence: eventData.aiConfidence,
      extractedEntities: eventData.entities || {}
    },
    tags: generateTagsFromEvent(eventData),
    priority: eventData.urgency || PRIORITY_LEVELS.NORMAL
  };
}

/**
 * Create email parser payload from extension data
 * @param {Object} email - Gmail email object
 * @param {Object} aiResult - AI processing result
 * @param {Object} eventData - Created event data
 * @param {string} userId - User ID
 * @returns {Object} Email parser API payload
 */
export function createEmailParserPayload(email, aiResult, eventData, userId) {
  return {
    payload: transformToRFC822(email),
    transport: EMAIL_TRANSPORT.EXTENSION,
    headers: {
      subject: email.subject,
      from: email.from,
      to: email.to || [],
      date: email.date || new Date().toISOString(),
      messageId: email.id
    },
    metadata: {
      source: EMAIL_TRANSPORT.EXTENSION,
      userId,
      priority: mapUrgencyToPriority(aiResult.urgency),
      category: 'tour_management',
      originalEmailId: email.id,
      calendarEventId: eventData.calendarEventId,
      extractedData: transformAIResultToEntities(aiResult),
      eventData: eventData,
      atmsEventType: mapEventTypeToStandard(aiResult.eventType)
    }
  };
}

// =====================================
// MAPPING FUNCTIONS
// =====================================

/**
 * Map extension intent to standard intent category
 * @param {string} intent - Intent from extension
 * @returns {string} Standard intent category
 */
function mapIntentToCategory(intent) {
  const intentMap = {
    'event_creation': INTENT_CATEGORIES.ATMS_EVENT,
    'equipment_request': INTENT_CATEGORIES.EQUIPMENT_REQUEST,
    'venue_booking': INTENT_CATEGORIES.VENUE_BOOKING,
    'meeting_request': INTENT_CATEGORIES.MEETING_REQUEST,
    'status_update': INTENT_CATEGORIES.STATUS_UPDATE
  };
  
  return intentMap[intent] || INTENT_CATEGORIES.UNKNOWN;
}

/**
 * Map extension event type to standard event type
 * @param {string} eventType - Event type from extension
 * @returns {string} Standard event type
 */
function mapEventTypeToStandard(eventType) {
  if (!eventType) return EVENT_TYPES.GENERAL;
  
  const typeMap = {
    'logistics_delivery': EVENT_TYPES.EQUIPMENT_DELIVERY,
    'meeting': EVENT_TYPES.MEETING,
    'appointment': EVENT_TYPES.APPOINTMENT,
    'equipment_request': EVENT_TYPES.EQUIPMENT_REQUEST,
    'venue_booking': EVENT_TYPES.VENUE_BOOKING,
    'soundcheck': EVENT_TYPES.SOUNDCHECK,
    'performance': EVENT_TYPES.SHOW,
    'show': EVENT_TYPES.SHOW,
    'travel': EVENT_TYPES.TRAVEL,
    'accommodation': EVENT_TYPES.ACCOMMODATION
  };

  return typeMap[eventType] || EVENT_TYPES.GENERAL;
}

/**
 * Map extension event types to ATMS event types
 * @param {string} eventType - Event type from extension
 * @returns {string} ATMS event type
 */
function mapEventTypeToATMS(eventType) {
  const typeMap = {
    'logistics_delivery': 'equipment_delivery',
    'meeting': 'meeting',
    'appointment': 'appointment',
    'equipment_request': 'equipment_request',
    'venue_booking': 'venue_booking',
    'soundcheck': 'soundcheck',
    'performance': 'show',
    'travel': 'travel',
    'accommodation': 'accommodation'
  };

  return typeMap[eventType] || 'general';
}

/**
 * Map extension urgency to standard priority level
 * @param {string} urgency - Urgency from extension
 * @returns {string} Standard priority level
 */
function mapUrgencyToPriority(urgency) {
  const priorityMap = {
    'urgent': PRIORITY_LEVELS.URGENT,
    'high': PRIORITY_LEVELS.HIGH,
    'medium': PRIORITY_LEVELS.NORMAL,
    'normal': PRIORITY_LEVELS.NORMAL,
    'low': PRIORITY_LEVELS.LOW
  };

  return priorityMap[urgency] || PRIORITY_LEVELS.NORMAL;
}

// =====================================
// EXTRACTION UTILITIES
// =====================================

/**
 * Extract contacts from AI result
 * @param {Object} aiResult - AI processing result
 * @returns {Array} Array of contact objects
 */
function extractContacts(aiResult) {
  const contacts = [];
  
  // Extract from direct contact fields
  if (aiResult.contacts) {
    contacts.push(...aiResult.contacts.map(contact => ({
      name: contact.name,
      email: contact.email,
      role: contact.role || 'mentioned',
      type: CONTACT_TYPES.PERSON
    })));
  }
  
  // Extract from people mentions
  if (aiResult.people) {
    contacts.push(...aiResult.people.map(person => ({
      name: typeof person === 'string' ? person : person.name,
      role: 'mentioned',
      type: CONTACT_TYPES.PERSON
    })));
  }
  
  return contacts;
}

/**
 * Extract locations from AI result
 * @param {Object} aiResult - AI processing result
 * @returns {Array} Array of location objects
 */
function extractLocations(aiResult) {
  const locations = [];
  
  if (aiResult.location) {
    if (typeof aiResult.location === 'string') {
      locations.push({ name: aiResult.location });
    } else if (aiResult.location.name) {
      locations.push(aiResult.location);
    }
  }
  
  if (aiResult.locations) {
    locations.push(...aiResult.locations.map(loc => 
      typeof loc === 'string' ? { name: loc } : loc
    ));
  }
  
  if (aiResult.venue) {
    locations.push({ 
      name: aiResult.venue,
      type: 'venue'
    });
  }
  
  return locations;
}

/**
 * Extract contact information from event data
 * @param {Object} eventData - Event data
 * @returns {Array} Array of contact objects
 */
function extractContactsFromEvent(eventData) {
  const contacts = [];

  // Extract from email participants
  if (eventData.emailFrom) {
    contacts.push({
      email: eventData.emailFrom,
      name: extractNameFromEmail(eventData.emailFrom),
      role: 'sender',
      type: CONTACT_TYPES.EMAIL
    });
  }

  // Extract from entities if available
  if (eventData.entities && eventData.entities.people) {
    eventData.entities.people.forEach(person => {
      if (typeof person === 'string') {
        contacts.push({
          name: person,
          role: 'mentioned',
          type: CONTACT_TYPES.PERSON
        });
      }
    });
  }

  return contacts;
}

/**
 * Generate tags from event data
 * @param {Object} eventData - Event data
 * @returns {Array} Array of tags
 */
function generateTagsFromEvent(eventData) {
  const tags = ['gmail-sync'];

  // Add event type as tag
  if (eventData.eventType) {
    tags.push(eventData.eventType);
  }

  // Add urgency as tag
  if (eventData.urgency && eventData.urgency !== 'normal') {
    tags.push(eventData.urgency);
  }

  // Add entity-based tags
  if (eventData.entities) {
    if (eventData.entities.equipment && eventData.entities.equipment.length > 0) {
      tags.push('equipment');
    }
    if (eventData.entities.locations && eventData.entities.locations.length > 0) {
      tags.push('location-specific');
    }
  }

  return tags;
}

/**
 * Extract name from email address
 * @param {string} email - Email address
 * @returns {string} Extracted name or email
 */
function extractNameFromEmail(email) {
  // Simple name extraction - can be improved
  const match = email.match(/^([^<]+)<(.+)>$/);
  if (match) {
    return match[1].trim();
  }

  const atIndex = email.indexOf('@');
  if (atIndex > 0) {
    return email.substring(0, atIndex);
  }

  return email;
}

// =====================================
// VALIDATION UTILITIES
// =====================================

/**
 * Validate contact data
 * @param {Object} contact - Contact object to validate
 * @returns {Object} Validation result
 */
export function validateContact(contact) {
  if (!contact || typeof contact !== 'object') {
    return { valid: false, errors: ['Contact must be an object'] };
  }

  const errors = [];
  
  if (!contact.name && !contact.email) {
    errors.push('Contact must have at least a name or email');
  }
  
  if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
    errors.push('Invalid email format');
  }
  
  if (contact.type && !Object.values(CONTACT_TYPES).includes(contact.type)) {
    errors.push('Invalid contact type');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate event type
 * @param {string} eventType - Event type to validate
 * @returns {boolean} Whether event type is valid
 */
export function validateEventType(eventType) {
  return Object.values(EVENT_TYPES).includes(eventType);
}

/**
 * Validate priority level
 * @param {string} priority - Priority level to validate
 * @returns {boolean} Whether priority is valid
 */
export function validatePriority(priority) {
  return Object.values(PRIORITY_LEVELS).includes(priority);
}

// =====================================
// UTILITY FUNCTIONS
// =====================================

/**
 * Get display name for event type
 * @param {string} eventType - Event type
 * @returns {string} Human-readable display name
 */
export function getEventTypeDisplayName(eventType) {
  return eventType.split('_').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

/**
 * Get icon for event type
 * @param {string} eventType - Event type
 * @returns {string} Emoji icon
 */
export function getEventTypeIcon(eventType) {
  switch (eventType) {
    case EVENT_TYPES.EQUIPMENT_DELIVERY:
    case EVENT_TYPES.EQUIPMENT_REQUEST:
      return '🎤';
    case EVENT_TYPES.MEETING:
    case EVENT_TYPES.APPOINTMENT:
      return '📅';
    case EVENT_TYPES.VENUE_BOOKING:
      return '🏟️';
    case EVENT_TYPES.SOUNDCHECK:
      return '🔊';
    case EVENT_TYPES.SHOW:
    case EVENT_TYPES.PERFORMANCE:
      return '🎭';
    case EVENT_TYPES.TRAVEL:
      return '✈️';
    case EVENT_TYPES.ACCOMMODATION:
      return '🏨';
    default:
      return '📧';
  }
}