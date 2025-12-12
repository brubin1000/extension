/**
 * ATMS Side Panel - Main Logic
 */

// State
const state = {
  currentScreen: 'overview',
  events: [],
  contacts: [],
  userProfile: null,
  selectedEvent: null
};

// DOM Elements
let elements = {};

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  console.log('[ATMS] Panel init');
  
  cacheElements();
  setupNavigation();
  setupDrawers();
  setupFilters();
  setupForms();
  
  await loadUserProfile();
  await loadData();
  
  // Listen for storage changes (sync from Gmail)
  chrome.storage.onChanged.addListener(handleStorageChange);
  
  showScreen('overview');
}

function cacheElements() {
  elements = {
    screens: {
      overview: document.getElementById('screen-overview'),
      contacts: document.getElementById('screen-contacts'),
      team: document.getElementById('screen-team'),
      settings: document.getElementById('screen-settings')
    },
    tabs: document.querySelectorAll('.tab-item'),
    drawers: {
      newEvent: document.getElementById('drawer-new-event'),
      addContact: document.getElementById('drawer-add-contact'),
      eventDetail: document.getElementById('drawer-event-detail')
    },
    backdrop: document.getElementById('drawer-backdrop')
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
  const drawer = elements.drawers[name];
  if (drawer) {
    drawer.classList.remove('hidden');
    elements.backdrop?.classList.remove('hidden');
  }
}

function closeDrawer(name) {
  const drawer = elements.drawers[name];
  if (drawer) {
    drawer.classList.add('hidden');
    elements.backdrop?.classList.add('hidden');
  }
}

function closeAllDrawers() {
  Object.keys(elements.drawers).forEach(closeDrawer);
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
    const stored = await chrome.storage.local.get('atmsEvents');
    state.events = stored.atmsEvents || [];
    renderEvents();
    updateEventCounts();
  } catch (err) {
    console.error('[ATMS] Failed to load events:', err);
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
    if (changes.atmsEvents) {
      state.events = changes.atmsEvents.newValue || [];
      renderEvents();
      updateEventCounts();
    }
    if (changes.atmsContacts) {
      state.contacts = changes.atmsContacts.newValue || [];
      renderContacts();
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
