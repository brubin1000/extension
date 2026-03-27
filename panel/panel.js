/**
 * ATMS Side Panel - Main Logic
 */

// State
const state = {
  currentScreen: 'artists', // Default to artists tab
  events: [],
  contacts: [],
  userProfile: null,
  selectedEvent: null,
  // Artist Profiles
  artistProfiles: [],
  selectedProfile: null,
  organizations: [],
  activeOrgId: null, // null = "All" / personal
  editingProfile: null // null for create, profile object for edit
};

// DOM Elements
let elements = {};

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  console.log('[ATMS] Panel init');

  cacheElements();
  setupNavigation();
  setupProfileDrawers();
  setupProfileForms();
  setupForms(); // Keep for authenticate button

  await loadUserProfile();
  await loadOrganizations();
  await loadArtistProfiles();

  // Listen for storage changes (sync from Gmail)
  chrome.storage.onChanged.addListener(handleStorageChange);

  // Listen for authentication state changes
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'AUTH_STATE_CHANGED' && message.authenticated) {
      console.log('[ATMS] Authentication state changed, reloading profile');
      loadUserProfile();
      loadOrganizations();
      loadArtistProfiles();
    }
  });

  showScreen('artists'); // Default to artists screen
}

function cacheElements() {
  elements = {
    screens: {
      artists: document.getElementById('screen-artists'),
      settings: document.getElementById('screen-settings')
    },
    tabs: document.querySelectorAll('.tab-item'),
    drawers: {
      profileDetail: document.getElementById('drawer-profile-detail'),
      profileEditor: document.getElementById('drawer-profile-editor'),
      orgManager: document.getElementById('drawer-org-manager')
    },
    backdrop: document.getElementById('drawer-backdrop'),
    // Artist profile elements
    orgSelector: document.getElementById('org-selector'),
    profilesList: document.getElementById('profiles-list'),
    profilesEmpty: document.getElementById('profiles-empty'),
    profilesLoading: document.getElementById('profiles-loading')
  };
}

// Navigation
function setupNavigation() {
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => showScreen(tab.dataset.screen));
  });
}

function showScreen(name) {
  Object.values(elements.screens).forEach(s => s?.classList.remove('active'));
  elements.screens[name]?.classList.add('active');
  
  elements.tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.screen === name);
  });
  
  state.currentScreen = name;
}

// Drawers
function setupDrawers() {
  elements.backdrop?.addEventListener('click', closeAllDrawers);
  
  document.getElementById('btn-new-event')?.addEventListener('click', () => openDrawer('newEvent'));
  document.getElementById('back-new-event')?.addEventListener('click', () => closeDrawer('newEvent'));
  
  document.getElementById('btn-add-contact')?.addEventListener('click', () => openDrawer('addContact'));
  document.getElementById('back-add-contact')?.addEventListener('click', () => closeDrawer('addContact'));
  
  document.getElementById('back-event-detail')?.addEventListener('click', () => closeDrawer('eventDetail'));
  document.getElementById('btn-view-calendar')?.addEventListener('click', handleViewInCalendar);
  document.getElementById('btn-delete-event')?.addEventListener('click', handleDeleteEvent);
}

function openDrawer(name) {
  console.log('[ATMS] openDrawer called:', name);
  const drawer = elements.drawers[name];
  console.log('[ATMS] drawer element:', drawer);
  if (drawer) {
    drawer.classList.add('open');
    elements.backdrop?.classList.remove('hidden');
    console.log('[ATMS] Drawer opened:', name);
  } else {
    console.error('[ATMS] Drawer not found:', name);
  }
}

function closeDrawer(name) {
  const drawer = elements.drawers[name];
  if (drawer) {
    drawer.classList.remove('open');
    // Only hide backdrop if no other drawers are open
    const anyOpen = Object.values(elements.drawers).some(d => d?.classList.contains('open'));
    if (!anyOpen) {
      elements.backdrop?.classList.add('hidden');
    }
  }
}

function closeAllDrawers() {
  Object.keys(elements.drawers).forEach(closeDrawer);
  elements.backdrop?.classList.add('hidden');
}

// Data Loading
async function loadUserProfile() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_USER_PROFILE' });
    if (response?.success && response.profile) {
      state.userProfile = response.profile;
      updateProfileUI();
    }
  } catch (err) {
    console.error('[ATMS] Failed to load profile:', err);
  }
}

async function loadData() {
  await loadEvents();
  await loadContacts();
  renderTeam();
}

async function loadEvents() {
  try {
    showLoadingState('events-list');

    // Query Supabase via background script
    const response = await chrome.runtime.sendMessage({
      type: 'GET_SUPABASE_EVENTS',
      filters: {
        limit: 50,
        orderBy: 'start_date_time',
        direction: 'desc'
      }
    });

    if (!response?.success) {
      throw new Error(response?.error || 'Failed to load events');
    }

    state.events = response.events || [];
    renderEvents();
    updateEventCounts();
    hideLoadingState('events-list');

  } catch (err) {
    console.error('[ATMS] Failed to load events:', err);
    showErrorState('events-list', 'Failed to load events. Click to retry.');
  }
}

