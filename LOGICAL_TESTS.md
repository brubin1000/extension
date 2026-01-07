# ATMS Logical Tests & Edge Cases

## Test Suite 1: DOM Extraction Logic

### Test 1.1: Multiple body elements (forward/thread)
**Scenario**: Email is forwarded, has 3 `.a3s.aiL` elements
**Input**:
- bodyEl[0]: 10 links
- bodyEl[1]: 5 links (3 duplicates)
- bodyEl[2]: 8 links (5 duplicates)
**Expected**:
- Body text from bodyEl[2] (most recent)
- 15 unique links total (10 + 2 + 3)
**Current behavior**: ✅ Should work (forEach all elements, Set deduplicates)

### Test 1.2: No body elements found
**Scenario**: Gmail changed DOM, selector `.a3s.aiL` doesn't match
**Input**: bodyEls.length === 0
**Expected**:
- Console error: "No body elements found! Selector might be wrong."
- Return empty body string
- No crash
**Current behavior**: ✅ Handled (line 756)

### Test 1.3: Body element exists but is empty
**Scenario**: Email loaded but content not rendered yet
**Input**:
- bodyEls.length > 0
- bodyEl.innerText === ''
**Expected**:
- body === ''
- No links extracted
- Warning logged
**Current behavior**: ⚠️ No specific warning for empty body

---

## Test Suite 2: Link Extraction Logic

### Test 2.1: Duplicate URLs with different text
**Scenario**: Same URL linked multiple times
**Input**:
```html
<a href="http://example.com">Click Here</a>
<a href="http://example.com">Example Site</a>
```
**Expected**: Only first occurrence kept ("Click Here: http://example.com")
**Current behavior**: ✅ Set deduplicates by URL (line 743)

### Test 2.2: Mailto links
**Scenario**: Email has contact email links
**Input**: `<a href="mailto:test@example.com">Email Us</a>`
**Expected**: Filtered out (not added to allLinks)
**Current behavior**: ✅ Filtered (line 743: `!href.startsWith('mailto:')`)

### Test 2.3: Anchor links (internal page navigation)
**Scenario**: Email has table of contents with #anchors
**Input**: `<a href="#section-2">Go to Section 2</a>`
**Expected**: Filtered out
**Current behavior**: ✅ Filtered (line 743: `!href.startsWith('#')`)

### Test 2.4: Empty href attribute
**Scenario**: Malformed HTML with empty href
**Input**: `<a href="">Broken Link</a>`
**Expected**: Filtered out
**Current behavior**: ✅ Filtered (line 743: `if (href && text)`)

### Test 2.5: Link with no text content
**Scenario**: Image-only link or whitespace-only
**Input**: `<a href="http://example.com">   </a>`
**Expected**: Filtered out
**Current behavior**: ✅ Filtered (line 741: `text = a.textContent?.trim()`, line 743 checks text)

### Test 2.6: Nested links (invalid HTML but happens)
**Scenario**: `<a href="outer.com"><a href="inner.com">Text</a></a>`
**Expected**: Both links extracted? Or just one?
**Current behavior**: ⚠️ POTENTIAL BUG - querySelectorAll gets both, might get weird text

### Test 2.7: Google tracking URLs
**Scenario**: Gmail wraps URLs in google.com/url?q=...
**Input**: `<a href="https://www.google.com/url?q=https://realsite.com&...">Link</a>`
**Expected**: Should we extract the real URL or tracking URL?
**Current behavior**: ⚠️ Extracts tracking URL (might want to unwrap)

### Test 2.8: Extremely long link text
**Scenario**: Link text is 500+ chars
**Input**: `<a href="http://x.com">[500 char text]</a>`
**Expected**: Should truncate or keep full text?
**Current behavior**: ⚠️ Keeps full text (might make body huge)

---

## Test Suite 3: Body Text Truncation

### Test 3.1: Body under 10000 chars
**Scenario**: Normal email, 5000 chars
**Expected**: Full body + links appended
**Current behavior**: ✅ Works (line 776: substring(0, 10000))

### Test 3.2: Body exactly 10000 chars
**Scenario**: Body is exactly 10000, links are 500 chars
**Expected**: Links get truncated/cut off
**Current behavior**: ⚠️ BUG - Links appended AFTER substring, so total could be 10500

### Test 3.3: Body 9500 chars, links 1000 chars
**Scenario**: Links section partially fits
**Expected**: Some links included, some cut off
**Current behavior**: ⚠️ Links section might be incomplete

### Test 3.4: Links appended THEN truncated
**Current code**:
```javascript
body = bodyEl?.innerText?.trim() || '';  // Get full body
// ... extract links ...
body += '\n\n=== LINKS ... ===\n' + allLinks.join('\n');  // Append links
return { body: body.substring(0, 10000) };  // TRUNCATE AFTER
```
**Expected**: Links at end might get cut off if body is large
**Current behavior**: ⚠️ CONFIRMED BUG

---

## Test Suite 4: Gemini Prompt Logic

### Test 4.1: Links section at end of body
**Scenario**: Body is 9000 chars, links at end
**Gemini receives**: Last 500 chars show links section
**Expected**: Gemini sees links and extracts them
**Current behavior**: ✅ Should work if within 12000 char limit

### Test 4.2: Links section truncated
**Scenario**: Body 10000 chars, links section cut in middle
**Gemini receives**: Incomplete links section
**Expected**: Gemini might miss some links or get confused
**Current behavior**: ⚠️ Could happen if body is large

### Test 4.3: No links section in email
**Scenario**: Email has no hyperlinks (plain text)
**Expected**:
- No links section appended
- Gemini doesn't extract event_links
- event_links === undefined or []
**Current behavior**: ✅ Works (line 752: if allLinks.length > 0)

