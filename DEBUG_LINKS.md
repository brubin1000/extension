# Link Extraction Debug

## What We're Seeing

**Total links found**: 97 (37 + 60)
**Unique links extracted**: 13
**Filtered out**: 84 links

## Why Are Links Being Filtered?

Our filter logic removes:
1. **Duplicates** - Same URL appears multiple times (most common!)
2. **mailto:** links - Email addresses
3. **#** anchors - Internal page navigation
4. **data:** URLs - Inline images
5. **Empty** href or text

## Test in Console

Run this in Gmail console to see what's being filtered:

```javascript
// Get all links
const bodyEls = document.querySelectorAll('.a3s.aiL');
const allLinks = [];

bodyEls.forEach((el, index) => {
  console.log(`\n=== Body Element ${index + 1} ===`);
  const links = el.querySelectorAll('a[href]');

  links.forEach((a, i) => {
    const href = a.getAttribute('href');
    const text = a.textContent?.trim().substring(0, 50);

    let reason = '';
    if (!href) reason = '❌ NO HREF';
    else if (!text) reason = '❌ NO TEXT';
    else if (href.startsWith('mailto:')) reason = '✉️ MAILTO';
    else if (href.startsWith('#')) reason = '⚓ ANCHOR';
    else if (href.startsWith('data:')) reason = '📷 DATA URL';
    else if (allLinks.includes(href)) reason = '🔁 DUPLICATE';
    else {
      reason = '✅ KEEP';
      allLinks.push(href);
    }

    console.log(`  ${i+1}. ${reason} | ${text} | ${href.substring(0, 80)}`);
  });
});

console.log(`\n📊 Summary: ${allLinks.length} unique links kept`);
```

## Expected Results for EDC Email

The EDC email likely has:
- **Many duplicate links** (same Guest List link appears multiple times)
- **Many mailto: links** (contact emails throughout)
- **Tracking URLs** (insomniac-dot-yamm-track.appspot.com)

## Verify Links Are in Gemini Response

Check the service worker logs for:
```
[INFO] Gemini raw response (last 200 chars):
```

Should show event_links with URLs. Example:
```json
"event_links": [
  {
    "url": "https://insomniac-dot-yamm-track.appspot.com/...",
    "description": "Artist Letter"
  },
  {
    "url": "https://insomniac-dot-yamm-track.appspot.com/...",
    "description": "Advance Form"
  }
]
```

## How to Check If We're Missing Important Links

1. Open Gmail console
2. Run: `document.querySelectorAll('.a3s.aiL a[href]:not([href^="mailto:"]):not([href^="#"])').length`
3. This counts non-mailto, non-anchor links
4. Compare to our extracted count (13)

If the counts are similar, we're good! If they're very different, we might have a bug.

## What If Links Are Missing?

If important links are being filtered:

1. **Check for mailto:** - Are we accidentally catching "mailto:link" that should be kept?
2. **Check tracking URL format** - Is Gmail using a different tracking wrapper?
3. **Check for JavaScript links** - `href="javascript:..."` should be filtered
4. **Check for Google redirects** - Should be unwrapped by our code

## View What Was Sent to Gemini

In Gmail console after clicking "Add Event":
```javascript
console.log(eventState.emailData.body.split('=== LINKS EXTRACTED FROM EMAIL ===')[1]);
```

This shows the exact links section Gemini received.
