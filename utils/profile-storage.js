/**
 * Profile Storage Module
 * CRUD operations for artist profiles using chrome.storage.local
 */

import { STORAGE_KEYS } from '../config/constants.js';
import {
  createArtistProfile,
  validateProfile,
  generateSectionText,
  generateFullProfileText,
  VISIBILITY
} from '../models/artist-profile-schema.js';

/**
 * Get all profiles the user can access
 * @param {string} userId - Current user's ID
 * @param {string[]} orgIds - IDs of organizations the user belongs to
 * @returns {Promise<Array>} Array of profiles
 */
export async function getAllProfiles(userId, orgIds = []) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ARTIST_PROFILES);
  const allProfiles = result[STORAGE_KEYS.ARTIST_PROFILES] || [];

  // Filter to profiles user can access:
  // 1. Profiles created by this user (private)
  // 2. Profiles in organizations the user belongs to
  return allProfiles.filter(profile => {
    // User created this profile
    if (profile.createdBy === userId) return true;

    // Profile is in an organization user belongs to
    if (profile.organizationId &&
        profile.visibility === VISIBILITY.ORGANIZATION &&
        orgIds.includes(profile.organizationId)) {
      return true;
    }

    return false;
  });
}

/**
 * Get profiles filtered by organization
 * @param {string} userId - Current user's ID
 * @param {string|null} orgId - Organization ID to filter by (null for personal)
 * @param {string[]} userOrgIds - All org IDs the user belongs to
 * @returns {Promise<Array>}
 */
export async function getProfilesByOrg(userId, orgId, userOrgIds = []) {
  const allAccessible = await getAllProfiles(userId, userOrgIds);

  if (orgId === null || orgId === 'personal') {
    // Personal profiles only (no org, created by user)
    return allAccessible.filter(p => !p.organizationId && p.createdBy === userId);
  }

  // Filter by specific organization
  return allAccessible.filter(p => p.organizationId === orgId);
}

/**
 * Get profile by ID
 * @param {string} profileId
 * @returns {Promise<Object|null>}
 */
export async function getProfileById(profileId) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ARTIST_PROFILES);
  const profiles = result[STORAGE_KEYS.ARTIST_PROFILES] || [];
  return profiles.find(p => p.id === profileId) || null;
}

/**
 * Create a new profile
 * @param {Object} profileData
 * @returns {Promise<Object>} Created profile
 */
export async function createProfile(profileData) {
  const profile = createArtistProfile(profileData);

  const validation = validateProfile(profile);
  if (!validation.valid) {
    throw new Error(validation.errors.join(', '));
  }

  const result = await chrome.storage.local.get(STORAGE_KEYS.ARTIST_PROFILES);
  const profiles = result[STORAGE_KEYS.ARTIST_PROFILES] || [];

  profiles.push(profile);

  await chrome.storage.local.set({
    [STORAGE_KEYS.ARTIST_PROFILES]: profiles
  });

  return profile;
}

/**
 * Update an existing profile
 * @param {string} profileId
 * @param {Object} updates
 * @returns {Promise<Object>} Updated profile
 */
export async function updateProfile(profileId, updates) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ARTIST_PROFILES);
  const profiles = result[STORAGE_KEYS.ARTIST_PROFILES] || [];

  const index = profiles.findIndex(p => p.id === profileId);
  if (index === -1) {
    throw new Error('Profile not found');
  }

  // Merge updates with existing profile
  const existingProfile = profiles[index];
  const updatedProfile = createArtistProfile({
    ...existingProfile,
    ...updates,
    id: profileId, // Preserve original ID
    createdAt: existingProfile.createdAt, // Preserve creation date
    createdBy: existingProfile.createdBy // Preserve creator
  });

  profiles[index] = updatedProfile;

  await chrome.storage.local.set({
    [STORAGE_KEYS.ARTIST_PROFILES]: profiles
  });

  return updatedProfile;
}

/**
 * Delete a profile
 * @param {string} profileId
 * @returns {Promise<boolean>} True if deleted
 */
export async function deleteProfile(profileId) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ARTIST_PROFILES);
  const profiles = result[STORAGE_KEYS.ARTIST_PROFILES] || [];

  const filtered = profiles.filter(p => p.id !== profileId);

  if (filtered.length === profiles.length) {
    return false; // Profile not found
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.ARTIST_PROFILES]: filtered
  });

  return true;
}

/**
 * Export a profile section as formatted text
 * @param {string} profileId
 * @param {string} section - 'tech', 'hospitality', 'stage', 'terms', 'contacts', 'full'
 * @returns {Promise<string>}
 */
export async function exportProfileSection(profileId, section) {
  const profile = await getProfileById(profileId);

  if (!profile) {
    throw new Error('Profile not found');
  }

  return generateSectionText(profile, section);
}

/**
 * Get the active profile ID
 * @returns {Promise<string|null>}
 */
export async function getActiveProfileId() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ACTIVE_PROFILE_ID);
  return result[STORAGE_KEYS.ACTIVE_PROFILE_ID] || null;
}

/**
 * Set the active profile ID
 * @param {string|null} profileId
 */
export async function setActiveProfileId(profileId) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.ACTIVE_PROFILE_ID]: profileId
  });
}

/**
 * Get the active organization ID
 * @returns {Promise<string|null>}
 */
export async function getActiveOrgId() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ACTIVE_ORG_ID);
  return result[STORAGE_KEYS.ACTIVE_ORG_ID] || null;
}

/**
 * Set the active organization ID
 * @param {string|null} orgId
 */
export async function setActiveOrgId(orgId) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.ACTIVE_ORG_ID]: orgId
  });
}