// Show loading state
function showLoadingState(containerId) {
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = `
      <div class="loading-state" style="text-align: center; padding: 40px;">
        <div class="spinner" style="border: 3px solid #262b35; border-top-color: #22c7a8; border-radius: 50%; width: 40px; height: 40px; animation: spin 0.8s linear infinite; margin: 0 auto 16px;"></div>
        <p style="color: #808898;">Loading events...</p>
      </div>
    `;
  }
}

// Hide loading state
function hideLoadingState(containerId) {
  const container = document.getElementById(containerId);
  if (container) {
    const loader = container.querySelector('.loading-state');
    if (loader) loader.remove();
  }
}

// Show error state
function showErrorState(containerId, message) {
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = `
      <div class="error-state" style="text-align: center; padding: 40px;">
        <p style="color: #ef4444; margin-bottom: 16px;">${escapeHtml(message)}</p>
        <button onclick="location.reload()" style="padding: 10px 20px; background: #22c7a8; color: #0d0f14; border: none; border-radius: 8px; cursor: pointer;">Retry</button>
      </div>
    `;
  }
}

async function loadContacts() {
  try {
    const stored = await chrome.storage.local.get('atmsContacts');
    state.contacts = stored.atmsContacts || [];
    renderContacts();
  } catch (err) {
    console.error('[ATMS] Failed to load contacts:', err);
  }
}

// Handle storage changes (sync from Gmail inline UI)
function handleStorageChange(changes, area) {
  if (area === 'local') {
    // BARE MINIMUM: Don't render events/contacts (those screens are hidden)
    if (changes.atmsEvents) {
      state.events = changes.atmsEvents.newValue || [];
      // renderEvents();
      // updateEventCounts();
    }
    if (changes.atmsContacts) {
      state.contacts = changes.atmsContacts.newValue || [];
      // renderContacts();
    }
  }
}

// Render Events
function renderEvents() {
  const container = document.getElementById('events-list');
  const emptyEl = document.getElementById('events-empty');
  
  if (!container) return;
  
  container.innerHTML = '';
  
  if (state.events.length === 0) {
    if (emptyEl) container.appendChild(emptyEl.cloneNode(true));
    return;
  }
  
  state.events.forEach(event => {
    container.appendChild(createEventCard(event));
  });
}

function createEventCard(event) {
  const card = document.createElement('div');
  card.className = 'event-card';
  card.dataset.eventId = event.id;
  
  const name = event.name || event.title || 'Untitled';
  const location = event.location || '';
  const date = formatDate(event.date);
  const status = event.status || 'confirmed';
  
  card.innerHTML = `
    <div class="event-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    </div>
    <div class="event-info">
      <div class="event-name">${escapeHtml(name)}</div>
      ${location ? `<div class="event-location">${escapeHtml(location)}</div>` : ''}
    </div>
    <div class="event-meta">
      <div class="event-date">${date}</div>
      <span class="badge status-${status}">${status}</span>
    </div>
    <div class="event-arrow">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </div>
  `;
  
  card.addEventListener('click', () => showEventDetail(event));
  
  return card;
}

function updateEventCounts() {
  document.getElementById('upcoming-count').textContent = state.events.length;
  document.getElementById('filter-all-count').textContent = state.events.length;
}

// Render Contacts
function renderContacts() {
  const container = document.getElementById('contacts-grid');
  const emptyEl = document.getElementById('contacts-empty');
  
  if (!container) return;
  
  container.innerHTML = '';
  
  if (state.contacts.length === 0) {
    if (emptyEl) container.appendChild(emptyEl.cloneNode(true));
    return;
  }
  
  state.contacts.forEach(contact => {
    container.appendChild(createContactCard(contact));
  });
}

function createContactCard(contact) {
  const card = document.createElement('div');
  card.className = 'contact-card';
  
  const initials = getInitials(contact.name);
  
  card.innerHTML = `
    <div class="contact-header">
      <div class="avatar">${initials}</div>
      <div class="contact-info">
        <div class="contact-name">${escapeHtml(contact.name)}</div>
        <div class="contact-role">${escapeHtml(contact.role || contact.email || '')}</div>
      </div>
    </div>
  `;
  
  return card;
}

// Render Team
function renderTeam() {
  const container = document.getElementById('team-list');
  if (!container) return;
  
  const email = state.userProfile?.email || 'you@example.com';
  const name = state.userProfile?.name || 'You';
  
  container.innerHTML = `
    <div class="team-member">
      <div class="avatar" style="width: 36px; height: 36px; font-size: 12px;">${getInitials(name)}</div>
      <div class="team-member-info">
        <div class="team-member-name">${escapeHtml(name)}</div>
        <div class="team-member-email">${escapeHtml(email)}</div>
      </div>
    </div>
  `;
}

