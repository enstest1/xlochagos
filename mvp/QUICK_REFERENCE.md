# 🎯 XlochaGOS Quick Reference Card

## 📍 Where to See Your Content

---

## 🖥️ **1. TERMINAL (Fast)**

```bash
# View everything
npm run cli -- swarm queue

# View premium posts for review
npm run cli -- swarm review
```

**Output:**
- 📡 Raw Intelligence (scraped data)
- 🔬 Research (Perplexity reports)
- 📝 Posts (generated content)
- 🖼️ Images (generation status)

---

## 🌐 **2. WEB DASHBOARD (Best!)**

```bash
# Start dashboard
npm run dashboard
```

**Access:** http://localhost:3001

**Features:**
- 📊 Real-time stats
- ✅ Approve/reject buttons
- 🖼️ Image previews
- 🔄 Auto-refresh (30s)
- 📱 Mobile friendly

---

## 🗄️ **3. SUPABASE (Database)**

**URL:** https://supabase.com/dashboard/project/eapuldmifefqxvfzopba/table-editor

**Tables:**
- `content_queue` - Generated posts
- `research_data` - Research reports
- `raw_intelligence` - Scraped tweets/articles
- `image_generation_logs` - Generated images

---

## 📁 **4. LOCAL FILES**

**Images:**
```
mvp/persist/images/{content_id}.png
```

**Cookies:**
```
mvp/persist/secrets/acct1.cookies.json
```

---

## ⚡ **Quick Commands**

```bash
# Run system once (generate content)
npm run cli -- swarm once

# Run continuously (30-min cycles)
npm run cli -- swarm start

# View content queue
npm run cli -- swarm queue

# Review premium posts
npm run cli -- swarm review

# Web dashboard
npm run dashboard

# Publish to account
npm run cli -- publish @Account2
```

---

## 🎯 **Daily Workflow**

1. **Check content:**
   ```bash
   npm run cli -- swarm queue
   ```

2. **Review premium:**
   ```bash
   npm run cli -- swarm review
   ```

3. **Approve in Supabase:**
   - Go to `content_queue` table
   - Find post by ID
   - Change `status` to `approved`

4. **Schedule:**
   - Copy content to Buffer/Hootsuite
   - Attach generated images
   - Schedule for @pelpa333

---

## 📊 **What You'll See**

### Research:
- Topic researched
- Key insights (bullet points)
- Sources (URLs)
- Quality score (0-1)

### Posts:
- Full post text
- Quality score (0-1)
- Type (commentary/opinion/insight)
- Status (pending/approved/posted)
- Images (generated/pending)
- Agent (who created it)

### Images:
- Location: `mvp/persist/images/`
- Format: PNG (16:9)
- Naming: `{content_id}.png`

---

## 🚀 **Best Practices**

1. ✅ Keep dashboard open: `npm run dashboard`
2. ✅ Check terminal daily: `npm run cli -- swarm queue`
3. ✅ Review premium posts: `npm run cli -- swarm review`
4. ✅ Approve in Supabase within 24 hours
5. ✅ Schedule premium posts manually for @pelpa333

---

## 💡 **Pro Tip**

The **Web Dashboard** is the best way to manage everything!

```bash
npm run dashboard
# Then open: http://localhost:3001
```

---

**📚 Need more details?** See `VIEWING_CONTENT_GUIDE.md`


