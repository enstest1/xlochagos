# Hunting System - Accounts Needed

**Status:** Planning Phase  
**Last Updated:** 2025-01-20

---

## 🎯 Overview

The hunting system requires **VIP accounts** that are monitored for campaign-related tweets. These are different from your current account categories:

- **Premium Sources**: Scraped for content generation (posts_to_generate)
- **Response Triggers**: Monitored for mentions by @pelpa333
- **Research Monitoring**: Monitored for intelligence gathering
- **Hunting VIPs**: Monitored for campaign-related engagement opportunities ⭐ **NEW**

---

## 📋 Required VIP Accounts for Hunting

According to the hunting system implementation plan, these VIP accounts should be configured:

### Currently Configured (3/4):
1. ✅ **@kloutgg** - Already in Premium Sources
2. ✅ **@wallchain** - Already in Premium Sources  
3. ✅ **@bankrbot** - Already in Premium Sources

### Missing (1/4):
4. ❌ **@meteoraAG** - **NOT CONFIGURED** ⚠️

---

## 🔍 Account Comparison

### Current Configuration Status:

| Account | Premium Sources | Response Triggers | Research Monitoring | Hunting VIPs |
|---------|----------------|-------------------|---------------------|--------------|
| @bankrbot | ✅ | ✅ | ❌ | ✅ (needs config) |
| @kloutgg | ✅ | ✅ | ❌ | ✅ (needs config) |
| @wallchain | ✅ | ✅ | ❌ | ✅ (needs config) |
| @meteoraAG | ❌ | ❌ | ❌ | ❌ **MISSING** |

---

## 🏗️ Implementation Requirements

### 1. Create `hunter.yaml` Config File

**Location:** `mvp/config/hunter.yaml`

**Required Structure:**
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
  - "@Wallchain"      # Note: Capital W in plan
  - "@bankrbot"
  - "@meteoraAG"      # MISSING - needs to be added

search_modes:
  - "programmatic"   # twscrape first
  - "ui_latest"      # Playwright fallback

dedupe_days: 7
```

### 2. Database Campaigns Table

Each campaign can have its own `vip_whitelist` per campaign, but the global VIPs from `hunter.yaml` are always monitored.

**Campaign Structure:**
```sql
campaigns (
  name text,
  keywords text[],
  vip_whitelist text[],  -- Per-campaign VIPs (in addition to global VIPs)
  talking_points text[],
  ...
)
```

---

## 🎯 What Hunting VIPs Do

**Purpose:** Monitor VIP account timelines for tweets matching active campaigns (keywords + VIP accounts)

**Flow:**
1. System monitors VIP timelines (via twscrape or Playwright)
2. Finds tweets matching campaign keywords
3. Scores candidates (0-10)
4. Engages with high-scoring candidates using persona-based replies

**Difference from Other Account Types:**
- **Premium Sources**: Scraped for content generation → creates posts
- **Response Triggers**: Monitored for mentions → triggers replies to @pelpa333
- **Hunting VIPs**: Monitored for campaign keywords → proactive engagement on their tweets

---

## ✅ Action Items

### Immediate:
1. ❌ **Add @meteoraAG** to configuration
   - Option A: Add to Premium Sources (if you want to scrape their content)
   - Option B: Add only to Hunting VIPs (if just for hunting)
   - Option C: Add to both (if you want both content generation AND hunting)

2. ❌ **Create `hunter.yaml` config file** with VIP handles

3. ❌ **Create `hunterConfig.ts` loader** to read the config

### When Implementing Hunting System:
4. ❌ **Create database migration** (`hunting-schema.sql`)
   - `campaigns` table
   - `hunt_candidates` table  
   - `hunt_counters` table

5. ❌ **Update generation system** to support campaign context

6. ❌ **Implement hunter services** (`hunter/` directory)

---

## 🤔 Decision Needed: Where Should @meteoraAG Go?

**Option 1: Premium Sources Only**
- Add to `target-accounts.yaml`
- Use for content generation (2 posts per cycle)
- Also add to `hunter.yaml` VIPs for hunting

**Option 2: Hunting VIPs Only**
- Add only to `hunter.yaml` VIPs
- Use only for hunting engagement
- No content generation from this account

**Option 3: Both**
- Add to `target-accounts.yaml` (Premium Sources)
- Add to `hunter.yaml` VIPs
- Use for both content generation AND hunting

**Recommendation:** Option 3 (Both) - Maximizes value from the account.

---

## 📊 Current Account Coverage

### Premium Sources (12 accounts):
- @bankrbot, @kloutgg, @wallchain, @reya_xyz, @HeyElsaAI, @Alignerz_, @spaace_io, @Velvet_Capital, @OneAnalog, @wardenprotocol, @beyond__tech, @SCORProtocol

### Response Triggers (12 accounts):
- Same as Premium Sources (dual purpose)

### Research Monitoring (0 accounts):
- Currently disabled, empty list

### Hunting VIPs (0 accounts):
- **Not yet configured** - needs `hunter.yaml` file

---

## 🎯 Summary

**Missing Account:** @meteoraAG

**Missing Configuration:**
- `hunter.yaml` config file
- `hunterConfig.ts` loader
- Database schema for campaigns

**Recommendation:**
1. Add @meteoraAG to Premium Sources (if you want content generation)
2. Create `hunter.yaml` with all 4 VIP accounts (@kloutgg, @Wallchain, @bankrbot, @meteoraAG)
3. When implementing hunting system, these VIPs will be monitored for campaign opportunities

---

**Next Steps:**
1. Decide where to add @meteoraAG (Premium Sources, Hunting VIPs, or both)
2. Create `hunter.yaml` config file
3. Add @meteoraAG to appropriate configuration(s)
4. Create `hunterConfig.ts` loader when ready to implement hunting system

---

**Document Version:** 1.0  
**Related Documents:**
- `doc/hunting-system-implementation-plan.md` - Full implementation plan
- `doc/current-account-configuration.md` - Current account setup

