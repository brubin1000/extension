/**
 * Gmail Content Script
 * Injects "ATMS" button with inline dropdown for event creation directly in Gmail
 */

console.log('[ATMS] Content script loaded');

// State
let buttonInjected = false;
let currentEmailId = null;
let dropdownOpen = false;
let currentDropdown = null;

// Event state for the flow
let eventState = {
  screen: 'choice', // choice, loading, review, success, error, link
  emailData: null,
  eventDetails: null,
  selectedAttendees: new Set(),
  upcomingEvents: []
};

// Gmail selectors - multiple fallbacks for different Gmail versions
const GMAIL_SELECTORS = {
  emailView: '[role="main"] [data-message-id], [role="main"] [data-legacy-message-id]',
  toolbar: '[role="main"] [gh="tm"], [role="main"] .G-atb, [role="main"] .btC',
  toolbarAlt: '.ade, .G-tF, [role="main"] .iH > div:first-child',
  subject: '[role="main"] h2[data-thread-perm-id], [role="main"] .hP',
  body: '[role="main"] .a3s.aiL, [role="main"] .a3s',
  sender: '[role="main"] [email], [role="main"] .gD',
  // Fallback: inject near reply button area
  replyArea: '[role="main"] .amn, [role="main"] .ams'
};

/**
 * Inject styles
 */
