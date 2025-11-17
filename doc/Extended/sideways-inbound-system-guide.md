# Sideways & Inbound Reply System - User Guide

## Overview

The Sideways & Inbound Reply System enables alt accounts to engage naturally in Pelpa threads by:
- **Sideways Replies**: Alts replying to comments within Pelpa tweet threads (including alt-to-alt engagement)
- **Inbound Replies**: Alts responding to @mentions and replies directed at them

This system keeps engagement **lowkey** and **natural** while maintaining character consistency.

---

## System Architecture

### Components

1. **Monitor** (`pelpa333Monitor.ts`)
   - Scans Pelpa tweets for opportunities
   - Flags sideways opportunities (comments worth replying to)
   - Flags inbound opportunities (replies to our alts)

2. **Sideways Reply Service** (`sidewaysReplyService.ts`)
   - Processes flagged sideways opportunities
   - Generates persona-based replies
   - Posts replies to comments in Pelpa threads

3. **Inbound Reply Service** (`inboundReplyService.ts`)
   - Processes flagged inbound opportunities
   - Generates persona-based replies
   - Posts replies to @mentions/replies

4. **Shared Utilities**
   - `generation.ts` - Unified reply generation for all modes
   - `publish/playwright.ts` - Reply posting functionality
   - `ingest/playwrightScraper.ts` - Tweet reply fetching
   - `utils/` - Helper functions (URL extraction, content filtering, etc.)

### Database Tables

- **`sideways_opportunities`**: Opportunities flagged by monitor (not yet processed)
- **`sideways_replies`**: Tracked sideways replies that were posted
- **`inbound_alt_replies`**: Tracked inbound mentions/replies (flagged by monitor)

---

## How It Works

### Flow Overview

```
1. Pelpa posts tweet
   ↓
2. Alts amplify (respond command)
   ↓
3. Monitor detects sideways opportunities
   ↓
4. Sideways service processes & posts replies
   ↓
5. Monitor detects inbound opportunities (replies to our alts)
   ↓
6. Inbound service processes & posts replies
```

### Detailed Process

#### Step 1: Initial Amplification
**Command:** `npm run cli swarm respond`

- Alts reply directly to Pelpa tweets (amplify mode)
- Sets `response_queue.status = 'posted'` for each tweet
- This marks tweets as eligible for sideways detection

#### Step 2: Monitor Detection (Sideways)
**Command:** `npm run cli swarm monitor`

The monitor:
1. Scrapes Pelpa timeline (last 20 posts)
2. For each posted tweet (`status='posted'`):
   - Fetches replies to that tweet
   - Scores each reply (quality check)
   - Filters spam/toxic content
   - Checks age (skips tweets older than 48 hours)
   - Checks caps (max 6 per root, max 2 per alt per root)
   - Flags high-quality opportunities in `sideways_opportunities` table

