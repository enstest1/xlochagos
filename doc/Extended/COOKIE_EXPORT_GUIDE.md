# How to Export Fresh Twitter/X Cookies

## Quick Method (Browser Extension):

1. **Install a cookie export extension:**
   - Chrome: "Get cookies.txt LOCALLY" or "Cookie-Editor"
   - Firefox: "cookies.txt" or "Cookie Quick Manager"

2. **Export steps:**
   - Go to https://x.com in your browser (while logged in as @FIZZonAbstract)
   - Click the extension icon
   - Click "Export" → Select "JSON format"
   - Save the file

3. **Copy the cookies file:**
   ```bash
   # Replace /path/to/downloaded/cookies.json with your file
   cp /path/to/downloaded/cookies.json mvp/secrets/FIZZonAbstract.cookies.json
   ```

## Manual Method (Chrome DevTools):

1. **Open Chrome DevTools (F12)**
2. **Go to Application tab**
3. **Navigate to:** Storage → Cookies → https://x.com
4. **Right-click on any cookie → "Copy all as cURL" or export manually**
5. **Convert to JSON format and save as:** `mvp/secrets/FIZZonAbstract.cookies.json`

## JSON Format Expected:

```json
[
    {
        "domain": ".x.com",
        "expirationDate": 1234567890.123,
        "hostOnly": false,
        "httpOnly": true,
        "name": "auth_token",
        "path": "/",
        "sameSite": "no_restriction",
        "secure": true,
        "session": false,
        "storeId": null,
        "value": "YOUR_TOKEN_HERE"
    }
]
```

## Test After Exporting:

```bash
npm run cli -- swarm monitor
```

Look for: "✅ Loaded authentication cookies" and recent posts being scraped!

---
**Current cookie file date:** October 5, 2024 (20 days old) ❌
**Expected:** Fresh cookies from today ✅
