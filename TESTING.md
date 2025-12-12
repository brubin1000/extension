# Testing Guide

This guide helps you test the Email to Calendar AI Agent extension to ensure it's working correctly.

## Pre-Testing Checklist

Before testing, ensure:
- [ ] Extension is loaded in Chrome
- [ ] MongoDB Atlas App Services configured
- [ ] Google Cloud APIs enabled (Gmail, Calendar)
- [ ] OAuth credentials configured
- [ ] OpenAI API key set up
- [ ] Extension icon clicked and setup completed

## Testing Strategy

### 1. Manual Testing with Real Emails

#### Test Case 1: Basic Delivery Email

**Send yourself this email:**
```
From: shipping@example.com
Subject: Your Package Will Arrive Tomorrow

Hello,

Your package will be delivered tomorrow (December 12) between 2:00 PM and 6:00 PM.

Delivery Address:
123 Main Street
San Francisco, CA 94102

Tracking Number: 1Z999AA10123456784

Thank you for your order!
```

**Expected Result:**
- Calendar event created with title "Package Delivery" or similar
- Start time: Tomorrow at 2:00 PM
- End time: Tomorrow at 6:00 PM
- Location: 123 Main Street, San Francisco, CA 94102
- Description includes tracking number
- Event synced to MongoDB

**How to Verify:**
1. Wait 5 minutes or click extension icon
2. Check Google Calendar for new event
3. Check MongoDB Atlas → Browse Collections → events
4. Look for notification (if enabled)

---

#### Test Case 2: Flight Booking Confirmation

**Send yourself this email:**
```
From: bookings@airline.com
Subject: Flight Confirmation - Flight UA123

Your flight is confirmed!

Flight: UA123
Date: December 15, 2024
Departure: 10:30 AM from San Francisco (SFO)
Arrival: 6:45 PM in New York (JFK)

Confirmation Code: ABC123
```

**Expected Result:**
- Event type: flight
- Title: "Flight UA123" or "UA123 to New York"
- Start: Dec 15 at 10:30 AM
- Location: San Francisco (SFO)
- Description includes confirmation code

---

#### Test Case 3: Hotel Reservation

**Send yourself this email:**
```
From: reservations@hotel.com
Subject: Hotel Reservation Confirmation

Thank you for your reservation!

Hotel: Grand Plaza Hotel
Check-in: Friday, December 20, 2024 at 3:00 PM
Check-out: Sunday, December 22, 2024 at 11:00 AM
Address: 456 Market Street, San Francisco, CA

Confirmation: HOTEL789
```

**Expected Result:**
- Event type: hotel
- Two events created (check-in and check-out) OR one multi-day event
- Dates: Dec 20 - Dec 22
- Location: 456 Market Street

---

#### Test Case 4: Non-Logistics Email (Should NOT Create Event)

**Send yourself this email:**
```
From: newsletter@news.com
Subject: Weekly Newsletter - Tech News

Hello,

Here are this week's top tech stories...

[Newsletter content]
```

**Expected Result:**
- NO calendar event created
- Email marked as processed
- No MongoDB entry

---

#### Test Case 5: Relative Date Parsing

**Send yourself this email (adjust "tomorrow" to whatever day makes sense):**
```
From: service@company.com
Subject: Appointment Reminder

Your appointment is scheduled for next Monday at 9:00 AM.

Location: 789 Oak Street, San Jose, CA
```

**Expected Result:**
- AI correctly converts "next Monday" to absolute date
- Event created for correct Monday date at 9:00 AM

---

### 2. Extension Functionality Tests

#### Test: Manual Sync

1. Click extension icon
2. Should show "Checking for new emails..." notification
3. Should complete and show "Sync Complete" notification

**Expected:** No errors in console, processing completes successfully

---

#### Test: Authentication Flow

1. Clear extension data: Go to `chrome://extensions` → Remove extension → Reinstall
2. Click extension icon
3. Should prompt for Google OAuth authorization
4. After authorizing, should complete setup

