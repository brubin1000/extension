/**
 * Tests for Organization Schema
 * Run with: node tests/organization-schema.test.js
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

// ============================================
// Inline schema functions for testing
// ============================================

const ORG_ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member'
};

function generateOrgId() {
  return `org_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateMemberId() {
  return `member_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function createOrganization(data = {}) {
  const now = new Date().toISOString();

  return {
    id: data.id || generateOrgId(),
    name: data.name || '',
    members: data.members || [],
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,
    createdBy: data.createdBy || null
  };
}

function createMember(data = {}) {
  const now = new Date().toISOString();

  return {
    id: data.id || generateMemberId(),
    userId: data.userId || null,
    email: data.email || '',
    displayName: data.displayName || '',
    role: data.role || ORG_ROLES.MEMBER,
    addedAt: data.addedAt || now,
    addedBy: data.addedBy || null
  };
}

function validateOrganization(org) {
  const errors = [];

  if (!org) {
    return { valid: false, errors: ['Organization is required'] };
  }

  if (!org.name?.trim()) {
    errors.push('Organization name is required');
  }

  if (!org.members || org.members.length === 0) {
    errors.push('Organization must have at least one member');
  } else {
    const owners = org.members.filter(m => m.role === ORG_ROLES.OWNER);
    if (owners.length === 0) {
      errors.push('Organization must have an owner');
    }
  }

  return { valid: errors.length === 0, errors };
}

function isMember(org, userId) {
  if (!org?.members || !userId) return false;
  return org.members.some(m => m.userId === userId);
}

function isOwner(org, userId) {
  if (!org?.members || !userId) return false;
  return org.members.some(m => m.userId === userId && m.role === ORG_ROLES.OWNER);
}

function canEditOrg(org, userId) {
  if (!org?.members || !userId) return false;
  const member = org.members.find(m => m.userId === userId);
  return member && (member.role === ORG_ROLES.OWNER || member.role === ORG_ROLES.ADMIN);
}

// ============================================
// TESTS
// ============================================

console.log('\n🏢 Organization Schema Tests\n');
console.log('================================\n');

// Organization ID Generation
console.log('Organization ID Generation:');
test('generateOrgId returns a string', () => {
  const id = generateOrgId();
  assertEqual(typeof id, 'string');
});

test('generateOrgId starts with "org_"', () => {
  const id = generateOrgId();
  assert(id.startsWith('org_'), 'ID should start with org_');
});

test('generateMemberId starts with "member_"', () => {
  const id = generateMemberId();
  assert(id.startsWith('member_'), 'ID should start with member_');
});

// Organization Creation
console.log('\nOrganization Creation:');
test('createOrganization with no data returns defaults', () => {
  const org = createOrganization();
  assert(org.id.startsWith('org_'), 'Should have generated ID');
  assertEqual(org.name, '', 'Name should be empty');
  assertEqual(org.members.length, 0, 'Members should be empty array');
});

test('createOrganization preserves provided data', () => {
  const org = createOrganization({
    name: 'Test Org',
    createdBy: 'user_123'
  });
  assertEqual(org.name, 'Test Org');
  assertEqual(org.createdBy, 'user_123');
});

// Member Creation
console.log('\nMember Creation:');
test('createMember with no data returns defaults', () => {
  const member = createMember();
  assert(member.id.startsWith('member_'), 'Should have generated ID');
  assertEqual(member.role, 'member', 'Default role should be member');
});

test('createMember preserves role', () => {
  const owner = createMember({ role: ORG_ROLES.OWNER });
  assertEqual(owner.role, 'owner');

  const admin = createMember({ role: ORG_ROLES.ADMIN });
  assertEqual(admin.role, 'admin');
});

test('createMember handles email and displayName', () => {
  const member = createMember({
    email: 'test@example.com',
    displayName: 'Test User',
    userId: 'user_456'
  });
  assertEqual(member.email, 'test@example.com');
  assertEqual(member.displayName, 'Test User');
  assertEqual(member.userId, 'user_456');
});

// Validation
console.log('\nOrganization Validation:');
test('validateOrganization rejects null organization', () => {
  const result = validateOrganization(null);
  assertEqual(result.valid, false);
  assert(result.errors.includes('Organization is required'));
});

test('validateOrganization rejects empty name', () => {
  const org = createOrganization({ name: '' });
  const result = validateOrganization(org);
  assertEqual(result.valid, false);
  assert(result.errors.includes('Organization name is required'));
});

test('validateOrganization rejects org without members', () => {
  const org = createOrganization({ name: 'Test Org', members: [] });
  const result = validateOrganization(org);
  assertEqual(result.valid, false);
  assert(result.errors.includes('Organization must have at least one member'));
});

test('validateOrganization rejects org without owner', () => {
  const org = createOrganization({
    name: 'Test Org',
    members: [createMember({ role: ORG_ROLES.MEMBER })]
  });
  const result = validateOrganization(org);
  assertEqual(result.valid, false);
  assert(result.errors.includes('Organization must have an owner'));
});

test('validateOrganization accepts valid org', () => {
  const org = createOrganization({
    name: 'Valid Org',
    members: [createMember({ userId: 'user_1', role: ORG_ROLES.OWNER })]
  });
  const result = validateOrganization(org);
  assertEqual(result.valid, true);
  assertEqual(result.errors.length, 0);
});

// Permission Checks
console.log('\nPermission Checks:');
test('isMember returns true for member', () => {
  const org = createOrganization({
    members: [createMember({ userId: 'user_1' })]
  });
  assert(isMember(org, 'user_1'), 'Should be a member');
});

test('isMember returns false for non-member', () => {
  const org = createOrganization({
    members: [createMember({ userId: 'user_1' })]
  });
  assert(!isMember(org, 'user_2'), 'Should not be a member');
});

test('isOwner returns true for owner', () => {
  const org = createOrganization({
    members: [createMember({ userId: 'user_1', role: ORG_ROLES.OWNER })]
  });
  assert(isOwner(org, 'user_1'), 'Should be owner');
});

test('isOwner returns false for non-owner member', () => {
  const org = createOrganization({
    members: [
      createMember({ userId: 'user_1', role: ORG_ROLES.OWNER }),
      createMember({ userId: 'user_2', role: ORG_ROLES.MEMBER })
    ]
  });
  assert(!isOwner(org, 'user_2'), 'Should not be owner');
});

test('canEditOrg returns true for owner', () => {
  const org = createOrganization({
    members: [createMember({ userId: 'user_1', role: ORG_ROLES.OWNER })]
  });
  assert(canEditOrg(org, 'user_1'), 'Owner should be able to edit');
});

test('canEditOrg returns true for admin', () => {
  const org = createOrganization({
    members: [
      createMember({ userId: 'user_1', role: ORG_ROLES.OWNER }),
      createMember({ userId: 'user_2', role: ORG_ROLES.ADMIN })
    ]
  });
  assert(canEditOrg(org, 'user_2'), 'Admin should be able to edit');
});

test('canEditOrg returns false for regular member', () => {
  const org = createOrganization({
    members: [
      createMember({ userId: 'user_1', role: ORG_ROLES.OWNER }),
      createMember({ userId: 'user_2', role: ORG_ROLES.MEMBER })
    ]
  });
  assert(!canEditOrg(org, 'user_2'), 'Regular member should not be able to edit');
});

// Summary
console.log('\n================================');
console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
