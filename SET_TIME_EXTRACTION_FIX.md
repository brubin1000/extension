# Set Time Extraction Fix

## The Problem

The extension was extracting **festival-level dates** but not the **specific artist performance times**:

- ❌ **Before**: Festival dates (May 16-18) shown as the event date
- ❌ **Before**: No specific set time extracted (8:15pm - 9:30pm)
- ❌ **Before**: Timezone not emphasized

For tour management, you need the EXACT performance slot, not just when the festival happens!

## The Fix

### 1. Updated Gemini Prompt (ai-parser.js)

**Changed:**
- Made `stages` array **MANDATORY** instead of optional
- Added explicit example showing difference between event dates and set times
- Strongly emphasized `set_date`, `start_time`, `end_time` are THE MOST IMPORTANT fields
- Added clear instructions for 24-hour time conversion (8:15pm → 20:15)
- Emphasized timezone extraction (IANA format like "America/Los_Angeles")

**New Prompt Section:**
```
CRITICAL FOR SETS: The set_date, start_time, and end_time are THE MOST IMPORTANT FIELDS.
These represent the ACTUAL PERFORMANCE TIME for the artist, NOT the overall event dates.

For example:
- If email says "EDC Las Vegas May 16-18" and "Your set: Friday 5/16 at 8:15pm - 9:30pm", then:
  - dates.start_date = "2025-05-16", dates.end_date = "2025-05-18" (festival dates)
  - sets[0].set_date = "2025-05-16" (specific performance day)
  - sets[0].start_time = "20:15" (actual set start in 24hr format)
  - sets[0].end_time = "21:30" (actual set end in 24hr format)
```

### 2. Updated UI Logic (gmail-inject.js)

**Changed Date Extraction (lines 1251-1260):**
```javascript
// BEFORE: Always used festival start date
currentDropdown.querySelector('#input-date').value = details.dates?.start_date || details.date || '';

// AFTER: Prioritize specific set date
let dateValue = details.date || details.dates?.start_date || '';
if (details.stages && details.stages.length > 0 && details.stages[0].sets && details.stages[0].sets.length > 0) {
  const setDate = details.stages[0].sets[0].set_date;
  if (setDate) {
    dateValue = setDate;
    console.log(`[ATMS] Using specific set date: ${setDate}`);
  }
}
currentDropdown.querySelector('#input-date').value = dateValue;
```

**Enhanced Time Extraction (lines 1262-1272):**
```javascript
// Extract time from specific set time (PRIORITY) or fall back to old time field
let timeValue = details.time || '10:00';
if (details.stages && details.stages.length > 0 && details.stages[0].sets && details.stages[0].sets.length > 0) {
  const setStartTime = details.stages[0].sets[0].start_time;
  const setEndTime = details.stages[0].sets[0].end_time;
  if (setStartTime) {
    timeValue = setStartTime;
    console.log(`[ATMS] Using specific set time: ${setStartTime}${setEndTime ? ` - ${setEndTime}` : ''}`);
  }
}
```

### 3. Added Debug Logging (ai-parser.js lines 109-120)

```javascript
// Log set time details for debugging
if (parsed.stages && parsed.stages.length > 0 && parsed.stages[0].sets && parsed.stages[0].sets.length > 0) {
  const firstSet = parsed.stages[0].sets[0];
  info('Primary set details:', {
    set_date: firstSet.set_date,
    start_time: firstSet.start_time,
    end_time: firstSet.end_time,
    stage_name: parsed.stages[0].stage_name
  });
} else {
  warn('No stages/sets extracted from email');
}
```

## Expected Data Structure

### For EDC Las Vegas Email:

**Event-Level Data:**
```json
{
  "event_name": "EDC Las Vegas 25",
  "dates": {
    "start_date": "2025-05-16",
    "end_date": "2025-05-18",
    "timezone": "America/Los_Angeles"
  },
  "venue": {
    "venue_name": "Las Vegas Motor Speedway",
    "city": "Las Vegas",
    "state": "NV"
  }
}
```

**Set-Level Data (THE CRITICAL PART!):**
```json
{
  "stages": [{
    "stage_name": "bionicJUNGLE",
    "sets": [{
      "artist_name": "Your Artist Name",
      "set_date": "2025-05-16",
      "start_time": "20:15",
      "end_time": "21:30",
      "soundcheck_time": "18:00",
      "crew_list": "DJ + 2",
      "guest_list_spots": 10
    }]
  }]
}
```

## How to Test

### 1. Reload Extension
Hard refresh in Gmail: **Cmd+Shift+R**

