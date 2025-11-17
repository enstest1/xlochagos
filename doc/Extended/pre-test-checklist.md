# Pre-Test Checklist - Sideways/Inbound Reply System

## ✅ Before Testing Checklist

### 1. Database Migration
**Status:** ⚠️ **REQUIRED** - Must be done first

**Action:** Apply the migration SQL file to your Supabase database:

```sql
-- Run this in Supabase SQL Editor:
-- File: mvp/supabase/sideways-inbound-schema.sql
```

**Verify:**
```sql
-- Check if tables exist:
SELECT COUNT(*) FROM sideways_opportunities;
SELECT COUNT(*) FROM sideways_replies;
SELECT COUNT(*) FROM inbound_alt_replies;
```

**Expected:** Should return `0` (tables exist but empty) or error if tables don't exist.

---

### 2. Environment Variables
**Status:** ✅ **CONFIGURED** (based on .env file)

**Required:**
- ✅ `SUPABASE_URL` - Set
- ✅ `SUPABASE_SERVICE_ROLE_KEY` - Set
- ✅ `OPENROUTER_API_KEY` - Set (for LLM generation)
- ✅ `OPENPIPE_API_KEY` - Set (for training data)

**Verify:**
```bash
# Check .env file exists and has values
cat mvp/.env | grep SUPABASE
```

---

### 3. Cookie Files
**Status:** ⚠️ **REQUIRED** - Must exist for posting

**Required Files:**
- `./secrets/FIZZonAbstract.cookies.json`
- `./secrets/Rick_Rupen.cookies.json`
- `./secrets/Dope_MusicVideo.cookies.json`
- `./secrets/aplep333.cookies.json`

**Verify:**
```bash
# Check if cookie files exist
ls -la mvp/secrets/*.cookies.json
```

**Note:** At minimum, you need `FIZZonAbstract.cookies.json` for the monitor to scrape replies.

---

### 4. Dependencies
**Status:** ⚠️ **REQUIRED** - Must be installed

**Action:**
```bash
cd mvp
npm install
```

**Verify:**
```bash
# Check if node_modules exists
ls node_modules | head -5
```

---

### 5. Code Verification
**Status:** ✅ **READY** - All code files exist

**Verify:**
```bash
# Run verification script
npx ts-node src/test/sideways-inbound-verification.ts
```

**Expected:** All tests should pass.

---

## 🚀 Quick Test Sequence

Once all prerequisites are met, run this sequence:

### Step 1: Verify Installation
```bash
cd mvp
npx ts-node src/test/sideways-inbound-verification.ts
```

### Step 2: Test Database Connection
```bash
# In Supabase SQL Editor, run:
SELECT COUNT(*) FROM response_queue WHERE status = 'posted';
```

**Expected:** Should return a number (may be 0 if no tweets posted yet).

### Step 3: Run Full Cycle (Dry Run First)

**Option A: Full Cycle**
```bash
# 1. Amplify Pelpa tweets
npm run cli swarm respond

# 2. Detect sideways opportunities
npm run cli swarm monitor

# 3. Process sideways replies
npm run cli swarm sideways

# 4. Detect inbound opportunities
npm run cli swarm monitor

# 5. Process inbound replies
npm run cli swarm inbound
```

**Option B: Convenience Command**
```bash
npm run cli swarm respond
npm run cli swarm monitor
npm run cli swarm engage  # Runs sideways + inbound together
npm run cli swarm monitor  # Detect new inbound opportunities
```

---

## ⚠️ Common Issues

### Issue: "Table does not exist"
**Solution:** Run the migration SQL file in Supabase.

### Issue: "Cookie file not found"
**Solution:** Export cookies from browser and save to `./secrets/[handle].cookies.json`

### Issue: "No opportunities detected"
**Solution:** 
- Ensure `swarm respond` ran first (creates `status='posted'` tweets)
- Check if Pelpa has recent tweets with replies
- Verify monitor is scraping correctly

### Issue: "Failed to post reply"
**Solution:**
- Check cookie files are valid (not expired)
- Verify account is not suspended
- Check console for specific error messages

---

## 📊 Monitoring During Test

**Watch Console Output:**
- Look for `✅` success messages
- Watch for `❌` error messages
- Check for rate limit warnings

**Check Database:**
```sql
-- Check sideways opportunities
SELECT COUNT(*) as pending FROM sideways_opportunities WHERE processed = false;

-- Check sideways replies posted
SELECT COUNT(*) as posted FROM sideways_replies;

-- Check inbound opportunities
SELECT COUNT(*) as pending FROM inbound_alt_replies WHERE replied = false;
```

---

## ✅ Ready to Test?

**If all checkboxes are ✅, you're ready!**

Start with:
1. Run verification script
2. Run `swarm respond` (if you have Pelpa tweets to amplify)
3. Run `swarm monitor` (to detect opportunities)
4. Run `swarm sideways` (to process and post)

Good luck! 🚀