**Key Features:**
- Only ONE opportunity per comment (UNIQUE constraint)
- Alt-to-alt replies allowed (alts can reply to other alts' comments)
- Self-reply prevention (alt won't reply to its own comment)

#### Step 3: Sideways Processing
**Command:** `npm run cli swarm sideways`

The sideways service:
1. Atomically claims unprocessed opportunities (prevents race conditions)
2. For each opportunity:
   - Double-checks caps (may have changed)
   - Generates persona-based reply using `generatePersonaReply()`
   - Filters garbage replies
   - Waits random delay (5-60 seconds for testing)
   - Posts reply using `replyFromAlt()`
   - Saves to `sideways_replies` table
   - Marks opportunity as processed

**Retry Logic:**
- Max 3 retries per opportunity
- Cookie/auth errors skip retry (moves to next account)
- Stuck opportunities can be recovered with `swarm recover`

#### Step 4: Monitor Detection (Inbound)
**Command:** `npm run cli swarm monitor` (run again after sideways)

The monitor:
1. Checks `sideways_replies` table for recent replies we posted
2. For each alt's reply:
   - Fetches replies to that alt's comment
   - Filters self-replies
   - Flags inbound opportunities in `inbound_alt_replies` table

#### Step 5: Inbound Processing
**Command:** `npm run cli swarm inbound`

The inbound service:
1. Gets unreplied inbound mentions (`replied=false`)
2. For each inbound:
   - Checks rate limits (max 8 per alt per hour, max 2 per user per alt per day)
   - Scores the message
   - Generates persona-based reply
   - Filters garbage replies
   - Waits random delay (10-90 seconds for testing)
   - Posts reply
   - Marks as replied (`replied=true`)

---

## Configuration

### Limits & Caps

**Sideways Replies:**
- Max 6 sideways replies per Pelpa tweet
- Max 2 replies per alt per Pelpa tweet
- Min score threshold: 3
- Max retries: 3

**Inbound Replies:**
- Max 8 replies per alt per hour
- Max 2 replies per user per alt per day
- Min score threshold: 2

**Delays (Testing):**
- Sideways: 5-60 seconds
- Inbound: 10-90 seconds
- Between tweets: 10 seconds

**Production Delays (Recommended):**
- Sideways: 5-30 minutes
- Inbound: 10-60 minutes
- Between tweets: 30 minutes - 2 hours

### Configuration File

Edit `mvp/src/config/replyConfig.ts` to adjust limits and delays:

```typescript
export const REPLY_CONFIG = {
  sideways: {
    MAX_PER_ROOT: 6,
    MAX_PER_ALT_PER_ROOT: 2,
    MIN_SCORE_THRESHOLD: 3,
    MAX_RETRIES: 3,
  },
  inbound: {
    MAX_PER_ALT_PER_HOUR: 8,
    MAX_PER_USER_PER_ALT_PER_DAY: 2,
    MIN_SCORE_THRESHOLD: 2,
  },
  delays: {
    SIDEWAYS_MIN_MS: 5 * 1000,   // 5 seconds
    SIDEWAYS_MAX_MS: 60 * 1000,  // 60 seconds
    INBOUND_MIN_MS: 10 * 1000,   // 10 seconds
    INBOUND_MAX_MS: 90 * 1000,   // 90 seconds
    BETWEEN_TWEETS_MS: 10 * 1000, // 10 seconds
  }
}
```

---

## Setup & Prerequisites

### 1. Database Migration

**Run the migration SQL file:**

```bash
# Apply migration to Supabase
# Use Supabase dashboard SQL editor or CLI
```

**Migration file:** `mvp/supabase/sideways-inbound-schema.sql`

This creates:
- `sideways_opportunities` table
- `sideways_replies` table
- `inbound_alt_replies` table
- All required indexes
- RLS policies

### 2. Environment Variables

Ensure these are set in `.env`:

```bash
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Cookie Files

Ensure cookie files exist for all alt accounts:
- `./secrets/FIZZonAbstract.cookies.json`
- `./secrets/Rick_Rupen.cookies.json`
- `./secrets/Dope_MusicVideo.cookies.json`
- `./secrets/aplep333.cookies.json`

---

## Testing Guide

### Step 1: Verify Installation

Run the verification script:

```bash
npx ts-node src/test/sideways-inbound-verification.ts
```

This checks:
- ✅ URL extraction functions work correctly
- ✅ All required modules export correctly
- ✅ Code patterns are correct

**Expected output:**
```
✅ All tests passed!
```

### Step 2: Test URL Extraction

The verification script tests various URL formats:
- `https://x.com/user/status/1234567890`
- `https://x.com/user/status/1234567890?s=20`
- `https://twitter.com/user/status/1234567890`

### Step 3: Test Database Connection

Verify Supabase connection by checking tables exist:

```sql
-- In Supabase SQL editor
SELECT COUNT(*) FROM sideways_opportunities;
SELECT COUNT(*) FROM sideways_replies;
SELECT COUNT(*) FROM inbound_alt_replies;
```

---

## Running the Full System

### Execution Order

**CRITICAL:** Commands must be run in this order:

```bash
# Step 1: Initial amplification (alts reply to Pelpa tweets)
npm run cli swarm respond

# Step 2: Monitor detects sideways opportunities
npm run cli swarm monitor

# Step 3: Process sideways replies
npm run cli swarm sideways

# Step 4: Monitor detects inbound opportunities (run monitor again)
npm run cli swarm monitor

# Step 5: Process inbound replies
npm run cli swarm inbound
```

### Convenience Command

Run both sideways and inbound together:

```bash
npm run cli swarm engage
```

This runs:
1. `processSidewaysReplies()`
2. `processInboundReplies()`

**Note:** You still need to run `monitor` separately before `engage`.

### Full Cycle Example

```bash
# 1. Amplify Pelpa tweets
npm run cli swarm respond

# 2. Detect sideways opportunities
npm run cli swarm monitor

# 3. Process sideways + inbound together
npm run cli swarm engage

# 4. Detect new inbound opportunities (if any)
npm run cli swarm monitor
```

---

## Command Reference

### `npm run cli swarm respond`
- **Purpose:** Initial amplification (alts reply to Pelpa tweets)
- **Sets:** `response_queue.status = 'posted'`
- **Required for:** Sideways detection (monitor checks for `status='posted'`)

### `npm run cli swarm monitor`
- **Purpose:** Detect opportunities (sideways and inbound)
- **Does:**
  - Scrapes Pelpa timeline
  - Flags sideways opportunities (requires `status='posted'` tweets)
  - Flags inbound opportunities (requires `sideways_replies` entries)
- **Run:** After `respond` and after `sideways`

### `npm run cli swarm sideways`
- **Purpose:** Process and post sideways replies
- **Does:**
  - Claims opportunities atomically
  - Generates replies
  - Posts replies to comments
  - Saves to `sideways_replies` table

### `npm run cli swarm inbound`
- **Purpose:** Process and post inbound replies
- **Does:**
  - Gets unreplied inbound mentions
  - Checks rate limits
  - Generates replies
  - Posts replies to @mentions

### `npm run cli swarm engage`
- **Purpose:** Run both sideways + inbound together
- **Does:** Runs `sideways` then `inbound`

### `npm run cli swarm recover`
- **Purpose:** Recover stuck opportunities
- **Does:** Resets opportunities stuck in `processed=true` state without `reply_tweet_id`

---

## Monitoring & Debugging

### Check Opportunities

```sql
-- Check sideways opportunities
SELECT COUNT(*) as total, 
       COUNT(*) FILTER (WHERE processed = false) as pending
FROM sideways_opportunities;

-- Check inbound opportunities
SELECT COUNT(*) as total,
       COUNT(*) FILTER (WHERE replied = false) as pending
FROM inbound_alt_replies;
```

### Check Posted Replies

```sql
-- Check sideways replies posted
SELECT alt_handle, COUNT(*) as reply_count
FROM sideways_replies
GROUP BY alt_handle
ORDER BY reply_count DESC;

-- Check inbound replies posted
SELECT alt_handle, COUNT(*) as reply_count
FROM inbound_alt_replies
WHERE replied = true
GROUP BY alt_handle
ORDER BY reply_count DESC;
```

### Check for Stuck Opportunities

```sql
-- Find stuck sideways opportunities
SELECT id, detected_at, processed_at, retry_count, last_error
FROM sideways_opportunities
WHERE processed = true
  AND reply_tweet_id IS NULL
  AND processed_at < NOW() - INTERVAL '1 hour';
```

### Check Rate Limits

```sql
-- Check sideways caps per root tweet
SELECT root_tweet_id, COUNT(*) as reply_count
FROM sideways_replies
GROUP BY root_tweet_id
HAVING COUNT(*) >= 6;  -- Should be capped at 6

-- Check inbound rate limits
SELECT alt_handle, COUNT(*) as reply_count
FROM inbound_alt_replies
WHERE replied = true
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY alt_handle
HAVING COUNT(*) >= 8;  -- Should be capped at 8 per hour
```

---

## Troubleshooting

### Issue: No Opportunities Detected

**Check:**
1. Are there tweets with `status='posted'` in `response_queue`?
   ```sql
   SELECT COUNT(*) FROM response_queue WHERE status = 'posted';
   ```
2. Did you run `swarm respond` first?
3. Are there actual replies to those tweets?

**Solution:**
- Run `swarm respond` to create posted tweets
- Ensure Pelpa has recent tweets with replies

### Issue: Sideways Processing Not Working

**Check:**
1. Are there opportunities in `sideways_opportunities`?
   ```sql
   SELECT COUNT(*) FROM sideways_opportunities WHERE processed = false;
   ```
2. Check for errors in console output
3. Verify cookie files exist and are valid

**Solution:**
- Check console for error messages
- Verify cookies are not expired
- Run `swarm recover` if opportunities are stuck

### Issue: Inbound Detection Not Working

**Check:**
1. Are there entries in `sideways_replies`?
   ```sql
   SELECT COUNT(*) FROM sideways_replies;
   ```
2. Did you run `swarm sideways` first?
3. Did you run `swarm monitor` again after `sideways`?

**Solution:**
- Run `swarm sideways` to create sideways replies
- Run `swarm monitor` again to detect inbound opportunities

### Issue: Replies Not Posting

**Check:**
1. Cookie files valid?
2. Account suspended?
3. Rate limits hit?

**Solution:**
- Verify cookies are fresh (export from browser)
- Check account status manually
- Wait for rate limits to reset

### Issue: Race Conditions

**Check:**
- Are multiple processes running simultaneously?

**Solution:**
- Only run one process at a time
- The atomic UPDATE pattern prevents most race conditions
- Use `swarm recover` if opportunities get stuck

---

## Example Scenarios

### Scenario 1: Alt-to-Alt Sideways Reply

```
1. Pelpa posts: "@kloutgg is building something cool!"

2. All 4 alts amplify:
   - @FIZZonAbstract: "Chrome UI needed..."
   - @Rick_Rupen: "Focus on core..."
   - @Dope_MusicVideo: "Design matters..."
   - @aplep333: "Curious to test..."

3. User @cryptouser comments: "How does this work?"

4. System processes sideways:
   - Scores: 4 (question + "how" + length) → passes
   - Picks alt: @FIZZonAbstract (contains "how")
   - Generates: "It's automated but needs chrome UI..."
   - Posts: @FIZZonAbstract replies to @cryptouser

5. @Rick_Rupen comments: "Anyone tried the alpha yet?"

6. System processes sideways:
   - Scores: 3 (question + length) → passes
   - Picks alt: @aplep333 (excludes @Rick_Rupen, default for questions)
   - Generates: "Haven't tried it yet, but curious..."
   - Posts: @aplep333 replies to @Rick_Rupen ← ALT-TO-ALT
```

### Scenario 2: Inbound Reply

```
1. @cryptouser replies: "@FIZZonAbstract thanks! What about the API?"

2. System detects inbound:
   - Finds reply to @FIZZonAbstract
   - Inserts into inbound_alt_replies
   - Scores: 3 → passes

3. System processes inbound:
   - Generates: "API docs are in the pinned thread..."
   - Posts: @FIZZonAbstract replies back ← INBOUND
```

---

## Best Practices

### 1. Execution Timing

- Run `respond` first (creates posted tweets)
- Run `monitor` after `respond` (detects sideways)
- Run `sideways` after `monitor` (posts sideways replies)
- Run `monitor` again after `sideways` (detects inbound)
- Run `inbound` after second `monitor` (posts inbound replies)

### 2. Monitoring

- Check database regularly for stuck opportunities
- Monitor rate limits to avoid hitting caps
- Check console output for errors

### 3. Maintenance

- Run `swarm recover` periodically to clean up stuck opportunities
- Refresh cookies regularly (before they expire)
- Monitor account health (suspensions, rate limits)

### 4. Production

- Update delays in `replyConfig.ts` to human-like values
- Monitor performance metrics
- Set up alerting for failures (TODO)

---

## Limitations & Known Issues

### Current Limitations

1. **Browser Instances**: Creates new browser per reply (slower but simpler)
2. **Manual Scheduling**: Monitor runs manually (no automated scheduling yet)
3. **No Alerting**: Alerting system not yet implemented (TODO)
4. **Performance Monitoring**: Metrics/debugging deferred (TODO)

### Known Issues

1. **Stuck Opportunities**: If process crashes after atomic UPDATE, use `swarm recover`
2. **Cookie Expiration**: No automatic retry on cookie errors (logs and moves on)
3. **URL Edge Cases**: May need enhancement for different X.com URL formats

---

## Future Enhancements

### High Priority
- [ ] Performance monitoring dashboard
- [ ] Automated scheduling (cron/scheduler)
- [ ] Alerting system for failures

### Medium Priority
- [ ] Account health checks
- [ ] Cleanup jobs for stale opportunities
- [ ] Browser instance reuse optimization

### Low Priority
- [ ] Expand inbound detection (detect replies to amplify replies)
- [ ] Testing delays configuration (env variable toggle)
- [ ] Transaction safety for caps

---

## Summary

The Sideways & Inbound Reply System enables natural alt-to-alt engagement in Pelpa threads while keeping it lowkey and character-consistent. The system uses a monitor-based detection approach with separate reply services for processing, ensuring scalability and maintainability.

**Key Features:**
- ✅ Alt-to-alt replies allowed
- ✅ Only ONE alt per comment (enforced)
- ✅ Lowkey engagement (caps and scoring)
- ✅ Character consistency (persona-based replies)
- ✅ Retry logic and error handling
- ✅ Rate limiting and caps

**Quick Start:**
1. Run migration
2. Run `swarm respond`
3. Run `swarm monitor`
4. Run `swarm sideways`
5. Run `swarm monitor` (again)
6. Run `swarm inbound`

For questions or issues, check the troubleshooting section or review the console output for error messages.

