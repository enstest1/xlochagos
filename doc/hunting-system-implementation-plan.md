# Hunting System Implementation Plan

## Overview

**Goal**: Implement proactive reply system that hunts for tweets matching active campaigns (keywords + VIP accounts) and engages with them using persona-based replies from alt accounts.

**Key Principle**: Only engage on tweets that match active campaigns. No random engagement.

**Status**: Planning phase - analysis and implementation roadmap

---

## ✅ Will This Work?

**YES** - The architecture is sound and follows proven patterns from the sideways/inbound system. Here's why:

1. **Reuses Existing Infrastructure**: Characters, Playwright, Supabase, persona generation
2. **Follows Established Patterns**: Similar to sideways/inbound detection → scoring → engagement flow
3. **Proper Separation**: Detection (hunting) separate from action (engagement)
4. **Database-Driven**: Campaigns stored in DB, easy to manage without code changes
5. **Scalable Design**: Can add campaigns, keywords, VIPs without code changes

---

## 🔍 Current System Analysis

### ✅ What Already Exists & Works

1. **Character System** ✅
   - `characters/*.character.json` files exist
   - `loadCharacter(username)` function exists
   - Persona prompt builder works

2. **Playwright Integration** ✅
   - `replyFromAlt()` function exists in `mvp/src/publish/playwright.ts`
   - Cookie-based authentication working
   - Reply posting functionality proven

3. **twscrape Integration** ✅
   - `mvp/src/ingest/twscrape.ts` exists
   - `twTimeline()` and `twSearch()` functions available
   - Python wrapper working

4. **Supabase Client** ✅
   - Supabase client initialized in multiple services
   - Database connection working
   - RLS policies pattern established

5. **Account Filtering** ✅
   - `isOurAccount()` function exists in `mvp/src/config/altAccounts.ts`
   - Can filter out our own accounts

6. **Content Filtering** ✅
   - `isGarbage()` function exists in `mvp/src/utils/contentFilter.ts`
   - Spam detection working

7. **Alt Helpers** ✅
   - `getCookiePath()` and `getAccountCfgForAlt()` exist
   - Cookie path resolution working

### ⚠️ What Needs to be Created/Updated

1. **Campaigns Table** ❌
   - Does NOT exist in Supabase
   - Need to create migration

2. **Hunt Tables** ❌
   - `hunt_candidates` table doesn't exist
   - `hunt_counters` table doesn't exist
   - Need to create migration

3. **Campaign Context in Generation** ⚠️
   - `generatePersonaReply()` exists but doesn't support campaign context
   - Need to add `mode: 'hunting'` and campaign parameter

4. **Hunter Config** ❌
   - `mvp/config/hunter.yaml` doesn't exist
   - Need to create config file

5. **Hunter Service** ❌
   - No hunter service exists
   - Need to create `mvp/src/hunter/` directory and services

6. **Playwright Search Scraper** ⚠️
   - Need to create fallback scraper for `/search?f=live` pages
   - twscrape exists but may fail, need Playwright backup

7. **CLI Command** ⚠️
   - Need to add `swarm hunt` command to `mvp/src/cli.ts`

---

## 📋 Required Updates & Dependencies

### 1. Database Schema Updates

**New Migration File**: `mvp/supabase/hunting-schema.sql`

**Tables to Create**:

```sql
-- Campaigns table (NEW)
CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  status text NOT NULL CHECK (status IN ('active','paused','ended')),
  keywords text[] NOT NULL DEFAULT '{}',
  vip_whitelist text[] NOT NULL DEFAULT '{}',
  talking_points text[] NOT NULL DEFAULT '{}',
  do text[] NOT NULL DEFAULT '{}',
  dont text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Hunt candidates table (NEW)
CREATE TABLE IF NOT EXISTS hunt_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tweet_id text NOT NULL,
  tweet_url text NOT NULL,
  author_handle text NOT NULL,
  author_followers int,
  found_via text NOT NULL CHECK (found_via IN ('vip', 'search')),
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  score int NOT NULL,
  picked boolean DEFAULT false,
  replied boolean DEFAULT false,
  alt_handle text,
  reply_tweet_id text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (tweet_id, campaign_id)
);

-- Hunt counters table (NEW)
CREATE TABLE IF NOT EXISTS hunt_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  d date NOT NULL,
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  alt_handle text NOT NULL,
  count int NOT NULL DEFAULT 0,
  UNIQUE (d, campaign_id, alt_handle)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hunt_c_by_camp ON hunt_candidates(campaign_id);
CREATE INDEX IF NOT EXISTS idx_hunt_c_by_author ON hunt_candidates(author_handle);
CREATE INDEX IF NOT EXISTS idx_hunt_c_by_picked ON hunt_candidates(picked, replied);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
```