// Filters
function setupFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Filter logic here if needed
    });
  });
  
  document.getElementById('contacts-search')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    document.querySelectorAll('.contact-card').forEach(card => {
      const name = card.querySelector('.contact-name')?.textContent.toLowerCase() || '';
      card.style.display = name.includes(query) ? '' : 'none';
    });
  });
}

// Forms
function setupForms() {
  document.getElementById('btn-create-event')?.addEventListener('click', handleCreateEvent);
  document.getElementById('btn-save-contact')?.addEventListener('click', handleSaveContact);
  document.getElementById('btn-authenticate')?.addEventListener('click', handleAuthenticate);
}

async function handleCreateEvent() {
  const name = document.getElementById('new-event-name')?.value;
  const date = document.getElementById('new-event-date')?.value;
  const time = document.getElementById('new-event-time')?.value;
  const venue = document.getElementById('new-event-venue')?.value;
  
  if (!name || !date) {
    alert('Please enter event name and date');
    return;
  }
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CREATE_EVENT',
      eventData: { title: name, date, time, location: venue, duration: 60 }
    });
    
    if (response?.success) {
      // Add to local storage
      const newEvent = {
        id: response.eventId || Date.now().toString(),
        name, date, time, location: venue, status: 'confirmed', createdAt: Date.now()
      };
      state.events.push(newEvent);
      await chrome.storage.local.set({ atmsEvents: state.events });
      
      renderEvents();
      updateEventCounts();
      closeDrawer('newEvent');
      
      // Clear form
      document.getElementById('new-event-name').value = '';
      document.getElementById('new-event-date').value = '';
      document.getElementById('new-event-time').value = '';
      document.getElementById('new-event-venue').value = '';
    } else {
      alert(response?.error || 'Failed to create event');
    }
  } catch (err) {
    console.error('[ATMS] Create event error:', err);
    alert('Failed to create event');
  }
}

async function handleSaveContact() {
  const name = document.getElementById('new-contact-name')?.value;
  const email = document.getElementById('new-contact-email')?.value;
  const phone = document.getElementById('new-contact-phone')?.value;
  const role = document.getElementById('new-contact-role')?.value;
  const isArtist = document.getElementById('new-contact-is-artist')?.checked;

  if (!name) {
    alert('Please enter a name');
    return;
  }

  const newContact = {
    id: Date.now().toString(),
    name, email, phone, role, isArtist, createdAt: Date.now()
  };

  state.contacts.push(newContact);
  await chrome.storage.local.set({ atmsContacts: state.contacts });

  renderContacts();
  closeDrawer('addContact');

  // Clear form
  document.getElementById('new-contact-name').value = '';
  document.getElementById('new-contact-email').value = '';
  document.getElementById('new-contact-phone').value = '';
  document.getElementById('new-contact-role').value = '';
  document.getElementById('new-contact-is-artist').checked = false;
}

