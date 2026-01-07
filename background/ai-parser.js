/**
 * AI Parser - Gemini Version
 * Uses Google Gemini to extract event data from emails
 */

import { GEMINI_API_URL } from '../config/constants.js';
import { GEMINI_API_KEY as SECRET_KEY } from '../config/secrets.js';
import { debug, error as logError, warn, info } from '../utils/logger.js';

// API key from secrets file (gitignored)
const FALLBACK_API_KEY = SECRET_KEY || '';

/**
 * Get Gemini API key from storage or fallback
 */
async function getGeminiApiKey() {
  try {
    const result = await chrome.storage.local.get('geminiApiKey');
    return result.geminiApiKey || FALLBACK_API_KEY;
  } catch (e) {
    return FALLBACK_API_KEY;
  }
}

/**
 * Save Gemini API key to storage
 */
export async function saveGeminiApiKey(apiKey) {
  await chrome.storage.local.set({ geminiApiKey: apiKey });
}

/**
 * Extract event details from email using Gemini
 */
export async function extractScheduleFromEmail(email) {
  return extractEventFromEmail(email);
}

/**
 * Extract event from email content using Gemini AI
 * @param {Object} email - Email object with subject, body, sender, date, links
 * @returns {Promise<Object>} Extracted event details
 */
export async function extractEventFromEmail(email) {
  const apiKey = await getGeminiApiKey();

  if (!apiKey) {
    throw new Error('Gemini API key not configured');
  }

  // Log the structured links we received
  if (email.links && email.links.length > 0) {
    info(`Received ${email.links.length} structured links from content script:`, email.links);
  }

  const prompt = buildPrompt(email);

  try {
    info('Calling Gemini API for event extraction...');
    info('Email body length:', email.body?.length || 0);
    info('Email body preview (last 500 chars):', (email.body || '').substring(Math.max(0, (email.body || '').length - 500)));

    // DEBUG: Log FULL email body to see if set time is in there
    info('🔍 FULL Email Body:', email.body);

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.1,  // Lower temperature for more consistent extraction
          maxOutputTokens: 8192  // High limit for complex events with multiple stages/artists
        }
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const errorMsg = error.error?.message || `Gemini API error: ${response.status}`;
      logError('Gemini API request failed:', errorMsg);
      throw new Error(errorMsg);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      logError('No text response from Gemini API');
      throw new Error('No response from Gemini');
    }

    info('Gemini response length:', text.length);
    info('Gemini raw response (first 500 chars):', text.substring(0, 500));
    info('Gemini raw response (last 200 chars):', text.substring(Math.max(0, text.length - 200)));

    // DEBUG: Log FULL response to see what Gemini actually returned for sets
    info('🔍 FULL Gemini Response:', text);

    // Parse JSON from response
    const parsed = parseJsonResponse(text);

    if (!parsed || Object.keys(parsed).length === 0) {
      logError('Failed to parse JSON from Gemini response');
      logError('Full response text:', text);
      throw new Error('Invalid JSON response from AI');
    }

    info('Gemini extraction complete:', {
      event_name: parsed.event_name,
      status: parsed.status,
      hasStages: !!(parsed.stages && parsed.stages.length > 0),
      hasContacts: !!(parsed.contacts && parsed.contacts.length > 0),
      hasScheduleItems: !!(parsed.schedule_items && parsed.schedule_items.length > 0),
      hasArtistInfo: !!parsed.artist_information
    });

    // Log set time details for debugging
    if (parsed.stages && parsed.stages.length > 0 && parsed.stages[0].sets && parsed.stages[0].sets.length > 0) {
      const firstSet = parsed.stages[0].sets[0];
      const totalSets = parsed.stages[0].sets.length;
      info('Primary set details:', {
        set_date: firstSet.set_date,
        start_time: firstSet.start_time,
        end_time: firstSet.end_time,
        stage_name: parsed.stages[0].stage_name
      });
      info(`🎵 TOTAL SETS EXTRACTED: ${totalSets} artists on ${parsed.stages[0].stage_name}`);
      if (totalSets > 1) {
        info('Full lineup:', parsed.stages[0].sets.map(s => `${s.artist_name} (${s.start_time}-${s.end_time})`));
      }
    } else {
      warn('No stages/sets extracted from email');
    }

    // Validate that we got meaningful data
    const hasEventName = parsed.event_name && parsed.event_name !== '';
    const hasDate = parsed.dates?.start_date && parsed.dates.start_date !== '';
    const hasVenue = parsed.venue?.venue_name && parsed.venue.venue_name !== '';

    if (!hasDate) {
      warn('No start date extracted from email');
    }

    // Return the full schema-aligned structure
    // Only include fields that have data
    const result = {
      // Always include basic event info
      event_name: parsed.event_name || email.subject || 'New Event',
      status: parsed.status || 'pending',
      isLogisticsEvent: hasDate || hasVenue,
      confidence: (hasDate && hasVenue) ? 0.95 : hasDate ? 0.75 : hasVenue ? 0.6 : 0.3
    };

    // Add each section if it has data
    if (parsed.venue && Object.keys(parsed.venue).some(k => parsed.venue[k])) {
      result.venue = parsed.venue;
    }

    if (parsed.dates && Object.keys(parsed.dates).some(k => parsed.dates[k])) {
      result.dates = parsed.dates;
    }

    if (parsed.organizer && Object.keys(parsed.organizer).some(k => parsed.organizer[k])) {
      result.organizer = parsed.organizer;
    }

    if (parsed.stages && parsed.stages.length > 0) {
      result.stages = parsed.stages;
    }

    if (parsed.contacts && parsed.contacts.length > 0) {
      result.contacts = parsed.contacts;
    }

    if (parsed.schedule_items && parsed.schedule_items.length > 0) {
      result.schedule_items = parsed.schedule_items;
    }

    if (parsed.artist_information && Object.keys(parsed.artist_information).some(k => parsed.artist_information[k])) {
      result.artist_information = parsed.artist_information;
    }

    if (parsed.event_links && parsed.event_links.length > 0) {
      result.event_links = parsed.event_links;
    }

    if (parsed.important_deadlines && parsed.important_deadlines.length > 0) {
      result.important_deadlines = parsed.important_deadlines;
    }

    if (parsed.logistics_notes && typeof parsed.logistics_notes === 'string' && parsed.logistics_notes.trim()) {
      result.logistics_notes = parsed.logistics_notes;
    }

    return result;

  } catch (err) {
    logError('Gemini extraction failed:', err.message);

    // Return minimal extraction with email content so user can manually edit
    return {
      event_name: email.subject || 'New Event',
      status: 'pending',
      venue: {
        venue_name: '',
        venue_address: '',
        city: '',
        state: '',
        country: 'US'
      },
      dates: {
        start_date: '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      isLogisticsEvent: false,
      confidence: 0,
      error: `AI extraction failed: ${err.message}. Please fill in details manually.`
    };
  }
}

