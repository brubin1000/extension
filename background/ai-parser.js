/**
 * AI Parser
 * Uses OpenAI to extract logistics schedule data from emails
 */

import {
  OPENAI_API_URL,
  OPENAI_MODEL,
  OPENAI_TEMPERATURE,
  OPENAI_MAX_TOKENS,
  AI_CONFIG
} from '../config/constants.js';
import { debug, error as logError, warn, logAIResult, logApiCall, logApiResponse } from '../utils/logger.js';
import { getDateContext } from '../utils/date-parser.js';
import { getOpenAIKey } from './auth-manager.js';

/**
 * System prompt for AI event extraction
 */
const SYSTEM_PROMPT = `You are an AI assistant that extracts logistics and scheduling information from emails.

Your task is to:
1. Determine if the email contains a logistics-related event (delivery, pickup, appointment, meeting, flight, hotel, service, etc.)
2. Extract key event details: title, description, date/time, location
3. Classify the event type
4. Provide a confidence score (0-1) for your extraction

Return ONLY a JSON object with this exact structure (no markdown, no explanations):
{
  "isLogisticsEvent": boolean,
  "title": "Brief event title (max 100 chars)",
  "description": "Event description with relevant details",
  "startDateTime": "ISO 8601 format YYYY-MM-DDTHH:MM:SS.000Z or null if no date/time",
  "endDateTime": "ISO 8601 format or null (if not specified, leave null)",
  "location": "Address or location string or empty string",
  "eventType": "delivery|pickup|meeting|appointment|shipment|flight|hotel|service|other",
  "confidence": number between 0 and 1
}

Important rules:
- If email does NOT contain a logistics event, set isLogisticsEvent to false
- Convert all relative dates (tomorrow, next Monday, etc.) to absolute ISO 8601 format using the date context provided
- If no specific time is mentioned, use a reasonable default (e.g., 9:00 AM for deliveries, appointment time if mentioned)
- Include tracking numbers, confirmation codes, or order numbers in the description
- Be conservative: if unsure, set confidence < 0.5
- Extract actual useful information, don't make up details
- Return ONLY valid JSON, nothing else`;

/**
 * Extract schedule data from email using AI
 * @param {Object} email - Email object
 * @returns {Promise<Object>} AI parsing result
 */
export async function extractScheduleFromEmail(email) {
  try {
    // Get OpenAI API key
    const apiKey = await getOpenAIKey();
    
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }
    
    // Build user prompt
    const userPrompt = buildUserPrompt(email);
    
    // Call OpenAI API
    const result = await callOpenAI(apiKey, userPrompt);
    
    // Validate result
    if (!validateAIResult(result)) {
      warn('AI returned invalid result', result);
      return createEmptyResult();
    }
    
    // Apply confidence threshold
    if (result.isLogisticsEvent && result.confidence < AI_CONFIG.MIN_CONFIDENCE_THRESHOLD) {
      debug(`Confidence ${result.confidence} below threshold, marking as non-logistics`);
      result.isLogisticsEvent = false;
    }
    
    logAIResult(result);
    
    return result;
    
  } catch (err) {
    logError('AI parsing failed', err);
    return createEmptyResult();
  }
}

/**
 * Build user prompt for OpenAI
 * @param {Object} email - Email object
 * @returns {string} User prompt
 */
function buildUserPrompt(email) {
  // Get date context for AI
  const dateContext = getDateContext(new Date(email.date));
  
  // Truncate body if too long
  let body = email.body || email.snippet || '';
  if (body.length > AI_CONFIG.MAX_EMAIL_CHARS_TO_PARSE) {
    body = body.substring(0, AI_CONFIG.MAX_EMAIL_CHARS_TO_PARSE) + '\n\n[...truncated]';
  }
  
  const prompt = `${dateContext}

Email to analyze:

From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}

Body:
${body}

Extract the logistics event information as JSON:`;
  
  return prompt;
}

/**
 * Call OpenAI API
 * @param {string} apiKey - OpenAI API key
 * @param {string} userPrompt - User prompt
 * @returns {Promise<Object>} Parsed result
 */
