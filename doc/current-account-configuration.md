# Current Account Configuration

**Last Updated:** 2025-01-20  
**Status:** Active Configuration Overview

---

## 🤖 Bot Accounts (4 Active)

These are your accounts that post replies and comments. They monitor @pelpa333 and respond when trigger accounts are mentioned.

| Handle | Priority | Daily Cap | Status | Mode |
|--------|----------|-----------|--------|------|
| @FIZZonAbstract | 1 | 10 | Active | Cookie |
| @Rick_Rupen | 2 | 5 | Active | Cookie |
| @Dope_MusicVideo | 3 | 5 | Active | Cookie |
| @aplep333 | 4 | 5 | Active | Cookie |

**Total Daily Capacity:** 25 comments/likes across all bots

**Configuration Details:**
- Minimum time between posts: 60 minutes
- Max total daily posts: 5 (rotation config)
- Burst window: 15 minutes
- Burst max posts: 3
- Adaptive timing: Enabled (randomized intervals)

---

## 📊 Premium Sources (12 Accounts)

These accounts are scraped for premium post generation. Each account generates **2 posts per cycle**.

| Handle | Category | Posts/Cycle | Status | URL |
|--------|----------|-------------|--------|-----|
| @bankrbot | airdrop_farming | 2 | Active | https://x.com/bankrbot |
| @kloutgg | airdrop_farming | 2 | Active | https://x.com/kloutgg |
| @wallchain | airdrop_farming | 2 | Active | https://x.com/wallchain |
| @reya_xyz | airdrop_farming | 2 | Active | https://x.com/reya_xyz |
| @HeyElsaAI | airdrop_farming | 2 | Active | https://x.com/HeyElsaAI |
| @Alignerz_ | airdrop_farming | 2 | Active | https://x.com/Alignerz_ |
| @spaace_io | airdrop_farming | 2 | Active | https://x.com/spaace_io |
| @Velvet_Capital | airdrop_farming | 2 | Active | https://x.com/Velvet_Capital |
| @OneAnalog | airdrop_farming | 2 | Active | https://x.com/OneAnalog |
| @wardenprotocol | airdrop_farming | 2 | Active | https://x.com/wardenprotocol |
| @beyond__tech | airdrop_farming | 2 | Active | https://x.com/beyond__tech |
| @SCORProtocol | airdrop_farming | 2 | Active | https://x.com/SCORProtocol |

**Total Potential Posts Per Cycle:** 24 posts (12 accounts × 2 posts each)

**Scraping Configuration:**
- Scrape replies: Enabled
- Scrape limit: 30 replies per account
- Weight: 1.0 (all accounts)
- Niche: airdrop_farming

---

## 🎯 Response Triggers (12 Accounts)

When @pelpa333 mentions these accounts, your bot accounts will automatically reply.

| Trigger Account | Purpose |
|----------------|---------|
| @bankrbot | Mention detection trigger |
| @kloutgg | Mention detection trigger |
| @wallchain | Mention detection trigger |
| @reya_xyz | Mention detection trigger |
| @HeyElsaAI | Mention detection trigger |
| @Alignerz_ | Mention detection trigger |
| @spaace_io | Mention detection trigger |
| @Velvet_Capital | Mention detection trigger |
| @OneAnalog | Mention detection trigger |
| @wardenprotocol | Mention detection trigger |
| @beyond__tech | Mention detection trigger |
| @SCORProtocol | Mention detection trigger |

**Response Configuration:**
- Target account: @pelpa333 (monitored account)
- Max comments per day: 2
- Max likes per day: 5
- Response delay: 30-120 minutes (randomized)
- Min time between responses: 120 minutes (2 hours)
- Staggered responses: Enabled (each bot responds at different times)
- Comment templates: 15 unique templates configured

**Actions:**
- ✅ Comment: Enabled
- ✅ Like: Enabled
- ❌ Repost: Disabled

---

## 🔬 Research Monitoring (0 Accounts)

**Status:** Currently Disabled

- `research_monitoring.enabled: false`
- `target_accounts: []` (empty)

**Configuration (when enabled):**
- Max posts per day: 2
- Content storage: Enabled (stores in Supabase)
- Research interval: 30 minutes
- Content freshness: 24 hours

