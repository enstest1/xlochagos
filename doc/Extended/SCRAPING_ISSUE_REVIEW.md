# Scraping Issue Investigation Report

## Problem
- Fresh cookies loaded successfully âœ…
- But scraping old posts (Oct 10-12) instead of new ones (Oct 26, "2h ago")
- Posts from wrong accounts appearing (ORBT_Protocol, ScrillaVentura, etc.)

## Code Review: `pelpa333Monitor.ts`

### Line 85: URL Navigation
```typescript
await this.page.goto(`https://x.com/${this.pelpa333Handle.replace('@', '')}`, {
  waitUntil: 'domcontentloaded',
  timeout: 60000
});
```
**Issue:** Goes to `https://x.com/pelpa333` - the profile page, not the timeline/tweets tab
**Expected:** Should go to `https://x.com/pelpa333/with_replies` or use specific tab

### Line 88: Selector Wait
```typescript
await this.page.waitForSelector('[data-testid="tweet"]', { timeout: 15000 });
```
**Issue:** Uses generic `[data-testid="tweet"]` which captures ALL tweets in view, including:
- Retweets
- Replies to other accounts
- Promoted tweets
- Posts from other accounts shown in timeline

### Lines 107-130: Post Extraction Logic
```typescript
const linkElement = tweet.querySelector('a[href*="/status/"]');
const relativeUrl = linkElement?.getAttribute('href') || '';
const url = relativeUrl ? `https://x.com${relativeUrl}` : '';
```
**Issues Found:**
1. **No author verification** - Doesn't check if the tweet is FROM @pelpa333
2. **Gets retweets** - If @pelpa333 retweeted someone, that author's username appears in URL
3. **Gets replies** - Replies to other accounts show up
4. **No filtering by author** - Any tweet visible on the page gets captured

### Evidence from Database:
- `https://x.com/ORBT_Protocol/status/...` - NOT from @pelpa333
- `https://x.com/ScrillaVentura/status/...` - NOT from @pelpa333
- `https://x.com/FarzaTV/status/...` - NOT from @pelpa333

These are likely:
- Retweets by @pelpa333 of other accounts
- Replies to other accounts
- Suggested tweets Twitter shows on profile

## Root Causes

### 1. Page Target Issue
- Profile page shows mixed content (tweets, retweets, replies)
- Should use tweets-only URL

### 2. No Author Filtering
- Code doesn't verify `data-testid="User-Name"` or author handle
- Just grabs any tweet visible

### 3. Selector Too Broad
- `[data-testid="tweet"]` captures everything
- Should be more specific to only tweets from @pelpa333

## What's Happening (Timeline)

1. **Cookies load** âœ… (fresh cookies working)
2. **Navigate to** `https://x.com/pelpa333` 
3. **Page shows** timeline with mixed content (tweets + retweets + replies)
4. **Selector grabs** first 20 visible tweets
5. **Extracts URLs** from those tweets (which include retweets/replies)
6. **No filtering** by author
7. **Result:** Mixed posts from multiple accounts

## Expected vs Actual

### Expected:
- Only tweets FROM @pelpa333
- New tweets (last 24 hours)
- Excluding retweets unless they mention target accounts

### Actual:
- Mix of tweets, retweets, and replies
- Old posts (Oct 10-12)
- Posts from multiple accounts
- No author verification

## Solutions Needed

### Fix 1: Correct Page Target
Use tweets-only URL: `https://x.com/pelpa333/with_replies`

### Fix 2: Add Author Verification
Check that each tweet has `@pelpa333` as the author before extracting

### Fix 3: Filter by Timestamp
Only process posts from last 24 hours

### Fix 4: Better Selector
Use more specific selector or filter after extraction

## Priority Issues

í´´ **Critical:** No author verification (mixing in posts from other accounts)  
í´´ **Critical:** Wrong page target (profile vs tweets-only)  
í¿¡ **Medium:** No timestamp filtering in extraction  
í¿¢ **Low:** Can improve selector specificity

