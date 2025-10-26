# 🎯 XlochaGOS Output Summary

## Where to See Your Content

---

## ✅ **TERMINAL OUTPUT (Enhanced)**

### Command: View Everything
```bash
npm run cli -- swarm queue
```

**Shows:**
- 📡 Raw Intelligence (scraped tweets, RSS)
- 🔬 Research Data (Perplexity reports)
- 📝 Content Queue (generated posts)
- 🖼️ Image status for each post
- ⏳ Processing status
- ✅ Quality scores

### Command: View Premium Posts Only
```bash
npm run cli -- swarm review
```

**Shows:**
- ⭐ Premium posts for @pelpa333 (manual review)
- 📊 Quality scores with color indicators
- 📝 Full post content
- 🖼️ Generated images
- 🔑 Post IDs for approval
- 📋 Summary stats

---

## ✅ **WEB DASHBOARD (Best Experience!)**

### Start Dashboard:
```bash
npm run dashboard
```

### Access:
```
http://localhost:3001
```

### Features:
- ✨ **Beautiful gradient UI**
- 📊 **Real-time stats cards**
- 🎨 **Color-coded quality scores**
- 🖼️ **Image previews**
- ✅ **One-click approve/reject buttons**
- 🔄 **Auto-refresh every 30 seconds**
- 📱 **Mobile responsive**

### Dashboard Sections:
1. **Stats Overview** - Total posts, pending, approved, posted
2. **Premium Posts** - Posts needing your approval
3. **Content Queue** - All generated posts
4. **Research Data** - Perplexity reports
5. **Raw Intelligence** - Scraped data

---

## ✅ **SUPABASE DATABASE**

### Access:
```
https://supabase.com/dashboard/project/eapuldmifefqxvfzopba/table-editor
```

### Tables:

#### **content_queue** - Generated Posts
- `content_text` - The actual post
- `quality_score` - 0-1 quality rating
- `status` - pending_approval, approved, posted, etc.
- `images` - JSON array of image paths
- `content_type` - commentary, opinion, insight, etc.
- `created_by_agent` - Which agent created it

#### **research_data** - Research Reports
- `topic` - What was researched
- `research_results` - Full Perplexity response
- `key_insights` - Extracted key points
- `sources` - Reference URLs
- `summary` - Brief summary

#### **raw_intelligence** - Scraped Data
- `raw_content` - Tweet or article content
- `source_account` - @username or RSS feed
- `source_type` - twitter_scrape or rss_feed
- `metadata` - Additional data

#### **image_generation_logs** - Generated Images
- `prompt` - Image generation prompt
- `image_urls` - Generated image URLs
- `api_cost` - Cost in USD
- `status` - success/failed

---

## ✅ **LOCAL FILES**

### Generated Images:
```
mvp/persist/images/{content_id}.png
```

Example:
```
mvp/persist/images/abc123-def456.png
```

### Account Cookies:
```
mvp/persist/secrets/acct1.cookies.json
mvp/persist/secrets/acct2.cookies.json
```

---

## 📊 **Data Flow**

```
1. Agent 1: Intelligence Gatherer
   └─> Scrapes @pelpa333, @bankrbot, @trylimitless, @wallchain_xyz
   └─> Loads RSS feeds
   └─> Stores in: raw_intelligence table

2. Agent 2: Research Agent
   └─> Picks unprocessed intelligence
   └─> Researches with Perplexity API
   └─> Stores in: research_data table

3. Agent 3: Content Writer
   └─> Creates 20 auto posts (rule-based)
   └─> Creates 10 premium posts (GPT-4o)
   └─> Stores in: content_queue table (status: pending_*)

4. Agent 4: Quality Controller
   └─> Reviews all posts
   └─> Approves auto posts → status: approved
   └─> Flags premium → status: pending_manual_review

5. Agent 6: Image Generator
   └─> Generates images for approved posts
   └─> Saves to: mvp/persist/images/
   └─> Logs in: image_generation_logs table

6. YOU: Manual Review
   └─> View: npm run cli -- swarm review
   └─> Approve: Change status in Supabase
   └─> Schedule: Manually post to @pelpa333

7. Spoke Publisher
   └─> Auto-posts approved content to @Account2, @Account3, @Account4
   └─> Updates status to: posted
```

---

## 🎯 **Quick Access Commands**

```bash
# View all content in terminal
npm run cli -- swarm queue

# View premium posts for review
npm run cli -- swarm review

# Start web dashboard
npm run dashboard

# Run system once (generate content)
npm run cli -- swarm once

# Run system continuously
npm run cli -- swarm start

# Publish to specific account
npm run cli -- publish @Account2
```

---

## 📱 **Mobile Access**

### Option 1: Web Dashboard on Mobile
1. Start dashboard: `npm run dashboard`
2. Find your IP: `ipconfig` (Windows)
3. Open on phone: `http://YOUR_IP:3001`

### Option 2: Supabase Mobile
1. Use Supabase dashboard on mobile browser
2. Access all tables
3. Approve/reject posts

---

## 💡 **Recommended Workflow**

### Daily Routine:
1. **Morning Check**: `npm run cli -- swarm queue`
2. **Review Premium Posts**: `npm run cli -- swarm review`
3. **Approve in Supabase**: Change status to 'approved'
4. **Schedule Posts**: Copy to Buffer/Hootsuite for @pelpa333
5. **Monitor**: Keep `npm run dashboard` open

### For Best Experience:
- Use **Web Dashboard** for daily management
- Use **Terminal** for quick checks
- Use **Supabase** for deep analysis

---

## 📊 **Output Examples**

### Terminal Output Example:
```
🎯 XlochaGOS Dashboard - 2025-10-12, 6:46:29 p.m.
================================================================================

📡 RAW INTELLIGENCE (45 items):
🐦 1. @pelpa333
   Latest thoughts on DeFi innovations in 2025...
   Processed: Researcher:✅ Writer:✅

🔬 RESEARCH DATA (15 items):
🔍 1. Topic: DeFi Innovations 2025
   Quality: 0.92/1.0
   Insights: 8 key points
   Sources: 12 references

📝 CONTENT QUEUE (30 items):
⭐ 1. 👁️ PENDING_MANUAL_REVIEW | Score: 0.95/1.0
   Content: This fascinating analysis reveals...
   Type: commentary | Agent: content_writer
   Images: 1 generated
```

### Web Dashboard Example:
```
[Gradient purple background with white cards]

📊 Stats Cards:
- Total Posts: 30
- Pending Review: 10
- Approved: 15
- Posted: 5
- Images Generated: 25
- Avg Quality: 0.88

[Below: Visual cards for each post with approve/reject buttons]
```

---

## 🚨 **Troubleshooting**

### "Supabase not configured"
- Check `.env` file exists
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

### "No content showing"
- Run system first: `npm run cli -- swarm once`
- Wait for agents to complete (~5-10 minutes)
- Check Supabase tables manually

### Dashboard won't start
- Kill existing Node processes
- Restart: `npm run dashboard`
- Check port 3001 is available

---

## ✅ **Summary**

You have **3 main ways** to view content:

1. **Terminal** - Fast, command-line
   - `npm run cli -- swarm queue`
   - `npm run cli -- swarm review`

2. **Web Dashboard** - Beautiful, interactive ⭐ RECOMMENDED
   - `npm run dashboard`
   - http://localhost:3001

3. **Supabase** - Database, full details
   - https://supabase.com/dashboard/project/eapuldmifefqxvfzopba

**📚 Full guide:** See `VIEWING_CONTENT_GUIDE.md` for detailed instructions!


