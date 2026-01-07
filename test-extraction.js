/**
 * Test AI Extraction with Example Emails
 * Run with: node test-extraction.js
 */

import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read test emails
const radiusEmail = fs.readFileSync(
  join(__dirname, '../remix-of-tourlink-pro-main/test-emails/radius-thread-example.txt'),
  'utf-8'
);

const edcEmail = fs.readFileSync(
  join(__dirname, '../remix-of-tourlink-pro-main/test-emails/edc-example.txt'),
  'utf-8'
);

// Gemini API configuration
const GEMINI_API_KEY = 'AIzaSyBBGEOs-z3mQpQuSk6aF9Gh_kMoEBJfGxA'; // From .env
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/**
 * Build extraction prompt
 */
function buildPrompt(email) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  return `You're helping extract tour and show information from an email. Pull out all the important details for managing a tour/event.

Today is ${todayStr} (${today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })})

From: ${email.from || 'Unknown'}
Subject: ${email.subject || 'No Subject'}

${email.body.substring(0, 7000)}

---

Extract everything useful from this email - show details, venue info, contacts, technical specs, logistics, whatever's in there. Here's what I need:

**CORE EVENT INFO:**
- event_name, status (confirmed/advancing/pending/cancelled)
- venue: {venue_name, venue_address, city, state, country}
- dates: {start_date (YYYY-MM-DD), end_date, timezone}
- organizer: {name, email, phone}

**STAGES & SETS:**
If the email mentions different rooms or stages (like "Main Room", "Klub Room", "Lounge"), create separate stage objects for each. For each stage:
- stage_name
- sets: [{
    artist_name, set_name,
    set_date (YYYY-MM-DD), start_time (HH:MM 24hr), end_time, soundcheck_time,
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

**CONTACTS:**
Anyone from the venue/promoter side → contacts array with:
- name, email, phone, company, role (be specific: "Production Manager", "Stage Manager", etc.), is_primary

Artist's crew (like "DJ + 1") → put in crew_list field as text, NOT in contacts

**SCHEDULE/RUN OF SHOW:**
Create schedule_items for each distinct activity:
- {title: "Load In/Soundcheck/Doors/Dinner/Curfew", description, start_time (ISO format), end_time, location, type: "load_in/soundcheck/doors/performance/load_out/meeting/other"}

**ARTIST INFO:**
- artist_name, dos_contact_phone (day-of-show contact), email, genre
- tech_rider: {type: "text/link/pdf", content/url/file_name}
- hospo_rider: {type: "text/link/pdf", content/url/file_name}

**KEY POINTS:**
- If there are multiple rooms with different gear, create separate stages
- Label ALL URLs with descriptions (tech rider, production pack, media kit, etc.)
- Separate venue contacts from artist crew
- Extract ALL times and convert to 24-hour format
- Calculate relative dates from today (${todayStr})
- Only include fields that have actual data - skip empty stuff

Return clean JSON, no markdown blocks, no explanation. Just the data.`;
}

/**
 * Parse email text to extract subject and body
 */
function parseEmail(emailText) {
  const lines = emailText.split('\n');
  const subject = lines[0].replace('Subject: ', '');
  const body = lines.slice(1).join('\n');

  return {
    subject,
    body,
    from: 'test@example.com',
    date: new Date().toISOString()
  };
}

/**
 * Call Gemini API
 */
async function extractWithGemini(email) {
  const prompt = buildPrompt(email);

  console.log('🤖 Calling Gemini API...\n');

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096
      }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Gemini API error: ${JSON.stringify(error)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('No response from Gemini');
  }

  // Parse JSON from response
  let jsonStr = text.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '');
  }

  return JSON.parse(jsonStr.trim());
}

/**
 * Pretty print results
 */
function printResults(label, result) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`  ${label}`);
  console.log(`${'='.repeat(80)}\n`);
  console.log(JSON.stringify(result, null, 2));

  // Summary
  console.log(`\n📊 EXTRACTION SUMMARY:`);
  console.log(`   Event Name: ${result.event_name || 'N/A'}`);
  console.log(`   Status: ${result.status || 'N/A'}`);
  console.log(`   Venue: ${result.venue?.venue_name || 'N/A'}`);
  console.log(`   Date: ${result.dates?.start_date || 'N/A'}`);
  console.log(`   Stages: ${result.stages?.length || 0}`);
  console.log(`   Contacts: ${result.contacts?.length || 0}`);
  console.log(`   Schedule Items: ${result.schedule_items?.length || 0}`);
  console.log(`   Confidence: ${result.confidence || 'N/A'}`);
}

/**
 * Run tests
 */
async function runTests() {
  console.log('🚀 ATMS AI Extraction Test\n');

  try {
    // Test 1: Radius email
    console.log('📧 Test 1: Radius Chicago Email (Complex thread with multiple artists)');
    const radiusParsed = parseEmail(radiusEmail);
    const radiusResult = await extractWithGemini(radiusParsed);
    printResults('RADIUS CHICAGO EXTRACTION', radiusResult);

    // Test 2: EDC email
    console.log('\n\n📧 Test 2: EDC Las Vegas Email (Festival stage assignment)');
    const edcParsed = parseEmail(edcEmail);
    const edcResult = await extractWithGemini(edcParsed);
    printResults('EDC LAS VEGAS EXTRACTION', edcResult);

    console.log('\n\n✅ All tests completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
  }
}

// Run tests
runTests();