async function callOpenAI(apiKey, userPrompt) {
  const requestBody = {
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    temperature: OPENAI_TEMPERATURE,
    max_tokens: OPENAI_MAX_TOKENS,
    response_format: { type: 'json_object' }
  };
  
  logApiCall('OpenAI', OPENAI_API_URL, { method: 'POST' });
  
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });
  
  logApiResponse('OpenAI', response.status, response.ok);
  
  if (!response.ok) {
    const errorText = await response.text();
    
    if (response.status === 401) {
      throw new Error('OpenAI API authentication failed. Check your API key.');
    }
    
    if (response.status === 429) {
      throw new Error('OpenAI API rate limit exceeded. Please try again later.');
    }
    
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Invalid response from OpenAI API');
  }
  
  const content = data.choices[0].message.content;
  
  // Parse JSON response
  try {
    const parsed = JSON.parse(content);
    return parsed;
  } catch (err) {
    logError('Failed to parse OpenAI JSON response', { content });
    throw new Error('OpenAI returned invalid JSON');
  }
}

/**
 * Validate AI result structure
 * @param {Object} result - AI result to validate
 * @returns {boolean} True if valid
 */
function validateAIResult(result) {
  if (!result || typeof result !== 'object') {
    return false;
  }
  
  // Required fields
  if (typeof result.isLogisticsEvent !== 'boolean') {
    return false;
  }
  
  if (result.isLogisticsEvent) {
    // If it's a logistics event, we need certain fields
    if (!result.title || typeof result.title !== 'string') {
      return false;
    }
    
    if (typeof result.eventType !== 'string') {
      return false;
    }
    
    if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) {
      return false;
    }
    
    // Start date/time is required for logistics events
    if (!result.startDateTime) {
      return false;
    }
  }
  
  return true;
}

/**
 * Create empty result (for when AI fails or email is not logistics)
 * @returns {Object} Empty result
 */
function createEmptyResult() {
  return {
    isLogisticsEvent: false,
    title: '',
    description: '',
    startDateTime: null,
    endDateTime: null,
    location: '',
    eventType: 'other',
    confidence: 0
  };
}

/**
 * Parse multiple emails in batch
 * @param {Array<Object>} emails - Array of email objects
 * @returns {Promise<Array<Object>>} Array of results
 */
export async function parseEmailsBatch(emails) {
  const results = [];
  
  for (const email of emails) {
    try {
      const result = await extractScheduleFromEmail(email);
      results.push({
        email: email,
        result: result,
        success: true
      });
    } catch (err) {
      logError(`Failed to parse email ${email.id}`, err);
      results.push({
        email: email,
        result: createEmptyResult(),
        success: false,
        error: err.message
      });
    }
    
    // Small delay to avoid rate limiting
    await sleep(100);
  }
  
  return results;
}

/**
 * Sleep utility
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Test AI parser with sample email
 * @returns {Promise<Object>} Test result
 */
export async function testAIParser() {
  const sampleEmail = {
    id: 'test-123',
    from: 'shipping@amazon.com',
    subject: 'Your package will arrive tomorrow',
    date: new Date().toISOString(),
    body: `Hello,

Your Amazon package is out for delivery and will arrive tomorrow between 2:00 PM and 6:00 PM.

Delivery address:
123 Main Street
San Francisco, CA 94102

Tracking number: 1Z999AA10123456784

Thank you for your order!`
  };
  
  try {
    const result = await extractScheduleFromEmail(sampleEmail);
    return {
      success: true,
      result: result
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Get AI parser statistics
 * @returns {Object} Parser stats
 */
export function getParserStats() {
  return {
    model: OPENAI_MODEL,
    temperature: OPENAI_TEMPERATURE,
    maxTokens: OPENAI_MAX_TOKENS,
    minConfidence: AI_CONFIG.MIN_CONFIDENCE_THRESHOLD,
    maxEmailChars: AI_CONFIG.MAX_EMAIL_CHARS_TO_PARSE
  };
}

/**
 * Estimate OpenAI API cost for an email
 * @param {Object} email - Email object
 * @returns {number} Estimated cost in USD
 */
export function estimateCost(email) {
  // Rough estimation based on token count
  // GPT-4o-mini: $0.150 per 1M input tokens, $0.600 per 1M output tokens
  
  const promptLength = SYSTEM_PROMPT.length + (email.body?.length || 0) + 200;
  const estimatedInputTokens = Math.ceil(promptLength / 4); // Rough approximation
  const estimatedOutputTokens = OPENAI_MAX_TOKENS;
  
  const inputCost = (estimatedInputTokens / 1000000) * 0.150;
  const outputCost = (estimatedOutputTokens / 1000000) * 0.600;
  
  return inputCost + outputCost;
}

