/**
 * Authentication Manager
 * Handles Google OAuth authentication and MongoDB Realm authentication
 */

import { MONGODB_REALM_APP_ID, STORAGE_KEYS } from '../config/constants.js';
import { info, error as logError, warn, logAuth } from '../utils/logger.js';
import * as Realm from 'realm-web';

let realmApp = null;
let realmUser = null;
let googleAccessToken = null;

/**
 * Check if Realm is configured
 */
function isRealmConfigured() {
  return MONGODB_REALM_APP_ID && MONGODB_REALM_APP_ID !== 'YOUR_MONGODB_REALM_APP_ID';
}

/**
 * Initialize the Realm app (optional - returns null if not configured)
 * @returns {Realm.App|null} Realm app instance or null
 */
function initRealmApp() {
  if (!isRealmConfigured()) {
    return null;
  }
  
  if (!realmApp) {
    realmApp = new Realm.App({ id: MONGODB_REALM_APP_ID });
    logAuth('Realm app initialized');
  }
  
  return realmApp;
}

/**
 * Get Google OAuth access token
 * @param {boolean} interactive - Whether to show OAuth popup
 * @returns {Promise<string|null>} Access token or null
 */
export async function getGoogleToken(interactive = false) {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        if (interactive) {
          logError('Failed to get Google token', chrome.runtime.lastError);
        }
        resolve(null);
      } else {
        googleAccessToken = token;
        logAuth('Google token obtained');
        resolve(token);
      }
    });
  });
}

/**
 * Remove cached Google token (for refresh)
 * @returns {Promise<void>}
 */
export async function removeCachedGoogleToken() {
  if (!googleAccessToken) return;
  
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken(
      { token: googleAccessToken },
      () => {
        googleAccessToken = null;
        logAuth('Cached Google token removed');
        resolve();
      }
    );
  });
}

/**
 * Refresh Google OAuth token
 * @returns {Promise<string|null>} New token or null
 */
export async function refreshGoogleToken() {
  await removeCachedGoogleToken();
  return await getGoogleToken(false);
}

/**
 * Get Google user profile information
 * @param {string} token - Access token
 * @returns {Promise<Object>} User profile
 */
