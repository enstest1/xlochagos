# Premium Standalone Command Flow

## Command
```bash
npm run cli swarm premium-standalone
```

## Overview
The `premium-standalone` command is a complete end-to-end workflow for generating premium content posts. It scrapes target accounts, researches intelligence, generates posts with images, and stores them in Supabase for manual review.

---

## Complete Flow

### **Step 1: Initialization** (`cli.ts` lines 647-658)
1. Command entry point: `swarm premium-standalone`
2. Loads hub account from `ACCOUNTS[0]`
3. Creates `StandalonePremiumGenerator` instance
4. Generator loads premium targets from `config/target-accounts.yaml`

**Target Loading Logic:**
- Reads `target-accounts.yaml`
- Filters for accounts where:
  - `enabled: true`
  - `category: 'airdrop_farming'`
- Extracts `posts_to_generate` (default: 4 if not specified)
- Only processes targets with `posts_to_generate > 0`

---

### **Step 2: Scrape Premium Targets** (`scrapePremiumTargets()`)
**Location:** `standalonePremiumGenerator.ts` lines 76-122

**Process:**
1. **Filter targets** - Only scrape accounts with `posts_to_generate > 0`
2. **Initialize scraper** - `targetAccountScraper.initialize()`
3. **Scrape accounts** - `scrapeSpecificTargetAccounts(targetHandles)`
   - Scrapes recent posts from each target account
   - Uses X API to fetch timeline
   - Extracts post content, metadata, URLs
4. **Store intelligence** - `storeTargetAccountIntelligence(posts)`
   - Stores scraped posts in `raw_intelligence` table
   - Fields stored:
     - `source_account` (handle)
     - `raw_content` (post text)
     - `source_url` (post URL)
     - `extracted_at` (timestamp)
     - `metadata` (post_id, etc.)
5. **Cleanup** - `targetAccountScraper.cleanup()`

**Output:**
- Posts stored in Supabase `raw_intelligence` table
- Logs show posts scraped per account

---

### **Step 3: Research Premium Intelligence** (`researchPremiumIntelligence()`)
**Location:** `standalonePremiumGenerator.ts` lines 124-128

**Current Behavior:**
- **Skipped** - No general research is performed
- Research happens per-post during generation when special features are detected
- This prevents generic research from contaminating all posts

**Note:** Account-specific research can be triggered later via `researchAccountIntelligence()` if needed.

---

### **Step 4: Generate Premium Posts** (`generatePremiumPosts()`)
**Location:** `standalonePremiumGenerator.ts` lines 255-341

#### **4.1: Fetch Intelligence** (`getResearchedIntelligence()`)
**Location:** `standalonePremiumGenerator.ts` lines 343-394

**Process:**
1. **Query Supabase** - Fetches from `raw_intelligence` table
   - Filters: `source_account IN (target_handles)`
   - Orders by: `extracted_at DESC` (newest first)
   - Limit: 200 posts
2. **Deduplicate** - Removes duplicate posts by `post_id`
3. **Returns** - Array of intelligence items

#### **4.2: Process Each Target Account**
**For each target account:**

1. **Filter intelligence** - Get posts for this specific target
2. **Check availability** - Skip if no intelligence found
3. **Select posts** - `pickTopInteresting(targetIntelligence, postCount)`
   - Scores posts by interestingness
   - Prioritizes diverse topics
   - Selects top N posts (where N = `posts_to_generate`)

**Interestingness Scoring** (`computeInterestingness()`):
- Base score: 0.3
- Length bonus: up to 0.2 (longer posts preferred)
- Topic boosts:
  - X402: +0.35
  - Farcaster: +0.2
  - Zora: +0.15
  - Prediction markets: +0.15
  - AI/Agent: +0.1
- Link bonus: +0.1 (if contains URL)
- Recency bonus: +0.25 (newer posts preferred)
- Max score: 1.0

**Topic Diversity** (`pickTopInteresting()`):
- First pass: Select diverse topics (one per topic signature)
- Second pass: Fill remaining slots with top-scoring posts
- Ensures variety in generated content

#### **4.3: Generate Post for Each Selected Intelligence Item**
**For each selected post (1 to N):**

**Process:** `generateAirdropPost(target, picked, i, numPostsToGenerate)`

1. **Select intelligence item** - Uses the picked post
2. **Generate post text** - Uses LLM (GPT-4o via OpenRouter)
   - Prompt includes:
     - Target account context
     - Scraped post content
     - Research data (if available)
     - Airdrop farming angle
   - Generates engaging, airdrop-focused post
3. **Generate image** - Uses Gemini Imagen API
   - Creates futuristic crypto character portrait
   - Saves to `mvp/assets/generated/{post_id}-{index}.png`
   - Style: Cyberpunk DeFi aesthetic, neon glow effects
4. **Create post object** - Includes:
   - `id` (UUID)
   - `content_text` (generated post)
   - `content_hash` (hash of content)
   - `status: 'pending_manual_review'`
   - `created_by_agent: 'standalone_premium_generator'`
   - `images` (array with image path)
   - `metadata` (target account, source post, etc.)
   - `quality_score` (calculated)

