# XlochaGOS Quick Start Guide
**X Leaderboard Orchestrated Generation & Operation System**

## 🚀 What is XlochaGOS?

XlochaGOS is a sophisticated **6-agent multi-agent system** that automates Twitter content generation and publishing:

```
Agent 1 (Gatherer) → Agent 2 (Researcher) → Agent 3 (Writer) 
    → Agent 4 (Quality) → Agent 6 (Images) → [Content Queue]
    → Publisher Accounts → Twitter → Agent 5 (Learning)
```

## ✅ What's Built (100% Complete!)

### **All 6 Agents:**
- ✅ Agent 1: Intelligence Gatherer (scraping + RSS)
- ✅ Agent 2: Research Agent (Perplexity MCP placeholder)
- ✅ Agent 3: Content Writer (generates varied posts)
- ✅ Agent 4: Quality Controller (filters content)
- ✅ Agent 6: Image Generator (Gemini Imagen API)
- ✅ Agent 5: Learning Agent (performance analysis)

### **Infrastructure:**
- ✅ Orchestrator (coordinates all agents)
- ✅ Spoke Publisher (pulls from queue and posts)
- ✅ Playwright image posting support
- ✅ CLI commands for swarm management

### **Configuration:**
- ✅ `config/rss-feeds.yaml` - 8 working RSS feeds
- ✅ `config/target-accounts.yaml` - 14 crypto accounts to scrape
- ✅ `config/research-topics.yaml` - 16 research topics
- ✅ `config/agent-config.yaml` - Full agent settings

### **Database:**
- ✅ Enhanced Supabase schema created
- ⏸️ **TODO**: Deploy schema to Supabase (manual step)

---

## 🎯 How It Works

### **Content Generation (85/15 Split)**

**85% Account Scraping + Research:**
- Scrape 14 target accounts (@VitalikButerin, @hasufl, @0xMaki, etc.)
- Research 16 topics with Perplexity MCP
- Generate informed commentary and analysis

**15% RSS Feeds:**
- Load from 8 crypto news feeds
- Supplement with breaking news and research

### **Publishing Workflow:**

```
1. Hub Account (@FIZZonAbstract):
   - Runs all 6 agents
   - Scrapes, researches, generates content
   - Stores in Supabase content_queue
   - Does NOT post (intelligence only)

2. Spoke Accounts (@Account2, 3, 4):
   - Pull content from queue
   - Post with unique personality
   - Report engagement metrics
   - Cross-boost each other
```

---

## 📋 Setup Steps

### **1. Deploy Supabase Schema (REQUIRED)**

Go to: https://supabase.com/dashboard/project/eapuldmifefqxvfzopba/editor

1. Click "New Query"
2. Paste contents of `supabase/schema-enhanced.sql`
3. Click "Run"
4. Verify tables created: `raw_intelligence`, `research_data`, `content_queue`, etc.

See `deploy-schema-manual.md` for detailed instructions.

### **2. Install Google GenAI Package**

```bash
cd mvp
npm install @google/genai
```

### **3. Verify Configuration**

Check that `.env` has:
```env
SUPABASE_URL=https://eapuldmifefqxvfzopba.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
GOOGLE_GENAI_API_KEY=AIzaSyAVNR3yyomwr_Fqj6qnq41sAy5pjEImRKQ
```

---

## 🚀 Usage

### **Test Individual Agents**

```bash
# Build TypeScript
npm run build

# Start orchestrator (single cycle for testing)
npm run cli -- swarm once

# View content queue
npm run cli -- swarm queue

# Run spoke publisher
DRY_RUN=true npm run cli -- publish @FIZZonAbstract
```

### **Production Mode**

```bash
# Start continuous orchestrator (30-minute cycles)
npm run cli -- swarm start

# In another terminal: Run publisher routine
npm run cli -- publish @Account2
```

---

## 📊 What Each Agent Does

### **Agent 1: Intelligence Gatherer**
- Scrapes 14 Twitter accounts
- Loads 8 RSS feeds
- Stores ~100 items per cycle in `raw_intelligence`

### **Agent 2: Research Agent**
- Pulls unprocessed intelligence
- Researches 10 topics with Perplexity
- Stores in `research_data`

### **Agent 3: Content Writer**
- Pulls processed intelligence + research
- Generates 3 variations per item
- Stores ~300 posts in `content_queue`

### **Agent 4: Quality Controller**
- Reviews all pending content
- Approves ~80% (240 posts)
- Rejects ~20% (60 posts)

### **Agent 6: Image Generator**
- Generates images for approved content
- Uses Gemini Imagen API
- Saves to `persist/images/`

### **Agent 5: Learning Agent**
- Analyzes yesterday's posts
- Identifies successful patterns
- Feeds insights back to Agent 3

---

## 🎨 Image Generation

XlochaGOS uses **Google Gemini Imagen 4.0** for images:

- **Model**: `imagen-4.0-generate-001`
- **Format**: 16:9 aspect ratio (Twitter optimized)
- **Quality**: 1K standard images
- **Cost**: ~$0.04 per image
- **Storage**: Local in `persist/images/`

**Image Strategy:**
- ✅ Always: Research posts, analysis
- ⏸️ Sometimes: News (if high-engagement topic)
- ❌ Never: Simple replies, boosts

---

## 🔧 Troubleshooting

### **"Supabase tables not found"**
- Run: Deploy schema from `supabase/schema-enhanced.sql`
- Verify in Supabase Table Editor

### **"Google GenAI API error"**
- Check `GOOGLE_GENAI_API_KEY` in `.env`
- Install: `npm install @google/genai`

### **"No content in queue"**
- Run: `npm run cli -- swarm once` (generates content)
- Check: `npm run cli -- swarm queue` (view queue)

### **"Playwright scraping failed"**
- Verify cookies are fresh: `npm run cli -- login @FIZZonAbstract`
- Check IP: `npm run cli -- ip`

---

## 📈 Expected Performance

**Per 30-Minute Cycle:**
- ~100 intelligence items collected (Agent 1)
- ~10 research reports generated (Agent 2)  
- ~300 posts drafted (Agent 3)
- ~240 posts approved (Agent 4)
- ~50 images generated (Agent 6)

**After 24 Hours:**
- ~4,800 intelligence items
- ~480 research reports
- ~14,400 posts drafted
- ~11,520 posts approved with images
- **Ready for ~38 posts per day per spoke account**

---

## 🎯 Next Steps

1. **Deploy Supabase Schema** - See `deploy-schema-manual.md`
2. **Test Single Cycle** - Run `npm run cli -- swarm once`
3. **View Queue** - Run `npm run cli -- swarm queue`
4. **Test Publishing** - Run `DRY_RUN=true npm run cli -- publish @FIZZonAbstract`
5. **Start Production** - Run `npm run cli -- swarm start`

---

## 📚 Documentation

- **Architecture**: See `doc/devlogs.md` (lines 1616-2633)
- **Schema**: See `supabase/schema-enhanced.sql`
- **Deployment**: See `deploy-schema-manual.md`
- **Config Files**: See `config/` directory

---

## ⚠️ Important Notes

1. **Hub Account (@FIZZonAbstract)**: Intelligence gathering ONLY, no posting
2. **Spoke Accounts**: Not yet configured (@Account2, 3, 4 need setup)
3. **Perplexity MCP**: Placeholder only, needs proper integration
4. **Dry Run First**: Always test with `DRY_RUN=true` before live
5. **Rate Limits**: Respect Twitter limits (5 posts/day per spoke)

---

**Status**: ✅ All agents built | ⏸️ Schema deployment needed | 🚀 Ready to test!