export async function getGoogleUserProfile(token) {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get user profile: ${response.status}`);
    }
    
    const profile = await response.json();
    logAuth('Google user profile retrieved', { email: profile.email });
    
    return profile;
  } catch (err) {
    logError('Failed to get Google user profile', err);
    throw err;
  }
}

/**
 * Authenticate with MongoDB Realm using Google token
 * @param {string} googleToken - Google OAuth access token
 * @returns {Promise<Realm.User|null>} Realm user or null if not configured
 */
export async function authenticateWithRealm(googleToken) {
  const app = initRealmApp();
  if (!app) {
    warn('Realm not configured - skipping Realm auth');
    return null;
  }
  
  try {
    // Create Google credentials
    const credentials = Realm.Credentials.google({ idToken: googleToken });
    
    // Log in to Realm
    realmUser = await app.logIn(credentials);
    
    // Store user ID for future use
    await chrome.storage.local.set({
      [STORAGE_KEYS.REALM_USER_ID]: realmUser.id
    });
    
    logAuth('Realm authentication successful', { userId: realmUser.id });
    
    return realmUser;
  } catch (err) {
    logError('Realm authentication failed', err);
    throw err;
  }
}

/**
 * Get current Realm user (if authenticated)
 * @returns {Realm.User|null} Current user or null
 */
export function getCurrentRealmUser() {
  if (!isRealmConfigured()) {
    return null;
  }
  
  if (realmUser && realmUser.isLoggedIn) {
    return realmUser;
  }
  
  // Try to get from app
  const app = initRealmApp();
  if (app && app.currentUser && app.currentUser.isLoggedIn) {
    realmUser = app.currentUser;
    return realmUser;
  }
  
  return null;
}

/**
 * Check if user is authenticated (Google only - Realm is optional)
 * @returns {Promise<boolean>} True if authenticated with Google
 */
export async function isAuthenticated() {
  // Check Google token - this is required
  const googleToken = await getGoogleToken(false);
  if (!googleToken) {
    return false;
  }
  
  // Realm is optional - don't require it
  return true;
}

/**
 * Complete authentication flow
 * Google is required, Realm is optional
 * @param {boolean} interactive - Whether to show OAuth UI
 * @returns {Promise<Object>} Authentication result
 */
export async function authenticate(interactive = false) {
  try {
    // Step 1: Get Google OAuth token (required)
    const googleToken = await getGoogleToken(interactive);
    
    if (!googleToken) {
      if (interactive) {
        throw new Error('Failed to get Google OAuth token. Please authorize the extension.');
      }
      return { success: false, error: 'No Google token' };
    }
    
    // Step 2: Get user profile
    const profile = await getGoogleUserProfile(googleToken);
    
    info('Google authentication complete', { email: profile.email });
    
    // Step 3: Try Realm authentication (optional)
    let user = null;
    if (isRealmConfigured()) {
      try {
        user = await authenticateWithRealm(googleToken);
        if (user) {
          info('Realm authentication complete', { userId: user.id });
        }
      } catch (realmErr) {
        warn('Realm auth failed (continuing without cloud sync)', realmErr.message);
      }
    } else {
      warn('Realm not configured - skipping. Extension will work without cloud sync.');
    }
    
    return {
      success: true,
      googleToken,
      realmUser: user,
      profile
    };
    
  } catch (err) {
    logError('Authentication failed', err);
    
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Log out from Realm
 * @returns {Promise<void>}
 */
export async function logout() {
  try {
    const user = getCurrentRealmUser();
    if (user) {
      await user.logOut();
      realmUser = null;
      logAuth('Logged out from Realm');
    }
    
    // Remove cached tokens
    await removeCachedGoogleToken();
    
    // Clear stored data
    await chrome.storage.local.remove([STORAGE_KEYS.REALM_USER_ID]);
    
    info('Logout complete');
  } catch (err) {
    logError('Logout failed', err);
  }
}

/**
 * Ensure user is authenticated, re-authenticate if needed
 * @returns {Promise<Object>} Authentication result
 */
export async function ensureAuthenticated() {
  const authenticated = await isAuthenticated();
  
  if (authenticated && googleAccessToken) {
    return { success: true, googleToken: googleAccessToken, realmUser: getCurrentRealmUser() };
  }
  
  // Try to re-authenticate without interaction first
  const result = await authenticate(false);
  
  if (!result.success) {
    warn('Silent authentication failed. User interaction may be required.');
  }
  
  return result;
}

/**
 * Get current Google user ID
 * @returns {Promise<string|null>} Google user ID or null
 */
export async function getGoogleUserId() {
  try {
    const token = await getGoogleToken(false);
    if (!token) return null;
    
    const profile = await getGoogleUserProfile(token);
    return profile.id;
  } catch (err) {
    logError('Failed to get Google user ID', err);
    return null;
  }
}

/**
 * Handle authentication errors and retry logic
 * @param {Function} fn - Function to execute
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<any>} Result of function
 */
export async function withAuthRetry(fn, maxRetries = 2) {
  let lastError = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Ensure authenticated before attempting
      const authResult = await ensureAuthenticated();
      
      if (!authResult.success) {
        throw new Error('Authentication failed');
      }
      
      // Execute the function
      return await fn();
      
    } catch (err) {
      lastError = err;
      
      // Check if it's an auth error
      if (err.message && err.message.includes('auth')) {
        warn(`Auth error on attempt ${attempt + 1}, refreshing token...`);
        
        // Try to refresh token
        await refreshGoogleToken();
        await authenticate(false);
        
        // Retry
        continue;
      }
      
      // Non-auth error, don't retry
      throw err;
    }
  }
  
  throw lastError;
}

/**
 * Check OpenAI API key configuration
 * @returns {Promise<string|null>} API key or null
 */
export async function getOpenAIKey() {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEYS.OPENAI_API_KEY);
    return result[STORAGE_KEYS.OPENAI_API_KEY] || null;
  } catch (err) {
    logError('Failed to get OpenAI key', err);
    return null;
  }
}

/**
 * Save OpenAI API key
 * @param {string} apiKey - OpenAI API key
 * @returns {Promise<void>}
 */
export async function saveOpenAIKey(apiKey) {
  try {
    await chrome.storage.sync.set({
      [STORAGE_KEYS.OPENAI_API_KEY]: apiKey
    });
    info('OpenAI API key saved');
  } catch (err) {
    logError('Failed to save OpenAI key', err);
    throw err;
  }
}

/**
 * Check if initial setup is complete
 * @returns {Promise<boolean>} True if setup is complete
 */
export async function isSetupComplete() {
  // Check if Google OAuth is authorized
  const googleToken = await getGoogleToken(false);
  if (!googleToken) return false;
  
  // Check if OpenAI key is configured
  const openaiKey = await getOpenAIKey();
  if (!openaiKey) return false;
  
  // Check if Realm is authenticated
  const authenticated = await isAuthenticated();
  if (!authenticated) return false;
  
  return true;
}

/**
 * Initialize authentication on extension startup
 * @returns {Promise<Object>} Initialization result
 */
export async function initializeAuth() {
  logAuth('Initializing authentication...');
  
  try {
    // Check if setup is complete
    const setupComplete = await isSetupComplete();
    
    if (!setupComplete) {
      warn('Setup not complete. User interaction may be required.');
      return { success: false, needsSetup: true };
    }
    
    // Try to authenticate
    const result = await authenticate(false);
    
    return result;
    
  } catch (err) {
    logError('Auth initialization failed', err);
    return { success: false, error: err.message };
  }
}

