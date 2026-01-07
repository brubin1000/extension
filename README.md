# Email to Calendar AI Agent

An intelligent Chrome extension that automatically monitors your Gmail for logistics-related emails (deliveries, appointments, flights, etc.) and creates Google Calendar events for them. All event data is synced to MongoDB Atlas for viewing on your [atms.space](https://atms.space) frontend.

## Features

- 🤖 **AI-Powered**: Uses OpenAI GPT-4o-mini to intelligently extract event details from emails
- 📧 **Gmail Integration**: Automatically polls your Gmail every 5 minutes for new logistics emails
- 📅 **Calendar Sync**: Creates Google Calendar events with smart reminders
- 💾 **MongoDB Sync**: Stores all events in MongoDB Atlas for access via web frontend
- 🔒 **Secure**: Uses Google OAuth 2.0 for authentication
- 🎯 **Focused**: Only processes emails that contain logistics keywords (deliveries, bookings, etc.)
- 🔕 **Background Operation**: Runs silently with no UI required

## Architecture

```
Chrome Extension → Gmail API → AI Parser (OpenAI) → Google Calendar API → MongoDB Atlas
                                                                            ↓
                                                                     atms.space Frontend
```

## What It Does

1. **Monitors Gmail** for new emails containing logistics keywords
2. **Filters emails** from known logistics providers (Amazon, FedEx, UPS, airlines, hotels, etc.)
3. **Extracts event details** using AI:
   - Event title and description
   - Date and time (converts relative dates like "tomorrow" to absolute dates)
   - Location/address
   - Event type (delivery, pickup, flight, appointment, etc.)
4. **Creates Calendar events** automatically with:
   - Link back to original email
   - Smart reminders (30min popup, 1hr email)
5. **Syncs to MongoDB** for viewing on your web dashboard

## Setup

### Prerequisites

You need:
1. Google Account (Gmail + Calendar)
2. MongoDB Atlas account (free tier works)
3. OpenAI API key

### Quick Start

1. **Clone this repository**
   ```bash
   git clone <your-repo-url>
   cd bjq
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Follow the detailed setup guide**
   
   See [SETUP_GUIDE.md](SETUP_GUIDE.md) for complete step-by-step instructions including:
   - MongoDB Atlas configuration
   - Google Cloud Project setup
   - Extension installation
   - First-time configuration

4. **Load extension in Chrome**
   - Go to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select this directory

## Configuration

Edit `config/constants.js` to customize:

- **Polling interval**: How often to check emails (default: 5 minutes)
- **MongoDB Realm App ID**: Your MongoDB Atlas App Services ID
- **Logistics keywords**: Add/remove keywords to filter emails
- **Priority domains**: Domains to prioritize for processing
- **Debug settings**: Enable detailed logging

## Usage

### After Installation

The extension runs automatically in the background. You can:

- **Click the extension icon** to:
  - Complete initial setup (first time)
  - Trigger manual email check
  - View current status

- **Notifications** appear when:
  - New events are created
  - Setup is required
  - Errors occur (if enabled)

### Extension Management

The extension stores configuration in Chrome storage:
- OpenAI API key (encrypted by Chrome)
- Processed email IDs (to avoid duplicates)
- MongoDB Realm authentication

### Viewing Events

- **Google Calendar**: Events appear with "Auto-created from email" in description
- **atms.space**: Login with same Google account to view all synced events

## File Structure

```
bjq/
├── manifest.json                 # Extension configuration
├── background/
│   ├── service-worker.js        # Main orchestrator
│   ├── auth-manager.js          # Authentication handling
│   ├── gmail-client.js          # Gmail API integration
│   ├── ai-parser.js             # OpenAI parsing logic
│   ├── calendar-client.js       # Calendar API integration
│   └── mongo-sync.js            # MongoDB sync
├── config/
│   └── constants.js             # Configuration
├── models/
│   └── event-schema.js          # Data models
├── utils/
│   ├── logger.js                # Logging utilities
│   └── date-parser.js           # Date parsing helpers
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## How It Works

### Email Processing Flow

1. **Alarm triggers** every 5 minutes
2. **Fetch emails** from last 24 hours
3. **Pre-filter** by logistics keywords and sender domains
4. **Check processed list** to avoid duplicates
5. For each new email:
   - **AI extraction**: Send to OpenAI for parsing
   - **Validation**: Check confidence score and required fields
   - **Calendar creation**: Create event via Google Calendar API
   - **MongoDB sync**: Store event data
   - **Mark processed**: Add to processed list

### AI Parsing

The AI receives:
- Email subject, from, date, body
- Current date context (for relative date conversion)
- System prompt with extraction rules

Returns JSON:
```json
{
  "isLogisticsEvent": true,
  "title": "Amazon Package Delivery",
  "description": "Package arriving between 2-6 PM. Tracking: 1Z999AA...",
  "startDateTime": "2024-12-12T14:00:00.000Z",
  "endDateTime": "2024-12-12T18:00:00.000Z",
  "location": "123 Main St, San Francisco, CA",
  "eventType": "delivery",
  "confidence": 0.95
}
```

### MongoDB Schema

Events stored in MongoDB:
```javascript
{
  _id: ObjectId,
  userId: "google-user-id",
  emailId: "gmail-message-id",
  emailSubject: "Your package will arrive tomorrow",
  emailFrom: "shipping@amazon.com",
  emailDate: Date,
  eventTitle: "Amazon Package Delivery",
  eventDescription: "...",
  eventType: "delivery",
  startDateTime: Date,
  endDateTime: Date,
  location: "...",
  calendarEventId: "google-calendar-event-id",
  calendarSyncStatus: "synced",
  calendarSyncDate: Date,
  createdAt: Date,
  updatedAt: Date,
  aiConfidence: 0.95
}
```

## Cost Estimates

### Per Email
- **OpenAI API**: ~$0.0001 (GPT-4o-mini)
- **MongoDB**: Free (included in free tier)
- **Google APIs**: Free (within quotas)

### Monthly (100 emails/day)
- **Total**: ~$0.30/month

### Scale (1000 emails/day)
- **Total**: ~$3/month

All APIs have generous free tiers that should cover typical personal use.

## Troubleshooting

### Extension not processing emails
- Check Chrome extensions page for errors
- Open Developer Tools → Service Workers → Inspect
- Look for authentication errors in console

### Calendar events not being created
- Verify Calendar API is enabled in Google Cloud Console
- Check OAuth scopes include `calendar.events`
- Look for quota errors

### MongoDB sync failing
- Verify Realm App ID in `config/constants.js`
- Check MongoDB Atlas → App Services logs
- Ensure Google OAuth is configured in App Services

### AI not extracting events
- Verify OpenAI API key is valid
- Check API key has credits
- Review AI responses in debug logs

## Development

### Debug Mode

Enable detailed logging in `config/constants.js`:
```javascript
export const DEBUG = {
  ENABLED: true,
  LOG_EMAIL_CONTENT: true,
  LOG_AI_RESPONSES: true,
  LOG_API_CALLS: true
};
```

### Testing

1. Send yourself test emails with logistics content
2. Wait 5 minutes or click extension icon for manual sync
3. Check:
   - Console logs in Service Worker inspector
   - Google Calendar for new events
   - MongoDB Atlas for synced data

### Manual Trigger

Click extension icon to manually trigger email processing.

## Security & Privacy

- **Email content** is only sent to OpenAI for parsing (not stored)
- **OAuth tokens** are managed by Chrome (never exposed to code)
- **API keys** stored in Chrome's encrypted storage
- **MongoDB data** is user-scoped (can only see your own events)
- **Google permissions**: Read-only Gmail access, Calendar event creation only

## Frontend Integration

The atms.space frontend:
1. Authenticates with same Google OAuth
2. Uses MongoDB Realm Web SDK to query events
3. Displays events in calendar/list view
4. Shows real-time sync status

## Roadmap

- [ ] Add support for more email providers
- [ ] Improve AI prompt for better extraction
- [ ] Add event editing/deletion
- [ ] Support for recurring events
- [ ] Machine learning for sender classification
- [ ] Mobile app integration

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file

## Support

For issues:
1. Check [SETUP_GUIDE.md](SETUP_GUIDE.md) for configuration help
2. Review console logs for error details
3. Open an issue on GitHub with:
   - Chrome version
   - Error messages from console
   - Steps to reproduce

## Credits

Built with:
- [Chrome Extensions API](https://developer.chrome.com/docs/extensions/)
- [Gmail API](https://developers.google.com/gmail/api)
- [Google Calendar API](https://developers.google.com/calendar)
- [OpenAI API](https://platform.openai.com/)
- [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
- [MongoDB Realm Web SDK](https://www.mongodb.com/docs/realm/web/)

---

Made with ❤️ for automating the boring stuff
