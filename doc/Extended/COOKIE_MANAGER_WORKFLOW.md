# Cookie Manager Workflow for Multi-Account Support

## Current Problem
- `pelpa333Monitor.ts` manually loads cookies from hardcoded path: `secrets/FIZZonAbstract.cookies.json`
- `responseAgent.ts` does the same
- Both need to support multiple accounts

## Better Approach (Using CookieManager)

### 1. CookieManager Benefits:
- ✅ Centralized cookie management
- ✅ Health checks for expired cookies
- ✅ Multi-account support via AccountConfig
- ✅ Automatic cookie validation
- ✅ Environment variable updates for Railway

### 2. How It Should Work:

```
┌─────────────────────────┐
│  CookieManager          │
│  - loadCookies()        │
│  - saveCookies()        │
│  - checkCookieHealth()  │
└─────────────┬───────────┘
              │
              │ Uses AccountConfig
              │
┌─────────────▼───────────┐
│  Pelpa333Monitor        │
│  1. Get AccountConfig   │
│  2. Load cookies via CM │
│  3. Scrape @pelpa333    │
└─────────────┬───────────┘
              │
              │ Creates tasks for
              │
┌─────────────▼───────────┐
│  ResponseAgent          │
│  1. Get AccountConfig   │
│  2. Load cookies via CM │
│  3. Auto-comment/like   │
└─────────────────────────┘
```

### 3. Implementation Steps:

**Step 1: Update Pelpa333Monitor**
- Import CookieManager
- Accept AccountConfig in constructor
- Use `cookieManager.loadCookies(account)` instead of manual loading

**Step 2: Update ResponseAgent**
- Same changes as Pelpa333Monitor

**Step 3: Update CLI**
- Pass AccountConfig to both services
- Can iterate over multiple accounts

### 4. Benefits:
- ��� Single source of truth for cookies
- ���️ Health checks prevent using expired cookies
- ��� Easier to add new accounts
- ��� Railway integration for production

## Decision:
**Should we integrate CookieManager?**
- YES: More robust, scalable, multi-account ready
- NO: Keep manual cookie loading (simpler but limited)

Recommendation: **YES** - The system is designed for multiple accounts, so we should use the infrastructure we built.
