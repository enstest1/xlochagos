# Why Liking/Commenting Works But Scraping Doesn't

## Key Discovery

### responseAgent (LIKING/COMMENTING WORKS ✅)
```typescript
this.browser = await chromium.launch({ 
  headless: false,  // ← VISIBLE BROWSER
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
```

### pelpa333Monitor (SCRAPING FAILS ❌)
```typescript
this.browser = await chromium.launch({ 
  headless: true,  // ← HIDDEN BROWSER
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
```

## Why This Matters

### Headless: true (Hidden Browser)
- X.com easily detects this is automated
- No visual rendering = Bot behavior
- Times out quickly on authenticated requests
- More aggressive rate limiting

### Headless: false (Visible Browser)
- X.com treats it as a real browser
- Less aggressive detection
- More human-like behavior signals
- Better success rate

## The Real Difference

**Timing pattern:**
- responseAgent: Go to URL → Wait → Like/Comment → Done (quick action)
- pelpa333Monitor: Go to URL → Wait → Scrape 20 posts → Parse → Timeout

The LENGTH of time on the page + the number of DOM queries triggers X.com's bot detection more aggressively.

## But Wait...

You updated pelpa333Monitor to use fresh cookies TODAY. Before that, it was using old cookies (20 days old). The old cookies likely:
- ✅ Had expired auth tokens
- ✅ Were treated as "old session"
- ✅ Got different rate limits

The NEW cookies might have:
- ❌ Fresh session tokens
- ❌ Tighter security checks
- ❌ More aggressive bot detection

## Solution

Option 1: Use headless: false (visible browser)
- Same as responseAgent
- Better success rate
- Easy fix

Option 2: Remove authentication
- Scrape public profile
- No rate limiting
- But lose some features

Option 3: Use X API
- Most reliable
- Proper rate limit handling
- More work to implement