**Dependencies**: None - standalone tables

**RLS Policies**: Add service role full access, authenticated users SELECT only (same pattern as sideways/inbound)

---

### 2. Generation System Updates

**File**: `mvp/src/generation.ts`

**Current State**:
- `generatePersonaReply()` exists
- Supports `mode: "amplify" | "sideways" | "inbound"`
- Does NOT support campaign context

**Required Changes**:

1. **Add 'hunting' mode**:
```typescript
export type ReplyMode = "amplify" | "sideways" | "inbound" | "hunting";
```

2. **Add campaign context to ReplyContext**:
```typescript
export interface ReplyContext {
  mode: ReplyMode;
  altHandle: string;
  rootTweetText?: string;
  parentText?: string;
  fromUser?: string;
  campaign?: {                    // NEW
    name: string;
    talkingPoints: string[];
    do: string[];
    dont: string[];
  };
}
```

3. **Update prompt builder** to inject campaign context when `mode === 'hunting'`:
```typescript
// In generatePersonaReply(), add campaign block:
const campaignBlock = ctx.mode === 'hunting' && ctx.campaign
  ? `CAMPAIGN CONTEXT:\n- Active campaign: ${ctx.campaign.name}\n- Talking points: ${ctx.campaign.talkingPoints.join(', ')}\n- Do: ${ctx.campaign.do.join(', ')}\n- Don't: ${ctx.campaign.dont.join(', ')}\n\n`
  : '';
```

**Impact**: Low - additive changes, backward compatible

---

### 3. Configuration File

**New File**: `mvp/config/hunter.yaml`

**Structure**:
```yaml
enabled: true
poll_interval_sec: 120
lookback_minutes: 180
min_author_followers: 50
max_per_campaign_per_run: 4
max_per_campaign_per_day: 24
max_per_alt_per_day: 20
random_delay_ms:
  min: 4000
  max: 22000

vip_handles:
  - "@kloutgg"
  - "@Wallchain"
  - "@bankrbot"
  - "@meteoraAG"

search_modes:
  - "programmatic"   # twscrape first
  - "ui_latest"      # Playwright fallback

dedupe_days: 7
```

**Config Loader**: Create `mvp/src/config/hunterConfig.ts` similar to `replyConfig.ts`

---

### 4. Hunter Service Architecture

**New Directory**: `mvp/src/hunter/`

**Files to Create**:

1. **`hunter.ts`** - Main orchestrator
   - `runHunterCycle()` - Main entry point
   - Coordinates all sub-services

2. **`sources.ts`** - Candidate fetching
   - `fetchVipCandidates(campaign, cfg)` - Fetch from VIP timelines
   - `fetchSearchCandidates(campaign, cfg)` - Fetch from search results
   - Uses twscrape first, Playwright fallback

3. **`score.ts`** - Scoring logic
   - `scoreCandidate(text, author, isVip, keywordHits)` - Score 0-10
   - `dropSpam(text)` - Spam detection
   - `isVipAuthor(handle, campaign, globalVips)` - VIP check

4. **`quotas.ts`** - Quota enforcement
   - `applyQuotas(candidates, campaign, cfg, now)` - Filter by quotas
   - `checkCampaignQuota(campaignId, date)` - Per-campaign checks
   - `checkAltQuota(altHandle, date)` - Per-alt checks

5. **`engage.ts`** - Engagement logic
   - `engageCandidate(candidate, campaign, cfg)` - Full engagement flow
   - `pickAltForCandidate(candidate, campaign)` - Alt selection
   - `upsertHuntCandidate(data)` - Save to DB
   - `incrementHuntCounter(date, campaignId, altHandle)` - Update counters

6. **`scraper.ts`** - Playwright search scraper (fallback)
   - `scrapeSearchLatest(keyword, limit)` - Scrape `/search?f=live` page
   - Handles scrolling, extraction, deduplication

**Dependencies**:
- `generation.ts` (updated)
- `publish/playwright.ts` (existing)
- `ingest/twscrape.ts` (existing)
- `utils/altHelpers.ts` (existing)
- `utils/contentFilter.ts` (existing)
- `config/altAccounts.ts` (existing)

---

### 5. Playwright Search Scraper (Fallback)

**New File**: `mvp/src/hunter/scraper.ts`

**Purpose**: Fallback when twscrape fails or unavailable

**Implementation**:
- Open `https://x.com/search?q=${keyword}&f=live`
- Wait for `[data-testid="tweet"]` elements
- Scroll 6-10 times with delays
- Extract: author, tweetId, text, url, created_at
- Return list of candidates

