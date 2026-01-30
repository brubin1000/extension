/**
 * ATMS Autofill Content Script
 * Handles autofilling artist profile data into forms
 */

// Listen for messages from the panel/extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'AUTOFILL_PROFILE') {
    const result = autofillProfile(message.profile);
    sendResponse(result);
  }
  return true; // Keep channel open for async response
});

/**
 * Main autofill function - detects page type and fills accordingly
 */
function autofillProfile(profile) {
  if (!profile) {
    return { success: false, error: 'No profile provided' };
  }

  const url = window.location.href;

  try {
    if (url.includes('docs.google.com/forms')) {
      return autofillGoogleForm(profile);
    } else if (url.includes('mail.google.com')) {
      return autofillGmailCompose(profile);
    } else {
      return autofillGenericForm(profile);
    }
  } catch (err) {
    console.error('[ATMS Autofill] Error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Autofill Google Forms
 */
function autofillGoogleForm(profile) {
  let fieldCount = 0;

  // Get all form questions
  const questions = document.querySelectorAll('[role="listitem"]');

  questions.forEach(question => {
    const labelEl = question.querySelector('[role="heading"]');
    const label = labelEl?.textContent?.toLowerCase() || '';

    // Find input/textarea in this question
    const input = question.querySelector('input[type="text"], textarea');
    if (!input) return;

    // Match label to profile fields
    const value = matchLabelToProfile(label, profile);
    if (value) {
      setInputValue(input, value);
      fieldCount++;
    }
  });

  // Also try standard input matching
  const genericResult = autofillGenericForm(profile, true);
  fieldCount += genericResult.fieldCount || 0;

  return {
    success: fieldCount > 0,
    fieldCount,
    error: fieldCount === 0 ? 'No matching fields found' : null
  };
}

/**
 * Autofill Gmail compose window
 */
function autofillGmailCompose(profile) {
  // Find the compose body
  const composeBody = document.querySelector('[role="textbox"][aria-label*="Message Body"]') ||
                      document.querySelector('.Am.Al.editable') ||
                      document.querySelector('[g_editable="true"]');

  if (!composeBody) {
    return { success: false, error: 'No compose window found', fieldCount: 0 };
  }

  // Generate formatted profile text
  const profileText = generateProfileText(profile);

  // Insert at cursor or append
  if (document.activeElement === composeBody) {
    document.execCommand('insertText', false, profileText);
  } else {
    composeBody.focus();
    const currentContent = composeBody.innerHTML;
    composeBody.innerHTML = currentContent + profileText.replace(/\n/g, '<br>');
  }

  return { success: true, fieldCount: 1 };
}

/**
 * Autofill generic forms
 */
function autofillGenericForm(profile, skipReturnIfZero = false) {
  let fieldCount = 0;

  // Find all inputs and textareas
  const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input:not([type]), textarea');

  inputs.forEach(input => {
    // Skip hidden or disabled inputs
    if (input.type === 'hidden' || input.disabled || input.readOnly) return;

    // Get associated label
    const label = getInputLabel(input).toLowerCase();

    // Match to profile
    const value = matchLabelToProfile(label, profile);
    if (value) {
      setInputValue(input, value);
      fieldCount++;
    }
  });

  if (skipReturnIfZero && fieldCount === 0) {
    return { fieldCount: 0 };
  }

  return {
    success: fieldCount > 0,
    fieldCount,
    error: fieldCount === 0 ? 'No matching fields found' : null
  };
}

/**
 * Get the label associated with an input
 */
function getInputLabel(input) {
  // Check for associated label
  if (input.id) {
    const label = document.querySelector(`label[for="${input.id}"]`);
    if (label) return label.textContent;
  }

  // Check for parent label
  const parentLabel = input.closest('label');
  if (parentLabel) return parentLabel.textContent;

  // Check for placeholder
  if (input.placeholder) return input.placeholder;

  // Check for aria-label
  if (input.getAttribute('aria-label')) return input.getAttribute('aria-label');

  // Check for name attribute
  if (input.name) return input.name.replace(/[_-]/g, ' ');

  // Check for preceding text node or element
  const prev = input.previousElementSibling;
  if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN')) {
    return prev.textContent;
  }

  return '';
}

/**
 * Match a label to profile fields
 */
function matchLabelToProfile(label, profile) {
  const l = label.toLowerCase().trim();

  // Artist/DJ Name
  if (l.includes('artist') || l.includes('dj name') || l.includes('act name') || l.includes('performer')) {
    return profile.artistName;
  }

  // Primary contact name
  if ((l.includes('contact') && l.includes('name')) || l.includes('booking contact') || l.includes('advance contact')) {
    const primary = profile.contacts?.find(c => c.isPrimary) || profile.contacts?.[0];
    return primary?.name || '';
  }

  // Contact email
  if ((l.includes('contact') && l.includes('email')) || l.includes('booking email') || l.includes('advance email')) {
    const primary = profile.contacts?.find(c => c.isPrimary) || profile.contacts?.[0];
    return primary?.email || '';
  }

  // Contact phone
  if ((l.includes('contact') && l.includes('phone')) || l.includes('booking phone') || l.includes('advance phone')) {
    const primary = profile.contacts?.find(c => c.isPrimary) || profile.contacts?.[0];
    return primary?.phone || '';
  }

  // Mixer
  if (l.includes('mixer') || l.includes('djm')) {
    return profile.techSpecs?.mixer?.preferred || '';
  }

  // CDJs / Media Players
  if (l.includes('cdj') || l.includes('media player') || l.includes('decks')) {
    const cdjs = profile.techSpecs?.cdjs;
    if (!cdjs?.model) return '';
    return `${cdjs.model}${cdjs.quantity ? ` x${cdjs.quantity}` : ''}`;
  }

  // Monitors
  if (l.includes('monitor') && !l.includes('subwoofer')) {
    return profile.techSpecs?.monitors?.boothMonitors || '';
  }

  // Subwoofers / Subs
  if (l.includes('sub') || l.includes('bass')) {
    return profile.techSpecs?.monitors?.subwoofers || '';
  }

  // Microphone
  if (l.includes('microphone') || l.includes('mic')) {
    const mic = profile.techSpecs?.microphone;
    if (!mic?.model) return '';
    return `${mic.model}${mic.quantity ? ` x${mic.quantity}` : ''}`;
  }

  // Tech specs / technical requirements (general)
  if (l.includes('tech') && (l.includes('spec') || l.includes('requirement') || l.includes('rider'))) {
    return generateTechSummary(profile);
  }

  // Hospitality / rider
  if (l.includes('hospitality') || l.includes('rider') || l.includes('catering')) {
    return generateHospitalitySummary(profile);
  }

  // Drinks / beverages
  if (l.includes('drink') || l.includes('beverage')) {
    const drinks = profile.hospitality?.drinks;
    if (!drinks?.length) return '';
    return drinks.map(d => `${d.quantity || ''}${d.quantity ? 'x ' : ''}${d.item}`).join(', ');
  }

  // Food / meals
  if (l.includes('food') || l.includes('meal')) {
    return profile.hospitality?.food?.meals || '';
  }

  // Hotel
  if (l.includes('hotel') || l.includes('accommodation')) {
    return profile.terms?.hotelRequirements || '';
  }

  // Transportation / travel
  if (l.includes('transport') || l.includes('travel') || l.includes('ground')) {
    return profile.terms?.transportation || '';
  }

  // Lighting
  if (l.includes('lighting') || l.includes('light')) {
    return profile.lighting?.preference || '';
  }

  // Crew size
  if (l.includes('crew') || l.includes('entourage') || l.includes('party size')) {
    return profile.crewSize?.toString() || '';
  }

  return '';
}

/**
 * Set input value with proper events
 */
function setInputValue(input, value) {
  if (!value) return;

  // Store original value
  const originalValue = input.value;

  // Set value
  input.value = value;

  // Dispatch events for React/Angular/Vue
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  // For Google Forms, also dispatch focus/blur
  input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

  console.log(`[ATMS Autofill] Set "${input.name || input.id || 'field'}" to "${value}"`);
}

/**
 * Generate tech specs summary text
 */
function generateTechSummary(profile) {
  const tech = profile.techSpecs || {};
  const parts = [];

  if (tech.mixer?.preferred) {
    parts.push(`Mixer: ${tech.mixer.preferred}${tech.mixer.quantity ? ` x${tech.mixer.quantity}` : ''}`);
  }

  if (tech.cdjs?.model) {
    parts.push(`CDJs: ${tech.cdjs.model}${tech.cdjs.quantity ? ` x${tech.cdjs.quantity}` : ''}`);
  }

  if (tech.monitors?.boothMonitors) {
    parts.push(`Booth Monitors: ${tech.monitors.boothMonitors}`);
  }

  if (tech.monitors?.subwoofers) {
    parts.push(`Subwoofers: ${tech.monitors.subwoofers}`);
  }

  if (tech.microphone?.model) {
    parts.push(`Microphone: ${tech.microphone.model}${tech.microphone.quantity ? ` x${tech.microphone.quantity}` : ''}`);
  }

  if (tech.recording?.required) {
    parts.push(`Recording: ${tech.recording.setup || 'Required'}`);
  }

  if (profile.lighting?.preference) {
    parts.push(`Lighting: ${profile.lighting.preference}`);
  }

  return parts.join('\n');
}

/**
 * Generate hospitality summary text
 */
function generateHospitalitySummary(profile) {
  const hosp = profile.hospitality || {};
  const parts = [];

  if (hosp.drinks?.length) {
    const drinksList = hosp.drinks.map(d => `${d.quantity || ''}${d.quantity ? 'x ' : ''}${d.item}`).join(', ');
    parts.push(`Drinks: ${drinksList}`);
  }

  if (hosp.food?.meals) {
    parts.push(`Food: ${hosp.food.meals}${hosp.food.notes ? ` (${hosp.food.notes})` : ''}`);
  }

  if (hosp.other?.length) {
    hosp.other.forEach(item => {
      parts.push(`${item.item}: ${item.quantity || ''}${item.notes ? ` ${item.notes}` : ''}`);
    });
  }

  return parts.join('\n');
}

/**
 * Generate full profile text for insertion
 */
function generateProfileText(profile) {
  const sections = [];

  // Header
  sections.push(`=== ${profile.artistName} ===`);
  if (profile.type) {
    sections.push(`Type: ${profile.type.toUpperCase()}`);
  }
  if (profile.crewSize) {
    sections.push(`Crew Size: ${profile.crewSize}`);
  }
  sections.push('');

  // Contacts
  if (profile.contacts?.length) {
    sections.push('ADVANCE CONTACT:');
    const primary = profile.contacts.find(c => c.isPrimary) || profile.contacts[0];
    if (primary.name) sections.push(`Name: ${primary.name}`);
    if (primary.email) sections.push(`Email: ${primary.email}`);
    if (primary.phone) sections.push(`Phone: ${primary.phone}`);
    if (primary.role) sections.push(`Role: ${primary.role}`);
    sections.push('');
  }

  // Tech specs
  const techSummary = generateTechSummary(profile);
  if (techSummary) {
    sections.push('TECH SPECS:');
    sections.push(techSummary);
    sections.push('');
  }

  // Hospitality
  const hospSummary = generateHospitalitySummary(profile);
  if (hospSummary) {
    sections.push('HOSPITALITY:');
    sections.push(hospSummary);
    sections.push('');
  }

  // Terms
  const terms = profile.terms || {};
  if (terms.transportation || terms.hotelRequirements) {
    sections.push('TERMS:');
    if (terms.transportation) sections.push(`Transportation: ${terms.transportation}`);
    if (terms.hotelRequirements) sections.push(`Hotel: ${terms.hotelRequirements}`);
    if (terms.meals) sections.push(`Meals: ${terms.meals}`);
    sections.push('');
  }

  // Documents
  const docs = profile.documents || {};
  if (docs.techRider?.url || docs.stageRider?.url) {
    sections.push('DOCUMENTS:');
    if (docs.techRider?.url) sections.push(`Tech Rider: ${docs.techRider.url}`);
    if (docs.stageRider?.url) sections.push(`Stage Rider: ${docs.stageRider.url}`);
    sections.push('');
  }

  return sections.join('\n');
}

console.log('[ATMS Autofill] Content script loaded');
