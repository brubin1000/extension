/**
 * Organization Schema
 * Data model for organizations that share artist profiles
 */

export const ORG_ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member'
};

/**
 * Generate a unique organization ID
 */
export function generateOrgId() {
  return `org_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a unique member ID
 */
export function generateMemberId() {
  return `member_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Creates a new organization with defaults
 * @param {Object} data - Partial organization data
 * @returns {Object} Complete organization object
 */
export function createOrganization(data = {}) {
  const now = new Date().toISOString();

  return {
    id: data.id || generateOrgId(),
    name: data.name || '',

    // Members array
    members: data.members || [],
    // Member shape: { id, userId, email, displayName, role, addedAt, addedBy }

    // Metadata
    createdAt: data.createdAt || now,
    updatedAt: now,
    createdBy: data.createdBy || null
  };
}

/**
 * Create a member object
 * @param {Object} data
 * @returns {Object} Member object
 */
export function createMember(data = {}) {
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

/**
 * Validate an organization has required fields
 * @param {Object} org
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateOrganization(org) {
  const errors = [];

  if (!org) {
    return { valid: false, errors: ['Organization is required'] };
  }

  if (!org.name?.trim()) {
    errors.push('Organization name is required');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check if a user has a specific role in an organization
 * @param {Object} org - Organization object
 * @param {string} userId - User ID to check
 * @param {string[]} roles - Array of roles to check for
 * @returns {boolean}
 */
export function userHasRole(org, userId, roles) {
  if (!org?.members || !userId) return false;

  const member = org.members.find(m => m.userId === userId);
  if (!member) return false;

  return roles.includes(member.role);
}

/**
 * Check if a user is a member of an organization
 * @param {Object} org
 * @param {string} userId
 * @returns {boolean}
 */
export function isMember(org, userId) {
  if (!org?.members || !userId) return false;
  return org.members.some(m => m.userId === userId);
}

/**
 * Check if a user can edit the organization (owner or admin)
 * @param {Object} org
 * @param {string} userId
 * @returns {boolean}
 */
export function canEditOrg(org, userId) {
  return userHasRole(org, userId, [ORG_ROLES.OWNER, ORG_ROLES.ADMIN]);
}

/**
 * Check if a user is the owner of an organization
 * @param {Object} org
 * @param {string} userId
 * @returns {boolean}
 */
export function isOwner(org, userId) {
  return userHasRole(org, userId, [ORG_ROLES.OWNER]);
}