async function handleAuthenticate() {
  const btn = document.getElementById('btn-authenticate');
  const originalText = btn.textContent;

  try {
    btn.textContent = 'Authenticating...';
    btn.disabled = true;

    const response = await chrome.runtime.sendMessage({ type: 'AUTHENTICATE' });

    if (response?.success) {
      await loadUserProfile();
      await loadData();
      alert('Authentication successful!');
    } else {
      alert(`Authentication failed: ${response?.error || 'Unknown error'}`);
    }
  } catch (err) {
    console.error('[ATMS] Authentication error:', err);
    alert(`Authentication failed: ${err.message}`);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// Profile UI
function updateProfileUI() {
  if (!state.userProfile) return;
  
  const name = state.userProfile.name || 'User';
  const email = state.userProfile.email || '';
  
  document.getElementById('settings-avatar').textContent = getInitials(name);
  document.getElementById('profile-name').textContent = name;
  document.getElementById('profile-email').textContent = email;
}

// Event Detail
function showEventDetail(event) {
  state.selectedEvent = event;
  
  const name = event.name || event.title || 'Untitled';
  const status = event.status || 'confirmed';
  
  document.getElementById('event-detail-title').textContent = name;
  document.getElementById('event-detail-status').textContent = status;
  document.getElementById('event-detail-status').className = `badge status-${status}`;
  
  document.getElementById('event-detail-date').textContent = event.date ? formatDateFull(event.date) : 'Not set';
  document.getElementById('event-detail-time').textContent = event.time ? formatTime(event.time) : 'Not set';
  document.getElementById('event-detail-location').textContent = event.location || 'Not set';
  
  const descRow = document.getElementById('event-detail-desc-row');
  const descVal = document.getElementById('event-detail-description');
  if (event.description) {
    descRow.style.display = 'flex';
    descVal.textContent = event.description;
  } else {
    descRow.style.display = 'none';
  }
  
  openDrawer('eventDetail');
}

function handleViewInCalendar() {
  if (!state.selectedEvent) return;
  
  const eventId = state.selectedEvent.id;
  if (eventId) {
    // Open Google Calendar event
    // Format: https://calendar.google.com/calendar/event?eid=BASE64_EVENT_ID
    // Simpler: just open Calendar to the date
    const dateStr = state.selectedEvent.date;
    if (dateStr) {
      const date = new Date(dateStr);
      const calendarUrl = `https://calendar.google.com/calendar/r/day/${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
      window.open(calendarUrl, '_blank');
    } else {
      window.open('https://calendar.google.com', '_blank');
    }
  } else {
    window.open('https://calendar.google.com', '_blank');
  }
  
  closeDrawer('eventDetail');
}

async function handleDeleteEvent() {
  if (!state.selectedEvent) return;
  
  if (!confirm('Are you sure you want to delete this event?')) return;
  
  const eventId = state.selectedEvent.id;
  
  // Remove from local storage
  state.events = state.events.filter(e => e.id !== eventId);
  await chrome.storage.local.set({ atmsEvents: state.events });
  
  renderEvents();
  updateEventCounts();
  closeDrawer('eventDetail');
  state.selectedEvent = null;
}

// Utilities
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateFull(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'long', 
    day: 'numeric',
    year: 'numeric'
  });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [hours, minutes] = timeStr.split(':');
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${minutes} ${ampm}`;
}

// ==================== ARTIST PROFILES ====================

// Setup profile drawers
function setupProfileDrawers() {
  elements.backdrop?.addEventListener('click', closeAllDrawers);

  // Add new profile button
  const openNewProfileEditor = () => {
    console.log('[ATMS] openNewProfileEditor called');
    state.editingProfile = null;
    clearProfileForm();
    populateOrgDropdown();
    document.getElementById('profile-editor-title').textContent = 'New Artist Profile';
    document.getElementById('btn-delete-profile').style.display = 'none';
    openDrawer('profileEditor');
  };
  const addBtn = document.getElementById('btn-add-profile');
  const addBtnEmpty = document.getElementById('btn-add-profile-empty');
  console.log('[ATMS] Add profile buttons:', { addBtn, addBtnEmpty });
  addBtn?.addEventListener('click', openNewProfileEditor);
  addBtnEmpty?.addEventListener('click', openNewProfileEditor);

  // Profile detail drawer
  document.getElementById('back-profile-detail')?.addEventListener('click', () => closeDrawer('profileDetail'));
  document.getElementById('btn-edit-profile')?.addEventListener('click', handleEditProfile);

  // Profile editor drawer
  document.getElementById('back-profile-editor')?.addEventListener('click', () => closeDrawer('profileEditor'));
  document.getElementById('btn-save-profile')?.addEventListener('click', handleSaveProfile);
  document.getElementById('btn-delete-profile')?.addEventListener('click', handleDeleteProfile);

  // Organization manager drawer
  document.getElementById('btn-manage-orgs')?.addEventListener('click', () => {
    renderOrgManager();
    openDrawer('orgManager');
  });
  document.getElementById('back-org-manager')?.addEventListener('click', () => closeDrawer('orgManager'));
  document.getElementById('btn-create-org')?.addEventListener('click', handleCreateOrg);

  // Org selector change
  elements.orgSelector?.addEventListener('change', handleOrgSelectorChange);

  // Copy buttons
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', handleCopySection);
  });

  // Copy full profile button
  document.getElementById('btn-copy-all')?.addEventListener('click', handleCopyFullProfile);

  // Autofill button
  document.getElementById('btn-autofill-form')?.addEventListener('click', handleAutofillForm);

  // Add contact row button
  document.getElementById('btn-add-contact-row')?.addEventListener('click', addContactRow);
}

// Setup profile form handlers
function setupProfileForms() {
  // These are set up in setupProfileDrawers
}

// Load organizations
async function loadOrganizations() {
  try {
    const userId = state.userProfile?.id || state.userProfile?.email;
    if (!userId) {
      console.log('[ATMS] No user ID, skipping org load');
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: 'GET_USER_ORGANIZATIONS',
      userId
    });

    if (response?.success) {
      state.organizations = response.organizations || [];
      renderOrgSelector();
    }
  } catch (err) {
    console.error('[ATMS] Failed to load organizations:', err);
  }
}

// Load artist profiles
async function loadArtistProfiles() {
  console.log('[ATMS] loadArtistProfiles called');
  try {
    showProfilesLoading(true);

    const userId = state.userProfile?.id || state.userProfile?.email;
    console.log('[ATMS] Loading profiles for userId:', userId);
    const response = await chrome.runtime.sendMessage({
      type: 'GET_ARTIST_PROFILES',
      userId,
      orgId: state.activeOrgId
    });

    console.log('[ATMS] Profiles response:', response);
    if (response?.success) {
      state.artistProfiles = response.profiles || [];
      console.log('[ATMS] Loaded profiles:', state.artistProfiles.length);
      renderProfiles();
    } else {
      console.error('[ATMS] Failed to load profiles:', response?.error);
    }
  } catch (err) {
    console.error('[ATMS] Failed to load profiles:', err);
  } finally {
    showProfilesLoading(false);
  }
}

// Show/hide profiles loading state
function showProfilesLoading(show) {
  if (elements.profilesLoading) {
    elements.profilesLoading.style.display = show ? 'flex' : 'none';
  }
  if (elements.profilesList) {
    elements.profilesList.style.display = show ? 'none' : 'block';
  }
}

// Render organization selector
function renderOrgSelector() {
  if (!elements.orgSelector) return;

  // Clear existing options except first two (All, Personal)
  while (elements.orgSelector.options.length > 2) {
    elements.orgSelector.remove(2);
  }

  // Add org options
  state.organizations.forEach(org => {
    const option = document.createElement('option');
    option.value = org.id;
    option.textContent = org.name;
    elements.orgSelector.appendChild(option);
  });

  // Set current value
  if (state.activeOrgId) {
    elements.orgSelector.value = state.activeOrgId;
  }
}

// Handle org selector change
function handleOrgSelectorChange(e) {
  const value = e.target.value;
  state.activeOrgId = value === '' || value === 'personal' ? null : value;

  // Save preference
  chrome.runtime.sendMessage({
    type: 'SET_ACTIVE_ORG',
    orgId: state.activeOrgId
  });

  loadArtistProfiles();
}

// Render profiles list
function renderProfiles() {
  if (!elements.profilesList) return;

  // Clear list
  elements.profilesList.innerHTML = '';

  // Filter based on active org
  let profiles = state.artistProfiles;
  if (state.activeOrgId === 'personal') {
    profiles = profiles.filter(p => !p.organizationId);
  } else if (state.activeOrgId) {
    profiles = profiles.filter(p => p.organizationId === state.activeOrgId);
  }

  // Show empty state if no profiles
  if (profiles.length === 0) {
    if (elements.profilesEmpty) {
      elements.profilesEmpty.style.display = 'flex';
    }
    return;
  }

  if (elements.profilesEmpty) {
    elements.profilesEmpty.style.display = 'none';
  }

  // Render profile cards
  profiles.forEach(profile => {
    elements.profilesList.appendChild(createProfileCard(profile));
  });
}

// Create profile card
function createProfileCard(profile) {
  const card = document.createElement('div');
  card.className = 'profile-card';
  card.dataset.profileId = profile.id;

  const initials = getInitials(profile.artistName);
  const typeLabel = formatArtistType(profile.type);
  const org = profile.organizationId
    ? state.organizations.find(o => o.id === profile.organizationId)
    : null;

  card.innerHTML = `
    <div class="profile-avatar">${initials}</div>
    <div class="profile-info">
      <div class="profile-name">${escapeHtml(profile.artistName)}</div>
      <div class="profile-type">${typeLabel}${profile.crewSize ? ` · ${profile.crewSize} crew` : ''}</div>
    </div>
    ${org ? `<span class="org-badge">${escapeHtml(org.name)}</span>` : ''}
    <div class="profile-arrow">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </div>
  `;

  card.addEventListener('click', () => showProfileDetail(profile));

  return card;
}

// Format artist type for display
function formatArtistType(type) {
  const types = {
    dj: 'DJ',
    live_act: 'Live Act',
    band: 'Band',
    solo: 'Solo Artist'
  };
  return types[type] || type || 'Artist';
}

// Show profile detail drawer
function showProfileDetail(profile) {
  state.selectedProfile = profile;

  // Update header
  document.getElementById('profile-detail-name').textContent = profile.artistName || 'Unknown Artist';

  const org = profile.organizationId
    ? state.organizations.find(o => o.id === profile.organizationId)
    : null;
  const orgBadge = document.getElementById('profile-detail-org');
  if (org && orgBadge) {
    orgBadge.textContent = org.name;
    orgBadge.style.display = 'inline-block';
  } else if (orgBadge) {
    orgBadge.style.display = 'none';
  }

  // Render sections
  renderTechSpecsSection(profile);
  renderHospitalitySection(profile);
  renderContactsSection(profile);
  renderDocumentsSection(profile);

  openDrawer('profileDetail');
}

// Render tech specs section (SIMPLIFIED)
function renderTechSpecsSection(profile) {
  const container = document.getElementById('tech-specs-content');
  if (!container) return;

  const tech = profile.techSpecs || {};
  let html = '';

  if (tech.text) {
    html += `<div class="section-text">${escapeHtml(tech.text).replace(/\n/g, '<br>')}</div>`;
  }

  if (tech.documentUrl) {
    html += `<div class="detail-row"><span class="detail-label">Document</span><a href="${escapeHtml(tech.documentUrl)}" target="_blank" class="detail-link">View Tech Rider</a></div>`;
  }

  container.innerHTML = html || '<p class="empty-text">No tech specs added</p>';
}

// Render hospitality section (SIMPLIFIED)
function renderHospitalitySection(profile) {
  const container = document.getElementById('hospitality-content');
  if (!container) return;

  const hosp = profile.hospitality || {};
  let html = '';

  if (hosp.text) {
    html += `<div class="section-text">${escapeHtml(hosp.text).replace(/\n/g, '<br>')}</div>`;
  }

  if (hosp.documentUrl) {
    html += `<div class="detail-row"><span class="detail-label">Document</span><a href="${escapeHtml(hosp.documentUrl)}" target="_blank" class="detail-link">View Hospitality Rider</a></div>`;
  }

  container.innerHTML = html || '<p class="empty-text">No hospitality requirements</p>';
}

// Render contacts section
function renderContactsSection(profile) {
  const container = document.getElementById('contacts-content');
  if (!container) return;

  const contacts = profile.contacts || [];

  if (contacts.length === 0) {
    container.innerHTML = '<p class="empty-text">No contacts added</p>';
    return;
  }

  let html = '';
  contacts.forEach(contact => {
    html += `
      <div class="contact-item">
        <div class="contact-name">${escapeHtml(contact.name)}${contact.isPrimary ? ' <span class="primary-badge">Primary</span>' : ''}</div>
        ${contact.role ? `<div class="contact-role">${escapeHtml(contact.role)}</div>` : ''}
        ${contact.email ? `<div class="contact-detail">${escapeHtml(contact.email)}</div>` : ''}
        ${contact.phone ? `<div class="contact-detail">${escapeHtml(contact.phone)}</div>` : ''}
      </div>
    `;
  });

  container.innerHTML = html;
}

// Render documents section (SIMPLIFIED)
function renderDocumentsSection(profile) {
  const container = document.getElementById('documents-content');
  if (!container) return;

  const docs = profile.documents || {};
  let html = '';

  if (docs.techRider) {
    html += `<div class="detail-row"><span class="detail-label">Tech Rider</span><a href="${escapeHtml(docs.techRider)}" target="_blank" class="detail-link">View</a></div>`;
  }

  if (docs.stageRider) {
    html += `<div class="detail-row"><span class="detail-label">Stage Plot</span><a href="${escapeHtml(docs.stageRider)}" target="_blank" class="detail-link">View</a></div>`;
  }

  if (docs.hospitalityRider) {
    html += `<div class="detail-row"><span class="detail-label">Hospitality</span><a href="${escapeHtml(docs.hospitalityRider)}" target="_blank" class="detail-link">View</a></div>`;
  }

  if (docs.pressKit) {
    html += `<div class="detail-row"><span class="detail-label">Press Kit</span><a href="${escapeHtml(docs.pressKit)}" target="_blank" class="detail-link">View</a></div>`;
  }

  if (docs.inputList) {
    html += `<div class="detail-row"><span class="detail-label">Input List</span><a href="${escapeHtml(docs.inputList)}" target="_blank" class="detail-link">View</a></div>`;
  }

  if (docs.other) {
    html += `<div class="detail-row"><span class="detail-label">Other</span><a href="${escapeHtml(docs.other)}" target="_blank" class="detail-link">View</a></div>`;
  }

  container.innerHTML = html || '<p class="empty-text">No documents linked</p>';
}

// Handle copy section button
async function handleCopySection(e) {
  const section = e.currentTarget.dataset.section;
  if (!state.selectedProfile) return;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'EXPORT_PROFILE_SECTION',
      profileId: state.selectedProfile.id,
      section
    });

    if (response?.success && response.text) {
      await navigator.clipboard.writeText(response.text);
      showToast('Copied to clipboard!');

      // Visual feedback on button
      const btn = e.currentTarget;
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1500);
    } else {
      showToast('Nothing to copy', 'error');
    }
  } catch (err) {
    console.error('[ATMS] Copy failed:', err);
    showToast('Copy failed', 'error');
  }
}

