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

    /* Field Sections */
    .atms-field-section {
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid #262b35;
    }

    .atms-field-section:last-child {
      border-bottom: none;
    }

    .atms-section-header {
      font-size: 11px;
      font-weight: 700;
      color: #22c7a8;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 12px;
      padding: 8px 12px;
      background: rgba(34, 199, 168, 0.1);
      border-radius: 6px;
      border-left: 3px solid #22c7a8;
    }

    .atms-section-fields {
      margin-top: 12px;
    }

    /* Array Lists */
    .atms-array-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .atms-array-item {
      padding: 8px 12px;
      background: #1e2128;
      border: 1px solid #262b35;
      border-radius: 6px;
      font-size: 13px;
      color: #eff2f5;
      word-break: break-word;
      overflow-wrap: break-word;
    }

    /* Contacts List */
    .atms-contacts-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 12px;
    }

    .atms-contact-card {
      padding: 12px;
      background: #151820;
      border: 1px solid #262b35;
      border-radius: 8px;
      transition: all 0.15s ease;
    }

    .atms-contact-card:hover {
      border-color: #22c7a8;
      background: #1e2128;
    }

    .atms-contact-name {
      font-size: 14px;
      font-weight: 600;
      color: #eff2f5;
      margin-bottom: 4px;
    }

    .atms-contact-role {
      font-size: 12px;
      color: #22c7a8;
      margin-bottom: 6px;
      text-transform: capitalize;
    }

    .atms-contact-detail {
      font-size: 12px;
      color: #808898;
      margin-top: 2px;
    }

    /* Run of Show Timeline */
    .atms-timeline {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 8px;
      padding-left: 4px;
    }

    .atms-timeline-item {
      display: flex;
      gap: 16px;
      padding: 10px 12px;
      background: #151820;
      border-left: 3px solid #22c7a8;
      border-radius: 6px;
      transition: all 0.2s ease;
    }

    .atms-timeline-item:hover {
      background: #1e2128;
      border-left-color: #2ae0bf;
    }

    .atms-timeline-time {
      flex-shrink: 0;
      width: 60px;
      font-size: 13px;
      font-weight: 700;
      color: #22c7a8;
      font-variant-numeric: tabular-nums;
    }

    .atms-timeline-content {
      flex: 1;
    }

    .atms-timeline-event {
      font-size: 13px;
      font-weight: 600;
      color: #eff2f5;
      margin-bottom: 2px;
    }

    .atms-timeline-artist {
      font-size: 12px;
      color: #808898;
      font-style: italic;
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
  let bodyHtml = '';
  const allLinks = [];
  const seenUrls = new Set();

  console.log(`[ATMS] extractEmailContent: Found ${bodyEls.length} body elements`);

  if (bodyEls.length > 0) {
    // Get text from last body element (most recent message in thread)
    const bodyEl = bodyEls[bodyEls.length - 1];
    body = bodyEl?.innerText?.trim() || '';
    bodyHtml = bodyEl?.innerHTML?.trim() || '';

    console.log(`[ATMS] extractEmailContent: Body text length: ${body.length}`);

    // Sanity check: Warn if body is empty or very short
    if (!body || body.length < 50) {
      console.warn('[ATMS] ⚠️ Body element found but content is empty or very short. Page might not be fully loaded.');
    }

    // Extract links from ALL body elements (email might be a forward with links in multiple sections)
    const filterStats = { mailto: 0, anchor: 0, data: 0, duplicate: 0, empty: 0, kept: 0 };

    bodyEls.forEach((el, index) => {
      const linkEls = el?.querySelectorAll('a[href]') || [];
      console.log(`[ATMS] extractEmailContent: Body element ${index + 1} has ${linkEls.length} links`);

      linkEls.forEach(a => {
        let href = a.getAttribute('href');
        const text = a.textContent?.trim();

        // Track why links are filtered
        if (!href || !text) {
          filterStats.empty++;
          return;
        }

        // Unwrap Google tracking URLs (gmail wraps external links)
        if (href.includes('google.com/url?q=')) {
          try {
            const url = new URL(href);
            const realUrl = url.searchParams.get('q');
            if (realUrl) {
              href = decodeURIComponent(realUrl);
              console.log(`[ATMS] Unwrapped tracking URL: ${href.substring(0, 60)}...`);
            }
          } catch (e) {
            // Keep original if parsing fails
          }
        }

        // Filter and track reasons
        if (href.startsWith('mailto:')) {
          filterStats.mailto++;
        } else if (href.startsWith('#')) {
          filterStats.anchor++;
        } else if (href.startsWith('data:')) {
          filterStats.data++;
        } else if (seenUrls.has(href)) {
          filterStats.duplicate++;
        } else {
          seenUrls.add(href);
          allLinks.push(`${text}: ${href}`);
          filterStats.kept++;
        }
      });
    });

    console.log(`[ATMS] Link filtering stats:`, filterStats);
    console.log(`[ATMS] extractEmailContent: Extracted ${allLinks.length} unique links total`);

    // Log the actual links that were kept (first 50 chars of each)
    if (allLinks.length > 0) {
      console.log(`[ATMS] Links kept:`);
      allLinks.forEach((link, i) => {
        const preview = link.length > 80 ? link.substring(0, 80) + '...' : link;
        console.log(`  ${i + 1}. ${preview}`);
      });
    }

    // IMPORTANT: For forwarded emails, the ORIGINAL email with set times is at the BOTTOM
    // We need to capture the full email to get performance details
    // The AI parser handles up to 12000 chars of body, and we typically have ~1500 chars of links
    // So we can safely include the full body text without truncation
    console.log(`[ATMS] ✅ Keeping full email body (${body.length} chars) - no truncation`);

    // Append links section AFTER truncation
    if (allLinks.length > 0) {
      body += '\n\n=== LINKS EXTRACTED FROM EMAIL ===\n' + allLinks.join('\n');
      console.log(`[ATMS] Final body length with links: ${body.length}`);
    }
  } else {
    console.error('[ATMS] extractEmailContent: No body elements found! Selector might be wrong.');
  }

  const emailView = document.querySelector(GMAIL_SELECTORS.emailView);
  const messageId = emailView?.getAttribute('data-message-id') || '';

  // Extract thread ID from URL hash
  // Support: #inbox/threadId AND #search/query/threadId
  let threadId = null;
  const hashMatch = window.location.hash.match(/#(?:inbox|all|sent|trash|spam|drafts|starred|important|search\/[^/]+)\/([a-zA-Z0-9]+)/);
  if (hashMatch && hashMatch[1]) {
    threadId = hashMatch[1];
  }

  // Fallback: try data attribute
  if (!threadId) {
    threadId = emailView?.getAttribute('data-thread-id') || null;
  }

  const participants = [];
  senderEls.forEach(el => {
    const email = el.getAttribute('email');
    const name = el.getAttribute('name') || el.textContent?.trim();
    if (email && !participants.find(p => p.email === email)) {
      participants.push({ email, name, role: 'to' });
    }
  });

  return {
    subject,
    sender,
    senderEmail,
    body: body,  // Already truncated smartly above (8000 + links), no need to truncate again
    links: allLinks,  // Pass extracted links as structured array
    messageId,
    threadId,
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

  console.log('[ATMS] Button clicked - v5 (DOM extraction with links)');

  // Extract email data from DOM (includes subject, sender, body with links appended!)
  const emailData = extractEmailContent();

  if (!emailData.subject) {
    console.error('[ATMS] Could not extract subject from email');
    alert('Could not identify email. Please try refreshing Gmail.');
    return;
  }

  // Sanity check: Count how many links were extracted
  const linksMatch = emailData.body.match(/=== LINKS EXTRACTED FROM EMAIL ===/);
  const hasLinksSection = !!linksMatch;
  let linkCount = 0;
  if (hasLinksSection) {
    const linksSection = emailData.body.split('=== LINKS EXTRACTED FROM EMAIL ===')[1];
    linkCount = (linksSection?.match(/\n/g) || []).length;
  }

  console.log('[ATMS] ✅ Extracted from DOM:', {
    subject: emailData.subject,
    sender: emailData.sender,
    senderEmail: emailData.senderEmail,
    bodyLength: emailData.body.length,
    hasLinksSection: hasLinksSection,
    linkCount: linkCount,
    threadId: emailData.threadId
  });

  // Sanity check: Warn if no links found
  if (linkCount === 0) {
    console.warn('[ATMS] ⚠️ No links extracted from email. This might be expected or a bug.');
  } else {
    console.log(`[ATMS] ✅ Found ${linkCount} links in email`);
  }

  // Store the email data and show the dropdown
  eventState.emailData = emailData;
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

        <!-- Core Event Fields -->
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

        <!-- Dynamic Additional Fields Container -->
        <div id="additional-fields"></div>

        <div class="atms-form-group">
          <label class="atms-label">Attendees</label>
          <div class="atms-attendees" id="attendees-list"></div>
          <div style="margin-top: 12px; display: flex; gap: 8px; align-items: center;">
            <input
              type="email"
              class="atms-input"
              id="add-attendee-input"
              placeholder="Add email to invite..."
              style="flex: 1; font-size: 13px;"
            >
            <button
              class="atms-btn atms-btn-secondary"
              id="add-attendee-btn"
              style="padding: 8px 16px; font-size: 13px; white-space: nowrap;"
            >
              Add
            </button>
          </div>
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

  // Add custom attendee button
  currentDropdown.querySelector('#add-attendee-btn')?.addEventListener('click', handleAddCustomAttendee);

  // Allow Enter key in attendee input
  currentDropdown.querySelector('#add-attendee-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddCustomAttendee();
    }
  });

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
 * Handle adding a custom attendee
 */
function handleAddCustomAttendee() {
  const input = currentDropdown.querySelector('#add-attendee-input');
  const attendeesList = currentDropdown.querySelector('#attendees-list');

  if (!input || !attendeesList) return;

  const email = input.value.trim();

  // Validate email
  if (!email) {
    return;
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    alert('Please enter a valid email address');
    return;
  }

  // Check if email already exists in participants or custom attendees
  const existingEmails = new Set();
  attendeesList.querySelectorAll('.atms-attendee').forEach(el => {
    existingEmails.add(el.dataset.email);
  });

  if (existingEmails.has(email)) {
    alert('This email is already in the attendees list');
    input.value = '';
    return;
  }

  // Create attendee element
  const attendeeDiv = document.createElement('div');
  attendeeDiv.className = 'atms-attendee selected'; // Auto-select custom attendees
  attendeeDiv.dataset.email = email;
  attendeeDiv.dataset.custom = 'true'; // Mark as custom attendee
  attendeeDiv.innerHTML = `
    <span>${escapeHtml(email)}</span>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="cursor: pointer; opacity: 0.6; margin-left: auto;" class="remove-custom-attendee">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  `;

  // Add click handler for selection toggle
  attendeeDiv.addEventListener('click', (e) => {
    // Don't toggle if clicking the remove button
    if (e.target.closest('.remove-custom-attendee')) return;

    attendeeDiv.classList.toggle('selected');
    if (attendeeDiv.classList.contains('selected')) {
      eventState.selectedAttendees.add(email);
    } else {
      eventState.selectedAttendees.delete(email);
    }
  });

  // Add remove button handler
  attendeeDiv.querySelector('.remove-custom-attendee').addEventListener('click', (e) => {
    e.stopPropagation();
    attendeeDiv.remove();
    eventState.selectedAttendees.delete(email);
  });

  // Add to list and auto-select
  attendeesList.appendChild(attendeeDiv);
  eventState.selectedAttendees.add(email);

  // Clear input
  input.value = '';

  console.log('[ATMS] Added custom attendee:', email);
  console.log('[ATMS] Selected attendees:', Array.from(eventState.selectedAttendees));
}

/**
 * Handle Create New
 */
async function handleCreateNew() {
  updateScreen('loading');

  try {
    // Sanity check: Log what we're sending to Gemini
    console.log('[ATMS] Sending to Gemini:', {
      subject: eventState.emailData.subject,
      bodyLength: eventState.emailData.body?.length,
      hasLinksSection: eventState.emailData.body?.includes('=== LINKS EXTRACTED FROM EMAIL ==='),
      bodyPreview: eventState.emailData.body?.substring(0, 200),
      bodyEnd: eventState.emailData.body?.substring(Math.max(0, eventState.emailData.body.length - 300))
    });

    const response = await sendMessage({
      type: 'EXTRACT_EVENT',
      email: eventState.emailData
    });

    if (!response?.success) {
      throw new Error(response?.error || 'Failed to extract event details');
    }

    eventState.eventDetails = response.eventDetails;

    // Log what we got from Gemini
    console.log('[ATMS] Event details received from Gemini:', {
      event_name: eventState.eventDetails.event_name,
      has_venue: !!eventState.eventDetails.venue,
      has_dates: !!eventState.eventDetails.dates,
      has_stages: !!(eventState.eventDetails.stages && eventState.eventDetails.stages.length > 0),
      has_contacts: !!(eventState.eventDetails.contacts && eventState.eventDetails.contacts.length > 0),
      has_event_links: !!(eventState.eventDetails.event_links && eventState.eventDetails.event_links.length > 0),
      event_links_count: eventState.eventDetails.event_links?.length || 0,
      event_links: eventState.eventDetails.event_links
    });

    // Check if AI extraction had an error but still returned data
    if (eventState.eventDetails.error) {
      console.warn('[ATMS] AI extraction warning:', eventState.eventDetails.error);
      // Show a brief notification but continue to review screen
      // User can manually fill in the fields
    }

    // Check if we got meaningful extraction (handle both old and new schema)
    const hasDate = (eventState.eventDetails.date && eventState.eventDetails.date !== '') ||
                    (eventState.eventDetails.dates?.start_date && eventState.eventDetails.dates.start_date !== '');
    const hasTime = (eventState.eventDetails.time && eventState.eventDetails.time !== '') ||
                    (eventState.eventDetails.dates?.start_date); // New schema includes time in ISO format

    if (!hasDate) {
      console.warn('[ATMS] ⚠️ No date extracted from email - user will need to add manually');
    } else {
      console.log('[ATMS] ✅ Date extracted successfully');
    }

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
 * Populate review form with dynamic field rendering
 */
function populateReviewForm() {
  if (!currentDropdown || !eventState.eventDetails) return;

  const details = eventState.eventDetails;

  // Populate core fields - support both new and old schema
  currentDropdown.querySelector('#input-title').value = details.event_name || details.title || '';

  // Extract date from specific set date (PRIORITY) or fall back to event start date
  let dateValue = details.date || details.dates?.start_date || '';
  if (details.stages && details.stages.length > 0 && details.stages[0].sets && details.stages[0].sets.length > 0) {
    const setDate = details.stages[0].sets[0].set_date;
    if (setDate) {
      dateValue = setDate;
      console.log(`[ATMS] Using specific set date: ${setDate}`);
    }
  }
  currentDropdown.querySelector('#input-date').value = dateValue;

  // Extract time from specific set time (PRIORITY) or fall back to old time field
  let timeValue = details.time || '10:00';
  if (details.stages && details.stages.length > 0 && details.stages[0].sets && details.stages[0].sets.length > 0) {
    const setStartTime = details.stages[0].sets[0].start_time;
    const setEndTime = details.stages[0].sets[0].end_time;
    if (setStartTime) {
      timeValue = setStartTime;
      console.log(`[ATMS] Using specific set time: ${setStartTime}${setEndTime ? ` - ${setEndTime}` : ''}`);
    }
  }
  currentDropdown.querySelector('#input-time').value = timeValue;

  // Location from venue or old location field
  let locationValue = details.location || '';
  if (details.venue && details.venue.venue_name) {
    locationValue = details.venue.venue_name;
    if (details.venue.city) {
      locationValue += `, ${details.venue.city}`;
    }
  }
  currentDropdown.querySelector('#input-location').value = locationValue;

  currentDropdown.querySelector('#input-desc').value = details.description || '';

  // Render dynamic additional fields
  renderAdditionalFields(details);

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
 * Render additional fields dynamically based on extracted data
 */
function renderAdditionalFields(details) {
  const container = currentDropdown.querySelector('#additional-fields');
  if (!container) return;

  container.innerHTML = '';

  console.log('[ATMS] Rendering additional fields:', details);

  // NEW SCHEMA: Venue & Dates
  if (details.venue && hasData(details.venue)) {
    console.log('[ATMS] Rendering venue section:', details.venue);
    const section = createFieldSection('Venue', details.venue, {
      venue_name: 'Venue Name',
      venue_address: 'Address',
      city: 'City',
      state: 'State',
      country: 'Country'
    });
    container.appendChild(section);
  } else {
    console.log('[ATMS] No venue data to render');
  }

  if (details.dates && hasData(details.dates)) {
    const section = createFieldSection('Event Dates', details.dates, {
      start_date: 'Start Date',
      end_date: 'End Date',
      timezone: 'Timezone'
    });
    container.appendChild(section);
  }

  // NEW SCHEMA: Stages & Sets
  if (details.stages && details.stages.length > 0) {
    const section = createStagesSection(details.stages);
    container.appendChild(section);
  }

  // NEW SCHEMA: Schedule/Run of Show
  if (details.schedule_items && details.schedule_items.length > 0) {
    const section = createScheduleSection(details.schedule_items);
    container.appendChild(section);
  }

  // NEW SCHEMA: Artist Information
  if (details.artist_information && hasData(details.artist_information)) {
    const section = createArtistInfoSection(details.artist_information);
    container.appendChild(section);
  }

  // NEW SCHEMA: Contacts (venue/promoter side)
  if (details.contacts && details.contacts.length > 0) {
    const section = createContactsSection(details.contacts);
    container.appendChild(section);
  }

  // NEW SCHEMA: Organizer
  if (details.organizer && hasData(details.organizer)) {
    const section = createFieldSection('Organizer/Promoter', details.organizer, {
      name: 'Name',
      email: 'Email',
      phone: 'Phone'
    });
    container.appendChild(section);
  }

  // NEW SCHEMA: Event Logistics & Documents
  if (details.logistics_notes && typeof details.logistics_notes === 'string' && details.logistics_notes.trim()) {
    const section = createLogisticsNotesSection(details.logistics_notes);
    container.appendChild(section);
  }

  if (details.important_deadlines && details.important_deadlines.length > 0) {
    console.log(`[ATMS] Rendering ${details.important_deadlines.length} important deadlines:`, details.important_deadlines);
    const section = createDeadlinesSection(details.important_deadlines);
    container.appendChild(section);
  } else {
    console.log('[ATMS] No important_deadlines to render:', details.important_deadlines);
  }

  if (details.event_links && details.event_links.length > 0) {
    console.log(`[ATMS] Rendering ${details.event_links.length} event links:`, details.event_links);
    const section = createEventLinksSection(details.event_links);
    container.appendChild(section);
  } else {
    console.log('[ATMS] No event_links to render:', details.event_links);
  }

  // Legacy support for event_documents
  if (details.event_documents && details.event_documents.length > 0) {
    const section = createEventLinksSection(details.event_documents);
    container.appendChild(section);
  }

  // LEGACY SCHEMA SUPPORT (for backwards compatibility)
  if (details.set_overview && hasData(details.set_overview)) {
    const section = createSetOverviewSection(details.set_overview);
    container.appendChild(section);
  }

  if (details.artist_information && hasData(details.artist_information) && !details.artist_data) {
    const section = createFieldSection('Artist Information', details.artist_information, {
      artist_name: 'Artist Name',
      genre: 'Genre',
      email: 'Artist Email',
      booking_email: 'Booking Email',
      day_of_show_contact_name: 'Day-of Contact',
      day_of_show_contact_phone: 'Day-of Phone'
    });
    container.appendChild(section);
  }

  if (details.riders_and_media && hasData(details.riders_and_media)) {
    const section = createFieldSection('Riders & Media', details.riders_and_media, {
      tech_rider_filename: 'Tech Rider',
      hospitality_rider_filename: 'Hospitality Rider',
      approved_media_files: 'Media Files',
      production_pack_files: 'Production Pack',
      production_pack_external_links: 'External Links'
    }, true);
    container.appendChild(section);
  }

  if (details.logistics_and_notes && hasData(details.logistics_and_notes)) {
    const section = createFieldSection('Logistics & Notes', details.logistics_and_notes, {
      venue_information_notes: 'Venue Info',
      hotel_transportation_notes: 'Hotel/Transport',
      hospitality_tech_notes: 'Hospitality/Tech',
      crew_guest_list_notes: 'Crew/Guest List'
    });
    container.appendChild(section);
  }

  if (details.contacts_list && details.contacts_list.length > 0 && !details.contacts) {
    const section = createContactsSection(details.contacts_list);
    container.appendChild(section);
  }
}

/**
 * Check if an object has any populated fields
 */
function hasData(obj) {
  if (!obj) return false;
  if (Array.isArray(obj)) return obj.length > 0;
  return Object.values(obj).some(v => v !== null && v !== undefined && v !== '');
}

/**
 * Create a field section with label and inputs - Enhanced for nested paths
 */
function createFieldSection(title, data, fieldMap, handleArrays = false) {
  const section = document.createElement('div');
  section.className = 'atms-field-section';

  const header = document.createElement('div');
  header.className = 'atms-section-header';
  header.textContent = title;
  section.appendChild(header);

  const fieldsContainer = document.createElement('div');
  fieldsContainer.className = 'atms-section-fields';

  for (const [key, label] of Object.entries(fieldMap)) {
    // Handle nested paths like 'venue_address.street'
    let value;
    if (key.includes('.')) {
      const parts = key.split('.');
      value = parts.reduce((obj, part) => obj?.[part], data);
    } else {
      value = data[key];
    }

    // Skip empty fields
    if (!value || (Array.isArray(value) && value.length === 0)) continue;
    if (typeof value === 'string' && !value.trim()) continue;

    const fieldGroup = document.createElement('div');
    fieldGroup.className = 'atms-form-group';

    const labelEl = document.createElement('label');
    labelEl.className = 'atms-label';
    labelEl.textContent = label;
    fieldGroup.appendChild(labelEl);

    // Handle arrays
    if (Array.isArray(value)) {
      const list = document.createElement('div');
      list.className = 'atms-array-list';
      list.innerHTML = value.map(item =>
        `<div class="atms-array-item">${escapeHtml(String(item))}</div>`
      ).join('');
      fieldGroup.appendChild(list);
    } else {
      // Regular input
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'atms-input';
      input.value = String(value);
      input.dataset.field = `${title.toLowerCase().replace(/\s+/g, '_')}.${key}`;
      fieldGroup.appendChild(input);
    }

    fieldsContainer.appendChild(fieldGroup);
  }

  section.appendChild(fieldsContainer);
  return section;
}

/**
 * Create set overview section with run of show timeline
 */
function createSetOverviewSection(setOverview) {
  const section = document.createElement('div');
  section.className = 'atms-field-section';

  const header = document.createElement('div');
  header.className = 'atms-section-header';
  header.textContent = 'Set Overview';
  section.appendChild(header);

  const container = document.createElement('div');
  container.className = 'atms-section-fields';

  // Set Name
  if (setOverview.set_name) {
    const field = document.createElement('div');
    field.className = 'atms-form-group';
    field.innerHTML = `
      <label class="atms-label">Set Name</label>
      <input type="text" class="atms-input" value="${escapeHtml(setOverview.set_name)}" data-field="set_overview.set_name">
    `;
    container.appendChild(field);
  }

  // Timezone
  if (setOverview.timezone) {
    const field = document.createElement('div');
    field.className = 'atms-form-group';
    field.innerHTML = `
      <label class="atms-label">Timezone</label>
      <input type="text" class="atms-input" value="${escapeHtml(setOverview.timezone)}" data-field="set_overview.timezone">
    `;
    container.appendChild(field);
  }

  // Run of Show Timeline
  if (setOverview.run_of_show && setOverview.run_of_show.length > 0) {
    const timelineLabel = document.createElement('label');
    timelineLabel.className = 'atms-label';
    timelineLabel.textContent = 'Run of Show';
    timelineLabel.style.marginTop = '12px';
    timelineLabel.style.display = 'block';
    container.appendChild(timelineLabel);

    const timeline = document.createElement('div');
    timeline.className = 'atms-timeline';

    setOverview.run_of_show.forEach((item, index) => {
      const timelineItem = document.createElement('div');
      timelineItem.className = 'atms-timeline-item';
      timelineItem.innerHTML = `
        <div class="atms-timeline-time">${escapeHtml(item.time)}</div>
        <div class="atms-timeline-content">
          <div class="atms-timeline-event">${escapeHtml(item.event)}</div>
          ${item.artist ? `<div class="atms-timeline-artist">${escapeHtml(item.artist)}</div>` : ''}
        </div>
      `;
      timeline.appendChild(timelineItem);
    });

    container.appendChild(timeline);
  }

  section.appendChild(container);
  return section;
}

/**
 * Create contacts section
 */
function createContactsSection(contacts) {
  const section = document.createElement('div');
  section.className = 'atms-field-section';

  const header = document.createElement('div');
  header.className = 'atms-section-header';
  header.textContent = 'Contacts';
  section.appendChild(header);

  const contactsList = document.createElement('div');
  contactsList.className = 'atms-contacts-list';

  contacts.forEach((contact, index) => {
    const card = document.createElement('div');
    card.className = 'atms-contact-card';
    card.innerHTML = `
      <div class="atms-contact-name">${escapeHtml(contact.name || 'Unknown')}</div>
      ${contact.role ? `<div class="atms-contact-role">${escapeHtml(contact.role)}</div>` : ''}
      ${contact.email ? `<div class="atms-contact-detail">${escapeHtml(contact.email)}</div>` : ''}
      ${contact.phone ? `<div class="atms-contact-detail">${escapeHtml(contact.phone)}</div>` : ''}
    `;
    contactsList.appendChild(card);
  });

  section.appendChild(contactsList);
  return section;
}

/**
 * Create stages section with sets (NEW SCHEMA)
 */
function createStagesSection(stages) {
  const section = document.createElement('div');
  section.className = 'atms-field-section';

  const header = document.createElement('div');
  header.className = 'atms-section-header';
  header.textContent = stages.length > 1 ? `Lineup by Room (${stages.length} rooms)` : 'Lineup';
  section.appendChild(header);

  const container = document.createElement('div');
  container.className = 'atms-section-fields';

  stages.forEach((stage, stageIdx) => {
    // Stage header
    const stageHeader = document.createElement('div');
    stageHeader.className = 'atms-stage-header';
    stageHeader.textContent = stage.stage_name || `Stage ${stageIdx + 1}`;
    stageHeader.style.cssText = 'font-weight: 600; color: #22c7a8; margin-top: 12px; margin-bottom: 8px;';
    container.appendChild(stageHeader);

    // Sets for this stage
    if (stage.sets && stage.sets.length > 0) {
      stage.sets.forEach((set, setIdx) => {
        const setCard = document.createElement('div');
        setCard.className = 'atms-set-card';
        setCard.style.cssText = 'background: #151820; border: 1px solid #262b35; border-radius: 8px; padding: 12px; margin-bottom: 12px;';

        let setHtml = `<div style="font-weight: 600; color: #eff2f5; margin-bottom: 6px;">${escapeHtml(set.artist_name || set.set_name || `Set ${setIdx + 1}`)}</div>`;

        if (set.start_time || set.end_time) {
          setHtml += `<div style="color: #22c7a8; font-size: 13px; margin-bottom: 6px;">${escapeHtml(set.start_time || '')} - ${escapeHtml(set.end_time || '')}</div>`;
        }

        if (set.soundcheck_time) {
          setHtml += `<div style="color: #808898; font-size: 12px;">Soundcheck: ${escapeHtml(set.soundcheck_time)}</div>`;
        }

        if (set.crew_list) {
          setHtml += `<div style="color: #808898; font-size: 12px; margin-top: 6px;"><strong>Crew:</strong> ${escapeHtml(set.crew_list)}</div>`;
        }

        if (set.technical_notes) {
          setHtml += `<div style="color: #eff2f5; font-size: 12px; margin-top: 6px; background: #0d0f14; padding: 8px; border-radius: 4px;"><strong>Tech:</strong> ${escapeHtml(set.technical_notes)}</div>`;
        }

        if (set.hospitality_notes) {
          setHtml += `<div style="color: #808898; font-size: 12px; margin-top: 6px;"><strong>Hospitality:</strong> ${escapeHtml(set.hospitality_notes)}</div>`;
        }

        if (set.production_pack_links && set.production_pack_links.length > 0) {
          setHtml += `<div style="margin-top: 8px; font-size: 12px;"><strong style="color: #eff2f5;">Links:</strong></div>`;
          set.production_pack_links.forEach(link => {
            setHtml += `<div style="margin-top: 4px;"><a href="${escapeHtml(link.url)}" target="_blank" style="color: #22c7a8; text-decoration: none;">${escapeHtml(link.description || 'Link')}</a></div>`;
          });
        }

        setCard.innerHTML = setHtml;
        container.appendChild(setCard);
      });
    }
  });

  section.appendChild(container);
  return section;
}

/**
 * Create schedule/run of show section (NEW SCHEMA)
 */
function createScheduleSection(scheduleItems) {
  const section = document.createElement('div');
  section.className = 'atms-field-section';

  const header = document.createElement('div');
  header.className = 'atms-section-header';
  header.textContent = 'Event Schedule';
  section.appendChild(header);

  const timeline = document.createElement('div');
  timeline.className = 'atms-timeline';

  scheduleItems.forEach(item => {
    const timelineItem = document.createElement('div');
    timelineItem.className = 'atms-timeline-item';

    const startTime = item.start_time ? new Date(item.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';

    timelineItem.innerHTML = `
      <div class="atms-timeline-time">${escapeHtml(startTime)}</div>
      <div class="atms-timeline-content">
        <div class="atms-timeline-event">${escapeHtml(item.title)}</div>
        ${item.description ? `<div class="atms-timeline-artist">${escapeHtml(item.description)}</div>` : ''}
        ${item.location ? `<div class="atms-timeline-artist">${escapeHtml(item.location)}</div>` : ''}
      </div>
    `;
    timeline.appendChild(timelineItem);
  });

  section.appendChild(timeline);
  return section;
}

/**
 * Create artist info section (NEW SCHEMA)
 */
function createArtistInfoSection(artistInfo) {
  const section = document.createElement('div');
  section.className = 'atms-field-section';

  const header = document.createElement('div');
  header.className = 'atms-section-header';
  header.textContent = 'Artist Information';
  section.appendChild(header);

  const container = document.createElement('div');
  container.className = 'atms-section-fields';

  const fields = {
    artist_name: 'Artist Name',
    dos_contact_phone: 'Day-of-Show Contact',
    email: 'Email',
    genre: 'Genre'
  };

  for (const [key, label] of Object.entries(fields)) {
    const value = artistInfo[key];
    if (!value) continue;

    const fieldGroup = document.createElement('div');
    fieldGroup.className = 'atms-form-group';
    fieldGroup.innerHTML = `
      <label class="atms-label">${label}</label>
      <input type="text" class="atms-input" value="${escapeHtml(String(value))}" data-field="artist_information.${key}">
    `;
    container.appendChild(fieldGroup);
  }

  // Tech Rider
  if (artistInfo.tech_rider && artistInfo.tech_rider.type) {
    const riderGroup = document.createElement('div');
    riderGroup.className = 'atms-form-group';
    const riderValue = artistInfo.tech_rider.url || artistInfo.tech_rider.file_name || artistInfo.tech_rider.content || 'Attached';
    riderGroup.innerHTML = `
      <label class="atms-label">Tech Rider</label>
      <input type="text" class="atms-input" value="${escapeHtml(String(riderValue))}" data-field="artist_information.tech_rider">
    `;
    container.appendChild(riderGroup);
  }

  // Hospo Rider
  if (artistInfo.hospo_rider && artistInfo.hospo_rider.type) {
    const riderGroup = document.createElement('div');
    riderGroup.className = 'atms-form-group';
    const riderValue = artistInfo.hospo_rider.url || artistInfo.hospo_rider.file_name || artistInfo.hospo_rider.content || 'Attached';
    riderGroup.innerHTML = `
      <label class="atms-label">Hospitality Rider</label>
      <input type="text" class="atms-input" value="${escapeHtml(String(riderValue))}" data-field="artist_information.hospo_rider">
    `;
    container.appendChild(riderGroup);
  }

  section.appendChild(container);
  return section;
}

/**
 * Create logistics notes section (NEW SCHEMA - free-form text)
 */
function createLogisticsNotesSection(notes) {
  const section = document.createElement('div');
  section.className = 'atms-field-section';

  const header = document.createElement('div');
  header.className = 'atms-section-header';
  header.textContent = 'Event Logistics & Instructions';
  section.appendChild(header);

  const container = document.createElement('div');
  container.className = 'atms-section-fields';
  container.style.cssText = 'background: #0d0f14; padding: 14px; border-radius: 8px; margin-top: 8px;';

  // Split by double newlines to create paragraphs
  const paragraphs = notes.split('\n\n').filter(p => p.trim());

  paragraphs.forEach(para => {
    const paraDiv = document.createElement('div');
    paraDiv.style.cssText = 'color: #eff2f5; font-size: 13px; line-height: 1.6; margin-bottom: 12px; white-space: pre-wrap;';
    paraDiv.textContent = para.trim();
    container.appendChild(paraDiv);
  });

  section.appendChild(container);
  return section;
}

/**
 * Create deadlines section (NEW SCHEMA)
 */
function createDeadlinesSection(deadlines) {
  const section = document.createElement('div');
  section.className = 'atms-field-section';

  const header = document.createElement('div');
  header.className = 'atms-section-header';
  header.textContent = 'Important Deadlines';
  section.appendChild(header);

  const container = document.createElement('div');
  container.className = 'atms-section-fields';

  deadlines.forEach(deadline => {
    const deadlineDiv = document.createElement('div');
    deadlineDiv.style.cssText = 'display: flex; gap: 12px; align-items: flex-start; margin-bottom: 10px; padding: 8px; background: #0d0f14; border-radius: 6px;';

    // Parse date as local date (not UTC) to avoid timezone offset issues
    let dateStr = '';
    if (deadline.date) {
      const [year, month, day] = deadline.date.split('-');
      const localDate = new Date(year, month - 1, day); // month is 0-indexed
      dateStr = localDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    deadlineDiv.innerHTML = `
      <div style="font-weight: 600; color: #22c7a8; min-width: 80px; font-size: 13px;">${escapeHtml(dateStr)}</div>
      <div style="color: #eff2f5; font-size: 13px; flex: 1;">${escapeHtml(deadline.description || '')}</div>
    `;
    container.appendChild(deadlineDiv);
  });

  section.appendChild(container);
  return section;
}

/**
 * Create event links section (NEW SCHEMA)
 */
function createEventLinksSection(links) {
  const section = document.createElement('div');
  section.className = 'atms-field-section';

  const header = document.createElement('div');
  header.className = 'atms-section-header';
  header.textContent = 'Event Links & Documents';
  section.appendChild(header);

  const container = document.createElement('div');
  container.className = 'atms-section-fields';

  links.forEach(link => {
    const linkDiv = document.createElement('div');
    linkDiv.style.cssText = 'margin-bottom: 8px;';
    linkDiv.innerHTML = `
      <a href="${escapeHtml(link.url)}" target="_blank" style="color: #22c7a8; text-decoration: none; font-size: 14px; display: flex; align-items: center; gap: 6px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        ${escapeHtml(link.description || 'Link')}
      </a>
    `;
    container.appendChild(linkDiv);
  });

  section.appendChild(container);
  return section;
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
 * Handle create event - Enhanced to collect all dynamic fields
 */
async function handleCreate() {
  if (!currentDropdown) return;

  const createBtn = currentDropdown.querySelector('#btn-create');
  createBtn.disabled = true;
  createBtn.textContent = 'Creating...';

  try {
    // Collect core fields
    const eventData = {
      title: currentDropdown.querySelector('#input-title').value || 'New Event',
      date: currentDropdown.querySelector('#input-date').value,
      time: currentDropdown.querySelector('#input-time').value || '10:00',
      location: currentDropdown.querySelector('#input-location').value,
      description: currentDropdown.querySelector('#input-desc').value,
      attendees: Array.from(eventState.selectedAttendees),
      duration: eventState.eventDetails?.duration || 60,
      emailMessageId: eventState.emailData?.messageId,
      threadId: eventState.emailData?.threadId,
      participants: eventState.emailData?.participants || []
    };

    // Collect additional dynamic fields from the form
    const additionalFields = collectAdditionalFields();
    Object.assign(eventData, additionalFields);

    // Include ALL extracted data for calendar description
    if (eventState.eventDetails) {
      eventData.extractedData = {
        // New schema fields
        venue: eventState.eventDetails.venue,
        dates: eventState.eventDetails.dates,
        organizer: eventState.eventDetails.organizer,
        stages: eventState.eventDetails.stages,
        contacts: eventState.eventDetails.contacts,
        schedule_items: eventState.eventDetails.schedule_items,
        artist_information: eventState.eventDetails.artist_information,
        event_links: eventState.eventDetails.event_links,
        important_deadlines: eventState.eventDetails.important_deadlines,
        logistics_notes: eventState.eventDetails.logistics_notes,
        // Status
        status: eventState.eventDetails.status
      };
    }

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
 * Collect values from all dynamic additional fields
 */
function collectAdditionalFields() {
  const additionalData = {};
  const container = currentDropdown.querySelector('#additional-fields');
  if (!container) return additionalData;

  // Get all input fields with data-field attributes
  const inputs = container.querySelectorAll('input[data-field]');
  inputs.forEach(input => {
    const field = input.dataset.field;
    const value = input.value;
    if (value) {
      // Parse field path (e.g., "artist_information.artist_name")
      const [section, key] = field.split('.');
      if (!additionalData[section]) {
        additionalData[section] = {};
      }
      additionalData[section][key] = value;
    }
  });

  // Preserve arrays and contacts from original extraction
  if (eventState.eventDetails) {
    if (eventState.eventDetails.riders_and_media) {
      if (!additionalData.riders_and_media) {
        additionalData.riders_and_media = {};
      }
      // Preserve array fields
      const riders = eventState.eventDetails.riders_and_media;
      if (riders.approved_media_files) additionalData.riders_and_media.approved_media_files = riders.approved_media_files;
      if (riders.production_pack_files) additionalData.riders_and_media.production_pack_files = riders.production_pack_files;
      if (riders.production_pack_external_links) additionalData.riders_and_media.production_pack_external_links = riders.production_pack_external_links;
    }

    if (eventState.eventDetails.contacts_list) {
      additionalData.contacts_list = eventState.eventDetails.contacts_list;
    }
  }

  return additionalData;
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
