# Deployment Guide

This guide covers deploying the Email to Calendar AI Agent extension.

## Deployment Options

### Option 1: Developer Mode (Testing)

**Best for:** Personal use, testing, development

1. **Load Extension**
   ```bash
   # Navigate to chrome://extensions
   # Enable "Developer mode"
   # Click "Load unpacked"
   # Select the bjq directory
   ```

2. **Update Extension**
   ```bash
   # After making changes:
   # Go to chrome://extensions
   # Click reload icon on your extension
   ```

**Pros:**
- Easy to update and test
- No approval process
- Free

**Cons:**
- Must be installed manually on each Chrome profile
- Shows "developer mode" warning
- Not suitable for distribution

---

### Option 2: Private Distribution (.crx file)

**Best for:** Small team, controlled distribution

1. **Package Extension**
   ```bash
   # Go to chrome://extensions
   # Pack extension (button in top right)
   # Select bjq directory
   # Creates bjq.crx and bjq.pem files
   ```

2. **Distribute**
   - Share .crx file via secure channel
   - Users drag .crx to chrome://extensions

**Important:** Keep the .pem file secure! It's your private key.

**Pros:**
- Can share with specific users
- No Chrome Web Store approval needed

**Cons:**
- Chrome blocks installation from outside Web Store (requires user to enable)
- Manual installation process
- No automatic updates

---

### Option 3: Chrome Web Store (Public)

**Best for:** Public distribution, wide audience

#### Prerequisites

1. **Chrome Web Store Developer Account**
   - Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   - Pay one-time $5 registration fee
   - Complete developer profile

2. **Extension Icons**
   - Create icons: 16x16, 48x48, 128x128 pixels
   - Add to `icons/` folder

3. **Screenshots**
   - Prepare 1-5 screenshots (1280x800 or 640x400)
   - Show extension in action

4. **Promotional Images**
   - Small tile: 440x280 (required)
   - Marquee: 1400x560 (optional)

#### Publishing Steps

1. **Prepare Package**
   ```bash
   # Remove dev files
   rm -rf node_modules
   rm -rf .git
   
   # Install production dependencies only
   npm install --production
   
   # Create zip
   zip -r email-calendar-agent.zip . -x "*.git*" "node_modules/*" "*.DS_Store"
   ```

2. **Upload to Store**
   - Go to Developer Dashboard
   - Click "New Item"
   - Upload zip file
   - Fill in store listing:
     - Name: Email to Calendar AI Agent
     - Description: (use from README.md)
     - Category: Productivity
     - Language: English

3. **Store Listing Details**

   **Short Description (132 chars max):**
   ```
   Automatically extracts logistics schedules from Gmail and creates Google Calendar events using AI. Syncs to MongoDB.
   ```

   **Full Description:**
   ```markdown
   Email to Calendar AI Agent automatically monitors your Gmail for logistics-related emails (deliveries, appointments, flights, bookings, etc.) and intelligently creates Google Calendar events.

   🤖 AI-POWERED EXTRACTION
   Uses OpenAI GPT-4o-mini to understand emails and extract:
   • Event titles and descriptions
   • Dates and times (even from relative dates like "tomorrow")
   • Locations and addresses
   • Event types (delivery, flight, appointment, etc.)

   📧 GMAIL INTEGRATION
   • Monitors your Gmail automatically every 5 minutes
   • Focuses on logistics emails from known providers
   • Filters out newsletters and spam
   • Prevents duplicate events

   📅 CALENDAR SYNC
   • Creates events in your Google Calendar
   • Adds smart reminders (30min popup, 1hr email)
   • Links back to original email
   • Handles timezones correctly

   💾 CLOUD SYNC
   • Stores all events in MongoDB Atlas
   • Access from web dashboard at atms.space
   • View processing history and analytics

   🔒 SECURE & PRIVATE
   • Uses Google OAuth 2.0
   • No email storage - only event data
   • You control your data
   • Open source code

   PERFECT FOR:
   • Online shoppers tracking deliveries
   • Frequent travelers managing bookings
   • Anyone tired of manually adding events

   SETUP REQUIRED:
   • Google Account (Gmail + Calendar)
   • MongoDB Atlas account (free tier)
   • OpenAI API key (very low cost: ~$0.30/month for 100 emails)

   No UI required - runs automatically in background!
   ```

4. **Privacy Practices**
   - Justify permissions:
     - `identity`: For Google OAuth authentication
     - `storage`: Store processed email IDs and settings
     - `alarms`: Schedule periodic email checks
     - `notifications`: Alert when events are created
   - Data usage:
     - "Email data is sent to OpenAI for processing only, not stored"
     - "Event data is stored in your personal MongoDB database"
   - Privacy policy: Create one (see template below)

5. **Submit for Review**
   - Click "Submit for review"
   - Review typically takes 1-3 business days
   - May be asked for clarifications

---

### Option 4: Enterprise Deployment (Google Workspace)

**Best for:** Company-wide deployment

1. **Configure for Workspace**
   - Use Workspace OAuth client
   - Add to approved extensions list
   - Deploy via admin console

2. **Enterprise Policies**
   ```json
   {
     "ExtensionSettings": {
       "YOUR_EXTENSION_ID": {
         "installation_mode": "force_installed",
         "update_url": "https://clients2.google.com/service/update2/crx"
       }
     }
   }
   ```