// Handle copy full profile
async function handleCopyFullProfile() {
  if (!state.selectedProfile) return;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'EXPORT_PROFILE_SECTION',
      profileId: state.selectedProfile.id,
      section: 'full'
    });

    if (response?.success && response.text) {
      await navigator.clipboard.writeText(response.text);
      showToast('Full profile copied!');
    } else {
      showToast('Nothing to copy', 'error');
    }
  } catch (err) {
    console.error('[ATMS] Copy full profile failed:', err);
    showToast('Copy failed', 'error');
  }
}

// Handle autofill form
async function handleAutofillForm() {
  if (!state.selectedProfile) return;

  try {
    // Get the current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showToast('No active tab found', 'error');
      return;
    }

    // Send message to content script to autofill
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'AUTOFILL_PROFILE',
      profile: state.selectedProfile
    });

    if (response?.success) {
      showToast(`Filled ${response.fieldCount || 0} fields`);
    } else {
      showToast(response?.error || 'Autofill not available on this page', 'error');
    }
  } catch (err) {
    console.error('[ATMS] Autofill failed:', err);
    showToast('Autofill not available on this page', 'error');
  }
}

// Show toast notification
function showToast(message, type = 'success') {
  // Remove existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  // Remove after delay
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// Handle edit profile button
function handleEditProfile() {
  if (!state.selectedProfile) return;

  state.editingProfile = state.selectedProfile;
  document.getElementById('profile-editor-title').textContent = 'Edit Profile';
  document.getElementById('btn-delete-profile').style.display = 'block';

  populateOrgDropdown();
  populateProfileForm(state.selectedProfile);
  closeDrawer('profileDetail');
  openDrawer('profileEditor');
}

// Populate organization dropdown in editor
function populateOrgDropdown() {
  const dropdown = document.getElementById('edit-profile-org');
  if (!dropdown) return;

  // Clear existing org options (keep first "Personal" option)
  while (dropdown.options.length > 1) {
    dropdown.remove(1);
  }

  // Add organizations
  state.organizations.forEach(org => {
    const option = document.createElement('option');
    option.value = org.id;
    option.textContent = org.name;
    dropdown.appendChild(option);
  });
}

// Populate profile form with existing data (SIMPLIFIED)
function populateProfileForm(profile) {
  // Basic info
  document.getElementById('edit-artist-name').value = profile.artistName || '';
  document.getElementById('edit-artist-type').value = profile.type || 'other';
  document.getElementById('edit-crew-size').value = profile.crewSize || '';
  document.getElementById('edit-profile-org').value = profile.organizationId || '';

  // Contacts
  const contactsContainer = document.getElementById('contacts-rows');
  if (contactsContainer) {
    contactsContainer.innerHTML = '';
    if (profile.contacts && profile.contacts.length > 0) {
      profile.contacts.forEach(contact => addContactRow(null, contact));
    } else {
      addContactRow();
    }
  }

  // Tech specs (simplified)
  document.getElementById('edit-tech-text').value = profile.techSpecs?.text || '';
  document.getElementById('edit-tech-doc').value = profile.techSpecs?.documentUrl || '';

  // Stage requirements
  document.getElementById('edit-stage-text').value = profile.stageRequirements?.text || '';
  document.getElementById('edit-stage-doc').value = profile.stageRequirements?.documentUrl || '';

  // Hospitality
  document.getElementById('edit-hospitality-text').value = profile.hospitality?.text || '';
  document.getElementById('edit-hospitality-doc').value = profile.hospitality?.documentUrl || '';

  // Terms
  document.getElementById('edit-terms-text').value = profile.terms?.text || '';
  document.getElementById('edit-terms-doc').value = profile.terms?.documentUrl || '';

  // Document links
  const docs = profile.documents || {};
  document.getElementById('edit-doc-tech').value = docs.techRider || '';
  document.getElementById('edit-doc-stage').value = docs.stageRider || '';
  document.getElementById('edit-doc-hospitality').value = docs.hospitalityRider || '';
  document.getElementById('edit-doc-press').value = docs.pressKit || '';
  document.getElementById('edit-doc-other').value = docs.other || '';
}

// Clear profile form
function clearProfileForm() {
  document.getElementById('profile-form')?.reset();

  // Reset contact rows
  const contactsContainer = document.getElementById('contacts-rows');
  if (contactsContainer) {
    contactsContainer.innerHTML = '';
    addContactRow();
  }
}

// Add contact row
function addContactRow(e, data = {}) {
  if (e) e.preventDefault();

  const container = document.getElementById('contacts-rows');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'contact-row';
  row.innerHTML = `
    <input type="text" placeholder="Name" class="contact-name-input" value="${escapeHtml(data.name || '')}">
    <input type="email" placeholder="Email" class="contact-email-input" value="${escapeHtml(data.email || '')}">
    <input type="tel" placeholder="Phone" class="contact-phone-input" value="${escapeHtml(data.phone || '')}">
    <input type="text" placeholder="Role" class="contact-role-input" value="${escapeHtml(data.role || '')}">
    <label class="contact-primary-label"><input type="checkbox" class="contact-primary-input" ${data.isPrimary ? 'checked' : ''}> Primary</label>
    <button type="button" class="btn-remove-row" onclick="this.parentElement.remove()">×</button>
  `;
  container.appendChild(row);
}

// Handle save profile (SIMPLIFIED)
async function handleSaveProfile(e) {
  console.log('[ATMS] handleSaveProfile called');
  e.preventDefault();

  const artistName = document.getElementById('edit-artist-name')?.value?.trim();
  console.log('[ATMS] Artist name:', artistName);
  if (!artistName) {
    showToast('Artist name is required', 'error');
    return;
  }

  // Collect form data (simplified schema)
  const profileData = {
    artistName,
    type: document.getElementById('edit-artist-type')?.value || 'other',
    crewSize: parseInt(document.getElementById('edit-crew-size')?.value) || null,
    organizationId: document.getElementById('edit-profile-org')?.value || null,

    contacts: collectContactRows(),

    techSpecs: {
      text: document.getElementById('edit-tech-text')?.value || '',
      documentUrl: document.getElementById('edit-tech-doc')?.value || ''
    },

    stageRequirements: {
      text: document.getElementById('edit-stage-text')?.value || '',
      documentUrl: document.getElementById('edit-stage-doc')?.value || ''
    },

    hospitality: {
      text: document.getElementById('edit-hospitality-text')?.value || '',
      documentUrl: document.getElementById('edit-hospitality-doc')?.value || ''
    },

    terms: {
      text: document.getElementById('edit-terms-text')?.value || '',
      documentUrl: document.getElementById('edit-terms-doc')?.value || ''
    },

    documents: {
      techRider: document.getElementById('edit-doc-tech')?.value || '',
      stageRider: document.getElementById('edit-doc-stage')?.value || '',
      hospitalityRider: document.getElementById('edit-doc-hospitality')?.value || '',
      pressKit: document.getElementById('edit-doc-press')?.value || '',
      other: document.getElementById('edit-doc-other')?.value || ''
    }
  };

  try {
    const btn = document.getElementById('btn-save-profile');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    let response;
    if (state.editingProfile) {
      response = await chrome.runtime.sendMessage({
        type: 'UPDATE_PROFILE',
        profileId: state.editingProfile.id,
        updates: profileData
      });
    } else {
      const userId = state.userProfile?.id || state.userProfile?.email;
      response = await chrome.runtime.sendMessage({
        type: 'CREATE_PROFILE',
        profileData: { ...profileData, createdBy: userId }
      });
    }

    console.log('[ATMS] Save profile response:', response);
    if (response?.success) {
      showToast(state.editingProfile ? 'Profile updated!' : 'Profile created!');
      closeDrawer('profileEditor');
      await loadArtistProfiles();
    } else {
      console.error('[ATMS] Save profile failed:', response?.error);
      showToast(response?.error || 'Failed to save profile', 'error');
    }
  } catch (err) {
    console.error('[ATMS] Save profile error:', err);
    showToast('Failed to save profile', 'error');
  } finally {
    const btn = document.getElementById('btn-save-profile');
    btn.disabled = false;
    btn.textContent = 'Save Profile';
  }
}

// Collect contact rows from form
function collectContactRows() {
  const rows = document.querySelectorAll('#contacts-rows .contact-row');
  const contacts = [];

  rows.forEach(row => {
    const name = row.querySelector('.contact-name-input')?.value?.trim();
    if (name) {
      contacts.push({
        name,
        email: row.querySelector('.contact-email-input')?.value?.trim() || '',
        phone: row.querySelector('.contact-phone-input')?.value?.trim() || '',
        role: row.querySelector('.contact-role-input')?.value?.trim() || '',
        isPrimary: row.querySelector('.contact-primary-input')?.checked || false
      });
    }
  });

  return contacts;
}

// Handle delete profile
async function handleDeleteProfile() {
  if (!state.editingProfile) return;

  if (!confirm(`Delete "${state.editingProfile.artistName}"? This cannot be undone.`)) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'DELETE_PROFILE',
      profileId: state.editingProfile.id
    });

    if (response?.success) {
      showToast('Profile deleted');
      closeDrawer('profileEditor');
      state.editingProfile = null;
      await loadArtistProfiles();
    } else {
      showToast(response?.error || 'Failed to delete', 'error');
    }
  } catch (err) {
    console.error('[ATMS] Delete profile error:', err);
    showToast('Failed to delete profile', 'error');
  }
}