**Expected:** Successful authentication, no errors

---

#### Test: Duplicate Prevention

1. Send yourself a test email
2. Wait for processing (or trigger manually)
3. Trigger manual sync again
4. Check calendar and MongoDB

**Expected:** Only ONE event created (no duplicates)

---

### 3. Error Handling Tests

#### Test: Invalid OpenAI Key

1. Go to Chrome DevTools → Application → Storage → Chrome Storage
2. Set invalid OpenAI key
3. Trigger email processing

**Expected:** Error logged, graceful failure, no crash

---

#### Test: Network Failure Simulation

1. Disconnect internet
2. Trigger email processing
3. Reconnect internet

**Expected:** Retry logic kicks in, eventually succeeds

---

#### Test: Rate Limiting

1. Send 50 test emails at once
2. Trigger processing

**Expected:** Extension processes them with appropriate delays, respects rate limits

---

### 4. MongoDB Sync Verification

#### Check MongoDB Data

1. Go to MongoDB Atlas
2. Navigate to your cluster → Browse Collections
3. Select `email_calendar` database → `events` collection

**Verify:**
- [ ] Events have correct userId (your Google user ID)
- [ ] All required fields are populated
- [ ] calendarSyncStatus is "synced"
- [ ] Dates are stored as Date objects (not strings)
- [ ] Event types are correct

---

#### Test MongoDB Query (from Frontend)

If you have the frontend running:

1. Log in to atms.space with same Google account
2. View events page

**Expected:** All events from extension appear in frontend

---

### 5. Calendar Integration Tests

#### Check Calendar Events

1. Open Google Calendar
2. Look for events with "Auto-created from email" in description

**Verify:**
- [ ] Event times are correct
- [ ] Timezone is handled properly
- [ ] Reminders are set (30min popup, 1hr email)
- [ ] Link to original email works

---

#### Test Event Update