---

## Test Suite 5: Integration Tests

### Test 5.1: Full flow - EDC email
**Steps**:
1. Open EDC email in search view
2. Click "Add to ATMS"
3. Check console logs
4. Click "Add Event"
5. Verify extraction

**Expected Console Output**:
```
[ATMS] extractEmailContent: Found 1 body elements
[ATMS] extractEmailContent: Body text length: 8500
[ATMS] extractEmailContent: Body element 1 has 21 links
[ATMS] extractEmailContent: Extracted 21 unique links total
[ATMS] Button clicked - v5 (DOM extraction with links)
[ATMS] ✅ Extracted from DOM: {..., linkCount: 21, hasLinksSection: true}
[ATMS] ✅ Found 21 links in email
[ATMS] Sending to Gemini: {..., hasLinksSection: true, bodyEnd: "...=== LINKS..."}
```

**Expected Gemini Response**:
- event_links array with 15+ items
- important_deadlines array with dates
- All other fields populated

---

## Critical Bugs Found 🐛

### BUG 1: Body truncation happens AFTER links appended
**Location**: gmail-inject.js:776
**Current**:
```javascript
body += '\n\n=== LINKS EXTRACTED FROM EMAIL ===\n' + allLinks.join('\n');
// ...
return { body: body.substring(0, 10000) }
```
**Problem**: If body is 9500 chars and links are 1000 chars, we get 10500 chars, then truncate to 10000. Links section might be incomplete.

**Fix**: Should be:
```javascript
// Truncate body first, then append links
const maxBodyLength = 8000;  // Leave room for links
body = body.substring(0, maxBodyLength);

if (allLinks.length > 0) {
  body += '\n\n=== LINKS EXTRACTED FROM EMAIL ===\n' + allLinks.join('\n');
}

// Final safety truncation (should rarely hit this)
return { body: body.substring(0, 12000) }
```

---

### BUG 2: No warning for empty body element
**Location**: gmail-inject.js:729
**Problem**: If bodyEl exists but is empty (content not loaded yet), we silently fail
**Fix**: Add check:
```javascript
if (!body || body.length < 50) {
  console.warn('[ATMS] Body element found but content is empty or very short. Page might not be fully loaded.');
}
```

---

### BUG 3: Google tracking URL wrappers not unwrapped
**Location**: gmail-inject.js:740
**Problem**: Gmail wraps external links in google.com/url?q=REAL_URL tracking wrapper
**Impact**: Gemini sees tracking URL instead of real URL
**Fix**: Add URL unwrapping:
```javascript
let href = a.getAttribute('href');
// Unwrap Google tracking URLs
if (href && href.includes('google.com/url?q=')) {
  try {
    const url = new URL(href);
    const realUrl = url.searchParams.get('q');
    if (realUrl) href = realUrl;
  } catch (e) {
    // Keep original if parsing fails
  }
}
```

---

### BUG 4: Service worker body limit doesn't match content script
**Location**:
- Content script truncates to 10000 (gmail-inject.js:776)
- Service worker expects up to 12000 (ai-parser.js:199)
**Problem**: Inconsistent limits, might cause confusion
**Fix**: Use same constant in both places

---

## Edge Cases to Handle

### Edge Case 1: Gmail DOM changes
**Symptom**: bodyEls.length === 0
**Detection**: Console error "No body elements found!"
**Recovery**:
1. Log full page HTML structure to debug
2. Try fallback selectors
3. Alert user to refresh page

### Edge Case 2: Very long email (20000+ chars)
**Symptom**: Body gets heavily truncated, links at end get cut off
**Detection**: body.length === 10000 && allLinks.length > 0
**Recovery**: Warn user that email is very long, some content may be missed

### Edge Case 3: Email in different language
**Symptom**: Text encoding issues, special characters
**Detection**: Check for character encoding
**Recovery**: Should work fine, but log warning if text has lots of replacement characters (�)

### Edge Case 4: Email with inline images/attachments
**Symptom**: Body might include base64 data URLs
**Detection**: href.startsWith('data:')
**Recovery**: Filter these out like mailto:

---

## Recommended Additions

### Addition 1: Debug mode flag
```javascript
const DEBUG_MODE = true;  // Set via chrome.storage

if (DEBUG_MODE) {
  console.log('[ATMS DEBUG] Full extracted body:');
  console.log(body);
}
```

### Addition 2: Link extraction stats
```javascript
console.log('[ATMS] Link extraction stats:', {
  totalLinksInDOM: document.querySelectorAll('.a3s.aiL a[href]').length,
  linksParsed: linkEls.length,
  linksFiltered: allLinks.length,
  mailtoFiltered: /* count */,
  anchorFiltered: /* count */,
  duplicatesFiltered: /* count */
});
```

### Addition 3: Body size warning
```javascript
if (body.length >= 10000) {
  console.warn('[ATMS] Body text reached maximum length. Some content may be truncated.');
}
```

---

## Test Priority

**HIGH PRIORITY (Fix Now)**:
- [ ] BUG 1: Body truncation before link append
- [ ] Test 5.1: Full EDC email flow
- [ ] Test 2.1: Duplicate URL handling

**MEDIUM PRIORITY (Fix Soon)**:
- [ ] BUG 2: Empty body warning
- [ ] BUG 3: Google tracking URL unwrapping
- [ ] Test 3.3: Body size edge cases

**LOW PRIORITY (Nice to Have)**:
- [ ] Test 2.8: Long link text handling
- [ ] Addition 1-3: Debug improvements
- [ ] Edge Case 2: Very long email warning
