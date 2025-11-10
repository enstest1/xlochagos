# New Local-First Architecture

## Overview

This is a complete rewrite using **Playwright for posting** and **twscrape for reading**, bypassing Cloudflare's detection of the `goat-x` library.

## Architecture

- **Writer**: Playwright (Chromium) - posts/likes/replies using cookies + proxy
- **Reader**: twscrape (Python) - read/search timelines for targets and topics  
- **Glue**: Node.js (TypeScript) orchestrator

## Setup

### 1. Install Dependencies

```bash
cd mvp
npm install
```

### 2. Install Python Dependencies

```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install twscrape
twscrape init
```

### 3. Configure Accounts

Edit `.env.local`:

```env
# Account 1: @FIZZonAbstract
ACCT1_HANDLE=@FIZZonAbstract
ACCT1_COOKIE_PATH=./persist/secrets/acct1.cookies.json
ACCT1_USERNAME=FIZZonAbstract
ACCT1_PASSWORD=Finnegan19871!
# ACCT1_PROXY_URL=http://user:pass@host:port  # Optional
```

## Usage

### Check Outbound IPs

```bash
npm run cli -- ip
```

Output:
```
[ip] @FIZZonAbstract -> 70.79.237.213 (direct)
```

### Login (One-Time Setup)

This opens a browser, logs in, and saves cookies:

```bash
npm run cli -- login '@FIZZonAbstract'
```

**Note**: Use quotes around the handle to prevent PowerShell from interpreting the `@` symbol.

The browser will:
1. Navigate to X login page
2. Fill in username
3. Fill in password
4. Save cookies to `./persist/secrets/acct1.cookies.json`

**If you encounter phone/email verification**, complete it manually in the browser window. The script will wait.

### Post a Tweet

```bash
npm run cli -- post '@FIZZonAbstract' "Hello from the new architecture!"
```

### Reply to a Tweet

```bash
npm run cli -- reply '@FIZZonAbstract' 'https://x.com/i/web/status/123456789' "Great post!"
```

### Like a Tweet

```bash
npm run cli -- like '@FIZZonAbstract' 'https://x.com/i/web/status/123456789'
```

### Fetch Timeline (twscrape)

```bash
npm run cli -- timeline pelpa333
```

Output saved to `./persist/timeline.json`

### Search Tweets (twscrape)

```bash
npm run cli -- search "from:pelpa333 crypto"
```

Output saved to `./persist/search.json`

## Directory Structure

```
mvp/
  persist/
    secrets/              # Cookie files (NEVER commit!)
      acct1.cookies.json
      acct2.cookies.json
    docs/                 # Documentation cache
    logs/                 # Error screenshots
    twscrape.db          # twscrape database
  src/
    config/
      accountsNew.ts      # Account config loader
    auth/
      login.ts            # Playwright login
    publish/
      playwright.ts       # Post/reply/like via browser
    ingest/
      twscrape.ts         # Read timelines/search
    health/
      ipcheck.ts          # Verify outbound IPs
    cli.ts               # CLI interface
  py/
    reader.py            # Python twscrape wrapper
  .env.local             # Local environment config (NEVER commit!)
```

## Key Benefits

1. **✅ Bypasses Cloudflare** - Real browser behavior, not detected
2. **✅ Cookie Reuse** - Login once, reuse cookies
3. **✅ Proxy Support** - Per-account static residential proxies
4. **✅ Local-First** - No cloud dependencies
5. **✅ Separation of Concerns** - Playwright for writing, twscrape for reading
6. **✅ Human-Like** - Real browser interactions

## Troubleshooting

### Login Timeout

If login times out:
1. Check if phone/email verification is required
2. Complete verification manually in the browser
3. Re-run the login command

### Cloudflare Challenge

If you see a Cloudflare challenge:
1. Complete it manually in the browser
2. The script will continue after completion

### Cookies Expired

If cookies expire:
1. Re-run the login command: `npm run cli -- login '@YourHandle'`
2. New cookies will be saved automatically

### Proxy Issues

If proxy connection fails:
1. Test proxy directly: `curl --proxy http://user:pass@host:port https://api.ipify.org`
2. Verify proxy credentials
3. Try without proxy first (comment out `ACCT1_PROXY_URL`)

## Next Steps

1. ✅ Test login flow (DONE - browser opens, navigates to login)
2. Handle phone/email verification flow
3. Test posting with saved cookies
4. Set up twscrape accounts for reading
5. Integrate with existing content generation pipeline

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ACCT1_HANDLE` | Twitter handle | `@FIZZonAbstract` |
| `ACCT1_COOKIE_PATH` | Cookie file path | `./persist/secrets/acct1.cookies.json` |
| `ACCT1_USERNAME` | Twitter username | `FIZZonAbstract` |
| `ACCT1_PASSWORD` | Twitter password | `YourPassword123!` |
| `ACCT1_PROXY_URL` | Proxy URL (optional) | `http://user:pass@host:port` |
| `DRY_RUN` | Test mode | `true` or `false` |

## Important Notes

- **Never commit `.env.local` or `persist/secrets/` to git**
- **Use the same proxy for login and posting** to maintain device fingerprint
- **Throttle actions** - don't spam posts/likes
- **Vary content** - avoid identical posts across accounts
- **Monitor for 401/403** - indicates cookies need refresh

## Status

**Current Status**: ✅ Architecture implemented, IP check working, login flow working (browser opens and navigates)

**Next**: Handle phone/email verification, then test posting with saved cookies.


