# 🎯 @pelpa333 Monitoring System - Deployment Guide

## 📋 Overview

This guide covers deploying and testing the complete @pelpa333 monitoring and auto-response system.

## 🗄️ Step 1: Deploy Database Schema

### Manual Deployment (Recommended)

1. **Go to Supabase Dashboard:**
   - https://supabase.com/dashboard/project/YOUR_PROJECT_ID/editor

2. **Open SQL Editor** (left sidebar)

3. **Run this SQL:**

```sql
-- Enhanced schema for @pelpa333 monitoring and auto-response system

-- Response queue for @pelpa333 mentions
CREATE TABLE IF NOT EXISTS response_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id TEXT NOT NULL,
  post_url TEXT NOT NULL,
  post_text TEXT NOT NULL,
  target_mentions TEXT[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_response' CHECK (status IN ('pending_response', 'generating_response', 'response_ready', 'posted', 'failed')),
  generated_response TEXT,
  response_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Research triggers from target accounts
CREATE TABLE IF NOT EXISTS research_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'target_accounts',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_response_queue_status ON response_queue(status);
CREATE INDEX IF NOT EXISTS idx_response_queue_created_at ON response_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_response_queue_target_mentions ON response_queue USING GIN(target_mentions);

CREATE INDEX IF NOT EXISTS idx_research_triggers_status ON research_triggers(status);
CREATE INDEX IF NOT EXISTS idx_research_triggers_priority ON research_triggers(priority);
CREATE INDEX IF NOT EXISTS idx_research_triggers_created_at ON research_triggers(created_at);

-- RLS Policies for new tables

-- Response queue policies
DROP POLICY IF EXISTS "Service role full access" ON response_queue;
CREATE POLICY "Service role full access" ON response_queue FOR ALL USING (true);

DROP POLICY IF EXISTS "Authenticated users can view" ON response_queue;
CREATE POLICY "Authenticated users can view" ON response_queue FOR SELECT USING (auth.role() = 'authenticated');

-- Research triggers policies  
DROP POLICY IF EXISTS "Service role full access" ON research_triggers;
CREATE POLICY "Service role full access" ON research_triggers FOR ALL USING (true);

DROP POLICY IF EXISTS "Authenticated users can view" ON research_triggers;
CREATE POLICY "Authenticated users can view" ON research_triggers FOR SELECT USING (auth.role() = 'authenticated');

-- Comments
COMMENT ON TABLE response_queue IS 'Queue for auto-responses to @pelpa333 mentions of target accounts';
COMMENT ON TABLE research_triggers IS 'Research topics triggered by target account content';
```

4. **Click "Run"** ✅

---

## 🧪 Step 2: Test the System

### Test 1: Monitor @pelpa333

```bash
cd mvp
npm run cli -- swarm monitor
```

**Expected Output:**
```
[cli] 🔍 Starting @pelpa333 monitoring...
[cli] ✅ Monitored @pelpa333: 20 posts
[cli] ✅ Monitored target accounts: 30 posts
[cli] 🚨 2 posts need immediate response!
[cli] Run 'npm run cli swarm respond' to process responses
```

### Test 2: Process Auto-Responses

```bash
npm run cli -- swarm respond
```

**Expected Output:**
```
[cli] 🎯 Processing @pelpa333 response queue...
📋 Found 2 pending response tasks
🤖 Generating response for @trylimitless mention...
👍 Liking post: https://x.com/pelpa333/status/...
💬 Commenting on post: https://x.com/pelpa333/status/...
✅ Successfully responded to @pelpa333 post
[cli] ✅ Response processing complete
```

### Test 3: Run Full XlochaGOS Cycle

```bash
npm run cli -- swarm once
```

**This will run:**
1. ✅ @pelpa333 monitoring
2. ✅ Target account scraping
3. ✅ RSS feed processing
4. ✅ Research generation
5. ✅ Content writing
6. ✅ Quality control
7. ✅ Image generation
8. ✅ Auto-response processing

---

## 🎯 How It Works

### Workflow Diagram

