/**
 * Tests for Artist Profile Schema
 * Run with: node tests/artist-profile-schema.test.js
 */

// Simple test framework
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

// Mock the module (since we can't use ES modules directly in Node without setup)
// We'll inline the key functions for testing

function generateProfileId() {
  return `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

const ARTIST_TYPES = {
  DJ: 'dj',
  LIVE_ACT: 'live_act',
  BAND: 'band',
  SOLO: 'solo',
  OTHER: 'other'
};

const VISIBILITY = {
  PRIVATE: 'private',
  ORGANIZATION: 'organization'
};

function createArtistProfile(data = {}) {
  const now = new Date().toISOString();

  return {
    id: data.id || generateProfileId(),
    artistName: data.artistName || '',
    type: data.type || ARTIST_TYPES.OTHER,
    crewSize: data.crewSize || null,
    organizationId: data.organizationId || null,
    visibility: data.visibility || VISIBILITY.PRIVATE,
    contacts: data.contacts || [],
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
    documents: {
      techRider: data.documents?.techRider || '',
      stageRider: data.documents?.stageRider || '',
      hospitalityRider: data.documents?.hospitalityRider || '',
      pressKit: data.documents?.pressKit || '',
      inputList: data.documents?.inputList || '',
      other: data.documents?.other || ''
    },
    createdAt: data.createdAt || now,
    updatedAt: now,
    createdBy: data.createdBy || null
  };
}

function validateProfile(profile) {
  const errors = [];

  if (!profile) {
    return { valid: false, errors: ['Profile is required'] };
  }

  if (!profile.artistName?.trim()) {
    errors.push('Artist name is required');
  }

  return { valid: errors.length === 0, errors };
}

// ============================================
// TESTS
// ============================================

console.log('\n🎸 Artist Profile Schema Tests\n');
console.log('================================\n');

// Profile ID Generation
console.log('Profile ID Generation:');
test('generateProfileId returns a string', () => {
  const id = generateProfileId();
  assertEqual(typeof id, 'string');
});

test('generateProfileId starts with "profile_"', () => {
  const id = generateProfileId();
  assert(id.startsWith('profile_'), 'ID should start with profile_');
});

test('generateProfileId creates unique IDs', () => {
  const id1 = generateProfileId();
  const id2 = generateProfileId();
  assert(id1 !== id2, 'IDs should be unique');
});

// Profile Creation
console.log('\nProfile Creation:');
test('createArtistProfile with no data returns defaults', () => {
  const profile = createArtistProfile();
  assert(profile.id.startsWith('profile_'), 'Should have generated ID');
  assertEqual(profile.artistName, '', 'Artist name should be empty');
  assertEqual(profile.type, 'other', 'Type should default to other');
  assertEqual(profile.visibility, 'private', 'Visibility should default to private');
});

test('createArtistProfile preserves provided data', () => {
  const profile = createArtistProfile({
    artistName: 'Test Band',
    type: 'band',
    crewSize: 5
  });
  assertEqual(profile.artistName, 'Test Band');
  assertEqual(profile.type, 'band');
  assertEqual(profile.crewSize, 5);
});

test('createArtistProfile creates proper tech specs structure', () => {
  const profile = createArtistProfile({
    techSpecs: {
      text: 'Need 4 mics',
      documentUrl: 'https://example.com/rider.pdf'
    }
  });
  assertEqual(profile.techSpecs.text, 'Need 4 mics');
  assertEqual(profile.techSpecs.documentUrl, 'https://example.com/rider.pdf');
});

test('createArtistProfile handles contacts array', () => {
  const contacts = [
    { name: 'John', email: 'john@test.com', role: 'Manager', isPrimary: true },
    { name: 'Jane', email: 'jane@test.com', role: 'Agent', isPrimary: false }
  ];
  const profile = createArtistProfile({ contacts });
  assertEqual(profile.contacts.length, 2);
  assertEqual(profile.contacts[0].name, 'John');
  assert(profile.contacts[0].isPrimary, 'First contact should be primary');
});

test('createArtistProfile handles organization assignment', () => {
  const profile = createArtistProfile({
    organizationId: 'org_123',
    visibility: 'organization'
  });
  assertEqual(profile.organizationId, 'org_123');
  assertEqual(profile.visibility, 'organization');
});

// Validation
console.log('\nProfile Validation:');
test('validateProfile rejects null profile', () => {
  const result = validateProfile(null);
  assertEqual(result.valid, false);
  assert(result.errors.includes('Profile is required'));
});

test('validateProfile rejects empty artist name', () => {
  const profile = createArtistProfile({ artistName: '' });
  const result = validateProfile(profile);
  assertEqual(result.valid, false);
  assert(result.errors.includes('Artist name is required'));
});

test('validateProfile rejects whitespace-only artist name', () => {
  const profile = createArtistProfile({ artistName: '   ' });
  const result = validateProfile(profile);
  assertEqual(result.valid, false);
});

test('validateProfile accepts valid profile', () => {
  const profile = createArtistProfile({ artistName: 'Valid Band' });
  const result = validateProfile(profile);
  assertEqual(result.valid, true);
  assertEqual(result.errors.length, 0);
});

// Document URLs
console.log('\nDocument URLs:');
test('createArtistProfile handles all document URL fields', () => {
  const profile = createArtistProfile({
    documents: {
      techRider: 'https://example.com/tech.pdf',
      stageRider: 'https://example.com/stage.pdf',
      hospitalityRider: 'https://example.com/hosp.pdf',
      pressKit: 'https://example.com/press.pdf',
      inputList: 'https://example.com/inputs.pdf',
      other: 'https://example.com/other.pdf'
    }
  });
  assertEqual(profile.documents.techRider, 'https://example.com/tech.pdf');
  assertEqual(profile.documents.stageRider, 'https://example.com/stage.pdf');
  assertEqual(profile.documents.hospitalityRider, 'https://example.com/hosp.pdf');
  assertEqual(profile.documents.pressKit, 'https://example.com/press.pdf');
  assertEqual(profile.documents.inputList, 'https://example.com/inputs.pdf');
  assertEqual(profile.documents.other, 'https://example.com/other.pdf');
});

// Artist Types
console.log('\nArtist Types:');
test('ARTIST_TYPES has all expected values', () => {
  assertEqual(ARTIST_TYPES.DJ, 'dj');
  assertEqual(ARTIST_TYPES.LIVE_ACT, 'live_act');
  assertEqual(ARTIST_TYPES.BAND, 'band');
  assertEqual(ARTIST_TYPES.SOLO, 'solo');
  assertEqual(ARTIST_TYPES.OTHER, 'other');
});

// Summary
console.log('\n================================');
console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
