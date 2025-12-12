# ATMS Extension - Current State Summary
**Date:** December 12, 2025

---

## What's Working

| Feature | Status | Details |
|---------|--------|---------|
| **Gmail Button** | ✅ Working | Injects teal calendar button into Gmail (toolbar or floating) |
| **Inline Dropdown UI** | ✅ Working | Multi-step flow: Choice → Loading → Review → Success/Error |
| **Gemini AI Extraction** | ✅ Working | Extracts event title, date, time, location from emails |
| **Google Calendar Creation** | ✅ Working | Creates events directly via Calendar API |
| **Side Panel** | ✅ Working | 4-tab mobile UI: Overview, Contacts, Team, Settings |
| **Event Detail View** | ✅ Working | Click event → expands with "View in Calendar" button |
| **Google OAuth** | ✅ Working | Chrome identity API for Gmail/Calendar access |
| **Local Storage Sync** | ✅ Working | Events/contacts saved locally, sync between Gmail and panel |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         GMAIL WEB                               │
│  ┌─────────────┐    ┌──────────────────────────────────────┐   │
│  │ ATMS Button │───▶│     Inline Dropdown UI               │   │
│  │  (Teal)     │    │  • Choice Screen                     │   │
│  └─────────────┘    │  • Loading (Gemini extraction)       │   │
│                     │  • Review/Edit Form                  │   │
│                     │  • Success/Error                     │   │
│                     └──────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKGROUND SERVICE WORKER                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │Auth Manager │  │Gemini Parser│  │Calendar Client          │ │
│  │(Google OAuth│  │(AI Extract) │  │(Create/List Events)     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Chrome Storage  │  │ Google Calendar │  │  Side Panel UI  │
│ (Local Events)  │  │     API         │  │  (4 Tabs)       │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## Key Files

| File | Purpose |
|------|---------|
| `content/gmail-inject.js` | Gmail button + inline dropdown UI (~1,280 lines) |
| `background/service-worker.js` | Message handlers, calendar creation, polling |
| `background/ai-parser.js` | Gemini API for event extraction |
| `background/auth-manager.js` | Google OAuth (Realm is optional/stubbed) |
| `panel/panel.html` | Side panel HTML structure |
| `panel/panel.css` | Side panel styles (ATMS design system) |
| `panel/panel.js` | Side panel logic, event/contact management |
| `config/constants.js` | API URLs, storage keys, configuration |
| `manifest.json` | Chrome extension manifest v3 |

---

## Message Flow (Gmail → Calendar)

1. User clicks **ATMS button** in Gmail
2. Content script extracts email content (subject, body, sender, participants)
3. Dropdown shows **Choice screen** ("Create New" or "Link Existing")
4. If "Create New":
   - Sends `EXTRACT_EVENT` message to service worker
   - Service worker calls **Gemini API** with email content
   - Returns extracted: title, date, time, location, duration
5. User reviews/edits in **Review screen**
6. User clicks "Create Event"
   - Sends `CREATE_EVENT` message to service worker
   - Service worker calls **Google Calendar API**
   - Event saved to both Calendar and local storage
7. **Success screen** shown with "View in Calendar" option

---

## What Needs Work (TODO)

### 1. Database Integration
- **Current:** Local Chrome storage only (`chrome.storage.local`)
- **Needed:** MongoDB Realm or other cloud database for:
  - Cross-device sync
  - Team collaboration
  - Data persistence beyond browser
- **Files to update:** `background/auth-manager.js`, `background/mongo-sync.js`

### 2. Better Gemini Prompt for Music Industry
- **Current prompt** is generic (meetings, appointments, deliveries)
- **Needs to extract music-specific data:**
  - Artist names
  - Venue details (capacity, address, contacts)
  - Show times / Load-in times / Soundcheck
  - Ticket/hospitality info
  - Tour dates / routing
  - Agent/manager/promoter contacts
  - Rider requirements
  - Settlement/financial terms
- **File to update:** `background/ai-parser.js` → `buildPrompt()` function

### 3. Terminology Updates
- Replace "Attendees" → **"Contacts"** throughout:
  - `content/gmail-inject.js` (dropdown UI)
  - `background/service-worker.js` (CREATE_EVENT handler)
  - `panel/panel.js`
- More music-industry specific language in UI

### 4. Other Future Enhancements
- [ ] Email linking to existing calendar events
- [ ] Event editing (not just creation)
- [ ] Contact management improvements (roles, tags)
- [ ] Team/workspace collaboration
- [ ] Notification preferences
- [ ] Event templates for common show types
- [ ] Integration with ticketing platforms
- [ ] Financial/settlement tracking

---

## Current API Keys & Config

| Service | Status | Location |
|---------|--------|----------|
| Google OAuth | ✅ Configured | `manifest.json` → `oauth2.client_id` |
| Gemini API | ✅ Has fallback key | `background/ai-parser.js` → `FALLBACK_API_KEY` |
| MongoDB Realm | ⚠️ Placeholder | `config/constants.js` → `MONGODB_REALM_APP_ID` |

---

## Extension ID
`hmnfkenngnibnhoodejokafaailchnkh`

---

## Build Commands

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Output: dist/service-worker.js
```

---

## Files Changed in This Session

**Modified:**
- `background/auth-manager.js` - Realm now fully optional
- `background/service-worker.js` - Added message handlers for EXTRACT_EVENT, CREATE_EVENT, etc.
- `background/ai-parser.js` - Gemini integration with fallback key
- `config/constants.js` - Added GEMINI_API_URL, GEMINI_MODEL
- `manifest.json` - Side panel config, removed icons section
- `package.json` - Added esbuild and build scripts

**New Files:**
- `content/gmail-inject.js` - Gmail button and inline dropdown
- `panel/panel.html` - Side panel structure
- `panel/panel.css` - Side panel styles
- `panel/panel.js` - Side panel logic

---

## Commit Message Suggestion

```
feat: ATMS v1.0 - Gmail integration, AI extraction, side panel

- Gmail button with inline dropdown UI for event creation
- Gemini AI extracts event details from email content
- Google Calendar integration for event creation
- Side panel with Overview, Contacts, Team, Settings tabs
- Event detail view with "View in Calendar" button
- Local storage sync between Gmail and side panel
- Realm authentication made optional
```

