# ATMS Project Status - December 28, 2024

## Project Overview

**ATMS (Artist Tour Management System)** is a Chrome extension that uses AI to extract event information from emails and create Google Calendar events. It integrates with Gmail and uses Google's Gemini AI to intelligently parse tour/show details from email content.

## Current Status: ✅ FULLY FUNCTIONAL

### Core Features Working

1. **Gmail Integration**
   - ✅ Content script injects into Gmail interface
   - ✅ Email extraction dialog appears when viewing emails
   - ✅ Real-time email parsing and display

2. **AI-Powered Event Extraction**
   - ✅ Gemini API integration for intelligent parsing
   - ✅ Extracts comprehensive event details including:
     - Basic event info (title, date, time, location, description)
     - Set overview with timezone and set name
     - **Complete Run of Show timeline** (all set times, load-in, soundcheck, doors, curfew)
     - Artist information (name, genre, contacts, day-of-show contact)
     - Riders and media files
     - Logistics and notes (venue info, hotel, hospitality, tech notes, guest list)
     - Contacts list with roles
   - ✅ Dynamic field rendering (only shows fields with actual data)
   - ✅ Beautiful timeline UI for run of show

3. **Google Calendar Integration**
   - ✅ OAuth 2.0 authentication working
   - ✅ Create calendar events from extracted data
   - ✅ Calendar API enabled and configured

4. **Side Panel UI**
   - ✅ Overview screen with event list
   - ✅ Contacts management
   - ✅ Team view
   - ✅ Settings with user profile
   - ✅ Real-time authentication state updates
   - ✅ "Authenticate with Google" button in settings

## Recent Fixes (December 28, 2024)

### 1. OAuth Authentication Setup
- **Issue**: Extension had invalid OAuth client ID causing "bad client id" errors
- **Fix**: Updated manifest.json with new OAuth client ID: `245581280666-rm1knoaq72dojulk7sb1gb70s5f2fadb.apps.googleusercontent.com`
- **Location**: `/manifest.json:43`

### 2. Profile Update After Authentication
- **Issue**: After OAuth login, sidebar still showed placeholder "user@example.com"
- **Fix**: Added broadcast message system
  - Service worker broadcasts `AUTH_STATE_CHANGED` after successful auth (`/background/service-worker.js:454-460`)
  - Panel listens for message and reloads profile (`/panel/panel.js:35-42`)
- **Result**: Profile now updates automatically after authentication

### 3. Authentication Button in Sidebar
- **Issue**: Users couldn't trigger auth easily (extension icon click didn't work as expected)
- **Fix**: Added "Authenticate with Google" button in Settings tab
  - Button UI: `/panel/panel.html:159-161`
  - Handler: `/panel/panel.js:447-471`

### 4. Complete Run of Show Extraction
- **Enhancement**: AI now extracts ALL set times, not just one
- **Details**: Updated Gemini prompt to capture complete timeline including:
  - Load-in times
  - Soundcheck
  - Doors open
  - All artist set times (multiple artists)
  - Dinner breaks
  - Curfew
- **Location**: `/background/ai-parser.js:212-218`
- **UI**: Beautiful timeline display with teal accent (`/content/gmail-inject.js`)

### 5. CSS Fixes
- **Issue**: Long URLs overflowing containers
- **Fix**: Added word-break and overflow-wrap to `.atms-array-item`
- **Location**: `/content/gmail-inject.js` (inline styles)

## Configuration

### Google Cloud Project
- **Project ID**: `gen-lang-client-0708643776`
- **Project Number**: `245581280666`

### APIs Enabled
- ✅ Gmail API
- ✅ Google Calendar API
- ✅ Gemini API (Generative Language API)

### OAuth 2.0 Configuration
- **Client ID**: `245581280666-rm1knoaq72dojulk7sb1gb70s5f2fadb.apps.googleusercontent.com`
- **Extension ID**: `cbcmkjfoggiogdmlkofobnohmipbjkob`
- **Scopes**:
  - `https://www.googleapis.com/auth/gmail.readonly`
  - `https://www.googleapis.com/auth/calendar.events`
  - `https://www.googleapis.com/auth/calendar.readonly`
  - `openid`
  - `email`
  - `profile`

### API Keys
- **Gemini API**: Configured in `/config/secrets.js` (gitignored)
- **Calendar API**: Uses OAuth token (no separate API key needed)

## Architecture

