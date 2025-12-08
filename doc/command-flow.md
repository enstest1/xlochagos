# XlochaGOS Command Flow & Server Setup

## 🚀 Server Setup

### Running the Dashboard (Backend + Frontend)

**Option 1: Run both servers together (Recommended)**
```bash
npm run dev:all
```
or
```bash
npm run dashboard:dev
```

This runs:
- **Backend Server** on `http://localhost:3001` (API endpoints)
- **Frontend React App** on `http://localhost:5174` (Dashboard UI)

**Option 2: Run servers separately**

**Terminal 1 - Backend Server:**
```bash
npm run dashboard
# or
npm run cli swarm dashboard
```

**Terminal 2 - Frontend React App:**
```bash
cd dashboard-react
npm run dev
```

**Access:**
- Dashboard UI: `http://localhost:5174`
- Backend API: `http://localhost:3001`
- API Endpoints: `http://localhost:3001/api/dashboard`, `http://localhost:3001/api/accounts`, etc.

---

## 📝 Premium Content Generation

### Standalone Premium Generator
```bash
npm run cli swarm premium-standalone
```

**What it does:**
1. Scrapes premium target accounts (@bankrbot, @wallchain_xyz, @kloutgg, etc.)
2. Researches premium intelligence using Perplexity
3. Generates premium posts with images
4. Stores posts in Supabase with `status = pending_manual_review` and `created_by_agent = standalone_premium_generator`

**Output:**
- Posts appear in dashboard at `http://localhost:5174` under "02 PREMIUM" tab
- Posts are ready for manual review and approval

### Other Premium Commands
```bash
npm run cli swarm premium          # Generate premium content for @pelpa333 airdrop farming
npm run cli swarm premium-workflow # Full premium workflow
npm run cli swarm premium-only     # Premium-only generation
```

---

## 🔄 Sideways/Inbound Reply System

### Quick Reference

#### Full Cycle (Complete Workflow)
```bash
# Step 1: Monitor scrapes @pelpa333 and creates response_queue entries
npm run cli swarm monitor

# Step 2: Amplify Pelpa tweets (alts reply directly to Pelpa)
npm run cli swarm respond

# Step 3: Detect sideways opportunities (separate command - time-intensive)
npm run cli swarm sideways-monitor

# Step 4: Process and post sideways replies
npm run cli swarm sideways

# Step 5: Detect inbound opportunities (replies to our alts)
npm run cli swarm sideways-monitor

# Step 6: Process and post inbound replies
npm run cli swarm inbound
```

---

### Convenience Commands

#### Option 1: Use `engage` command (runs sideways + inbound together)
```bash
npm run cli swarm monitor          # Scrape @pelpa333 & create response_queue entries
npm run cli swarm respond          # Amplify Pelpa tweets
npm run cli swarm sideways-monitor # Detect sideways opportunities
npm run cli swarm engage           # Process sideways + inbound together
npm run cli swarm sideways-monitor # Detect new inbound opportunities
```

#### Option 2: Run individually
```bash
npm run cli swarm monitor          # Scrape @pelpa333 & create response_queue entries
npm run cli swarm respond          # Amplify
npm run cli swarm sideways-monitor # Detect sideways opportunities
npm run cli swarm sideways         # Post sideways replies
npm run cli swarm sideways-monitor # Detect inbound opportunities
npm run cli swarm inbound          # Post inbound replies
```

---

### Individual Commands Explained

#### `npm run cli swarm monitor`
**Purpose:** Scrape @pelpa333 timeline and create response queue entries  
**Does:**
- Scrapes @pelpa333 timeline (last 48 hours, stores in `raw_intelligence`)
- Creates response_queue entries for posts mentioning trigger accounts (status='pending_response')
- Fast execution (~1-2 minutes) - focused on timeline scraping only
**Run:** FIRST before `respond` to create response_queue entries

#### `npm run cli swarm sideways-monitor`
**Purpose:** Detect sideways and inbound opportunities (time-intensive)  
**Does:**
- Checks posted tweets from `response_queue` (last 24 hours)
- Scrapes replies to detect sideways opportunities
- Scrapes replies to our alt's comments to detect inbound opportunities
- Flags opportunities in `sideways_opportunities` and `inbound_alt_replies` tables
- Takes ~5-10 minutes (scrapes replies for multiple tweets)
**Run:** After `respond` to detect sideways, and after `sideways` to detect inbound
**Note:** Run less frequently than `monitor` (every 30-60 minutes vs every 5-10 minutes)