```
@pelpa333 Posts Tweet mentioning @trylimitless
        ↓
Intelligence Gatherer detects mention
        ↓
Stores in response_queue (status: pending_response)
        ↓
Response Agent generates contextual reply
        ↓
Response Agent likes the post
        ↓
Response Agent comments with generated reply
        ↓
Status updated to 'posted'
```

### Target Accounts Monitored

- **@trylimitless** - AI trading insights
- **@wallchain_xyz** - DeFi protocols
- **@bankrbot** - Banking integration

### Trigger Logic

**Response Agent activates ONLY when:**
- @pelpa333 mentions **any** of the target accounts
- Example: "@trylimitless is crushing it with AI trading!"
- ✅ System auto-likes + comments within 15 minutes

**Response Agent does NOT activate when:**
- @pelpa333 posts without mentions
- @pelpa333 mentions other accounts
- Target accounts post (just stored for intelligence)

---

## 🔍 Viewing Results

### CLI Commands

```bash
# View all content queue
npm run cli -- swarm queue

# View premium posts for manual review
npm run cli -- swarm review

# Start web dashboard
npm run cli -- swarm dashboard
```

### Web Dashboard

Open: **http://localhost:3001**

Shows real-time:
- @pelpa333 posts monitored
- Target account intelligence
- Response queue status
- Generated responses

### Supabase Dashboard

**Tables to check:**
- `response_queue` - See pending/posted responses
- `research_triggers` - Topics extracted from target accounts
- `raw_intelligence` - All scraped data with `source_type`

---

## 🚀 Running Continuously

### Option 1: Daemon Mode (Recommended)

```bash
cd mvp
npm run cli -- swarm start
```

**Runs every 30 minutes:**
- Monitors @pelpa333
- Scrapes target accounts
- Processes responses
- Generates content

### Option 2: Cron Job

```bash
# Add to crontab (every 15 minutes)
*/15 * * * * cd /path/to/mvp && npm run cli -- swarm monitor
*/15 * * * * cd /path/to/mvp && npm run cli -- swarm respond
```

---

## 🐛 Troubleshooting

### Error: "Not logged into X"

**Solution:** Run login first
```bash
npm run cli -- login @FIZZonAbstract
```

### Error: "Supabase not configured"

**Solution:** Check `.env` file
```bash
SUPABASE_URL=https://eapuldmifefsqxvfzopba.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_key_here
```

### Error: "Response Agent failed"

**Solution:** Check Playwright browser
```bash
npm install @playwright/test
npx playwright install chromium
```

### No posts detected

**Solution:** Check @pelpa333 has recent posts mentioning target accounts

---

## 📊 Expected Performance

**Monitoring Cycle (every 15-30 min):**
- @pelpa333: 20 posts scraped
- Target accounts: 30 posts scraped (10 per account)
- Response generation: 1-3 responses per cycle
- Total time: 3-5 minutes per cycle

**Response Time:**
- Detection: Instant (when cycle runs)
- Like: 2-3 seconds
- Comment: 5-7 seconds
- Total: ~15 seconds per response

---

## 🎯 Next Steps

1. **Deploy the database schema** (Step 1)
2. **Test monitoring** (`npm run cli -- swarm monitor`)
3. **Test responses** (`npm run cli -- swarm respond`)
4. **Run full cycle** (`npm run cli -- swarm once`)
5. **Start continuous monitoring** (`npm run cli -- swarm start`)

---

## 🔒 Security Notes

- Response Agent runs in **non-headless mode** for initial testing
- Change to `headless: true` in `responseAgent.ts` for production
- Cookies are saved locally in `secrets/` directory
- Rate limiting: 5 seconds between responses to avoid detection

---

## 📝 Configuration Files

**Target Accounts:**
- Edit: `config/target-accounts.yaml`
- Add more accounts to monitor

**Response Templates:**
- Edit: `src/agents/responseAgent.ts`
- Customize LLM response prompts

**Monitoring Schedule:**
- Edit: `config/agent-config.yaml`
- Adjust `check_interval_minutes`

---

## ✅ System is Ready!

All code is implemented and ready to deploy. Just need to:
1. Run the SQL schema (Step 1)
2. Test the commands (Step 2)
3. Start continuous monitoring (Step 3)

Questions? Check the logs:
```bash
npm run cli -- swarm logs
```