/**
 * Build prompt for Gemini - Tour/Show Extraction
 */
function buildPrompt(email) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const currentYear = today.getFullYear();

  return `You're helping extract tour and show information from an email. Pull out all the important details for managing a tour/event.

Today is ${todayStr} (${today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })})

From: ${email.sender || email.from || 'Unknown'}
Subject: ${email.subject || 'No Subject'}

${(email.body || email.snippet || '').substring(0, 12000)}

---

Extract everything useful from this email - show details, venue info, contacts, technical specs, logistics, whatever's in there.

Return a FLAT JSON object with these top-level fields:

event_name: String (e.g., "EDC Las Vegas 25", "Duke Dumont at 1015 Folsom")
status: String (confirmed/advancing/pending/cancelled)
venue: {venue_name, venue_address, city, state, country}
dates: {start_date (YYYY-MM-DD), end_date (YYYY-MM-DD if multi-day), timezone} - This is for the OVERALL event/festival dates
organizer: {name, email, phone}

stages: Array - CRITICAL: Extract the COMPLETE LINEUP for each stage/room. If the email has a "ROS" (Rest of Schedule), "SET TIMES", or "LINEUP" section, extract ALL artists listed, not just the primary artist. Create one set object for EACH artist performing. If the email mentions different rooms or stages (like "Main Room", "bionicJUNGLE stage", "Lounge"), create separate stage objects for each. Each stage has:
- stage_name (e.g., "bionicJUNGLE", "Main Stage", "Arena", or just the venue name if no stage specified)
- sets: [{ // ONE SET OBJECT PER ARTIST - Extract ALL artists from ROS/lineup/set times section
    artist_name, set_name,
    set_date (YYYY-MM-DD),
    start_time (HH:MM in 24hr format),
    end_time (HH:MM in 24hr format),
    soundcheck_time,
    crew_list: "text like 'DJ + 2'",
    guest_list_spots: number,
    ticket_link: "url",
    venue_information: {venue_name, venue_address, venue_contact_name, venue_contact_email, venue_contact_phone, venue_notes, booking_notes},
    technical_notes: "IMPORTANT: Extract gear specs for THIS stage/room (e.g., '4 CDJs 3000, 1 DJM900NXS2')",
    hospo_tech_rider_confirmed: "yes/no/pending/n/a",
    hospitality_notes: "green room, catering, etc",
    logistics: {hotel_information, ground_transportation},
    production_pack_links: [{url, description: "label what the link is for"}],
    status: "scheduled/confirmed/cancelled"
  }]

  CRITICAL EXAMPLES FOR FULL LINEUP EXTRACTION:

  Example 1 - ROS (Rest of Schedule):
  Email contains:
  "ROS
  4:00am - 5:30am BOYS NOIZE
  2:30am - 4:00am X CLUB
  1:30am - 2:30am DJ FUCKOFF"

  You MUST create 3 separate set objects:
  sets: [
    {artist_name: "BOYS NOIZE", set_date: "2025-05-17", start_time: "04:00", end_time: "05:30"},
    {artist_name: "X CLUB", set_date: "2025-05-17", start_time: "02:30", end_time: "04:00"},
    {artist_name: "DJ FUCKOFF", set_date: "2025-05-17", start_time: "01:30", end_time: "02:30"}
  ]

  Example 2 - SET TIMES section:
  If you see a section labeled "SET TIME" or "SET TIMES" followed by a list of times and artists, extract EVERY SINGLE artist listed with their times.

  CRITICAL FOR SETS: The set_date, start_time, and end_time are THE MOST IMPORTANT FIELDS. These represent the ACTUAL PERFORMANCE TIME for the artist, NOT the overall event dates. For example:
  - If email says "EDC Las Vegas May 16-18" and "Your set: Friday 5/16 at 8:15pm - 9:30pm", then:
    - dates.start_date = "2025-05-16", dates.end_date = "2025-05-18" (festival dates)
    - sets[0].set_date = "2025-05-16" (specific performance day)
    - sets[0].start_time = "20:15" (actual set start in 24hr format)
    - sets[0].end_time = "21:30" (actual set end in 24hr format)
  - ALWAYS extract start_time and end_time in 24-hour format (e.g., 8:15pm = "20:15", 1:30am = "01:30")
  - If no specific set time mentioned, still create the stage/set structure with whatever info is available

contacts: Array - Anyone from the venue/promoter side. Include name, email, phone, company, role (be specific: "Production Manager", "Artist Relations", etc.), is_primary. NOTE: Artist's crew (like "DJ + 1") goes in crew_list field, NOT in contacts.

schedule_items: Array - Each distinct activity gets an item: {title, description, start_time (ISO format), end_time, location, type: "load_in/soundcheck/doors/performance/load_out/meeting/other"}

artist_information: Object (if mentioned) - {artist_name, dos_contact_phone, email, genre, tech_rider: {type, content/url/file_name}, hospo_rider: {type, content/url/file_name}}

logistics_notes: String - Free-form text capturing ALL logistics: guest list/comp details, transportation, sound check, visuals submission, venue rules, etiquette, hospitality, parking, photo/video policy, merchandise, hotel info, production contacts, shuttle info - whatever is mentioned. Preserve all details.

important_deadlines: Array - CRITICAL: Extract EVERY SINGLE deadline mentioned in the email: [{date: "YYYY-MM-DD", description: "what's due"}]. Look for date patterns like "April 22", "May 2", "May 8 -", etc. IMPORTANT: If the deadline month is BEFORE the event month, it's the SAME YEAR as the event (not current year ${currentYear}). For deadlines AFTER the event, use the event year too. Example: If event is May 2025 and deadline is "April 22", use "2025-04-22" (same year as event). If deadline is "May 2 - Advance Form", use "2025-05-02".

event_links: Array - CRITICAL: I will provide you with a pre-extracted list of ALL links from the email as structured data. DO NOT parse links from the email body text. Instead, use the links I provide in the "STRUCTURED LINKS" section below. Convert each link from the format "Description: URL" to the format [{url: "full URL", description: "the description text"}]. Include ALL links provided - do not filter, skip, or consolidate any!

CRITICAL NOTES:
- Return a FLAT JSON structure with top-level fields (event_name, status, venue, dates, stages, contacts, etc.)
- DO NOT nest fields under section headers like "core_event_info" or "stages_and_sets"
- **EXTRACT THE FULL LINEUP - MOST IMPORTANT**: Look for sections titled "ROS" (Rest of Schedule), "SET TIMES", "LINEUP", or any list of artist names with times. Extract EVERY SINGLE ARTIST with their set times, not just the primary artist. If you see "ROS" followed by a list like "11pm-12am ARTIST A, 12am-1am ARTIST B", create a separate set object for BOTH artists. This complete lineup is CRITICAL for tour management!
- Extract the SPECIFIC performance date and time (set_date, start_time, end_time) - NOT just the overall event dates
- Convert ALL times to 24-hour format (HH:MM) - e.g., "8:15pm" becomes "20:15", "1:30am" becomes "01:30", "4:00am" becomes "04:00"
- Extract timezone (use IANA format like "America/Los_Angeles" or abbreviation like "PDT/PST") - this is CRITICAL for tour management
- Extract EVERY link you see in the email - check for hyperlinked text and plain URLs
- If there are multiple rooms/stages, create separate stage objects for each
- Calculate dates from today (${todayStr}) - convert relative dates like "next Friday" or month names to YYYY-MM-DD
- Only include fields that have actual data

Return ONLY the JSON object. No markdown code blocks, no explanation, no wrapper. Just pure JSON starting with { and ending with }.

---

STRUCTURED LINKS (use these exactly as provided):
${email.links && email.links.length > 0 ? email.links.join('\n') : 'No links found in email'}

---

Use the links above to populate the event_links field. Convert each line from "Description: URL" format to {url: "URL", description: "Description"} format.`;
}

/**
 * Parse JSON from Gemini response
 */
function parseJsonResponse(text) {
  // Try to extract JSON from the response
  let jsonStr = text.trim();

  // Remove markdown code blocks if present
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '');
  }

  try {
    return JSON.parse(jsonStr.trim());
  } catch (e) {
    warn('JSON parse error (first attempt):', e.message);

    // Try to find JSON in the text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e2) {
        warn('Failed to parse Gemini JSON response (second attempt):', e2.message);
        warn('Matched JSON length:', jsonMatch[0].length);
      }
    }
    return {};
  }
}