Currently not implemented, but you can manually test:
1. In Calendar, edit an auto-created event
2. Check if MongoDB reflects changes (currently won't - one-way sync)

---

### 6. Performance Tests

#### Test: Large Volume

1. Send yourself 20+ test emails
2. Trigger processing
3. Monitor memory and CPU usage

**Expected:** 
- All emails processed within reasonable time
- No memory leaks
- Service worker doesn't crash

---

#### Test: Long Running

1. Let extension run for 24 hours
2. Check processed emails count
3. Verify no accumulating errors

**Expected:** Stable operation, no degradation

---

### 7. Debug Console Checks

Open Service Worker console:
1. Go to `chrome://extensions`
2. Click "Service worker" under your extension
3. Watch console output

**What to Look For:**

✅ **Good Signs:**
```
[Email Calendar Agent] [INFO] Alarm set to check emails every 5 minutes
[Email Calendar Agent] [INFO] Extension ready and authenticated
[Email Calendar Agent] [INFO] Processing email: Your Package Will Arrive Tomorrow
[Email Calendar Agent] [INFO] Logistics event detected: Package Delivery (delivery)
[Email Calendar Agent] [INFO] Calendar event created: abc123xyz
[Email Calendar Agent] [INFO] Event synced to MongoDB
```

❌ **Bad Signs:**
```
[Email Calendar Agent] [ERROR] Gmail API authentication failed
[Email Calendar Agent] [ERROR] OpenAI API error: 401
[Email Calendar Agent] [ERROR] Failed to sync event to MongoDB
```

---

## Automated Test Scenarios

### Quick Test Script

You can create test emails programmatically:

```javascript
// Run in browser console on Gmail
// (Note: This is pseudocode - actual Gmail API calls needed)

const testEmails = [
  {
    subject: "Package Delivery Tomorrow",
    body: "Your package arrives tomorrow at 2 PM at 123 Main St"
  },
  {
    subject: "Flight Confirmation",
    body: "Flight UA123 on Dec 15 at 10:30 AM from SFO"
  }
  // ... more test cases
];

// Send each test email to yourself
testEmails.forEach(email => {
  // Use Gmail API to send
});
```

---

## Testing Checklist

Use this checklist for comprehensive testing:

### Setup
- [ ] Extension loads without errors
- [ ] Authentication completes successfully
- [ ] All APIs are accessible (Gmail, Calendar, OpenAI, MongoDB)

### Core Functionality
- [ ] Emails are fetched from Gmail
- [ ] Logistics emails are identified correctly
- [ ] Non-logistics emails are filtered out
- [ ] AI extracts event details accurately
- [ ] Calendar events are created successfully
- [ ] Events are synced to MongoDB

### Edge Cases
- [ ] Duplicate emails don't create duplicate events
- [ ] Emails without dates are handled gracefully
- [ ] Relative dates are converted correctly
- [ ] HTML emails are parsed properly
- [ ] Very long emails are handled
- [ ] Emails in different timezones work

### Error Handling
- [ ] Invalid API keys show proper errors
- [ ] Network failures are retried
- [ ] Authentication failures are handled
- [ ] Partial failures don't crash extension

### Performance
- [ ] Processing 20+ emails completes in reasonable time
- [ ] Memory usage remains stable
- [ ] No service worker crashes

### Integration
- [ ] Events appear in Google Calendar
- [ ] Events appear in MongoDB Atlas
- [ ] Frontend can query events (if applicable)

---

## Troubleshooting Failed Tests

### Email Not Processed

**Check:**
1. Is email in spam/trash? (Excluded by default)
2. Does email contain logistics keywords?
3. Check console for AI parsing result
4. Verify email wasn't already processed

---

### Calendar Event Not Created

**Check:**
1. Calendar API enabled in Google Cloud?
2. OAuth scopes include calendar.events?
3. Check console for Calendar API errors
4. Verify event has valid start date/time

---

### MongoDB Sync Failed

**Check:**
1. Realm App ID correct in constants.js?
2. MongoDB Atlas → App Services → Logs for errors
3. Authentication successful?
4. Check network tab for failed requests

---

### AI Not Extracting Correctly

**Check:**
1. OpenAI API key valid and has credits?
2. Email body being truncated too much?
3. Enable LOG_AI_RESPONSES to see what AI returns
4. Try with simpler test email first

---

## Test Results Documentation

Document your test results:

```markdown
## Test Run: [Date]

### Environment
- Chrome Version: 
- Extension Version: 
- OS: 

### Test Results

| Test Case | Status | Notes |
|-----------|--------|-------|
| Basic Delivery | ✅ Pass | Event created correctly |
| Flight Booking | ✅ Pass | |
| Hotel Reservation | ❌ Fail | Created only check-in event |
| Non-Logistics | ✅ Pass | Correctly ignored |

### Issues Found
1. Hotel checkout event not created
2. ...

### Action Items
- [ ] Fix hotel checkout logic
- [ ] ...
```

---

## Continuous Testing

### Daily Monitoring

Check these daily:
1. Extension is still running (check last poll time)
2. No accumulated errors in console
3. Recent events in Calendar match emails
4. MongoDB event count is increasing appropriately

### Weekly Review

Check weekly:
1. Review all created events for accuracy
2. Check for any missed logistics emails
3. Review MongoDB data for anomalies
4. Check API usage and costs

---

## Success Criteria

The extension is working correctly when:
- ✅ 95%+ of logistics emails are detected
- ✅ <5% false positives (non-logistics creating events)
- ✅ Calendar events match email details accurately
- ✅ MongoDB sync succeeds 99%+ of the time
- ✅ No service worker crashes
- ✅ Processing completes within 5 minutes of email receipt

---

## Reporting Issues

When reporting issues, include:
1. Chrome version
2. Full console logs from Service Worker
3. Example email that failed (sanitized)
4. Expected vs actual behavior
5. MongoDB and Calendar state

---

Good luck with testing! 🚀

