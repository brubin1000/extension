# Extension Icons

This folder should contain the extension icons in three sizes:

- `icon16.png` - 16x16 pixels (toolbar icon)
- `icon48.png` - 48x48 pixels (extension management page)
- `icon128.png` - 128x128 pixels (Chrome Web Store)

## Creating Icons

You can create icons using any image editor. Here are some recommendations:

### Design Guidelines

- **Simple and recognizable**: Use a simple design that's easy to recognize at small sizes
- **Clear at 16x16**: The icon should be clear even at the smallest size
- **Consistent style**: All three sizes should have the same design, just scaled
- **Use transparency**: PNG format with transparent background works best

### Suggested Design Ideas

For an email-to-calendar extension:
- 📧 + 📅 Email merged with calendar
- ⚡ Lightning bolt (for automation)
- 🤖 Robot icon
- 📨→📅 Arrow from email to calendar

### Quick Icon Generation

**Option 1: Use Figma/Canva**
1. Create a 128x128 canvas
2. Design your icon
3. Export as PNG in three sizes

**Option 2: Use Online Tools**
- [Favicon.io](https://favicon.io/)
- [RealFaviconGenerator](https://realfavicongenerator.net/)

**Option 3: AI Generation**
Use AI tools like DALL-E or Midjourney:
```
Prompt: "A minimalist icon for a chrome extension that converts emails to calendar events, 
simple geometric shapes, flat design, blue and white color scheme, transparent background"
```

**Option 4: Use Emoji as Base**
Convert emoji to icon:
1. Find suitable emoji (📧📅, ⚡, 🤖)
2. Screenshot at large size
3. Clean up in image editor
4. Scale to required sizes

## Temporary Placeholder

Until you create custom icons, you can use colored squares:
- Create 128x128 square with brand color
- Add text "EC" (Email Calendar)
- Scale to all three sizes

## Installation

After creating icons:
1. Place `icon16.png`, `icon48.png`, `icon128.png` in this folder
2. Reload extension in Chrome
3. Icons should appear in toolbar and extensions page