#### `npm run cli swarm respond`
**Purpose:** Initial amplification - alts reply directly to Pelpa tweets  
**Does:**
- Reads from `response_queue` where `status='pending_response'`
- Generates and posts replies
- Sets: `response_queue.status = 'posted'`  
**Required for:** Sideways detection (monitor checks for `status='posted'` tweets)
**Requires:** `monitor` to run first to create response_queue entries

#### `npm run cli swarm sideways`
**Purpose:** Process and post sideways replies  
**Does:**
- Claims opportunities atomically
- Generates persona-based replies
- Posts replies to comments
- Saves to `sideways_replies` table

#### `npm run cli swarm inbound`
**Purpose:** Process and post inbound replies  
**Does:**
- Gets unreplied inbound mentions
- Checks rate limits
- Generates persona-based replies
- Posts replies to @mentions

#### `npm run cli swarm engage`
**Purpose:** Run both sideways + inbound together  
**Does:** Runs `sideways` then `inbound` sequentially

#### `npm run cli swarm recover`
**Purpose:** Recover stuck opportunities  
**Does:** Resets opportunities stuck in `processed=true` state without `reply_tweet_id`

---

## 🎯 Typical Daily Workflow

### Morning Routine
```bash
# 1. Generate premium content
npm run cli swarm premium-standalone

# 2. Review in dashboard
# Open http://localhost:5174 → "02 PREMIUM" tab

# 3. Review & post manually to your account

# 4. Engagement cycle
# IMPORTANT: Monitor MUST run first to scrape @pelpa333 and create response_queue entries
npm run cli swarm monitor          # Scrape @pelpa333 & create response_queue entries
npm run cli swarm respond          # Process response_queue entries (alts reply to Pelpa)
npm run cli swarm sideways-monitor # Detect sideways opportunities (time-intensive)
npm run cli swarm sideways         # Post sideways replies
npm run cli swarm sideways-monitor # Detect inbound opportunities (time-intensive)
npm run cli swarm inbound         # Post inbound replies
```

---

## 📊 Monitoring & Review Commands

### View Content Queue
```bash
npm run cli swarm queue
```
Shows:
- Raw intelligence items
- Research data
- Content queue with status, quality scores, and images

### Review Premium Posts
```bash
npm run cli swarm review
```
Shows premium posts pending manual review with:
- Quality scores
- Content text
- Image status
- Post IDs for approval/rejection

### Check Opportunities
```bash
npx ts-node src/test/check-opportunities.ts
```

### Check Results
```bash
npx ts-node src/test/check-results.ts
```

### Check Migration Status
```bash
npx ts-node src/test/check-migration.ts
```

---

## 🔧 Orchestrator Commands

### Continuous Mode (30-minute cycles)
```bash
npm run cli swarm start
```
Runs the full orchestrator continuously with 30-minute cycles.

### Single Cycle
```bash
npm run cli swarm once
```
Runs one complete cycle and exits.

---

## 🛠️ Utility Commands

### Verify Cookies
```bash
npm run cli verify-cookies [cookie_path]
```
Verifies authentication cookies for an account.

### Dashboard (Backend Only)
```bash
npm run cli swarm dashboard
# or
npm run dashboard
```
Starts the backend server only (no frontend).

---

## ⚠️ Execution Order (CRITICAL)

**MUST run in this order for reply system:**

1. `monitor` → Scrapes @pelpa333 timeline and creates response_queue entries
2. `respond` → Creates posted tweets (sets `status='posted'`)
3. `sideways-monitor` → Detects sideways opportunities (needs `status='posted'`)
4. `sideways` → Posts sideways replies
5. `sideways-monitor` → Detects inbound opportunities (needs `sideways_replies`)
6. `inbound` → Posts inbound replies

**Why this order?**
- `monitor` must run first to scrape timeline and create response_queue entries
- `respond` creates posted tweets that `sideways-monitor` needs to detect sideways opportunities
- `sideways-monitor` checks `response_queue.status='posted'` for sideways detection
- `sideways` creates `sideways_replies` entries that `sideways-monitor` needs for inbound detection
- Each step depends on the previous step completing

**Performance Notes:**
- `monitor` is fast (~1-2 minutes) - run frequently (every 5-10 minutes)
- `sideways-monitor` is time-intensive (~5-10 minutes) - run less frequently (every 30-60 minutes)

