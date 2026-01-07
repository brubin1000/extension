# Quick Start Guide

Get your Email to Calendar AI Agent up and running in 10 minutes!

## Prerequisites

✅ Google Account with Gmail  
✅ Chrome browser  
✅ 10 minutes of setup time

## Step-by-Step Setup

### 1. Get Your API Keys (5 minutes)

#### MongoDB Atlas (Free)
1. Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Sign up for free account
3. Create a free M0 cluster
4. Go to "App Services" → Create new app
5. Copy your **Realm App ID** (looks like: `email-calendar-xxxxx`)

#### OpenAI API Key
1. Go to [platform.openai.com](https://platform.openai.com/)
2. Sign up and add payment method
3. Go to API Keys → Create new key
4. Copy and save the key securely
5. **Cost**: ~$0.30/month for 100 emails

### 2. Configure Google Cloud (3 minutes)

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Create new project: "Email Calendar Agent"
3. Enable APIs:
   - Click "Enable APIs and Services"
   - Search and enable: **Gmail API**
   - Search and enable: **Google Calendar API**
4. Create OAuth credentials:
   - Go to "Credentials" → "Create Credentials" → "OAuth client ID"
   - Application type: **Chrome Extension**
   - Note: You'll need to add your extension ID after installation

### 3. Install Extension (2 minutes)

1. **Clone or download** this repository
2. Open `config/constants.js` and update:
   ```javascript
   export const MONGODB_REALM_APP_ID = 'your-app-id-here';
   ```
3. Open Chrome and go to `chrome://extensions`
4. Enable **"Developer mode"** (toggle in top right)
5. Click **"Load unpacked"**
6. Select the `bjq` folder
7. **Copy the Extension ID** (string of letters that appears)

### 4. Complete OAuth Setup (1 minute)

1. Go back to [Google Cloud Console](https://console.cloud.google.com/)
2. Go to your project → "Credentials"
3. Edit the OAuth client ID you created
4. Paste your Extension ID
5. Update `manifest.json` with your OAuth client ID:
   ```json
   "oauth2": {
     "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
     ...
   }
   ```

### 5. First Run (1 minute)

1. Click the extension icon in Chrome toolbar
2. Follow the prompts:
   - ✅ Authorize Google (Gmail + Calendar access)
   - ✅ Enter your OpenAI API key when prompted
3. Done! Extension is now running

## Test It Out

Send yourself this test email:

```
To: yourself@gmail.com
Subject: Test Delivery Tomorrow

Your package will arrive tomorrow at 2:00 PM
at 123 Main Street, San Francisco, CA 94102.

Tracking: TEST123
```

**Wait 5 minutes** (or click extension icon to sync manually)

Check:
- ✅ Google Calendar for new event
- ✅ MongoDB Atlas → Browse Collections → events
- ✅ Notification appears (if enabled)

## Configuration Options

Edit `config/constants.js` to customize:

```javascript
// How often to check emails (in minutes)
export const POLL_INTERVAL_MINUTES = 5;

// How far back to look for emails (in hours)
export const EMAIL_LOOKBACK_HOURS = 24;

// Add custom keywords to detect
export const LOGISTICS_KEYWORDS = [
  'delivery', 'shipped', 'tracking',
  // Add your own...
];
```

## Common Issues

### "Setup not complete" notification
➡️ Click extension icon to complete OAuth authorization

### Calendar events not appearing
➡️ Check that Calendar API is enabled in Google Cloud Console  
➡️ Verify OAuth scopes include `calendar.events`

### MongoDB sync failing
➡️ Double-check Realm App ID in constants.js  
➡️ Ensure Google OAuth is configured in MongoDB App Services

### AI not extracting events
➡️ Verify OpenAI API key is correct  
➡️ Check API key has available credits  
➡️ Try with a simpler test email first

## Monitoring

### Check Extension Status

Open DevTools console:
1. Go to `chrome://extensions`
2. Find your extension
3. Click "Service worker" → "inspect"
4. Look for logs like:
   ```
   [Email Calendar Agent] [INFO] Extension ready and authenticated
   [Email Calendar Agent] [INFO] Alarm set to check emails every 5 minutes
   ```

### View Statistics

Check MongoDB Atlas:
- Total events created
- Recent events
- Sync status

## Next Steps

✅ **Read the full docs**
- [README.md](README.md) - Complete feature list
- [SETUP_GUIDE.md](SETUP_GUIDE.md) - Detailed setup
- [TESTING.md](TESTING.md) - Test scenarios

✅ **Customize settings**
- Adjust polling frequency
- Add custom keywords
- Configure notifications

✅ **Set up frontend**
- Deploy atms.space frontend
- View events in web dashboard
- Access analytics

## Support

Need help?
- 📖 Check [SETUP_GUIDE.md](SETUP_GUIDE.md) for detailed instructions
- 🐛 Open an issue on GitHub
- 📧 Contact support

## Costs

**Estimated monthly costs:**
- MongoDB Atlas: **$0** (free tier)
- Google APIs: **$0** (free)
- OpenAI API: **$0.30** (100 emails/day)

**Total: ~$0.30/month** for typical personal use

---

## Checklist

Setup complete when you can check all these:

- [ ] Extension loaded in Chrome
- [ ] MongoDB Realm App ID configured
- [ ] Google OAuth working
- [ ] OpenAI API key set
- [ ] Test email processed successfully
- [ ] Event appears in Google Calendar
- [ ] Event synced to MongoDB

---

**Congratulations! Your Email to Calendar AI Agent is now running! 🎉**

The extension will automatically monitor your Gmail every 5 minutes and create calendar events for any logistics emails it finds.

Sit back and let AI handle your scheduling! ✨

