# ATMS Sanity Tests

## Quick Console Tests

### Test 1: Check Link Extraction (Run in Gmail Console)

```javascript
// Test that links are in the DOM
const linkCount = document.querySelectorAll('.a3s.aiL a[href]').length;
console.log(`Total links in DOM: ${linkCount}`);

// Test body elements
const bodyEls = document.querySelectorAll('.a3s.aiL');
console.log(`Body elements found: ${bodyEls.length}`);

bodyEls.forEach((el, i) => {
  const links = el.querySelectorAll('a[href]').length;
  console.log(`Body element ${i + 1}: ${links} links`);
});
```

**Expected**: Should show 21+ links for EDC email

---

### Test 2: Full Extraction Test (Run in Gmail Console)

```javascript
// Test the actual extractEmailContent function
const GMAIL_SELECTORS = {
  body: '[role="main"] .a3s.aiL, [role="main"] .a3s',
  subject: '[role="main"] h2[data-thread-perm-id], [role="main"] .hP',
};

const bodyEls = document.querySelectorAll(GMAIL_SELECTORS.body);
console.log(`Found ${bodyEls.length} body elements`);

const allLinks = [];
const seenUrls = new Set();

bodyEls.forEach((el, index) => {
  const linkEls = el?.querySelectorAll('a[href]') || [];
  console.log(`Body element ${index + 1} has ${linkEls.length} links`);

  linkEls.forEach(a => {
    const href = a.getAttribute('href');
    const text = a.textContent?.trim();
    if (href && text && !href.startsWith('mailto:') && !href.startsWith('#') && !seenUrls.has(href)) {
      seenUrls.add(href);
      allLinks.push({text, href});
    }
  });
});

console.log(`Total unique links extracted: ${allLinks.length}`);
console.table(allLinks.slice(0, 10)); // Show first 10
```

**Expected**: Should extract all 21 links without duplicates

---

### Test 3: Check What's Sent to Gemini (After clicking "Add Event")

Look for these console logs:
```
[ATMS] extractEmailContent: Found X body elements
[ATMS] extractEmailContent: Body element 1 has X links
[ATMS] extractEmailContent: Extracted X unique links total
[ATMS] ✅ Found X links in email
[ATMS] Sending to Gemini: {...hasLinksSection: true...}
```

**Expected**:
- hasLinksSection: true
- bodyEnd should show "=== LINKS EXTRACTED FROM EMAIL ===" section

---

## Common Issues & Fixes

### Issue: No links extracted (linkCount: 0)

**Possible causes:**
1. Body selector not finding elements → Check `bodyEls.length`
2. Links are mailto: or # → Check raw link hrefs
3. Content script not reloaded → Hard refresh Gmail

**Fix:**
```javascript
// Debug: Check what selector matches
console.log('Body elements:', document.querySelectorAll('.a3s.aiL').length);
console.log('Links in first body:', document.querySelector('.a3s.aiL')?.querySelectorAll('a[href]').length);
```

---

### Issue: Links extracted but not sent to Gemini

**Possible causes:**
1. hasLinksSection is false → Text mismatch bug
2. Links not appended to body → Check bodyEnd in logs
3. Body length too short (truncated before links)

**Fix:**
```javascript
// Check if links section exists in emailData
console.log(eventState.emailData.body.includes('=== LINKS EXTRACTED FROM EMAIL ==='));
console.log(eventState.emailData.body.substring(eventState.emailData.body.length - 500));
```

---

### Issue: Gemini not extracting links from body

**Check service worker logs:**
```
[INFO] Email body length: XXXX
[INFO] Email body preview (last 500 chars): ...should show links section...
```

**If links are in body but Gemini doesn't extract:**
- Prompt might need updating (check ai-parser.js line 238-240)
- Body might be truncated before links (check 12000 char limit)

---

## Automated Test Checklist

Before testing extraction:
- [ ] Gmail console shows "extractEmailContent: Found X body elements" (X > 0)
- [ ] Each body element shows link count
- [ ] Total unique links > 0
- [ ] Console shows "Found X links in email"

After clicking "Add Event":
- [ ] Console shows "Sending to Gemini" with hasLinksSection: true
- [ ] bodyEnd preview shows links section
- [ ] Service worker logs show email body length > 5000
- [ ] Gemini response includes event_links array with multiple URLs

After extraction completes:
- [ ] UI shows event_links section with labeled links
- [ ] All important links are captured (artist letter, advance form, guest list, etc.)
- [ ] Link descriptions match link purpose

---

## Expected Results for EDC Email

**DOM Check:**
- Body elements: 1-3 (depends on email thread depth)
- Total links in DOM: 21+
- Unique links extracted: 15-21 (after filtering mailto/duplicates)

**Extraction:**
- hasLinksSection: true
- linkCount: 15-21
- Body length: 8000-10000 chars

**Gemini Output:**
- event_links array with 10+ items
- Each link has {url, description}
- Important links captured: Artist Letter, Advance Form, Guest List Link, Ticket Link, Hotel Link, Shuttle Link

---

## Quick Fix Commands

### Force reload content script:
```bash
# In chrome://extensions
1. Remove ATMS extension
2. Wait 3 seconds
3. Load unpacked
4. Hard refresh Gmail (Cmd+Shift+R)
```

### Clear cached email data:
```javascript
// In Gmail console
chrome.storage.local.remove('currentEmailData');
```

### Check what's in storage:
```javascript
// In Gmail console
chrome.storage.local.get(null, (data) => console.log(data));
```