---

## Pre-Deployment Checklist

Before deploying:

- [ ] All configuration complete in `config/constants.js`
- [ ] Icons added to `icons/` folder
- [ ] Tested with real emails
- [ ] MongoDB Atlas configured
- [ ] Google Cloud APIs enabled
- [ ] README.md and SETUP_GUIDE.md reviewed
- [ ] Version number updated in manifest.json
- [ ] No hardcoded API keys in code
- [ ] Error handling tested
- [ ] Privacy policy created (if public)

---

## Privacy Policy Template

Required for Chrome Web Store:

```markdown
# Privacy Policy for Email to Calendar AI Agent

Last Updated: [Date]

## Data Collection

Email to Calendar AI Agent collects and processes the following data:

1. **Email Content**
   - Purpose: Extract logistics event information
   - Processing: Sent to OpenAI API for parsing
   - Storage: NOT stored by the extension
   - Retention: Processed in real-time, not retained

2. **Event Data**
   - Purpose: Store extracted event information
   - Storage: Your personal MongoDB Atlas database
   - Retention: Until you delete it
   - Data: Event titles, dates, locations, descriptions

3. **Authentication Tokens**
   - Purpose: Access Gmail and Calendar APIs
   - Storage: Chrome's secure storage
   - Retention: Until you revoke access

4. **Processed Email IDs**
   - Purpose: Prevent duplicate processing
   - Storage: Chrome's local storage
   - Retention: Last 1000 email IDs

## Third-Party Services

This extension uses:

1. **Google APIs** (Gmail, Calendar)
   - Privacy Policy: https://policies.google.com/privacy

2. **OpenAI API**
   - Privacy Policy: https://openai.com/privacy

3. **MongoDB Atlas**
   - Privacy Policy: https://www.mongodb.com/legal/privacy-policy

## Your Rights

You can:
- Revoke extension permissions at any time
- Delete your MongoDB data
- Request data export
- Delete the extension and all local data

## Security

- OAuth 2.0 for authentication
- No email content stored
- Encrypted storage for tokens
- User-scoped database access

## Contact

Questions: [your-email@example.com]

## Changes

We'll notify you of privacy policy changes via extension updates.
```

---

## Version Management

### Semantic Versioning

Use semantic versioning: MAJOR.MINOR.PATCH

```json
{
  "version": "1.0.0"
}
```

- **MAJOR**: Breaking changes
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes

### Update Process

1. Update version in `manifest.json`
2. Document changes in CHANGELOG.md
3. Test thoroughly
4. Package and upload to Chrome Web Store
5. Users auto-update within hours

---

## Monitoring Post-Deployment

### User Feedback

Monitor:
- Chrome Web Store reviews
- GitHub issues
- Support email
- User analytics (if implemented)

### Error Tracking

Consider adding:
- Sentry for error tracking
- Google Analytics for usage stats
- Custom logging to your backend

### Key Metrics

Track:
- Daily active users
- Events created per user
- Error rates
- API costs (OpenAI, MongoDB)

---

## Rollback Plan

If issues arise:

1. **Quick Fix**
   - Fix bug
   - Increment patch version
   - Publish update

2. **Major Issue**
   - Unpublish from Chrome Web Store
   - Fix issue
   - Republish with fixes

3. **User Communication**
   - Update store listing with known issues
   - Post updates on GitHub
   - Email users if possible

---

## Costs at Scale

Plan for costs as usage grows:

**Per User/Month (100 emails)**
- OpenAI: $0.30
- MongoDB: Free (up to 512MB)
- Google APIs: Free

**1000 Users**
- OpenAI: $300/month
- MongoDB: ~$57/month (M2 cluster)
- Total: ~$357/month

**10,000 Users**
- Consider dedicated OpenAI plan
- MongoDB M10+ cluster
- Budget: ~$2000-3000/month

---

## Support Plan

### Self-Service

- Comprehensive README.md
- SETUP_GUIDE.md
- TESTING.md
- FAQ section

### Community Support

- GitHub issues
- Community forum
- Discord/Slack channel

### Paid Support (Optional)

- Email support
- Priority bug fixes
- Custom deployment assistance
- SLA guarantees

---

## Legal Considerations

### Terms of Service

Create terms covering:
- Acceptable use
- Service limitations
- Liability disclaimers
- Termination conditions

### License

Current: MIT License
- Open source
- Free to use, modify, distribute
- No warranty

Consider:
- Commercial license for enterprise
- Different license for Chrome Web Store version

---

## Success Metrics

Track these to measure deployment success:

- **Installation Rate**: Installs per day
- **Retention**: Active users after 7/30 days
- **Event Creation**: Average events per user
- **Error Rate**: % of emails that fail processing
- **User Satisfaction**: Star rating, reviews

---

## Next Steps

After deployment:

1. Monitor error logs daily
2. Respond to user feedback
3. Plan feature updates
4. Optimize costs
5. Build community
6. Consider monetization (if applicable)

---

## Resources

- [Chrome Web Store Developer Documentation](https://developer.chrome.com/docs/webstore/)
- [Extension Distribution](https://developer.chrome.com/docs/extensions/mv3/linux_hosting/)
- [Publishing Guide](https://developer.chrome.com/docs/webstore/publish/)

---

Good luck with your deployment! 🚀

