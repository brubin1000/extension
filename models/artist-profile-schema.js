/**
 * Artist Profile Schema - SIMPLIFIED
 * Works for DJs, bands, live acts, any performer type
 * Each section: raw text OR document link - user's choice
 */

export const ARTIST_TYPES = {
  DJ: 'dj',
  LIVE_ACT: 'live_act',
  BAND: 'band',
  SOLO: 'solo',
  OTHER: 'other'
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
 * SIMPLIFIED: Each section is just text + optional doc link
 */
export function createArtistProfile(data = {}) {
  const now = new Date().toISOString();

  return {
    id: data.id || generateProfileId(),
    artistName: data.artistName || '',
    type: data.type || ARTIST_TYPES.OTHER,
    crewSize: data.crewSize || null,

    // Organization for shared access
    organizationId: data.organizationId || null,
    visibility: data.visibility || VISIBILITY.PRIVATE,

    // Contacts array
    contacts: data.contacts || [],
    // Contact shape: { name, phone, email, role, isPrimary }

    // SIMPLIFIED SECTIONS - each has text + documentUrl
    techSpecs: {
      text: data.techSpecs?.text || '',
      documentUrl: data.techSpecs?.documentUrl || ''
    },

    hospitality: {
      text: data.hospitality?.text || '',
      documentUrl: data.hospitality?.documentUrl || ''
    },

    stageRequirements: {
      text: data.stageRequirements?.text || '',
      documentUrl: data.stageRequirements?.documentUrl || ''
    },

    terms: {
      text: data.terms?.text || '',
      documentUrl: data.terms?.documentUrl || ''
    },

    // Quick-access document links
    documents: {
      techRider: data.documents?.techRider || '',
      stageRider: data.documents?.stageRider || '',
      hospitalityRider: data.documents?.hospitalityRider || '',
      pressKit: data.documents?.pressKit || '',
      inputList: data.documents?.inputList || '',
      other: data.documents?.other || ''
    },

    // Metadata
    createdAt: data.createdAt || now,
    updatedAt: now,
    createdBy: data.createdBy || null
  };
}

/**
 * Validate a profile has required fields
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
 * Generate section text for copy/paste
 * @param {Object} profile
 * @param {string} section - 'tech', 'hospitality', 'stage', 'terms', 'contacts', 'full'
 */
export function generateSectionText(profile, section) {
  switch (section) {
    case 'tech':
      return formatSection('TECH SPECS', profile.techSpecs);

    case 'hospitality':
      return formatSection('HOSPITALITY', profile.hospitality);

    case 'stage':
      return formatSection('STAGE REQUIREMENTS', profile.stageRequirements);

    case 'terms':
      return formatSection('TERMS', profile.terms);

    case 'contacts':
      return formatContacts(profile.contacts);

    case 'full':
      return generateFullProfileText(profile);

    default:
      return '';
  }
}

function formatSection(title, data) {
  if (!data) return '';

  const parts = [];
  if (data.text) {
    parts.push(data.text);
  }
  if (data.documentUrl) {
    parts.push(`Document: ${data.documentUrl}`);
  }

  if (parts.length === 0) return '';
  return `--- ${title} ---\n${parts.join('\n')}`;
}

function formatContacts(contacts) {
  if (!contacts?.length) return 'No contacts';

  const lines = contacts.map(c => {
    const parts = [c.name];
    if (c.role) parts[0] += ` (${c.role})`;
    if (c.phone) parts.push(c.phone);
    if (c.email) parts.push(c.email);
    if (c.isPrimary) parts.push('[PRIMARY]');
    return parts.join(' | ');
  });

  return `--- ADVANCE CONTACTS ---\n${lines.join('\n')}`;
}

/**
 * Generate full profile text for copy/paste
 */
export function generateFullProfileText(profile) {
  const sections = [];

  // Header
  sections.push(`========================================`);
  sections.push(`${profile.artistName.toUpperCase()}`);
  sections.push(`Type: ${formatType(profile.type)}${profile.crewSize ? ` | Crew: ${profile.crewSize}` : ''}`);
  sections.push(`========================================`);
  sections.push('');

  // Contacts
  if (profile.contacts?.length) {
    sections.push(formatContacts(profile.contacts));
    sections.push('');
  }

  // Tech specs
  const tech = formatSection('TECH SPECS', profile.techSpecs);
  if (tech) {
    sections.push(tech);
    sections.push('');
  }

  // Stage requirements
  const stage = formatSection('STAGE REQUIREMENTS', profile.stageRequirements);
  if (stage) {
    sections.push(stage);
    sections.push('');
  }

  // Hospitality
  const hosp = formatSection('HOSPITALITY', profile.hospitality);
  if (hosp) {
    sections.push(hosp);
    sections.push('');
  }

  // Terms
  const terms = formatSection('TERMS', profile.terms);
  if (terms) {
    sections.push(terms);
    sections.push('');
  }

  // Documents
  const docs = profile.documents;
  if (docs && Object.values(docs).some(v => v)) {
    sections.push('--- DOCUMENTS ---');
    if (docs.techRider) sections.push(`Tech Rider: ${docs.techRider}`);
    if (docs.stageRider) sections.push(`Stage Rider: ${docs.stageRider}`);
    if (docs.hospitalityRider) sections.push(`Hospitality: ${docs.hospitalityRider}`);
    if (docs.inputList) sections.push(`Input List: ${docs.inputList}`);
    if (docs.pressKit) sections.push(`Press Kit: ${docs.pressKit}`);
    if (docs.other) sections.push(`Other: ${docs.other}`);
  }

  return sections.join('\n');
}

function formatType(type) {
  const types = {
    dj: 'DJ',
    live_act: 'Live Act',
    band: 'Band',
    solo: 'Solo Artist',
    other: 'Artist'
  };
  return types[type] || type || 'Artist';
}

// Legacy exports for backward compatibility
export const generateTechSpecsSummary = (profile) => formatSection('TECH SPECS', profile.techSpecs);
export const generateHospitalitySummary = (profile) => formatSection('HOSPITALITY', profile.hospitality);
export const generateContactsSummary = (profile) => formatContacts(profile.contacts);