---

## 📋 Quick Copy-Paste Sequences

### Full Reply Cycle
```bash
# Full cycle (copy-paste all at once)
# IMPORTANT: Monitor MUST run first to create response_queue entries
npm run cli swarm monitor && \
npm run cli swarm respond && \
npm run cli swarm sideways-monitor && \
npm run cli swarm sideways && \
npm run cli swarm sideways-monitor && \
npm run cli swarm inbound
```

### Using Convenience Command
```bash
# IMPORTANT: Monitor MUST run first to create response_queue entries
npm run cli swarm monitor && \
npm run cli swarm respond && \
npm run cli swarm sideways-monitor && \
npm run cli swarm engage && \
npm run cli swarm sideways-monitor
```

### Premium + Reply Cycle
```bash
# Generate premium content
npm run cli swarm premium-standalone && \

# Then run reply cycle (monitor MUST run first)
npm run cli swarm monitor && \
npm run cli swarm respond && \
npm run cli swarm sideways-monitor && \
npm run cli swarm engage && \
npm run cli swarm sideways-monitor
```

---

## 🐛 Troubleshooting

### No opportunities detected?
```bash
# Check if tweets are posted
npm run cli swarm respond

# Then run sideways-monitor to detect opportunities
npm run cli swarm sideways-monitor
```

### Stuck opportunities?
```bash
npm run cli swarm recover
```

### Check what's in database
```bash
npx ts-node src/test/check-results.ts
```

### Dashboard not loading?
```bash
# Make sure both servers are running
npm run dev:all

# Check if backend is running
curl http://localhost:3001/api/dashboard

# Check if frontend is running
curl http://localhost:5174
```

### Premium posts not showing?
```bash
# Verify posts were generated
npm run cli swarm queue

# Check premium posts specifically
npm run cli swarm review

# Verify in Supabase dashboard
# Filter: status = pending_manual_review AND created_by_agent = standalone_premium_generator
```

---

## 📚 Command Reference Summary

### Server Commands
- `npm run dev:all` - Run both backend + frontend
- `npm run dashboard` - Backend server only
- `cd dashboard-react && npm run dev` - Frontend only

### Premium Commands
- `npm run cli swarm premium-standalone` - Generate premium posts (scrape → research → write)
- `npm run cli swarm premium` - Generate premium content for airdrop farming
- `npm run cli swarm review` - Review premium posts

### Reply System Commands
- `npm run cli swarm monitor` - Scrape @pelpa333 timeline & create response queue (fast, ~1-2 min)
- `npm run cli swarm respond` - Amplify Pelpa tweets
- `npm run cli swarm sideways-monitor` - Detect sideways & inbound opportunities (time-intensive, ~5-10 min)
- `npm run cli swarm sideways` - Post sideways replies
- `npm run cli swarm inbound` - Post inbound replies
- `npm run cli swarm engage` - Run sideways + inbound together
- `npm run cli swarm recover` - Recover stuck opportunities

### Monitoring Commands
- `npm run cli swarm queue` - View content queue
- `npm run cli swarm review` - Review premium posts
- `npm run cli swarm start` - Start continuous orchestrator
- `npm run cli swarm once` - Run single cycle

### Utility Commands
- `npm run cli verify-cookies` - Verify authentication cookies

---

## 🌐 URLs & Ports

- **Frontend Dashboard:** `http://localhost:5174`
- **Backend API:** `http://localhost:3001`
- **API Endpoints:**
  - `GET http://localhost:3001/api/dashboard` - Dashboard data
  - `POST http://localhost:3001/api/accounts` - Add accounts
  - `GET http://localhost:3001/api/generated/*` - Generated images

---

## 💡 Tips

1. **Always run servers first** before using CLI commands that need the dashboard
2. **Premium generator** can run independently - doesn't need servers
3. **Reply system** requires proper order: monitor → respond → sideways-monitor → sideways → sideways-monitor → inbound
4. **Use `engage`** command to save time when processing both sideways and inbound
5. **Check `queue`** command regularly to see what's been generated
6. **Review premium posts** in dashboard UI for better UX than CLI
7. **Monitor vs Sideways-Monitor**: Run `monitor` frequently (every 5-10 min), `sideways-monitor` less frequently (every 30-60 min) due to time intensity
