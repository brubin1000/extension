# Email to Calendar AI Agent - Setup Guide

## Prerequisites

Before installing the extension, you need to set up the required services:

### 1. MongoDB Atlas Setup

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free account and new cluster
3. Click "App Services" in the left sidebar
4. Create a new App:
   - Name: `email-calendar-agent`
   - Link to your cluster
5. Configure Authentication:
   - Go to "Authentication" → "Authentication Providers"
   - Enable "Google OAuth"
   - Add your Google OAuth Client ID (from next step)
6. Create Database:
   - Database name: `email_calendar`
   - Collection name: `events`
7. Set up Rules & Permissions:
   - Go to "Rules" → Select `events` collection
   - Use this rule template:
   ```json
   {
     "name": "userCanOnlySeeOwnEvents",
     "apply_when": {},
     "read": {
       "userId": "%%user.id"
     },
     "write": {
       "userId": "%%user.id"
     }
   }
   ```
8. Get your Realm App ID:
   - Found in "App Settings" → Copy the App ID (looks like: `email-calendar-xxxxx`)

### 2. Google Cloud Project Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project: "Email Calendar Agent"
3. Enable APIs:
   - Go to "APIs & Services" → "Library"
   - Enable "Gmail API"
   - Enable "Google Calendar API"
4. Create OAuth 2.0 Credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: **Chrome Extension**
   - Note: You'll need your Chrome Extension ID first
5. Configure OAuth Consent Screen:
   - User type: Internal (for personal use) or External
   - Add scopes:
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/calendar.events`
6. After loading extension unpacked, return here to add the Extension ID

### 3. OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Create an account and add billing
3. Go to "API Keys" → "Create new secret key"
4. Copy and save the key securely
5. Recommended: Set usage limits to avoid unexpected charges

## Installation Steps

### Step 1: Clone and Configure

```bash
cd /Users/elijahschleifer/.cursor/worktrees/extension/bjq
```

### Step 2: Update Configuration

Edit `config/constants.js` and add:
- MongoDB Realm App ID (from MongoDB Atlas)
- Your timezone (optional, defaults to system timezone)

### Step 3: Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `bjq` directory
5. **Copy the Extension ID** that appears (e.g., `abcdefghijklmnopqrstuvwxyz123456`)

### Step 4: Update Google OAuth

1. Return to Google Cloud Console
2. Go to "APIs & Services" → "Credentials"
3. Edit your OAuth 2.0 Client ID
4. Add your Extension ID to allowed origins
5. Save changes

### Step 5: Update manifest.json

1. Open `manifest.json`
2. Replace `YOUR_GOOGLE_CLIENT_ID` with your actual Client ID from Google Cloud
3. Save the file
4. Return to `chrome://extensions` and click the reload icon for your extension

### Step 6: First Run Setup

1. Click the extension icon in Chrome toolbar
2. You'll be prompted to:
   - Authorize Google (Gmail + Calendar access)
   - Enter your OpenAI API key (stored securely in Chrome sync)
3. Grant all permissions when prompted

### Step 7: Verify Installation

1. Send yourself a test email with logistics content, e.g.:
   ```
   Subject: Package Delivery Scheduled
   
   Your Amazon package will be delivered tomorrow at 3:00 PM
   to 123 Main Street.
   
   Tracking: 1Z999AA10123456784
   ```
2. Wait 5-10 minutes (default polling interval)
3. Check your Google Calendar for the new event
4. Verify in MongoDB Atlas that the event was synced

## Troubleshooting

### Extension not polling emails
- Check Chrome extensions page for errors
- Open Developer Tools → Service Workers → Inspect
- Check console for authentication errors

### Calendar events not being created
- Verify Calendar API is enabled in Google Cloud
- Check that OAuth scopes include calendar.events
- Look for API quota errors in console

### MongoDB sync failing
- Verify Realm App ID is correct in constants.js
- Check authentication providers are configured
- Review App Services logs in MongoDB Atlas

### AI not extracting events
- Verify OpenAI API key is valid and has credits
- Check console for API errors
- Try with simpler test emails first

## Cost Estimates

- **MongoDB Atlas:** Free tier (512MB storage, 1M requests/month)
- **Google APIs:** Free (Gmail and Calendar APIs have generous quotas)
- **OpenAI API:** ~$0.0001 per email with GPT-4o-mini
  - 100 emails/day = ~$0.30/month
  - 1000 emails/day = ~$3/month

## Security Notes

- OpenAI API key is stored in `chrome.storage.sync` (encrypted by Chrome)
- OAuth tokens are managed by Chrome Identity API (never exposed to code)
- MongoDB data is user-scoped (you can only see your own events)
- Email content is only sent to OpenAI for parsing (not stored anywhere)

## Frontend Integration (atms.space)

The frontend at atms.space will:
1. Authenticate users with same Google OAuth
2. Query events from MongoDB using Realm Web SDK
3. Display events in calendar view
4. Show processing status and history

Frontend setup is in a separate repository.

## Support

For issues:
1. Check browser console for errors
2. Review MongoDB App Services logs
3. Verify all API keys and credentials are correct
4. Ensure all APIs are enabled in Google Cloud Console