**Reuses**: Cookie loading from `getAccountCfgForAlt()`

**Similar to**: `mvp/src/services/targetAccountScraper.ts` (can reuse patterns)

---

### 6. CLI Integration

**File**: `mvp/src/cli.ts`

**Add Command**:
```typescript
if (subCmd === "hunt") {
  const { runHunterCycle } = await import("./hunter/hunter");
  await runHunterCycle();
  return;
}
```

**Update Usage**: Add `hunt` to command list

**Scheduling**: Document cron setup (PM2 or system cron)

---

## 🔄 Integration Points

### How It Fits with Existing Systems

1. **Sideways/Inbound Systems**: 
   - ✅ **Independent** - Doesn't interfere
   - ✅ **Separate Tables** - No conflicts
   - ✅ **Separate Quotas** - Different limits
   - ✅ **Same Alt Accounts** - Shares alt pool

2. **Response Queue**:
   - ✅ **No Conflict** - Different purpose (hunting vs amplification)
   - ✅ **Separate Tracking** - Uses `hunt_candidates` table

3. **Character System**:
   - ✅ **Reuses** - Same character files and loader
   - ✅ **Extends** - Adds campaign context to prompts

4. **Playwright**:
   - ✅ **Reuses** - Same `replyFromAlt()` function
   - ✅ **Extends** - Adds search scraper fallback

---

## ⚠️ Potential Issues & Solutions

### Issue 1: Campaign Table Doesn't Exist
**Solution**: Create migration file and apply to Supabase

### Issue 2: twscrape May Fail
**Solution**: Implement Playwright fallback scraper (already planned)

### Issue 3: Quota Conflicts
**Solution**: Separate quota tables (`hunt_counters`) - no conflict with sideways/inbound

### Issue 4: Alt Selection Conflicts
**Solution**: Check both `hunt_counters` AND existing daily caps before selecting alt

### Issue 5: Campaign Context Not in Generation
**Solution**: Update `generatePersonaReply()` to accept campaign parameter (already planned)

### Issue 6: Deduplication Across Systems
**Solution**: 
- Hunting uses `hunt_candidates` table (separate)
- Sideways uses `sideways_opportunities` table (separate)
- No cross-system deduplication needed (different purposes)

### Issue 7: VIP Account Detection
**Solution**: 
- Check `hunter.yaml` global VIPs
- Check `campaigns.vip_whitelist` per-campaign VIPs
- Combine for final VIP list

---

## 📊 Implementation Phases

### Phase 1: Foundation (Prerequisites)
1. ✅ Create database migration (`hunting-schema.sql`)
2. ✅ Apply migration to Supabase
3. ✅ Create `hunter.yaml` config file
4. ✅ Create config loader (`hunterConfig.ts`)

### Phase 2: Core Services
1. ✅ Create `hunter/` directory structure
2. ✅ Implement `score.ts` (scoring logic)
3. ✅ Implement `sources.ts` (candidate fetching)
4. ✅ Implement `scraper.ts` (Playwright fallback)

### Phase 3: Engagement
1. ✅ Update `generation.ts` for campaign context
2. ✅ Implement `quotas.ts` (quota enforcement)
3. ✅ Implement `engage.ts` (engagement logic)
4. ✅ Implement `hunter.ts` (orchestrator)

### Phase 4: Integration
1. ✅ Add CLI command (`swarm hunt`)
2. ✅ Test end-to-end flow
3. ✅ Add error handling and logging
4. ✅ Document cron setup

### Phase 5: Testing & Refinement
1. ✅ Test VIP feed fetching
2. ✅ Test search fallback
3. ✅ Test quota enforcement
4. ✅ Test campaign context in replies
5. ✅ Test deduplication

---

## 🎯 Key Design Decisions

### 1. Campaign-Driven Engagement
**Decision**: Only engage on tweets matching active campaigns
**Rationale**: Keeps engagement focused and high-signal, avoids random spam

### 2. Separate Quota System
**Decision**: Use `hunt_counters` table separate from sideways/inbound
**Rationale**: Different engagement patterns, different limits needed

### 3. twscrape First, Playwright Fallback
**Decision**: Try twscrape, fallback to Playwright if fails
**Rationale**: twscrape faster/more reliable, Playwright ensures we always have a way

### 4. Campaign Context in Prompts
**Decision**: Inject campaign talking points into persona prompts
**Rationale**: Ensures replies are campaign-relevant while staying in character