### File Structure
```
extension-main/
├── background/
│   ├── service-worker.js      # Main background service worker
│   ├── ai-parser.js            # Gemini AI integration
│   └── calendar-api.js         # Google Calendar API calls
├── content/
│   └── gmail-inject.js         # Gmail UI injection & extraction dialog
├── panel/
│   ├── panel.html              # Side panel UI
│   ├── panel.js                # Side panel logic
│   └── panel.css               # Side panel styles
├── config/
│   ├── constants.js            # API URLs and constants
│   └── secrets.js              # API keys (gitignored)
├── utils/
│   └── logger.js               # Logging utilities
├── manifest.json               # Extension manifest
└── dist/                       # Built files (esbuild output)
```

### Key Technologies
- **Build Tool**: esbuild (watch mode for development)
- **AI**: Google Gemini API (gemini-pro model)
- **Authentication**: Chrome Identity API with OAuth 2.0
- **Storage**: Chrome Storage API
- **UI Framework**: Vanilla JavaScript (no framework)

## Development Setup

### Running the Extension
1. **Start build watcher**:
   ```bash
   cd /Users/leerubin/Downloads/extension-main
   npm run watch
   ```
   Currently running on PID: b72c7c0 (background task)

2. **Load extension in Chrome**:
   - Go to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `/Users/leerubin/Downloads/extension-main`

3. **Usage**:
   - Open Gmail
   - Click on an email with event/show information
   - Click "Add to ATMS" button that appears
   - Review extracted information
   - Click "Create Calendar Event"

### Companion Web App
- **Location**: `/Users/leerubin/Downloads/remix-of-tourlink-pro-main`
- **Dev Server**: Running on port 8081 (Vite)
- **Purpose**: Dashboard for managing events

## How to Use

### First-Time Setup
1. Install extension in Chrome
2. Open sidebar (right-click extension icon → "Open sidebar")
3. Go to Settings tab
4. Click "Authenticate with Google"
5. Complete OAuth flow
6. Profile updates automatically with your Google account

### Creating Events from Emails
1. Open Gmail and view an email with event details
2. Look for the "Add to ATMS" button in the email
3. Click it to open the extraction dialog
4. AI automatically extracts:
   - Event title, date, time, location
   - Complete run of show with all set times
   - Artist information and contacts
   - Logistics notes and rider details
5. Review the extracted information
6. Click "Create Calendar Event"
7. Event is added to Google Calendar

### Managing Events
- View all events in the sidebar Overview tab
- Click on an event to see details
- View in Google Calendar or delete from sidebar

## Data Flow

1. **Email → AI Extraction**:
   - User clicks "Add to ATMS" on email
   - Email content sent to Gemini API via `/background/ai-parser.js`
   - AI parses and returns structured JSON

2. **Extraction → Display**:
   - Parsed data displayed in dialog (`/content/gmail-inject.js`)
   - Dynamic sections only show populated fields
   - Timeline view for run of show

3. **Create Event**:
   - User clicks "Create Calendar Event"
   - Message sent to service worker
   - Service worker authenticates with Google
   - Calendar API creates event
   - Event stored in local storage and displayed in sidebar

## Known Limitations

1. **Icon Click**: Extension icon click doesn't open popup (use right-click → "Open sidebar")
2. **Notification Images**: Chrome shows warnings about notification icon downloads (non-critical)
3. **API Quotas**: Gemini API has usage quotas (user has billing enabled)

## Future Enhancements

### Potential Improvements
- Add batch email processing
- Implement email filters/labels for auto-detection
- Add event templates for common tour scenarios
- Export functionality (PDF, CSV)
- Team collaboration features
- Mobile companion app
- Integration with other tour management tools

### Code Quality
- Add TypeScript for better type safety
- Implement unit tests
- Add error boundary components
- Improve logging and debugging tools

## Troubleshooting

### Common Issues

**"Not authenticated" error**:
- Go to Settings tab
- Click "Authenticate with Google"
- Complete OAuth flow

**"API not enabled" error**:
- Enable required APIs in Google Cloud Console
- Wait 1-2 minutes for propagation

**Profile not updating**:
- Extension automatically updates after auth
- If stuck, reload extension and re-authenticate

**Build not updating**:
- Check if esbuild watch is running
- Reload extension in chrome://extensions

## Version History

### v1.0.0 - December 28, 2024
- ✅ Core functionality complete
- ✅ OAuth authentication working
- ✅ AI extraction with Gemini
- ✅ Complete run of show timeline
- ✅ Dynamic field rendering
- ✅ Calendar integration
- ✅ Profile auto-update after auth
- ✅ All APIs enabled and configured

## Contact & Support

For issues or questions, check:
- Chrome DevTools console for errors
- Service worker logs in chrome://extensions
- Gmail page console for content script logs

---

**Status**: Production Ready ✅
**Last Updated**: December 28, 2024
**Maintainer**: Development Team
**License**: Proprietary
