# 🖥️ Terminal Setup Guide - XlochaGOS

## How Many Terminals Do I Need?

---

## ⚡ **ANSWER: 2 Terminals (Recommended)**

### **Terminal 1: Web Dashboard** 🌐
### **Terminal 2: System Operations** 🤖

---

## 🎯 **Complete Setup Instructions**

### **Step 1: Open Terminal 1 (Dashboard)**

```bash
cd c:\Users\tomic\Desktop\Cursor\x_leaderboard\mvp
npm run dashboard
```

**Expected output:**
```
🎯 XlochaGOS Dashboard running at http://localhost:3001
📊 View your data at: http://localhost:3001
```

**Action:**
- Leave this terminal running
- Open http://localhost:3001 in your browser
- The dashboard will auto-refresh every 30 seconds

---

### **Step 2: Open Terminal 2 (System)**

```bash
cd c:\Users\tomic\Desktop\Cursor\x_leaderboard\mvp

# Option A: Run once (for testing)
npm run cli -- swarm once

# Option B: Run continuously (for production)
npm run cli -- swarm start
```

**What happens:**
1. Agent 1 scrapes Twitter accounts and RSS feeds (2-3 min)
2. Agent 2 conducts Perplexity research (3-4 min)
3. Agent 3 generates 30 posts (20 auto + 10 premium) (2-3 min)
4. Agent 4 reviews quality and flags premium posts (1 min)
5. Agent 6 generates images for all posts (2-3 min)

**Total time: ~10-15 minutes per cycle**

---

## 📊 **Alternative Setups**

### **Option A: Minimal (1 Terminal)** ⚡

Just run the system and view output in terminal:

```bash
cd mvp
npm run cli -- swarm once
npm run cli -- swarm queue
```

**Pros:**
- ✅ Simple
- ✅ Fast
- ✅ No extra processes

**Cons:**
- ❌ No visual dashboard
- ❌ Must run commands to see updates

---

### **Option B: Full Experience (2 Terminals)** ⭐ RECOMMENDED

```bash
# Terminal 1 (keep open)
npm run dashboard

# Terminal 2 (run as needed)
npm run cli -- swarm once
```

**Pros:**
- ✅ Beautiful visual dashboard
- ✅ Real-time updates
- ✅ One-click approve/reject
- ✅ Image previews

**Cons:**
- ⚠️ Uses 2 terminals
- ⚠️ Extra Node process

---

### **Option C: Production (1-2 Terminals)** 🚀

```bash
# Terminal 1 (optional)
npm run dashboard

# Terminal 2 (continuous)
npm run cli -- swarm start
```

**Pros:**
- ✅ Hands-off operation
- ✅ Runs 24/7
- ✅ 30-minute cycles

**Cons:**
- ⚠️ Uses resources continuously

---

## 🎨 **What Each Terminal Does**

### **Terminal 1: Dashboard Server** 🌐

```bash
npm run dashboard
```

**Purpose:**
- Serves web interface on port 3001
- Fetches data from Supabase
- Provides API for approve/reject actions

**Resources:**
- Memory: ~50-100 MB
- CPU: ~1-2% (idle), ~5-10% (active)
- Network: Minimal (Supabase API calls)

**Status:** Keep running all day

---

### **Terminal 2: XlochaGOS System** 🤖

```bash
npm run cli -- swarm once  # OR
npm run cli -- swarm start
```

**Purpose:**
- Runs all 6 agents
- Scrapes Twitter/RSS
- Generates research
- Creates posts
- Generates images

**Resources:**
- Memory: ~200-500 MB
- CPU: ~20-50% (active), ~5% (idle between cycles)
- Network: High (Twitter, Perplexity, OpenRouter, Gemini APIs)

**Status:** Run as needed (once) or continuously (start)

---

## 📋 **Step-by-Step First Run**

### **1. Open PowerShell/Terminal 1**