### 5. Scoring Before Quotas
**Decision**: Score candidates first, then apply quotas
**Rationale**: Only process high-quality candidates, saves quota for best opportunities

---

## 🔧 Technical Considerations

### Performance
- **Batch Processing**: Process candidates in batches (20-50 at a time)
- **Parallel VIP Fetching**: Fetch multiple VIP timelines in parallel
- **Database Indexes**: Ensure proper indexes on `hunt_candidates` for fast queries

### Error Handling
- **Graceful Degradation**: If twscrape fails, use Playwright
- **Quota Failures**: Log but don't crash if quota check fails
- **Posting Failures**: Mark `picked=true, replied=false` to avoid retry loops

### Rate Limiting
- **Respect X.com Limits**: Use delays between posts
- **Respect Our Limits**: Enforce per-alt, per-campaign quotas
- **Jitter Delays**: Randomize delays to avoid patterns

### Monitoring
- **Logging**: Log all candidates found, scored, engaged
- **Metrics**: Track success rate, quota usage, campaign performance
- **Alerts**: Alert on quota exhaustion, high failure rates

---

## 📝 Testing Checklist

### Unit Tests
- [ ] Scoring algorithm (scoreCandidate)
- [ ] VIP detection (isVipAuthor)
- [ ] Spam detection (dropSpam)
- [ ] Quota checks (applyQuotas)
- [ ] Alt selection (pickAltForCandidate)

### Integration Tests
- [ ] VIP feed fetching (twscrape)
- [ ] Search fetching (twscrape + Playwright fallback)
- [ ] Campaign context in generation
- [ ] Database operations (insert, update, counters)
- [ ] Reply posting (Playwright)

### End-to-End Tests
- [ ] Full cycle: fetch → score → quota → engage
- [ ] Deduplication across runs
- [ ] Quota enforcement (per-campaign, per-alt)
- [ ] Campaign context in replies
- [ ] Error recovery (failed posts, stuck candidates)

### Manual Tests
- [ ] Create test campaign
- [ ] Run hunter cycle
- [ ] Verify replies posted
- [ ] Verify database entries
- [ ] Verify quota counters
- [ ] Verify deduplication

---

## 🚀 Deployment Considerations

### Initial Setup
1. Create campaigns in database (via SQL or admin UI)
2. Configure `hunter.yaml` with VIPs and settings
3. Test with `enabled: false` first
4. Enable when ready

### Monitoring
- Watch `hunt_candidates` table for stuck candidates
- Monitor `hunt_counters` for quota usage
- Check logs for errors/failures
- Track engagement success rate

### Scaling
- Start with conservative quotas (4 per run, 24 per day)
- Increase based on performance
- Add more campaigns gradually
- Monitor for rate limit issues

---

## 📚 Documentation Needed

1. **Campaign Management Guide**: How to create/manage campaigns
2. **Hunting System Guide**: How the system works, flow diagrams
3. **Troubleshooting Guide**: Common issues and solutions
4. **Cron Setup Guide**: How to schedule hunter cycles
5. **API Reference**: Function signatures, parameters, return types

---

## ✅ Summary: Will This Work?

**YES** - The plan is solid and implementable. Here's why:

1. ✅ **Reuses Existing Infrastructure**: Characters, Playwright, twscrape all exist
2. ✅ **Follows Proven Patterns**: Similar to sideways/inbound system
3. ✅ **Proper Separation**: Detection separate from action
4. ✅ **Database-Driven**: Easy to manage campaigns without code changes
5. ✅ **Scalable Design**: Can add campaigns/keywords/VIPs easily
6. ✅ **Error Resilient**: Fallbacks for twscrape, graceful error handling
7. ✅ **Quota Protected**: Separate quota system prevents over-engagement

**Required Updates**:
- ✅ Database migration (3 new tables)
- ✅ Generation system update (campaign context)
- ✅ New hunter service (6 files)
- ✅ Config file and loader
- ✅ CLI command
- ✅ Playwright search scraper (fallback)

**No Breaking Changes**: All updates are additive, existing systems unaffected.

---

## 🎯 Next Steps

1. **Review this plan** with team
2. **Create database migration** (`hunting-schema.sql`)
3. **Create config file** (`hunter.yaml`)
4. **Update generation system** (add campaign context)
5. **Implement hunter services** (phase by phase)
6. **Test thoroughly** before enabling
7. **Deploy and monitor**

---

*Last Updated: 2025-11-16*  
*Status: Planning Complete - Ready for Implementation*  
*Estimated Implementation Time: 2-3 days*