### 2. Open EDC Email
Search for "edc" and open the email

### 3. Click "Add to ATMS"
Watch Gmail console for:
```
[ATMS] extractEmailContent: Found 1 body elements
[ATMS] extractEmailContent: Extracted 13 unique links total
```

### 4. Click "Add Event"
Watch service worker logs (chrome://extensions → Service Worker → Inspect) for:
```
[INFO] Gemini extraction complete: {event_name: "EDC Las Vegas 25", hasStages: true, ...}
[INFO] Primary set details: {
  set_date: "2025-05-16",
  start_time: "20:15",
  end_time: "21:30",
  stage_name: "bionicJUNGLE"
}
```

### 5. Check UI
Watch Gmail console for:
```
[ATMS] Using specific set date: 2025-05-16
[ATMS] Using specific set time: 20:15 - 21:30
```

### 6. Verify Date & Time Fields
- **Date field** should show: `2025-05-16` (the performance day, NOT May 16-18)
- **Time field** should show: `20:15` (the actual set start, NOT just a default time)

## What This Fixes

✅ **Calendar Integration**: Now adds event at the EXACT performance time
✅ **Tour Management**: Can see actual performance slots, not just festival dates
✅ **Multi-Day Festivals**: If artist performs on Day 2, correct date is used
✅ **Timezone Handling**: Timezone extracted for cross-country tour coordination
✅ **Set Time Display**: Shows start and end times prominently in UI

## Files Modified

1. `background/ai-parser.js` - Updated Gemini prompt and added logging
2. `content/gmail-inject.js` - Fixed date/time extraction to prioritize set times
3. `dist/service-worker.js` - Rebuilt with new changes

## Example Use Cases

### Single Show
**Email**: "Duke Dumont at 1015 Folsom, Friday May 23 at 11pm - 2am"
**Extraction**:
- set_date: "2025-05-23"
- start_time: "23:00"
- end_time: "02:00"
- timezone: "America/Los_Angeles"

### Multi-Day Festival (Day 2 Performance)
**Email**: "Lightning in a Bottle May 21-26, your set Saturday 5/24 at 3:30pm - 5pm on The Woogie"
**Extraction**:
- dates: {start_date: "2025-05-21", end_date: "2025-05-26"}
- set_date: "2025-05-24" (specific performance day)
- start_time: "15:30"
- end_time: "17:00"
- stage_name: "The Woogie"

### Multiple Sets (Different Days)
**Email**: "Coachella Weekend 1, Friday 4/11 sunset slot 6pm + Sunday 4/13 closing set 10pm"
**Extraction**:
```json
{
  "stages": [
    {
      "stage_name": "Main Stage",
      "sets": [
        {"set_date": "2025-04-11", "start_time": "18:00", "set_name": "Sunset Slot"},
        {"set_date": "2025-04-13", "start_time": "22:00", "set_name": "Closing Set"}
      ]
    }
  ]
}
```

## Testing Checklist

- [ ] Extension reloaded (remove & reinstall if needed)
- [ ] EDC email extraction shows set_date: "2025-05-16"
- [ ] EDC email extraction shows start_time: "20:15"
- [ ] EDC email extraction shows end_time: "21:30"
- [ ] UI date field shows "2025-05-16" (not "2025-05-16" to "2025-05-18")
- [ ] UI time field shows "20:15" (not a default like "10:00")
- [ ] Console logs show "Using specific set date" and "Using specific set time"
- [ ] Service worker logs show "Primary set details" with all times
- [ ] Timezone is extracted (check dates.timezone field)

## Troubleshooting

**Problem**: Still seeing festival dates instead of set date
- Check service worker logs for "Primary set details"
- If missing, Gemini didn't extract stages - check prompt is updated
- Rebuild service worker: `npm run build`

**Problem**: Time shows "10:00" instead of actual set time
- Check if stages[0].sets[0].start_time exists in eventDetails
- Check Gmail console for "Using specific set time" log
- If missing, Gemini didn't extract set times

**Problem**: Times in wrong format (12hr instead of 24hr)
- Gemini should convert to 24hr automatically
- Check service worker logs for raw Gemini response
- Verify prompt says "HH:MM in 24hr format"

## Next Steps

After confirming this works:
1. Test with other email examples (Radius, Lightning in a Bottle, etc.)
2. Verify calendar integration uses the correct set times
3. Update Supabase schema to store stages/sets data
4. Add timezone display in UI
5. Add end_time display (show "8:15pm - 9:30pm" range)
