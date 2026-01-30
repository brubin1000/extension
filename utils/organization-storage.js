/**
 * Organization Storage Module
 * CRUD operations for organizations using chrome.storage.local
 */

import { STORAGE_KEYS } from '../config/constants.js';
import {
  createOrganization,
  createMember,
  validateOrganization,
  isMember,
  isOwner,
  canEditOrg,
  ORG_ROLES
} from '../models/organization-schema.js';

/**
 * Get all organizations
 * @returns {Promise<Array>}
 */
export async function getAllOrganizations() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ORGANIZATIONS);
  return result[STORAGE_KEYS.ORGANIZATIONS] || [];
}

/**
 * Get organizations the user belongs to
 * @param {string} userId - Current user's ID
 * @returns {Promise<Array>}
 */
export async function getUserOrganizations(userId) {
  const allOrgs = await getAllOrganizations();
  return allOrgs.filter(org => isMember(org, userId));
}

/**
 * Get organization IDs the user belongs to
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
export async function getUserOrgIds(userId) {
  const orgs = await getUserOrganizations(userId);
  return orgs.map(org => org.id);
}

/**
 * Get organization by ID
 * @param {string} orgId
 * @returns {Promise<Object|null>}
 */
export async function getOrganizationById(orgId) {
  const orgs = await getAllOrganizations();
  return orgs.find(o => o.id === orgId) || null;
}

/**
 * Create a new organization
 * @param {string} name - Organization name
 * @param {string} userId - Creator's user ID
 * @param {string} email - Creator's email
 * @param {string} displayName - Creator's display name
 * @returns {Promise<Object>} Created organization
 */
export async function createNewOrganization(name, userId, email, displayName) {
  const org = createOrganization({
    name,
    createdBy: userId,
    members: [
      createMember({
        userId,
        email,
        displayName,
        role: ORG_ROLES.OWNER,
        addedBy: userId
      })
    ]
  });

  const validation = validateOrganization(org);
  if (!validation.valid) {
    throw new Error(validation.errors.join(', '));
  }

  const orgs = await getAllOrganizations();
  orgs.push(org);

  await chrome.storage.local.set({
    [STORAGE_KEYS.ORGANIZATIONS]: orgs
  });

  return org;
}

/**
 * Update organization details
 * @param {string} orgId
 * @param {Object} updates - { name }
 * @param {string} userId - User making the update
 * @returns {Promise<Object>}
 */
export async function updateOrganization(orgId, updates, userId) {
  const orgs = await getAllOrganizations();
  const index = orgs.findIndex(o => o.id === orgId);

  if (index === -1) {
    throw new Error('Organization not found');
  }

  const org = orgs[index];

  // Check permission
  if (!canEditOrg(org, userId)) {
    throw new Error('Permission denied');
  }

  // Apply updates
  if (updates.name) {
    org.name = updates.name;
  }
  org.updatedAt = new Date().toISOString();

  orgs[index] = org;

  await chrome.storage.local.set({
    [STORAGE_KEYS.ORGANIZATIONS]: orgs
  });

  return org;
}

/**
 * Delete an organization
 * @param {string} orgId
 * @param {string} userId - User attempting deletion
 * @returns {Promise<boolean>}
 */
export async function deleteOrganization(orgId, userId) {
  const orgs = await getAllOrganizations();
  const org = orgs.find(o => o.id === orgId);

  if (!org) {
    return false;
  }

  // Only owner can delete
  if (!isOwner(org, userId)) {
    throw new Error('Only the owner can delete an organization');
  }

  const filtered = orgs.filter(o => o.id !== orgId);

  await chrome.storage.local.set({
    [STORAGE_KEYS.ORGANIZATIONS]: filtered
  });

  return true;
}

/**
 * Add a member to an organization
 * @param {string} orgId
 * @param {Object} memberData - { email, displayName, role }
 * @param {string} addedByUserId - User adding the member
 * @returns {Promise<Object>} Updated organization
 */
