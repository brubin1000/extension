/**
 * Artist Profile Schema
 * Data model for DJ/artist tech riders, hospitality, and contact info
 */

export const ARTIST_TYPES = {
  DJ: 'dj',
  LIVE_ACT: 'live_act',
  BAND: 'band'
};

export const VISIBILITY = {
  PRIVATE: 'private',
  ORGANIZATION: 'organization'
};

/**
 * Generate a unique profile ID
 */
export function generateProfileId() {
  return `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Creates a new artist profile with defaults
 * @param {Object} data - Partial profile data
 * @returns {Object} Complete profile object
 */
export function createArtistProfile(data = {}) {
  const now = new Date().toISOString();

  return {
    id: data.id || generateProfileId(),
    artistName: data.artistName || '',
    type: data.type || ARTIST_TYPES.DJ,
    crewSize: data.crewSize || 1,

    // Organization for shared access
    organizationId: data.organizationId || null,
    visibility: data.visibility || VISIBILITY.PRIVATE,

    // Contacts array
    contacts: data.contacts || [],
    // Contact shape: { id, name, phone, email, role, isPrimary }

    // Terms and conditions
    terms: {
      transportation: data.terms?.transportation || '',
      meals: data.terms?.meals || '',
      hotelRequirements: data.terms?.hotelRequirements || '',
      cancellationPolicy: data.terms?.cancellationPolicy || '',
      securityRequirements: data.terms?.securityRequirements || ''
    },

    // Technical specifications
    techSpecs: {
      mixer: {
        preferred: data.techSpecs?.mixer?.preferred || '',
        acceptable: data.techSpecs?.mixer?.acceptable || [],
        quantity: data.techSpecs?.mixer?.quantity || 1
      },
      cdjs: {
        model: data.techSpecs?.cdjs?.model || '',
        quantity: data.techSpecs?.cdjs?.quantity || 2,
        minimum: data.techSpecs?.cdjs?.minimum || '',
        notes: data.techSpecs?.cdjs?.notes || ''
      },
      monitors: {
        boothMonitors: data.techSpecs?.monitors?.boothMonitors || '',
        subwoofers: data.techSpecs?.monitors?.subwoofers || '',
        notes: data.techSpecs?.monitors?.notes || ''
      },
      microphone: {
        model: data.techSpecs?.microphone?.model || '',
        quantity: data.techSpecs?.microphone?.quantity || 0,
        cables: data.techSpecs?.microphone?.cables || []
      },
      recording: {
        required: data.techSpecs?.recording?.required || false,
        setup: data.techSpecs?.recording?.setup || ''
      },
      other: data.techSpecs?.other || [],
      summary: data.techSpecs?.summary || ''
    },

    // Lighting preferences
    lighting: {
      preference: data.lighting?.preference || '',
      notes: data.lighting?.notes || ''
    },

    // Hospitality requirements
    hospitality: {
      drinks: data.hospitality?.drinks || [],
      // Drink shape: { item, quantity, notes }
      food: {
        meals: data.hospitality?.food?.meals || '',
        notes: data.hospitality?.food?.notes || ''
      },
      other: data.hospitality?.other || [],
      // Other shape: { item, quantity, notes }
      summary: data.hospitality?.summary || ''
    },

    // Document links (URLs)
    documents: {
      techRider: {
        url: data.documents?.techRider?.url || '',
        lastUpdated: data.documents?.techRider?.lastUpdated || null
      },
      stageRider: {
        url: data.documents?.stageRider?.url || '',
        lastUpdated: data.documents?.stageRider?.lastUpdated || null
      },
      pressKit: {
        url: data.documents?.pressKit?.url || ''
      },
      hospitality: {
        url: data.documents?.hospitality?.url || ''
      }
    },

    // Media assets
    media: data.media || [],
    // Media shape: { id, type, url, description, isApproved }

    // Metadata
    createdAt: data.createdAt || now,
    updatedAt: now,
    createdBy: data.createdBy || null
  };
}

/**
 * Validate a profile has required fields
 * @param {Object} profile
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateProfile(profile) {
  const errors = [];

  if (!profile) {
    return { valid: false, errors: ['Profile is required'] };
  }

  if (!profile.artistName?.trim()) {
    errors.push('Artist name is required');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Generate tech specs summary for copy/paste
 * @param {Object} profile
 * @returns {string}
 */
export function generateTechSpecsSummary(profile) {
  const ts = profile.techSpecs;
  if (!ts) return '';

  const lines = [];

  if (ts.mixer?.preferred) {
    lines.push(`Mixer: ${ts.mixer.preferred}`);
  }
  if (ts.cdjs?.model) {
    let cdj = `CDJs: ${ts.cdjs.quantity}x ${ts.cdjs.model}`;
    if (ts.cdjs.minimum) cdj += ` (minimum: ${ts.cdjs.minimum})`;
    if (ts.cdjs.notes) cdj += ` - ${ts.cdjs.notes}`;
    lines.push(cdj);
  }
  if (ts.monitors?.boothMonitors) {
    let mon = `Booth Monitors: ${ts.monitors.boothMonitors}`;
    if (ts.monitors.subwoofers) mon += ` + ${ts.monitors.subwoofers} subs`;
    if (ts.monitors.notes) mon += ` - ${ts.monitors.notes}`;
    lines.push(mon);
  }
  if (ts.microphone?.model) {
    let mic = `Microphone: ${ts.microphone.quantity}x ${ts.microphone.model}`;
    if (ts.microphone.cables?.length) mic += ` (${ts.microphone.cables.join(', ')})`;
    lines.push(mic);
  }
  if (ts.recording?.required && ts.recording.setup) {
    lines.push(`Recording: ${ts.recording.setup}`);
  }
  if (ts.other?.length) {
    lines.push(`Other: ${ts.other.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Generate hospitality summary for copy/paste
 * @param {Object} profile
 * @returns {string}
 */
export function generateHospitalitySummary(profile) {
  const h = profile.hospitality;
  if (!h) return '';

  const lines = [];

  if (h.drinks?.length) {
    const drinksList = h.drinks.map(d => {
      let str = `${d.quantity} ${d.item}`;
      if (d.notes) str += ` (${d.notes})`;
      return str;
    }).join(', ');
    lines.push(`Drinks: ${drinksList}`);
  }

  if (h.food?.meals) {
    let food = `Food: ${h.food.meals}`;
    if (h.food.notes) food += ` - ${h.food.notes}`;
    lines.push(food);
  }

  if (h.other?.length) {
    const otherList = h.other.map(o => {
      let str = `${o.quantity} ${o.item}`;
      if (o.notes) str += ` (${o.notes})`;
      return str;
    }).join(', ');
    lines.push(`Other: ${otherList}`);
  }

  return lines.join('\n');
}

/**
 * Generate contacts summary for copy/paste
 * @param {Object} profile
 * @returns {string}
 */
export function generateContactsSummary(profile) {
  const contacts = profile.contacts;
  if (!contacts?.length) return 'No contacts';

  return contacts.map(c => {
    const parts = [c.name];
    if (c.role) parts.push(`(${c.role})`);
    if (c.phone) parts.push(c.phone);
    if (c.email) parts.push(c.email);
    return parts.join(' - ');
  }).join('\n');
}

/**
 * Generate full profile text for copy/paste
 * @param {Object} profile
 * @returns {string}
 */
export function generateFullProfileText(profile) {
  const sections = [];

  // Header
  sections.push(`=== ${profile.artistName.toUpperCase()} ===`);
  sections.push(`Type: ${profile.type} | Crew Size: ${profile.crewSize}`);
  sections.push('');

  // Contacts
  sections.push('--- ADVANCE CONTACTS ---');
  sections.push(generateContactsSummary(profile));
  sections.push('');

  // Tech specs
  sections.push('--- TECHNICAL SPECIFICATIONS ---');
  sections.push(profile.techSpecs?.summary || generateTechSpecsSummary(profile));
  sections.push('');

  // Lighting
  if (profile.lighting?.preference || profile.lighting?.notes) {
    sections.push('--- LIGHTING ---');
    if (profile.lighting.preference) sections.push(`Preference: ${profile.lighting.preference}`);
    if (profile.lighting.notes) sections.push(profile.lighting.notes);
    sections.push('');
  }

  // Hospitality
  sections.push('--- HOSPITALITY ---');
  sections.push(profile.hospitality?.summary || generateHospitalitySummary(profile));
  sections.push('');

  // Terms
  const terms = profile.terms;
  if (terms?.transportation || terms?.meals || terms?.hotelRequirements) {
    sections.push('--- TERMS ---');
    if (terms.transportation) sections.push(`Transportation: ${terms.transportation}`);
    if (terms.meals) sections.push(`Meals: ${terms.meals}`);
    if (terms.hotelRequirements) sections.push(`Hotel: ${terms.hotelRequirements}`);
    if (terms.cancellationPolicy) sections.push(`Cancellation: ${terms.cancellationPolicy}`);
    if (terms.securityRequirements) sections.push(`Security: ${terms.securityRequirements}`);
    sections.push('');
  }

  // Documents
  const docs = profile.documents;
  if (docs?.techRider?.url || docs?.stageRider?.url || docs?.pressKit?.url) {
    sections.push('--- DOCUMENTS ---');
    if (docs.techRider?.url) sections.push(`Tech Rider: ${docs.techRider.url}`);
    if (docs.stageRider?.url) sections.push(`Stage Rider: ${docs.stageRider.url}`);
    if (docs.pressKit?.url) sections.push(`Press Kit: ${docs.pressKit.url}`);
    if (docs.hospitality?.url) sections.push(`Hospitality Rider: ${docs.hospitality.url}`);
  }

  return sections.join('\n');
}
