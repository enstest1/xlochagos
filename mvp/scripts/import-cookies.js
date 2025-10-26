#!/usr/bin/env node
/**
 * Helper script to import cookies from browser
 * Usage: node scripts/import-cookies.js <cookie-json>
 */

const fs = require('fs');
const path = require('path');

const cookieJson = process.argv[2];
const outputPath = './persist/secrets/acct1.cookies.json';

if (!cookieJson) {
  console.log(`
Usage: node scripts/import-cookies.js '<cookie-json>'

Example:
1. Open browser DevTools (F12)
2. Go to Application → Cookies → https://x.com
3. Copy cookies as JSON
4. Run: node scripts/import-cookies.js '{"name":"auth_token","value":"abc123",...}'

Or create a file with cookies and pipe it:
  cat cookies.json | node scripts/import-cookies.js
`);
  process.exit(1);
}

try {
  // Parse the cookie JSON
  let cookies;
  try {
    cookies = JSON.parse(cookieJson);
  } catch (e) {
    console.error('Invalid JSON. Make sure to wrap in quotes:');
    console.error('node scripts/import-cookies.js \'{"name":"auth_token","value":"abc123"}\'');
    process.exit(1);
  }

  // Ensure it's an array
  if (!Array.isArray(cookies)) {
    cookies = [cookies];
  }

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  // Write cookies file
  fs.writeFileSync(outputPath, JSON.stringify(cookies, null, 2));

  console.log(`✅ Successfully imported ${cookies.length} cookies to ${outputPath}`);
  console.log(`\nNow you can test posting:`);
  console.log(`npm run cli -- post '@FIZZonAbstract' "Hello from imported cookies!"`);

} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}