```powershell
cd c:\Users\tomic\Desktop\Cursor\x_leaderboard\mvp
npm run dashboard
```

**Wait for:**
```
🎯 XlochaGOS Dashboard running at http://localhost:3001
```

### **2. Open Browser**

Navigate to: http://localhost:3001

You should see:
- Empty dashboard (no data yet)
- Stats showing 0s

### **3. Open PowerShell/Terminal 2**

```powershell
cd c:\Users\tomic\Desktop\Cursor\x_leaderboard\mvp
npm run cli -- swarm once
```

**Watch the output:**
```
[Agent 1] Starting intelligence gathering...
[Agent 1] Scraped 45 items
[Agent 2] Starting research...
[Agent 2] Completed 15 research reports
[Agent 3] Starting content generation...
[Agent 3] Generated 30 posts
[Agent 4] Starting quality control...
[Agent 4] Approved 20 posts, flagged 10 for review
[Agent 6] Starting image generation...
[Agent 6] Generated 30 images
```

### **4. Refresh Dashboard**

Go back to http://localhost:3001

You should now see:
- Stats populated (30 posts, 10 pending review, etc.)
- All sections filled with data
- Premium posts with approve/reject buttons

### **5. Review Content**

In Terminal 2:
```bash
npm run cli -- swarm review
```

Or use the web dashboard to review and approve posts!

---

## 🔄 **Typical Daily Workflow**

### **Morning:**

#### Terminal 1 (Start once, leave open)
```bash
cd mvp
npm run dashboard
```
- Open http://localhost:3001
- Keep browser tab open

#### Terminal 2 (Run once)
```bash
cd mvp
npm run cli -- swarm once
```
- Wait ~10 minutes for completion
- Dashboard will auto-update

### **Throughout the Day:**

- Check dashboard periodically
- Review premium posts when notified
- Approve/reject in Supabase or web UI

### **Evening:**

- Close Terminal 2 (system)
- Optionally close Terminal 1 (dashboard)

---

## 💡 **Pro Tips**

### **Tip 1: Use Windows Terminal**

Install Windows Terminal for better experience:
- Tabs for multiple terminals
- Split panes
- Better colors

### **Tip 2: Keep Dashboard Open**

Set browser to auto-reload tab:
- Install browser extension "Auto Refresh"
- Or just let the dashboard's built-in refresh work

### **Tip 3: Run in Background**

Use `start` command to run in background:
```powershell
start powershell -Command "cd mvp; npm run dashboard"
```

### **Tip 4: Schedule Runs**

Use Windows Task Scheduler:
- Schedule `npm run cli -- swarm once` every 6 hours
- No need to keep Terminal 2 open

---

## 🚨 **Troubleshooting**

### **"Port 3001 already in use"**

```bash
# Find and kill the process
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

### **"Module not found"**

```bash
cd mvp
npm install
npm run build
```

### **Dashboard won't load**

1. Check Terminal 1 is running
2. Verify http://localhost:3001 in browser
3. Check firewall isn't blocking port 3001

### **No data showing**

1. Run the system first: `npm run cli -- swarm once`
2. Wait for completion (~10 min)
3. Refresh browser

---

## ✅ **Summary**

### **Recommended Setup: 2 Terminals**

**Terminal 1:**
```bash
npm run dashboard
```
Keep running, access at http://localhost:3001

**Terminal 2:**
```bash
npm run cli -- swarm once    # Run as needed
# OR
npm run cli -- swarm start   # Run continuously
```

### **Minimum Setup: 1 Terminal**

```bash
npm run cli -- swarm once
npm run cli -- swarm queue
```
View in Supabase dashboard

### **Production Setup: 2 Terminals**

```bash
# Terminal 1
npm run dashboard

# Terminal 2
npm run cli -- swarm start
```
Runs continuously, cycles every 30 minutes

---

**🎉 That's it! You only need 2 terminals for the full experience!**