export async function addMember(orgId, memberData, addedByUserId) {
  const orgs = await getAllOrganizations();
  const index = orgs.findIndex(o => o.id === orgId);

  if (index === -1) {
    throw new Error('Organization not found');
  }

  const org = orgs[index];

  // Check permission
  if (!canEditOrg(org, addedByUserId)) {
    throw new Error('Permission denied');
  }

  // Check if email already exists
  const existingMember = org.members.find(
    m => m.email.toLowerCase() === memberData.email.toLowerCase()
  );
  if (existingMember) {
    throw new Error('Member with this email already exists');
  }

  // Create and add member
  const member = createMember({
    email: memberData.email,
    displayName: memberData.displayName || '',
    role: memberData.role || ORG_ROLES.MEMBER,
    addedBy: addedByUserId
  });

  org.members.push(member);
  org.updatedAt = new Date().toISOString();

  orgs[index] = org;

  await chrome.storage.local.set({
    [STORAGE_KEYS.ORGANIZATIONS]: orgs
  });

  return org;
}

/**
 * Remove a member from an organization
 * @param {string} orgId
 * @param {string} memberId - Member ID to remove
 * @param {string} removedByUserId - User removing the member
 * @returns {Promise<Object>} Updated organization
 */
export async function removeMember(orgId, memberId, removedByUserId) {
  const orgs = await getAllOrganizations();
  const index = orgs.findIndex(o => o.id === orgId);

  if (index === -1) {
    throw new Error('Organization not found');
  }

  const org = orgs[index];

  // Check permission
  if (!canEditOrg(org, removedByUserId)) {
    throw new Error('Permission denied');
  }

  // Find the member
  const memberIndex = org.members.findIndex(m => m.id === memberId);
  if (memberIndex === -1) {
    throw new Error('Member not found');
  }

  const member = org.members[memberIndex];

  // Can't remove the owner
  if (member.role === ORG_ROLES.OWNER) {
    throw new Error('Cannot remove the organization owner');
  }

  // Remove member
  org.members.splice(memberIndex, 1);
  org.updatedAt = new Date().toISOString();

  orgs[index] = org;

  await chrome.storage.local.set({
    [STORAGE_KEYS.ORGANIZATIONS]: orgs
  });

  return org;
}

/**
 * Update a member's role
 * @param {string} orgId
 * @param {string} memberId
 * @param {string} newRole
 * @param {string} updatedByUserId
 * @returns {Promise<Object>}
 */
export async function updateMemberRole(orgId, memberId, newRole, updatedByUserId) {
  const orgs = await getAllOrganizations();
  const index = orgs.findIndex(o => o.id === orgId);

  if (index === -1) {
    throw new Error('Organization not found');
  }

  const org = orgs[index];

  // Only owner can change roles
  if (!isOwner(org, updatedByUserId)) {
    throw new Error('Only the owner can change member roles');
  }

  const memberIndex = org.members.findIndex(m => m.id === memberId);
  if (memberIndex === -1) {
    throw new Error('Member not found');
  }

  // Can't change owner's role
  if (org.members[memberIndex].role === ORG_ROLES.OWNER) {
    throw new Error('Cannot change the owner\'s role');
  }

  // Validate new role
  if (!Object.values(ORG_ROLES).includes(newRole)) {
    throw new Error('Invalid role');
  }

  org.members[memberIndex].role = newRole;
  org.updatedAt = new Date().toISOString();

  orgs[index] = org;

  await chrome.storage.local.set({
    [STORAGE_KEYS.ORGANIZATIONS]: orgs
  });

  return org;
}

/**
 * Link a user ID to a member by email (when they log in)
 * @param {string} email
 * @param {string} userId
 * @param {string} displayName
 */
export async function linkUserToMemberships(email, userId, displayName) {
  const orgs = await getAllOrganizations();
  let updated = false;

  for (const org of orgs) {
    for (const member of org.members) {
      if (member.email.toLowerCase() === email.toLowerCase() && !member.userId) {
        member.userId = userId;
        if (displayName && !member.displayName) {
          member.displayName = displayName;
        }
        updated = true;
      }
    }
  }

  if (updated) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.ORGANIZATIONS]: orgs
    });
  }
}
