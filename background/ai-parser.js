/**
 * AI Parser - Gemini Version
 * Uses Google Gemini to extract event data from emails
 */

import { GEMINI_API_URL } from '../config/constants.js';
import { debug, error as logError, warn, info } from '../utils/logger.js';

// Fallback Gemini API key (user provided)
const FALLBACK_API_KEY = 'AIzaSyDZad3ahOoMpiKWzOgpKIx9hMQQZwnEQIw';

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
 * @param {Object} email - Email object with subject, body, sender, date
 * @returns {Promise<Object>} Extracted event details
 */
export async function extractEventFromEmail(email) {
  const apiKey = await getGeminiApiKey();
  
  if (!apiKey) {
    throw new Error('Gemini API key not configured');
  }
  
  const prompt = buildPrompt(email);
  
  try {
    info('Calling Gemini API for event extraction...');
    
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024
        }
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `Gemini API error: ${response.status}`);
    }
    
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      throw new Error('No response from Gemini');
    }
    
    // Parse JSON from response
    const parsed = parseJsonResponse(text);
    
    info('Gemini extraction complete:', parsed.title);
    
    return {
      title: parsed.title || email.subject || 'New Event',
      description: parsed.description || '',
      date: parsed.date || '',
      time: parsed.time || '10:00',
      location: parsed.location || '',
      duration: parsed.duration || 60,
      attendees: parsed.attendees || [],
      isLogisticsEvent: true,
      confidence: 0.8
    };
    
  } catch (err) {
    logError('Gemini extraction failed:', err);
    
    // Return basic extraction from email
    return {
      title: email.subject || 'New Event',
      description: email.body?.substring(0, 200) || '',
      date: '',
      time: '10:00',
      location: '',
      duration: 60,
      attendees: [],
      isLogisticsEvent: false,
      confidence: 0
    };
  }
}

/**
 * Build prompt for Gemini
 */
function buildPrompt(email) {
  const today = new Date().toISOString().split('T')[0];
  
  return `You are an AI assistant that extracts event/meeting information from emails.

Today's date is: ${today}

Analyze this email and extract event details:

From: ${email.sender || email.from || 'Unknown'}
Subject: ${email.subject || 'No Subject'}
Date Received: ${email.date || 'Unknown'}

Email Body:
${(email.body || email.snippet || '').substring(0, 3000)}

Extract and return a JSON object with these fields:
{
  "title": "Event title (brief, max 100 chars)",
  "description": "Brief description of the event",
  "date": "YYYY-MM-DD format",
  "time": "HH:MM format (24-hour)",
  "location": "Location or venue",
  "duration": number in minutes,
  "attendees": ["email1@example.com"]
}

If no event is found, return:
{
  "title": "${email.subject || 'New Event'}",
  "description": "",
  "date": "",
  "time": "10:00",
  "location": "",
  "duration": 60,
  "attendees": []
}

Return ONLY valid JSON, no other text.`;
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
    // Try to find JSON in the text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e2) {
        warn('Failed to parse Gemini JSON response');
      }
    }
    return {};
  }
}