function injectStyles() {
  if (document.getElementById('atms-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'atms-styles';
  style.textContent = `
    /* Button - Icon only with morphing animation */
    #atms-btn {
      display: inline-flex;
      margin-left: 8px;
      position: relative;
    }
    
    .atms-trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      padding: 0;
      background: linear-gradient(135deg, #22c7a8 0%, #1ba896 100%);
      color: white;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      box-shadow: 0 2px 8px rgba(34, 199, 168, 0.3);
    }
    
    .atms-trigger:hover {
      transform: scale(1.1) rotate(-3deg);
      box-shadow: 0 6px 20px rgba(34, 199, 168, 0.5);
      border-radius: 14px;
    }
    
    .atms-trigger:active {
      transform: scale(0.95);
    }
    
    /* Icon animations */
    .atms-icon {
      transition: transform 0.3s ease;
    }
    
    .atms-trigger:hover .atms-icon {
      transform: scale(1.05);
    }
    
    /* Plus morphs to check on hover */
    .atms-icon .plus-group {
      transition: all 0.3s ease;
      transform-origin: 12px 16px;
    }
    
    .atms-trigger:hover .plus-group {
      transform: rotate(-45deg) scale(1.1);
    }
    
    .atms-icon .plus-v {
      transition: all 0.3s ease;
    }
    
    .atms-trigger:hover .plus-v {
      transform: translate(1px, -1px) rotate(0deg);
    }
    
    .atms-icon .plus-h {
      transition: all 0.3s ease;
    }
    
    .atms-trigger:hover .plus-h {
      transform: scaleX(0.7) translateX(-1px);
    }
    
    /* Calendar shakes slightly on hover */
    .atms-icon .cal-body {
      transition: all 0.3s ease;
    }
    
    .atms-trigger:hover .cal-body {
      stroke: #fff;
    }
    
    .atms-icon .cal-hook1,
    .atms-icon .cal-hook2 {
      transition: transform 0.3s ease;
      transform-origin: center 4px;
    }
    
    .atms-trigger:hover .cal-hook1 {
      transform: rotate(-10deg);
    }
    
    .atms-trigger:hover .cal-hook2 {
      transform: rotate(10deg);
    }
    
    /* Backdrop */
    .atms-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.4);
      z-index: 9998;
      animation: atms-fadeIn 0.2s ease;
    }
    
    /* Dropdown */
    .atms-dropdown {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 380px;
      max-height: 80vh;
      background: #0d0f14;
      border: 1px solid #262b35;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      z-index: 9999;
      overflow: hidden;
      font-family: 'Google Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      animation: atms-scaleIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    
    @keyframes atms-fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    @keyframes atms-scaleIn {
      from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
      to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }
    
    /* Header */
    .atms-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid #262b35;
      background: #151820;
    }
    
    .atms-logo {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 16px;
      font-weight: 600;
      color: #22c7a8;
    }
    
    .atms-close {
      background: none;
      border: none;
      color: #808898;
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .atms-close:hover {
      background: #1e2128;
      color: #eff2f5;
    }
    
    /* Content */
    .atms-content {
      padding: 20px;
      max-height: 60vh;
      overflow-y: auto;
    }
    
    /* Screens */
    .atms-screen {
      display: none;
    }
    
    .atms-screen.active {
      display: block;
      animation: atms-fadeIn 0.2s ease;
    }
    
    /* Subject line */
    .atms-subject {
      font-size: 13px;
      color: #808898;
      margin-bottom: 20px;
      padding: 12px;
      background: #151820;
      border-radius: 8px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    /* Choice buttons */
    .atms-choice-btn {
      width: 100%;
      padding: 16px;
      margin-bottom: 12px;
      background: #151820;
      border: 1px solid #262b35;
      border-radius: 12px;
      color: #eff2f5;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 12px;
      transition: all 0.2s ease;
      text-align: left;
      font-family: inherit;
    }
    
    .atms-choice-btn:hover {
      background: #1e2128;
      border-color: #22c7a8;
      transform: translateX(4px);
    }
    
    .atms-choice-btn svg {
      color: #22c7a8;
      flex-shrink: 0;
    }
    
    .atms-choice-desc {
      font-size: 12px;
      color: #808898;
      margin-top: 4px;
    }
    
    /* Loading */
    .atms-loading {
      text-align: center;
      padding: 40px 20px;
    }
    
    .atms-spinner {
      width: 48px;
      height: 48px;
      border: 3px solid #262b35;
      border-top-color: #22c7a8;
      border-radius: 50%;
      animation: atms-spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }
    
    @keyframes atms-spin {
      to { transform: rotate(360deg); }
    }
    
    .atms-loading-text {
      color: #808898;
      font-size: 14px;
    }
    
    /* Form */
    .atms-form-group {
      margin-bottom: 16px;
    }
    
    .atms-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #808898;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .atms-input {
      width: 100%;
      padding: 12px;
      background: #151820;
      border: 1px solid #262b35;
      border-radius: 8px;
      color: #eff2f5;
      font-size: 14px;
      font-family: inherit;
      box-sizing: border-box;
    }
    
    .atms-input:focus {
      outline: none;
      border-color: #22c7a8;
      box-shadow: 0 0 0 3px rgba(34, 199, 168, 0.2);
    }
    
    .atms-row {
      display: flex;
      gap: 12px;
    }
    
    .atms-row .atms-form-group {
      flex: 1;
    }
    
    /* Attendees */
    .atms-attendees {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
    }
    
    .atms-attendee {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: #1e2128;
      border: 1px solid #262b35;
      border-radius: 20px;
      font-size: 12px;
      color: #eff2f5;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    
    .atms-attendee:hover {
      border-color: #22c7a8;
    }
    
    .atms-attendee.selected {
      background: rgba(34, 199, 168, 0.2);
      border-color: #22c7a8;
      color: #22c7a8;
    }
    
    /* Buttons */
    .atms-btn {
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      border: none;
      font-family: inherit;
    }
    
    .atms-btn-primary {
      background: #22c7a8;
      color: #0d0f14;
      width: 100%;
    }
    
    .atms-btn-primary:hover {
      filter: brightness(1.1);
      box-shadow: 0 4px 12px rgba(34, 199, 168, 0.3);
    }
    
    .atms-btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .atms-btn-secondary {
      background: #1e2128;
      color: #eff2f5;
      border: 1px solid #262b35;
    }
    
    .atms-btn-secondary:hover {
      background: #262b35;
    }
    
    .atms-actions {
      display: flex;
      gap: 12px;
      margin-top: 20px;
    }
    
    .atms-actions .atms-btn {
      flex: 1;
    }
    
    /* Success */
    .atms-success {
      text-align: center;
      padding: 30px 20px;
    }
    
    .atms-success-icon {
      width: 64px;
      height: 64px;
      background: rgba(34, 199, 168, 0.2);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
      color: #22c7a8;
    }
    
    .atms-success h3 {
      color: #eff2f5;
      margin: 0 0 8px;
      font-size: 18px;
    }
    
    .atms-success p {
      color: #808898;
      margin: 0 0 24px;
      font-size: 14px;
    }
    
    /* Error */
    .atms-error {
      text-align: center;
      padding: 30px 20px;
    }
    
    .atms-error-icon {
      width: 64px;
      height: 64px;
      background: rgba(239, 68, 68, 0.2);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
      color: #ef4444;
    }
    
    .atms-error h3 {
      color: #eff2f5;
      margin: 0 0 8px;
      font-size: 18px;
    }
    
    .atms-error p {
      color: #808898;
      margin: 0 0 24px;
      font-size: 14px;
    }
    
    /* Event list */
    .atms-event-list {
      max-height: 300px;
      overflow-y: auto;
    }
    
    .atms-event-item {
      padding: 12px;
      background: #151820;
      border: 1px solid #262b35;
      border-radius: 8px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    
    .atms-event-item:hover {
      border-color: #22c7a8;
      background: #1e2128;
    }
    
    .atms-event-title {
      font-size: 14px;
      font-weight: 500;
      color: #eff2f5;
      margin-bottom: 4px;
    }
    
    .atms-event-date {
      font-size: 12px;
      color: #808898;
    }
    
    /* Back button */
    .atms-back {
      display: flex;
      align-items: center;
      gap: 8px;
      background: none;
      border: none;
      color: #808898;
      font-size: 13px;
      cursor: pointer;
      padding: 0;
      margin-bottom: 16px;
    }
    
    .atms-back:hover {
      color: #22c7a8;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Create the ATMS button - Icon only with morphing animation
 */
function createButton() {
  const button = document.createElement('div');
  button.id = 'atms-btn';
  button.innerHTML = `
    <button class="atms-trigger" title="Add to ATMS">
      <svg class="atms-icon" width="24" height="24" viewBox="0 0 24 24" fill="none">
        <!-- Calendar base -->
        <rect class="cal-body" x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/>
        <line class="cal-hook1" x1="8" y1="2" x2="8" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <line class="cal-hook2" x1="16" y1="2" x2="16" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <line class="cal-line" x1="3" y1="10" x2="21" y2="10" stroke="currentColor" stroke-width="2"/>
        <!-- Plus that morphs to check -->
        <g class="plus-group">
          <line class="plus-v" x1="12" y1="13" x2="12" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <line class="plus-h" x1="9" y1="16" x2="15" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </g>
      </svg>
    </button>
  `;
  
  button.querySelector('.atms-trigger').addEventListener('click', handleButtonClick);
  return button;
}

/**
 * Extract email content
 */
function extractEmailContent() {
  const subjectEl = document.querySelector(GMAIL_SELECTORS.subject);
  const subject = subjectEl?.textContent?.trim() || 'No Subject';
  
  const senderEls = document.querySelectorAll(GMAIL_SELECTORS.sender);
  let sender = '', senderEmail = '';
  if (senderEls.length > 0) {
    const lastSender = senderEls[senderEls.length - 1];
    senderEmail = lastSender.getAttribute('email') || '';
    sender = lastSender.getAttribute('name') || lastSender.textContent?.trim() || senderEmail;
  }
  
  const bodyEls = document.querySelectorAll(GMAIL_SELECTORS.body);
  let body = '';
  if (bodyEls.length > 0) {
    body = bodyEls[bodyEls.length - 1]?.innerText?.trim() || '';
  }
  
  const emailView = document.querySelector(GMAIL_SELECTORS.emailView);
  const messageId = emailView?.getAttribute('data-message-id') || '';
  
  const participants = [];
  senderEls.forEach(el => {
    const email = el.getAttribute('email');
    const name = el.getAttribute('name') || el.textContent?.trim();
    if (email && !participants.find(p => p.email === email)) {
      participants.push({ email, name });
    }
  });
  
  return {
    subject,
    sender,
    senderEmail,
    body: body.substring(0, 10000),
    messageId,
    participants,
    date: new Date().toISOString()
  };
}

/**
 * Handle button click
 */
async function handleButtonClick(e) {
  e?.preventDefault();
  e?.stopPropagation();
  
  console.log('[ATMS] Button clicked');
  
  // Extract email
  eventState.emailData = extractEmailContent();
  eventState.screen = 'choice';
  eventState.eventDetails = null;
  eventState.selectedAttendees = new Set();
  
  // Store for side panel sync
  await chrome.storage.local.set({
    currentEmailData: { ...eventState.emailData, extractedAt: Date.now() }
  });
  
  showDropdown();
}

/**
 * Show dropdown
 */
function showDropdown() {
  closeDropdown();
  
  const backdrop = document.createElement('div');
  backdrop.className = 'atms-backdrop';
  backdrop.addEventListener('click', closeDropdown);
  document.body.appendChild(backdrop);
  
  const dropdown = document.createElement('div');
  dropdown.className = 'atms-dropdown';
  dropdown.id = 'atms-dropdown';
  dropdown.innerHTML = getDropdownHTML();
  document.body.appendChild(dropdown);
  
  currentDropdown = dropdown;
  dropdownOpen = true;
  
  setupDropdownEvents();
  updateScreen('choice');
}

/**
 * Close dropdown
 */
function closeDropdown() {
  document.querySelector('.atms-backdrop')?.remove();
  document.getElementById('atms-dropdown')?.remove();
  currentDropdown = null;
  dropdownOpen = false;
}

/**
 * Get dropdown HTML
 */
function getDropdownHTML() {
  const subject = eventState.emailData?.subject || 'No Subject';
  
  return `
    <div class="atms-header">
      <div class="atms-logo">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        ATMS
      </div>
      <button class="atms-close" id="atms-close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    
    <div class="atms-content">
      <!-- Choice Screen -->
      <div class="atms-screen" id="screen-choice">
        <div class="atms-subject">${escapeHtml(subject)}</div>
        
        <button class="atms-choice-btn" id="btn-create-new">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          <div>
            <div>Create New Event</div>
            <div class="atms-choice-desc">Extract details with AI and create calendar event</div>
          </div>
        </button>
        
        <button class="atms-choice-btn" id="btn-link-existing">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
          <div>
            <div>Link to Existing Event</div>
            <div class="atms-choice-desc">Connect this email to an event in your calendar</div>
          </div>
        </button>
      </div>
      
      <!-- Loading Screen -->
      <div class="atms-screen" id="screen-loading">
        <div class="atms-loading">
          <div class="atms-spinner"></div>
          <div class="atms-loading-text" id="loading-text">Extracting event details...</div>
        </div>
      </div>
      
      <!-- Review Screen -->
      <div class="atms-screen" id="screen-review">
        <button class="atms-back" id="btn-back-review">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back
        </button>
        
        <div class="atms-form-group">
          <label class="atms-label">Event Title</label>
          <input type="text" class="atms-input" id="input-title" placeholder="Event name">
        </div>
        
        <div class="atms-row">
          <div class="atms-form-group">
            <label class="atms-label">Date</label>
            <input type="date" class="atms-input" id="input-date">
          </div>
          <div class="atms-form-group">
            <label class="atms-label">Time</label>
            <input type="time" class="atms-input" id="input-time">
          </div>
        </div>
        
        <div class="atms-form-group">
          <label class="atms-label">Location</label>
          <input type="text" class="atms-input" id="input-location" placeholder="Venue, city">
        </div>
        
        <div class="atms-form-group">
          <label class="atms-label">Description</label>
          <textarea class="atms-input" id="input-desc" rows="3" placeholder="Event details"></textarea>
        </div>
        
        <div class="atms-form-group">
          <label class="atms-label">Attendees</label>
          <div class="atms-attendees" id="attendees-list"></div>
        </div>
        
        <button class="atms-btn atms-btn-primary" id="btn-create">Create Event</button>
      </div>
      
      <!-- Link Screen -->
      <div class="atms-screen" id="screen-link">
        <button class="atms-back" id="btn-back-link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back
        </button>
        
        <div class="atms-form-group">
          <label class="atms-label">Select Event to Link</label>
        </div>
        
        <div class="atms-event-list" id="event-list">
          <div class="atms-loading">
            <div class="atms-spinner"></div>
          </div>
        </div>
      </div>
      
      <!-- Success Screen -->
      <div class="atms-screen" id="screen-success">
        <div class="atms-success">
          <div class="atms-success-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h3>Event Created!</h3>
          <p id="success-message">Your event has been added to Google Calendar</p>
          <div class="atms-actions">
            <button class="atms-btn atms-btn-secondary" id="btn-view-calendar">View Calendar</button>
            <button class="atms-btn atms-btn-primary" id="btn-done">Done</button>
          </div>
        </div>
      </div>
      
      <!-- Error Screen -->
      <div class="atms-screen" id="screen-error">
        <div class="atms-error">
          <div class="atms-error-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </div>
          <h3>Something went wrong</h3>
          <p id="error-message">Please try again</p>
          <div class="atms-actions">
            <button class="atms-btn atms-btn-secondary" id="btn-retry">Try Again</button>
            <button class="atms-btn atms-btn-primary" id="btn-close-error">Close</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Setup dropdown events
 */
function setupDropdownEvents() {
  if (!currentDropdown) return;
  
  // Close
  currentDropdown.querySelector('#atms-close')?.addEventListener('click', closeDropdown);
  
  // Choice buttons
  currentDropdown.querySelector('#btn-create-new')?.addEventListener('click', handleCreateNew);
  currentDropdown.querySelector('#btn-link-existing')?.addEventListener('click', handleLinkExisting);
  
  // Back buttons
  currentDropdown.querySelector('#btn-back-review')?.addEventListener('click', () => updateScreen('choice'));
  currentDropdown.querySelector('#btn-back-link')?.addEventListener('click', () => updateScreen('choice'));
  
  // Create button
  currentDropdown.querySelector('#btn-create')?.addEventListener('click', handleCreate);
  
  // Success/Error buttons
  currentDropdown.querySelector('#btn-view-calendar')?.addEventListener('click', () => {
    window.open('https://calendar.google.com', '_blank');
  });
  currentDropdown.querySelector('#btn-done')?.addEventListener('click', closeDropdown);
  currentDropdown.querySelector('#btn-retry')?.addEventListener('click', () => updateScreen('choice'));
  currentDropdown.querySelector('#btn-close-error')?.addEventListener('click', closeDropdown);
}

/**
 * Update screen
 */
function updateScreen(screen) {
  if (!currentDropdown) return;
  
  currentDropdown.querySelectorAll('.atms-screen').forEach(s => s.classList.remove('active'));
  currentDropdown.querySelector(`#screen-${screen}`)?.classList.add('active');
  eventState.screen = screen;
}

/**
 * Handle Create New
 */
async function handleCreateNew() {
  updateScreen('loading');
  
  try {
    const response = await sendMessage({
      type: 'EXTRACT_EVENT',
      email: eventState.emailData
    });
    
    if (!response?.success) {
      throw new Error(response?.error || 'Failed to extract event details');
    }
    
    eventState.eventDetails = response.eventDetails;
    populateReviewForm();
    updateScreen('review');
    
  } catch (err) {
    console.error('[ATMS] Extract error:', err);
    showError(err.message);
  }
}

/**
 * Handle Link Existing
 */
async function handleLinkExisting() {
  updateScreen('link');
  
  try {
    const response = await sendMessage({ type: 'GET_UPCOMING_EVENTS' });
    
    if (!response?.success) {
      throw new Error(response?.error || 'Failed to load events');
    }
    
    eventState.upcomingEvents = response.events || [];
    renderEventList();
    
  } catch (err) {
    console.error('[ATMS] Load events error:', err);
    showError(err.message);
  }
}

/**
 * Populate review form
 */
function populateReviewForm() {
  if (!currentDropdown || !eventState.eventDetails) return;
  
  const details = eventState.eventDetails;
  
  currentDropdown.querySelector('#input-title').value = details.title || '';
  currentDropdown.querySelector('#input-date').value = details.date || '';
  currentDropdown.querySelector('#input-time').value = details.time || '10:00';
  currentDropdown.querySelector('#input-location').value = details.location || '';
  currentDropdown.querySelector('#input-desc').value = details.description || '';
  
  // Render attendees
  const attendeesList = currentDropdown.querySelector('#attendees-list');
  const participants = eventState.emailData?.participants || [];
  
  attendeesList.innerHTML = participants.map(p => `
    <div class="atms-attendee" data-email="${escapeHtml(p.email)}">
      <span>${escapeHtml(p.name || p.email)}</span>
    </div>
  `).join('') || '<span style="color: #808898; font-size: 13px;">No participants found</span>';
  
  // Attendee click handlers
  attendeesList.querySelectorAll('.atms-attendee').forEach(el => {
    el.addEventListener('click', () => {
      el.classList.toggle('selected');
      const email = el.dataset.email;
      if (el.classList.contains('selected')) {
        eventState.selectedAttendees.add(email);
      } else {
        eventState.selectedAttendees.delete(email);
      }
    });
  });
}

/**
 * Render event list
 */
function renderEventList() {
  if (!currentDropdown) return;
  
  const list = currentDropdown.querySelector('#event-list');
  
  if (eventState.upcomingEvents.length === 0) {
    list.innerHTML = '<p style="color: #808898; text-align: center; padding: 20px;">No upcoming events found</p>';
    return;
  }
  
  list.innerHTML = eventState.upcomingEvents.map(event => `
    <div class="atms-event-item" data-event-id="${event.id}">
      <div class="atms-event-title">${escapeHtml(event.title)}</div>
      <div class="atms-event-date">${formatEventDate(event.start)}</div>
    </div>
  `).join('');
  
  // Event click handlers
  list.querySelectorAll('.atms-event-item').forEach(el => {
    el.addEventListener('click', () => handleLinkToEvent(el.dataset.eventId));
  });
}

/**
 * Handle link to event
 */
async function handleLinkToEvent(eventId) {
  updateScreen('loading');
  document.getElementById('loading-text').textContent = 'Linking email to event...';
  
  try {
    // Store link in storage (for sync with side panel)
    const event = eventState.upcomingEvents.find(e => e.id === eventId);
    await chrome.storage.local.set({
      linkedEvents: {
        [eventState.emailData.messageId]: {
          eventId,
          eventTitle: event?.title,
          linkedAt: Date.now()
        }
      }
    });
    
    document.getElementById('success-message').textContent = `Email linked to "${event?.title || 'event'}"`;
    updateScreen('success');
    
  } catch (err) {
    console.error('[ATMS] Link error:', err);
    showError(err.message);
  }
}

/**
 * Handle create event
 */
async function handleCreate() {
  if (!currentDropdown) return;
  
  const createBtn = currentDropdown.querySelector('#btn-create');
  createBtn.disabled = true;
  createBtn.textContent = 'Creating...';
  
  try {
    const eventData = {
      title: currentDropdown.querySelector('#input-title').value || 'New Event',
      date: currentDropdown.querySelector('#input-date').value,
      time: currentDropdown.querySelector('#input-time').value || '10:00',
      location: currentDropdown.querySelector('#input-location').value,
      description: currentDropdown.querySelector('#input-desc').value,
      attendees: Array.from(eventState.selectedAttendees),
      duration: eventState.eventDetails?.duration || 60,
      emailMessageId: eventState.emailData?.messageId
    };
    
    const response = await sendMessage({
      type: 'CREATE_EVENT',
      eventData
    });
    
    if (!response?.success) {
      throw new Error(response?.error || 'Failed to create event');
    }
    
    // Save to local storage for side panel sync
    const savedEvents = (await chrome.storage.local.get('atmsEvents'))?.atmsEvents || [];
    savedEvents.push({
      ...eventData,
      id: response.eventId,
      createdAt: Date.now(),
      status: 'confirmed'
    });
    await chrome.storage.local.set({ atmsEvents: savedEvents });
    
    document.getElementById('success-message').textContent = `"${eventData.title}" added to Google Calendar`;
    updateScreen('success');
    
  } catch (err) {
    console.error('[ATMS] Create error:', err);
    showError(err.message);
  } finally {
    createBtn.disabled = false;
    createBtn.textContent = 'Create Event';
  }
}

/**
 * Show error
 */
function showError(message) {
  if (currentDropdown) {
    currentDropdown.querySelector('#error-message').textContent = message;
  }
  updateScreen('error');
}

/**
 * Send message to background
 */
async function sendMessage(message) {
  try {
    if (!chrome?.runtime?.sendMessage) {
      throw new Error('Extension disconnected. Please refresh the page.');
    }
    return await chrome.runtime.sendMessage(message);
  } catch (err) {
    console.error('[ATMS] Message error:', err);
    throw err;
  }
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Format event date
 */
function formatEventDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

/**
 * Inject button
 */
function injectButton() {
  // Check if we're viewing an email
  const emailView = document.querySelector(GMAIL_SELECTORS.emailView);
  
  if (!emailView) {
    document.getElementById('atms-btn')?.remove();
    buttonInjected = false;
    return;
  }
  
  // Already injected
  if (document.getElementById('atms-btn') || document.getElementById('atms-btn-float')) return;
  
  // Try multiple toolbar locations
  let toolbar = null;
  const toolbarSelectors = [
    '[role="main"] [gh="tm"]',
    '[role="main"] .G-atb',
    '[role="main"] .btC',
    '.ade',
    '.G-tF',
    '[role="main"] .iH > div:first-child',
    // Near reply buttons
    '[role="main"] .amn',
    '[role="main"] .ams',
    // Generic toolbar area
    '[role="main"] .nH .G-atb',
    '[role="main"] .nH.if'
  ];
  
  for (const selector of toolbarSelectors) {
    toolbar = document.querySelector(selector);
    if (toolbar) {
      console.log('[ATMS] Found toolbar with selector:', selector);
      break;
    }
  }
  
  // Last resort: create floating button
  if (!toolbar) {
    console.log('[ATMS] No toolbar found, creating floating button');
    createFloatingButton();
    return;
  }
  
  const button = createButton();
  toolbar.appendChild(button);
  buttonInjected = true;
  currentEmailId = emailView.getAttribute('data-message-id') || emailView.getAttribute('data-legacy-message-id');
  
  console.log('[ATMS] Button injected into toolbar');
}

/**
 * Create floating button as fallback
 */
function createFloatingButton() {
  if (document.getElementById('atms-btn-float')) return;
  
  const button = document.createElement('div');
  button.id = 'atms-btn-float';
  button.innerHTML = `
    <button class="atms-trigger-float" title="Add to ATMS">
      <svg class="atms-icon" width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect class="cal-body" x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/>
        <line class="cal-hook1" x1="8" y1="2" x2="8" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <line class="cal-hook2" x1="16" y1="2" x2="16" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <line class="cal-line" x1="3" y1="10" x2="21" y2="10" stroke="currentColor" stroke-width="2"/>
        <g class="plus-group">
          <line class="plus-v" x1="12" y1="13" x2="12" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <line class="plus-h" x1="9" y1="16" x2="15" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </g>
      </svg>
    </button>
  `;
  
  // Add floating button styles
  const style = document.createElement('style');
  style.textContent = `
    #atms-btn-float {
      position: fixed;
      bottom: 80px;
      right: 20px;
      z-index: 9999;
    }
    .atms-trigger-float {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #22c7a8 0%, #1ba896 100%);
      color: white;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 20px rgba(34, 199, 168, 0.4);
      transition: all 0.3s ease;
    }
    .atms-trigger-float:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 30px rgba(34, 199, 168, 0.5);
    }
  `;
  document.head.appendChild(style);
  
  button.querySelector('.atms-trigger-float').addEventListener('click', handleButtonClick);
  document.body.appendChild(button);
  buttonInjected = true;
  
  console.log('[ATMS] Floating button created');
}

/**
 * Handle email change
 */
function handleEmailChange() {
  const emailView = document.querySelector(GMAIL_SELECTORS.emailView);
  const newEmailId = emailView?.getAttribute('data-message-id') || null;
  
  if (newEmailId !== currentEmailId) {
    currentEmailId = newEmailId;
    buttonInjected = false;
    closeDropdown();
    setTimeout(injectButton, 100);
  }
}

/**
 * Initialize
 */
function init() {
  console.log('[ATMS] Initializing...');
  
  injectStyles();
  injectButton();
  
  // Watch for changes
  const observer = new MutationObserver(() => {
    clearTimeout(window.atmsDebounce);
    window.atmsDebounce = setTimeout(() => {
      injectButton();
      handleEmailChange();
    }, 200);
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
  
  window.addEventListener('hashchange', () => setTimeout(injectButton, 100));
  
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(injectButton, 100);
    }
  }, 1000);
  
  console.log('[ATMS] Ready');
}

// Start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