// ==================== ORGANIZATIONS ====================

// Render organization manager
function renderOrgManager() {
  const container = document.getElementById('orgs-list');
  if (!container) return;

  if (state.organizations.length === 0) {
    container.innerHTML = '<p class="empty-text">No organizations yet</p>';
    return;
  }

  let html = '';
  state.organizations.forEach(org => {
    const memberCount = org.members?.length || 0;
    html += `
      <div class="org-card" data-org-id="${org.id}">
        <div class="org-info">
          <div class="org-name">${escapeHtml(org.name)}</div>
          <div class="org-members">${memberCount} member${memberCount !== 1 ? 's' : ''}</div>
        </div>
        <div class="org-actions">
          <button class="btn-sm btn-view-org" onclick="viewOrgMembers('${org.id}')">View</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// View organization members
window.viewOrgMembers = function(orgId) {
  const org = state.organizations.find(o => o.id === orgId);
  if (!org) return;

  let membersList = org.members.map(m =>
    `${m.displayName || m.email} (${m.role})`
  ).join('\n');

  alert(`Members of ${org.name}:\n\n${membersList || 'No members'}`);
};

// Handle create organization
async function handleCreateOrg() {
  const name = prompt('Enter organization name:');
  if (!name?.trim()) return;

  try {
    const userId = state.userProfile?.id || state.userProfile?.email;
    const email = state.userProfile?.email || '';
    const displayName = state.userProfile?.name || '';

    const response = await chrome.runtime.sendMessage({
      type: 'CREATE_ORGANIZATION',
      name: name.trim(),
      userId,
      email,
      displayName
    });

    if (response?.success) {
      showToast('Organization created!');
      await loadOrganizations();
      renderOrgManager();
    } else {
      showToast(response?.error || 'Failed to create org', 'error');
    }
  } catch (err) {
    console.error('[ATMS] Create org error:', err);
    showToast('Failed to create organization', 'error');
  }
}