**Note:** Previously monitored accounts (@trylimitless, @bankrbot, @wallchain_xyz) are commented out and will be re-enabled shortly.

---

## 📈 Summary Statistics

| Category | Count | Details |
|----------|-------|---------|
| **Bot Accounts** | 4 | All active, total daily cap: 25 |
| **Premium Sources** | 12 | 2 posts each = 24 posts/cycle |
| **Response Triggers** | 12 | Same accounts as Premium Sources |
| **Research Monitoring** | 0 | Disabled |

---

## 🔄 Account Overlap

**Important Note:** The 12 Premium Sources and 12 Response Triggers are the **same accounts**. These accounts serve dual purposes:

1. **Premium Sources:** Scraped for content generation (2 posts per cycle)
2. **Response Triggers:** Monitored for mentions by @pelpa333 (triggers bot replies)

This means when @pelpa333 mentions any of these 12 accounts, your bots will:
- Generate premium posts from their content (2 per cycle)
- Automatically reply to @pelpa333's mentions of them

---

## 📁 Configuration Files

### Primary Config Files:
- **Bot Accounts:** `mvp/config/accounts.yaml`
  - Section: `accounts` (4 bot accounts)
  - Section: `monitoring.trigger_mentions` (12 response triggers)
  - Section: `research_monitoring.target_accounts` (empty, disabled)

- **Premium Sources:** `mvp/config/target-accounts.yaml`
  - Section: `target_accounts` (12 premium sources)

### Key Settings:
- **Rotation:** Max 5 posts/day total, burst windows enabled
- **Content:** Max 260 chars, links required, variation enabled
- **Monitoring:** Enabled, responds to @pelpa333 mentions
- **Research:** Disabled (will re-enable shortly)

---

## 🎨 Dashboard Display

In the dashboard UI, these accounts appear in:

1. **Section 1: PREMIUM_SOURCES**
   - Shows all 12 accounts from `target-accounts.yaml`
   - Displays `posts_to_generate` count (2 for each)
   - Allows add/edit/delete operations

2. **Section 2: RESPONSE_TRIGGERS**
   - Shows all 12 accounts from `accounts.yaml` → `monitoring.trigger_mentions`
   - Displays as mention detection nodes
   - Allows add/delete operations

3. **Section 3: RESEARCH_MONITORING**
   - Currently empty (disabled)
   - Would show accounts from `research_monitoring.target_accounts`

4. **Section 4: BOT_ACCOUNTS**
   - Shows all 4 bot accounts from `accounts.yaml` → `accounts`
   - Read-only display with status indicators
   - Shows priority and daily cap information

---

## 🔧 Management Operations

### Currently Supported:
- ✅ Add Premium Source (via dashboard)
- ✅ Add Research Account (via dashboard)
- ⚠️ Delete operations (UI ready, backend TODO)
- ⚠️ Update posts count (UI ready, backend TODO)
- ⚠️ Add/Delete Response Triggers (UI ready, backend TODO)

### Backend Endpoints Status:
- ✅ `GET /api/dashboard` - Returns all account data
- ✅ `GET /api/accounts` - Returns all accounts
- ✅ `POST /api/accounts` - Add account (partial: doesn't accept posts_to_generate)
- ❌ `DELETE /api/accounts` - Not implemented
- ❌ `PUT /api/accounts` - Not implemented
- ❌ `POST /api/response-triggers` - Not implemented
- ❌ `DELETE /api/response-triggers` - Not implemented
- ❌ `POST /api/research-accounts` - Not implemented
- ❌ `DELETE /api/research-accounts` - Not implemented

---

## 📝 Notes

1. **Account Overlap:** Premium Sources and Response Triggers use the same 12 accounts, creating a unified monitoring and content generation system.

2. **Research Monitoring:** Currently disabled but configured. Will be re-enabled shortly with target accounts restored.

3. **Bot Capacity:** 4 bots with staggered responses ensure natural-looking engagement patterns.

4. **Content Generation:** 12 premium sources × 2 posts each = 24 potential posts per scraping cycle.

5. **Response System:** When @pelpa333 mentions any of the 12 trigger accounts, bots respond with randomized delays (30-120 minutes) using 15 different comment templates.

---

**Document Version:** 1.0  
**Generated:** 2025-01-20  
**Source:** Configuration files analysis