#### **4.4: Store Posts** (`storePremiumPosts()`)
**Process:**
1. **Insert to Supabase** - `content_queue` table
2. **Status:** `pending_manual_review`
3. **Agent:** `standalone_premium_generator`
4. **Images:** Stored as JSON array with file paths

---

### **Step 5: Display Results** (`cli.ts` lines 671-700)
**After generation completes:**

1. **Fetch latest post** - Queries Supabase for most recent generated post
2. **Display in terminal:**
   - Post text (ready to copy-paste)
   - Image path
   - Post ID
   - Status

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  npm run cli swarm premium-standalone                        │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 1: Load Targets                                       │
│  - Read target-accounts.yaml                                │
│  - Filter: enabled=true, category=airdrop_farming           │
│  - Extract posts_to_generate per account                    │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 2: Scrape Premium Targets                             │
│  - Initialize targetAccountScraper                         │
│  - Scrape each target account's timeline                    │
│  - Store posts in raw_intelligence table                    │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 3: Research Intelligence                             │
│  - Currently skipped (no general research)                  │
│  - Per-post research happens during generation if needed    │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 4: Generate Premium Posts                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 4.1: Fetch Intelligence                               │  │
│  │ - Query raw_intelligence for target accounts          │  │
│  │ - Deduplicate by post_id                              │  │
│  └───────────────────────┬───────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 4.2: For Each Target Account                           │  │
│  │ - Filter intelligence for this target                  │  │
│  │ - Pick top N interesting & diverse posts               │  │
│  └───────────────────────┬───────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 4.3: Generate Post for Each Selected Item              │  │
│  │ - Generate text via LLM (GPT-4o)                       │  │
│  │ - Generate image via Gemini Imagen                    │  │
│  │ - Create post object with metadata                    │  │
│  └───────────────────────┬───────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 4.4: Store Posts                                       │  │
│  │ - Insert to content_queue table                       │  │
│  │ - Status: pending_manual_review                       │  │
│  └───────────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 5: Display Results                                    │
│  - Fetch latest generated post                             │
│  - Display post text, image path, ID in terminal          │
└─────────────────────────────────────────────────────────────┘
```

---

## Configuration

### **Target Accounts** (`config/target-accounts.yaml`)
```yaml
target_accounts:
  - handle: "@bankrbot"
    category: "airdrop_farming"
    enabled: true
    posts_to_generate: 4  # Number of posts to generate per run
    # ... other fields
```

### **Environment Variables Required**
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `OPENROUTER_API_KEY` - For LLM (GPT-4o)
- `GEMINI_API_KEY` - For image generation (Imagen)

---

## Output

### **Database Tables Used**

1. **`raw_intelligence`** (read)
   - Stores scraped posts from target accounts
   - Used as source material for post generation

2. **`content_queue`** (write)
   - Stores generated posts
   - Status: `pending_manual_review`
   - Agent: `standalone_premium_generator`

3. **`research_data`** (write, optional)
   - Stores research results if account-specific research is performed

### **File System**
- **Images:** `mvp/assets/generated/{post_id}-{index}.png`
- Generated images are saved locally

### **Dashboard**
- Posts appear in dashboard at `http://localhost:5174`
- Tab: **"02 PREMIUM"**
- Status: **Pending Manual Review**
- Ready for approval/rejection

---

## Key Features

1. **Independent Scraping** - Does not depend on `raw_intelligence` from monitor command
2. **Account-Specific** - Generates posts tailored to each target account
3. **Topic Diversity** - Ensures variety in generated content
4. **Image Generation** - Creates custom images for each post
5. **Quality Scoring** - Calculates quality scores for posts
6. **Manual Review** - All posts require manual approval before posting

---

## Example Output

```
[cli] 🚀 Running STANDALONE Premium Generator (Scrape → Research → Write)...
[cli] Step 1: Scraping premium targets (@bankrbot, @wallchain_xyz, @kloutgg)...
[Standalone Premium] Scraping premium targets...
[Standalone Premium] Scraping results: { totalPosts: 45, postsByAccount: {...} }
[cli] Step 2: Researching premium intelligence...
[cli] Step 3: Generating premium posts...
[Standalone Premium] Starting post generation for all targets
[Standalone Premium] Generated post: { target: '@bankrbot', postNumber: 1, postId: '...' }
[cli] ✅ Standalone premium generation complete!

================================================================================
📋 GENERATED POST (READY TO COPY-PASTE):
================================================================================

📝 POST TEXT:

🚀 @bankrbot is revolutionizing DeFi with AI-powered banking solutions...

🖼️ IMAGE:
mvp/assets/generated/abc123-0.png

📊 POST ID: abc123-def456-...
```

---

## Notes

- **No RSS Feeds** - Only scrapes target accounts, no RSS content
- **No Auto-Response** - Does not trigger response system
- **Standalone** - Independent from orchestrator workflow
- **Manual Review Required** - All posts must be approved before posting
- **Per-Account Generation** - Respects `posts_to_generate` per account
- **Latest Posts First** - Uses most recent scraped posts for generation


