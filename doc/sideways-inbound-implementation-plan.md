# Sideways & Inbound Reply System - Implementation Plan

## Overview
Add sideways replies (alts replying to comments in Pelpa threads) and inbound replies (alts responding to @mentions/replies), allowing alt-to-alt engagement while keeping it lowkey.

**Architecture:** Monitor-based detection + separate reply services. The monitor scans and flags opportunities, reply services process and post responses.

## Core Principles

✅ **DO:**
- Allow alt-to-alt replies (don't filter out our accounts)
- Only ONE alt can start a sideways reply per comment (enforced by database)
- Keep it lowkey (max 6 sideways per Pelpa post, max 2 per alt per post)
- Reuse existing infrastructure (llmService.chat, response_queue, characters, etc.)

❌ **DON'T:**
- Filter out our own accounts from sideways detection
- Allow multiple alts to reply to the same comment
- Post standalone tweets from alts (only replies)

---

## Phase 1: Database Schema

### Table 1: `sideways_opportunities` (NEW - Monitor Flags)
**Purpose:** Opportunities flagged by monitor for sideways replies

```sql
CREATE TABLE IF NOT EXISTS sideways_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  root_tweet_id text NOT NULL,           -- Pelpa tweet ID
  root_tweet_text text,                  -- Root tweet text (stored for context)
  parent_tweet_id text NOT NULL,         -- Comment we might reply to
  parent_tweet_url text NOT NULL,        -- Full URL of the parent tweet (for replying)
  comment_text text NOT NULL,            -- Text of the comment
  commenter_handle text NOT NULL,        -- Who made the comment
  score integer NOT NULL,                 -- Quality score (from monitor)
  recommended_alt_handle text NOT NULL,  -- Which alt should reply (from monitor)
  detected_at timestamptz DEFAULT now(),
  processed boolean DEFAULT false,        -- Has reply service processed this?
  processed_at timestamptz,              -- When it was processed
  reply_tweet_id text,                   -- Our reply tweet ID (if posted)
  retry_count integer DEFAULT 0,         -- Number of retry attempts
  last_error text,                        -- Last error message (if failed)
  UNIQUE (parent_tweet_id)               -- CRITICAL: Only ONE opportunity per comment
);

CREATE INDEX idx_sideways_opp_root ON sideways_opportunities(root_tweet_id);
CREATE INDEX idx_sideways_opp_processed ON sideways_opportunities(processed, detected_at);
CREATE INDEX idx_sideways_opp_alt ON sideways_opportunities(recommended_alt_handle);
```

### Table 2: `sideways_replies` (Tracks Posted Replies)
**Purpose:** Track actual sideways replies that were posted

```sql
CREATE TABLE IF NOT EXISTS sideways_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  root_tweet_id text NOT NULL,           -- Pelpa tweet ID
  parent_tweet_id text NOT NULL,         -- Comment we replied to (can be user OR alt)
  alt_handle text NOT NULL,              -- Which alt replied
  reply_tweet_id text NOT NULL,          -- Our reply tweet ID
  score integer NOT NULL,                 -- Quality score of the comment
  created_at timestamptz DEFAULT now(),
  UNIQUE (parent_tweet_id, alt_handle)   -- CRITICAL: Only ONE alt per comment
);

CREATE INDEX idx_sideways_root ON sideways_replies(root_tweet_id);
CREATE INDEX idx_sideways_parent ON sideways_replies(parent_tweet_id);
CREATE INDEX idx_sideways_alt ON sideways_replies(alt_handle);
```

**Key Constraint:** `UNIQUE (parent_tweet_id, alt_handle)` ensures only ONE alt can reply to any given comment.

### Table 3: `inbound_alt_replies`
**Purpose:** Track when users @mention or reply to our alts

```sql
CREATE TABLE IF NOT EXISTS inbound_alt_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alt_handle text NOT NULL,              -- Which alt was mentioned
  source_tweet_id text NOT NULL,         -- Tweet that mentioned/replied to us
  source_user_handle text NOT NULL,       -- Who mentioned/replied to us
  source_tweet_text text NOT NULL,        -- Text of the tweet (stored at insert time)
  in_reply_to_tweet_id text,             -- Parent tweet ID (if it's a reply)
  replied boolean DEFAULT false,          -- Have we replied yet?
  reply_tweet_id text,                   -- Our reply tweet ID
  created_at timestamptz DEFAULT now(),
  UNIQUE (alt_handle, source_tweet_id)   -- Don't process same mention twice
);

CREATE INDEX idx_inbound_alt ON inbound_alt_replies(alt_handle, replied);
CREATE INDEX idx_inbound_source ON inbound_alt_replies(source_tweet_id);
```

---

## Phase 2: Monitor Integration (Detection)

### File: `mvp/src/services/pelpa333Monitor.ts` (MODIFY)

**Purpose:** Extend existing monitor to detect and flag sideways/inbound opportunities

**NOTE:** The actual file is located at `mvp/src/services/pelpa333Monitor.ts` (not `monitoring/` directory)

**Add to existing monitor:**

```typescript
import { scoreComment, pickAltForSideways, isSpamOrToxic } from './sidewaysReplyService'; // Same directory
import { isOurAccount } from '../config/altAccounts';
import { getAccountCfgForAlt } from '../utils/altHelpers'; // Shared helper
import { fetchTweetReplies } from '../ingest/playwrightScraper';
import { REPLY_CONFIG } from '../config/replyConfig'; // Shared constants

// Use shared constants
const MAX_SIDEWAYS_PER_ROOT = REPLY_CONFIG.sideways.MAX_PER_ROOT;
const MAX_SIDEWAYS_PER_ALT_PER_ROOT = REPLY_CONFIG.sideways.MAX_PER_ALT_PER_ROOT;
const MIN_SCORE_THRESHOLD = REPLY_CONFIG.sideways.MIN_SCORE_THRESHOLD;

// In the monitor's tweet processing loop, add:

/**
 * Detect sideways opportunities from replies to Pelpa tweets
 */
async function detectSidewaysOpportunities(tweetId: string, tweetUrl: string): Promise<void> {
  // Only check tweets that are posted (from response_queue)
  const { data: task } = await supabase
    .from('response_queue')
    .select('post_id, post_url, post_text')
    .eq('post_id', tweetId)
    .eq('status', 'posted')
    .single();

  if (!task) return; // Not a posted Pelpa tweet

  // Fetch replies (reuse existing scraper)
  const fizzAccount = getAccountCfgForAlt('@FIZZonAbstract');
  const replies = await fetchTweetReplies(tweetUrl, fizzAccount, 50);

  for (const reply of replies) {
    // Skip if already flagged
    const { data: existing } = await supabase
      .from('sideways_opportunities')
      .select('id')
      .eq('parent_tweet_id', reply.id)
      .single();

    if (existing) continue; // Already flagged

    // Skip spam/toxic
    if (isSpamOrToxic(reply.text)) continue;

    // Skip tweets older than 48 hours (production requirement)
    const tweetAge = Date.now() - new Date(reply.created_at).getTime();
    const maxAgeMs = 48 * 60 * 60 * 1000; // 48 hours
    if (tweetAge > maxAgeMs) continue; // Too old, skip

    // Score the comment
    const score = scoreComment(reply.text);
    if (score < MIN_SCORE_THRESHOLD) continue; // Not worth replying

    // Pick which alt should reply
    const recommendedAlt = pickAltForSideways(reply.text, reply.user_handle);

    // Check caps (max 6 per root, max 2 per alt per root)
    const { count: totalCount } = await supabase
      .from('sideways_opportunities')
      .select('*', { count: 'exact', head: true })
      .eq('root_tweet_id', tweetId)
      .eq('processed', false);

    if ((totalCount || 0) >= MAX_SIDEWAYS_PER_ROOT) continue; // Cap reached

    const { count: altCount } = await supabase
      .from('sideways_opportunities')
      .select('*', { count: 'exact', head: true })
      .eq('root_tweet_id', tweetId)
      .eq('recommended_alt_handle', recommendedAlt)
      .eq('processed', false);

    if ((altCount || 0) >= MAX_SIDEWAYS_PER_ALT_PER_ROOT) continue; // Alt cap reached

    // Flag as opportunity (store full URL and root tweet text for replying)
    const { error: insertError } = await supabase
      .from('sideways_opportunities')
      .insert({
        root_tweet_id: tweetId,
        root_tweet_text: task.post_text,  // Store root tweet text for context
        parent_tweet_id: reply.id,
        parent_tweet_url: reply.url,  // Store full URL from scraper
        comment_text: reply.text,
        commenter_handle: reply.user_handle,
        score,
        recommended_alt_handle: recommendedAlt
      });

    // Handle UNIQUE constraint violations gracefully (duplicate detection)
    if (insertError) {
      if (insertError.code === '23505') { // Unique violation
        console.log(`ℹ️ Opportunity already exists for ${reply.id}, skipping`);
        continue;
      }
      console.error(`❌ Error inserting sideways opportunity:`, insertError);
      continue;
    }

    console.log(`📋 Flagged sideways opportunity: ${reply.user_handle} → ${recommendedAlt} (score: ${score})`);
  }
}

/**
 * Detect inbound opportunities (replies to our alt's comments)
 * This runs during monitor cycles to flag inbound opportunities
 */
async function detectInboundOpportunities(): Promise<void> {
  // Get recent sideways replies we posted
  const { data: sidewaysReplies } = await supabase
    .from('sideways_replies')
    .select('reply_tweet_id, alt_handle')
    .not('reply_tweet_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!sidewaysReplies) return;

  for (const sideways of sidewaysReplies) {
    if (!sideways.reply_tweet_id) continue;

    // Build URL to our alt's reply
    const altUsername = sideways.alt_handle.replace('@', '');
    const replyUrl = `https://x.com/${altUsername}/status/${sideways.reply_tweet_id}`;

    // Fetch replies to our alt's comment
    const fizzAccount = getAccountCfgForAlt('@FIZZonAbstract');
    const replies = await fetchTweetReplies(replyUrl, fizzAccount, 10);

    for (const reply of replies) {
      // Skip if from same alt (self-reply)
      if (reply.user_handle === sideways.alt_handle) continue;

      // Check if already detected
      const { data: existing } = await supabase
        .from('inbound_alt_replies')
        .select('id')
        .eq('alt_handle', sideways.alt_handle)
        .eq('source_tweet_id', reply.id)
        .single();

      if (existing) continue; // Already detected

      // Flag as inbound opportunity
      await supabase
        .from('inbound_alt_replies')
        .insert({
          alt_handle: sideways.alt_handle,
          source_tweet_id: reply.id,
          source_user_handle: reply.user_handle,
          source_tweet_text: reply.text,
          in_reply_to_tweet_id: sideways.reply_tweet_id,
          replied: false
        });

      console.log(`📥 Flagged inbound opportunity: ${reply.user_handle} → ${sideways.alt_handle}`);
    }
  }
}
```

**Note:** Monitor runs detection, flags opportunities in Supabase. Reply services process flags separately.

**CRITICAL: Add calls to detection functions inside `monitorPelpa333()` method:**

```typescript
// In monitorPelpa333() method, after storePelpa333Intelligence():
async monitorPelpa333(): Promise<void> {
  try {
    const posts = await this.scrapePelpa333Timeline(20);
    await this.storePelpa333Intelligence(posts);
    
    // NEW: Detect sideways opportunities for posted tweets
    for (const post of posts) {
      try {
        // Only check tweets that are posted (from response_queue)
        const { data: task } = await supabase
          .from('response_queue')
          .select('post_id, post_url, post_text')
          .eq('post_id', post.id)
          .eq('status', 'posted')
          .single();
        
        if (task) {
          await detectSidewaysOpportunities(post.id, post.url);
        }
      } catch (error) {
        console.error(`❌ Error detecting sideways opportunities for post ${post.id}:`, error);
        // Continue to next post - don't crash entire cycle
      }
    }
    
    // NEW: Detect inbound opportunities (replies to our alt's comments)
    try {
      await detectInboundOpportunities();
    } catch (error) {
      console.error('❌ Error detecting inbound opportunities:', error);
      // Continue - don't crash entire cycle
    }
    
    // Existing code...
    const urgentPosts = posts.filter(p => p.hasTargetMentions);
    if (urgentPosts.length > 0) {
      console.log(`🚨 ${urgentPosts.length} posts need immediate attention!`);
      try {
        await this.triggerResponseAgent(urgentPosts);
      } catch (responseError) {
        console.error('❌ Failed to trigger Response Agent:', responseError);
      }
    }
    
  } catch (error) {
    console.error('❌ Error in Pelpa333 monitoring cycle:', error);
  }
}
```

**Error Handling:** Wrap detection function calls in try-catch blocks to prevent one failure from crashing the entire monitor cycle.

---

## Phase 3: Shared Constants & Utilities

### File: `mvp/src/config/altAccounts.ts` (NEW)

```typescript
/**
 * List of all alt accounts for filtering and coordination
 */
export const ALT_ACCOUNTS = [
  '@FIZZonAbstract',
  '@Rick_Rupen',
  '@Dope_MusicVideo',
  '@aplep333'
] as const;

export const PELPA_HANDLE = '@pelpa333';

/**
 * Check if a handle is one of our alt accounts
 */
export function isOurAlt(handle: string): boolean {
  return ALT_ACCOUNTS.includes(handle as any);
}

/**
 * Check if a handle is Pelpa or any of our alts
 */
export function isOurAccount(handle: string): boolean {
  return handle === PELPA_HANDLE || isOurAlt(handle);
}
```

### File: `mvp/src/utils/tweetUtils.ts` (NEW)

```typescript
/**
 * Extract tweet ID from a tweet URL
 * Example: "https://x.com/user/status/1234567890" → "1234567890"
 */
export function extractTweetId(url: string): string {
  const match = url.match(/\/status\/(\d+)/);
  return match ? match[1] : '';
}

/**
 * Build tweet URL from username and tweet ID
 * Example: buildTweetUrl("pelpa333", "1234567890") → "https://x.com/pelpa333/status/1234567890"
 */
export function buildTweetUrl(username: string, tweetId: string): string {
  const cleanUsername = username.replace('@', '');
  return `https://x.com/${cleanUsername}/status/${tweetId}`;
}

/**
 * Extract username from tweet URL
 * Example: "https://x.com/pelpa333/status/123" → "pelpa333"
 */
export function extractUsernameFromUrl(url: string): string {
  const match = url.match(/x\.com\/([^\/]+)/);
  return match ? `@${match[1]}` : '';
}
```

### File: `mvp/src/utils/contentFilter.ts` (NEW)

**Purpose:** Shared utility for filtering low-quality content

```typescript
/**
 * Check if a reply text is too generic/low-effort to post
 * Exported from ResponseAgent for reuse across services
 */
export function isGarbage(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 20) return true;

  const blacklist = [
    'gm',
    'bullish',
    'insane',
    'crazy',
    'nice',
    'love this',
    'awesome',
    'great',
    'so true',
    'facts',
    'let\'s go',
    'lfg'
  ];

  const lower = trimmed.toLowerCase();
  return blacklist.includes(lower);
}
```

**Note:** This should be extracted from `ResponseAgent.isGarbage()` and both files should import from here.

### File: `mvp/src/utils/altHelpers.ts` (NEW)

**Purpose:** Shared helper functions for alt account operations

```typescript
import { createAccountCfg } from '../publish/playwright';

const COOKIE_PATH_BASE = './secrets';

/**
 * Get cookie path for an alt handle
 */
export function getCookiePath(altHandle: string): string {
  const safe = altHandle.replace('@', '');
  return `${COOKIE_PATH_BASE}/${safe}.cookies.json`;
}

/**
 * Create AccountCfg for an alt handle
 * Wrapper around createAccountCfg() from publish/playwright
 */
export function getAccountCfgForAlt(altHandle: string): ReturnType<typeof createAccountCfg> {
  return createAccountCfg(altHandle, getCookiePath(altHandle));
}
```

**Note:** These helpers are used by monitor, sideways service, and inbound service.

### File: `mvp/src/config/replyConfig.ts` (NEW)

**Purpose:** Shared configuration constants for sideways/inbound replies

```typescript
/**
 * Shared configuration for sideways and inbound reply systems
 * Used by monitor (detection) and reply services (processing)
 */
export const REPLY_CONFIG = {
  sideways: {
    MAX_PER_ROOT: 6,
    MAX_PER_ALT_PER_ROOT: 2,
    MIN_SCORE_THRESHOLD: 3,
    MAX_RETRIES: 3,
  },
  inbound: {
    MAX_PER_ALT_PER_HOUR: 8,
    MAX_PER_USER_PER_ALT_PER_DAY: 2,
    MIN_SCORE_THRESHOLD: 2,
  },
  delays: {
    // Testing delays (fast for development)
    SIDEWAYS_MIN_MS: 5 * 1000,   // 5 seconds
    SIDEWAYS_MAX_MS: 60 * 1000,  // 60 seconds
    INBOUND_MIN_MS: 10 * 1000,   // 10 seconds
    INBOUND_MAX_MS: 90 * 1000,   // 90 seconds
    BETWEEN_TWEETS_MS: 10 * 1000, // 10 seconds
  },
  rateLimits: {
    // X.com rate limits (to keep process natural and avoid detection)
    MAX_REQUESTS_PER_MINUTE: 10,      // Max API/scraper requests per minute
    MAX_REPLIES_PER_HOUR: 20,         // Max total replies per hour (across all alts)
    MIN_SECONDS_BETWEEN_REPLIES: 30,  // Minimum seconds between any two replies
    MAX_REPLIES_PER_DAY: 100,         // Max total replies per day (across all alts)
  }
} as const;
```

**Note:** Single source of truth for all constants. Import this in monitor and services.

---

## Phase 3: Extend Generation System

### File: `mvp/src/generation.ts` (MODIFY)

**Current State:** Has `generateReplyForAlt(altHandle, pelpaTweetText)` - only supports amplify mode

**Add New Function:** Extend to support multiple modes

```typescript
// Add new types at top of file
export type ReplyMode = "amplify" | "sideways" | "inbound";

export interface ReplyContext {
  mode: ReplyMode;
  altHandle: string;
  rootTweetText?: string;   // Pelpa tweet (if relevant)
  parentText?: string;      // Comment we're replying to
  fromUser?: string;        // Handle of person we're replying to
}

// NEW: Unified reply generator for all modes
export async function generatePersonaReply(ctx: ReplyContext): Promise<string> {
  const character = loadCharacter(ctx.altHandle);

  // Build style lines (reuse existing logic)
  const styleLines = [
    ...(character.style?.all || []),
    ...(character.style?.chat || []),
    ...(character.style?.post || [])
  ].filter(Boolean).join('\n');

  // Build bio/lore (reuse existing logic)
  const bioLore = [
    ...(character.bio || []),
    ...(character.lore || [])
  ].filter(Boolean).join('\n');

  // Format examples (reuse existing functions)
  const messageExampleText = formatMessageExamples(character.messageExamples);
  const postExampleText = formatPostExamples(character.postExamples);

  // Build context blocks
  const rootBlock = ctx.rootTweetText
    ? `Root tweet from @pelpa333:\n"${ctx.rootTweetText}"\n\n`
    : '';

  const parentBlock = ctx.parentText
    ? `You are replying to ${ctx.fromUser || 'a user'} who said:\n"${ctx.parentText}"\n\n`
    : '';

  // Mode-specific hints
  const modeHint =
    ctx.mode === "amplify"
      ? "You are replying directly under @pelpa333 to support his post."
      : ctx.mode === "sideways"
      ? "You are replying sideways to another user's comment in @pelpa333's thread. This could be a user OR another alt account - engage naturally."
      : "You are replying to someone who directly replied to you or @mentioned you.";

  // Build prompt sections
  const sections: string[] = [];
  if (bioLore) sections.push(`ABOUT YOU:\n${bioLore}`);
  if (character.adjectives?.length) {
    sections.push(`PERSONALITY ADJECTIVES:\n${character.adjectives.join(', ')}`);
  }
  if (character.topics?.length) {
    sections.push(`CORE TOPICS:\n${character.topics.join(', ')}`);
  }
  if (styleLines) sections.push(`STYLE GUIDELINES:\n${styleLines}`);
  if (messageExampleText) sections.push(`DIALOGUE EXAMPLES:\n${messageExampleText}`);
  if (postExampleText) sections.push(`POST EXAMPLES:\n${postExampleText}`);

  const userPrompt = `${sections.join('\n\n')}\n\nCONTEXT:\n${rootBlock}${parentBlock}MODE:\n${modeHint}\n\nTASK:\nWrite ONE reply as ${character.username}.\n- Follow your system and style EXACTLY - never deviate from your character profile.\n- Stay perfectly in character - use your established personality, tone, and style.\n- Reference at least one specific detail from the relevant tweet/comment.\n- Do NOT copy any text verbatim.\n- Do NOT output a generic 3-6 word hype reply.\n- Avoid emojis and hashtags unless your style explicitly allows them.\n- Keep it concise, natural, and on-brand.\n- ${ctx.mode === 'sideways' ? 'If replying to another alt, engage naturally - don\'t be overly formal.' : ''}\n- CRITICAL: Your character profile defines who you are - never break character.\n`;

  // Use existing llmService.chat() (not generateCompletion)
  const response = await llmService.chat(
    [
      {
        role: 'system',
        content: character.system || `You are ${character.username}. Stay perfectly in character.`
      },
      {
        role: 'user',
        content: userPrompt
      }
    ],
    process.env.OPENROUTER_MODEL_RESPONDER || 'openai/gpt-4o',
    {
      temperature: 0.75,
      max_tokens: ctx.mode === 'inbound' ? 220 : 150, // Inbound can be slightly longer
      logToOpenPipe: true,
      tags: {
        agent: 'alt_responder',
        persona: character.username,
        mode: ctx.mode
      }
    }
  );

  return response.content.trim();
}

// MODIFY: Update existing function to use new unified generator
export async function generateReplyForAlt(
  altHandle: string,
  pelpaTweetText: string
): Promise<string> {
  // Backward compatibility: call new function with amplify mode
  return generatePersonaReply({
    mode: 'amplify',
    altHandle,
    rootTweetText: pelpaTweetText
  });
}
```

**Export `isGarbage()` function** - Currently private in `responseAgent.ts`, needs to be exported or moved to shared utility.

---

## Phase 4: Extend Existing Reply Function

### File: `mvp/src/publish/playwright.ts` (MODIFY)

**Purpose:** Extend existing `replyTo()` function to return reply URL and support nested comments

**Current State:** `replyTo()` exists but returns `void` and uses simpler posting method

**Modifications Needed:**

```typescript
// MODIFY existing replyTo() function signature
export async function replyTo(
  acct: AccountCfg, 
  tweetUrl: string, 
  text: string, 
  dryRun = false
): Promise<string | null> {  // Changed: return URL instead of void
  console.log(`[publish] ${dryRun ? '[DRY RUN] ' : ''}Replying to ${tweetUrl} as ${acct.handle}...`);
  console.log(`[publish] Reply: ${text.substring(0, 100)}...`);

  if (dryRun) {
    console.log(`[publish] ✅ Dry run complete - no actual reply made`);
    return null;
  }

  const launchOptions: any = { headless: false };
  if (acct.proxyUrl) {
    launchOptions.proxy = { server: acct.proxyUrl };
  }
  const browser = await chromium.launch(launchOptions);

  const ctx = await browser.newContext({
    locale: "en-US",
    timezoneId: "America/Toronto",
  });

  try {
    await loadCookies(ctx, acct.cookiePath);
    const page = await ctx.newPage();

    // Navigate to tweet (works for both root and nested comments)
    await page.goto(tweetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });

    // Click reply button (reuse existing pattern, but ensure we click the right one)
    // For nested comments, the first reply button should be for the specific tweet
    const replyButton = page.locator('[data-testid="reply"]').first();
    await replyButton.click();

    // Wait for reply modal
    await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Type reply (enhanced from existing - use more reliable method)
    const textarea = page.locator('[aria-label="Post text"]').first();
    await textarea.click({ force: true });
    await textarea.press('Control+a');
    await textarea.press('Delete');
    await textarea.type(text, { delay: 20 });
    
    // Trigger events (enhanced)
    await textarea.dispatchEvent('input');
    await textarea.dispatchEvent('change');
    await textarea.dispatchEvent('keyup');
    await page.waitForTimeout(2000);

    // Submit (enhanced - use keyboard shortcut for reliability)
    await textarea.press('Control+Enter', { delay: 20 });
    await page.waitForTimeout(3000);

    // Extract reply URL from DOM (NEW - return value)
    try {
      await page.waitForSelector('[data-testid="tweet"]', { timeout: 5000 });
      
      // Find the newly posted reply tweet (first tweet element)
      const replyTweet = page.locator('[data-testid="tweet"]').first();
      const timeElement = replyTweet.locator('time').first();
      const timeParent = await timeElement.locator('..').first();
      const href = await timeParent.getAttribute('href');
      
      if (href) {
        // Extract tweet ID from href (e.g., "/pelpa333/status/1234567890")
        const tweetId = href.split('/status/')[1]?.split('?')[0];
        if (tweetId) {
          // Build full URL
          const username = href.split('/')[1];
          const replyUrl = `https://x.com/${username}/status/${tweetId}`;
          console.log(`[publish] ✅ Reply posted successfully! URL: ${replyUrl}`);
          return replyUrl;
        }
      }
    } catch (error) {
      console.warn('[publish] ⚠️ Could not extract reply tweet ID from DOM, falling back to page URL');
    }

    // Fallback to page URL
    const replyUrl = page.url();
    console.log(`[publish] ✅ Reply posted successfully! URL: ${replyUrl}`);
    return replyUrl;

  } catch (error: any) {
    console.error(`[publish] ❌ Failed to post reply: ${error.message}`);
    return null;
  } finally {
    await ctx.close();
    await browser.close();
  }
}
```

**Helper Function:** Create wrapper for alt accounts

```typescript
// ADD to mvp/src/publish/playwright.ts

import type { AccountCfg } from "../config/accountsNew";

/**
 * Helper to convert alt handle + cookie path to AccountCfg format
 * For use with existing replyTo() function
 */
export function createAccountCfg(handle: string, cookiePath: string, proxyUrl?: string): AccountCfg {
  return {
    handle,
    cookiePath,
    proxyUrl,
    // Other fields can be optional/defaults
    username: undefined,
    password: undefined,
  };
}

/**
 * Wrapper for alt accounts to use replyTo()
 * Converts alt handle/cookiePath to AccountCfg format
 */
export async function replyFromAlt(
  altHandle: string,
  cookiePath: string,
  parentTweetUrl: string,
  replyText: string
): Promise<string | null> {
  const accountCfg = createAccountCfg(altHandle, cookiePath);
  return replyTo(accountCfg, parentTweetUrl, replyText, false);
}
```

**Note:** This reuses the existing `replyTo()` function, just enhances it to return the URL and uses more reliable posting method.

---

## Phase 5: Extend Existing Scraper

### File: `mvp/src/ingest/playwrightScraper.ts` (MODIFY)

**Purpose:** Add `fetchTweetReplies()` function to existing scraper file

**Current State:** File already has `fetchUserTimeline()`, `loadCookies()`, browser patterns

**Add New Function:** Extend existing file with reply fetching

```typescript
// ADD to existing mvp/src/ingest/playwrightScraper.ts

export interface TweetReply {
  id: string;
  user_handle: string;
  text: string;
  in_reply_to_status_id: string;  // Parent tweet ID
  created_at: string;
  url: string;
}

/**
 * Fetch replies to a specific tweet with retry logic
 * Reuses existing loadCookies() and browser patterns from this file
 * @param tweetUrl - URL of the tweet to fetch replies for
 * @param account - AccountCfg for authentication (reuse existing type)
 * @param limit - Max number of replies to fetch
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Array of reply objects
 */
export async function fetchTweetReplies(
  tweetUrl: string,
  account: AccountCfg,
  limit: number = 50,
  maxRetries: number = 3
): Promise<TweetReply[]> {
  let lastError: Error | null = null;
  
  // Retry logic for transient failures
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetchTweetRepliesInternal(tweetUrl, account, limit);
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        const delay = 5000 * attempt; // Exponential backoff: 5s, 10s, 15s
        console.warn(`[playwright-scraper] ⚠️ Failed to fetch replies (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // All retries failed
  console.error(`[playwright-scraper] ❌ Failed to fetch replies after ${maxRetries} attempts:`, lastError);
  return [];
}

/**
 * Internal function to fetch replies (called by retry wrapper)
 * Reuses existing patterns from fetchUserTimeline()
 */
async function fetchTweetRepliesInternal(
  tweetUrl: string,
  account: AccountCfg,
  limit: number = 50
): Promise<TweetReply[]> {
  const launchOptions: any = { headless: false };
  if (account.proxyUrl) {
    launchOptions.proxy = { server: account.proxyUrl };
  }

  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({
    locale: "en-US",
    timezoneId: "America/Toronto",
  });

  try {
    // Reuse existing loadCookies() function from this file
    await loadCookies(ctx, account.cookiePath);
    const page = await ctx.newPage();

    // Navigate to tweet page
    await page.goto(tweetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });

    // Scroll to load replies (reuse scrolling pattern from fetchUserTimeline)
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollBy(0, 1000));
      await page.waitForTimeout(2000);
    }

    // Extract replies from page (reuse extraction pattern from fetchUserTimeline)
    const replies = await page.evaluate((params: { limit: number, rootUrl: string }) => {
      const { limit, rootUrl } = params;
      const tweetElements = document.querySelectorAll('[data-testid="tweet"]');
      const replies: any[] = [];

      // Skip first tweet (it's the root tweet)
      for (let i = 1; i < Math.min(tweetElements.length, limit + 1); i++) {
        const tweet = tweetElements[i];
        if (!tweet) continue;

        try {
          // Extract text (reuse pattern from fetchUserTimeline)
          const textEl = tweet.querySelector('[data-testid="tweetText"]');
          const text = textEl?.textContent?.trim() || '';

          // Extract user handle (reuse pattern from fetchUserTimeline)
          const userLink = tweet.querySelector('a[href^="/"]');
          const userHref = userLink?.getAttribute('href') || '';
          const userHandle = userHref ? `@${userHref.split('/')[1]}` : '';

          // Extract tweet ID from time link (reuse pattern from fetchUserTimeline)
          const timeEl = tweet.querySelector('time');
          const timeParent = timeEl?.parentElement;
          const href = timeParent?.getAttribute('href') || '';
          const tweetId = href.split('/status/')[1]?.split('?')[0] || '';

          // Extract timestamp
          const datetime = timeEl?.getAttribute('datetime') || new Date().toISOString();

          // Extract parent tweet ID (from root URL)
          const inReplyTo = rootUrl.split('/status/')[1]?.split('?')[0] || '';

          if (text && tweetId && userHandle) {
            replies.push({
              id: tweetId,
              user_handle: userHandle,
              text,
              in_reply_to_status_id: inReplyTo,
              created_at: datetime,
              url: `https://x.com${href}`
            });
          }
        } catch (error) {
          console.warn('[playwright-scraper] Error extracting reply:', error);
        }
      }

      return replies;
    }, { limit, rootUrl: tweetUrl });

    console.log(`[playwright-scraper] ✅ Scraped ${replies.length} replies`);
    return replies;

  } catch (error: any) {
    console.error(`[playwright-scraper] ❌ Failed to scrape replies: ${error.message}`);
    throw error; // Re-throw for retry logic
  } finally {
    await ctx.close();
    await browser.close();
  }
}
```

**Note:** This reuses:
- Existing `loadCookies()` function
- Existing `AccountCfg` type
- Existing browser initialization pattern
- Existing scrolling pattern
- Existing tweet extraction pattern

---

## Phase 6: Scoring & Selection Logic

### File: `mvp/src/services/sidewaysReplyService.ts` (NEW)

**Purpose:** Core logic for sideways reply detection, scoring, and posting

```typescript
import { createClient } from '@supabase/supabase-js';
import { ALT_ACCOUNTS, isOurAccount } from '../config/altAccounts';
import { generatePersonaReply, ReplyMode } from '../generation';
import { replyFromAlt } from '../publish/playwright'; // Reuse existing publish module
import { extractTweetId, buildTweetUrl } from '../utils/tweetUtils';
import { isGarbage } from '../utils/contentFilter'; // Shared utility
import { getCookiePath, getAccountCfgForAlt } from '../utils/altHelpers'; // Shared helpers
import { REPLY_CONFIG } from '../config/replyConfig'; // Shared constants

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Use shared configuration constants
const MAX_SIDEWAYS_PER_ROOT = REPLY_CONFIG.sideways.MAX_PER_ROOT;
const MAX_SIDEWAYS_PER_ALT_PER_ROOT = REPLY_CONFIG.sideways.MAX_PER_ALT_PER_ROOT;
const MIN_SCORE_THRESHOLD = REPLY_CONFIG.sideways.MIN_SCORE_THRESHOLD;
const MAX_RETRIES = REPLY_CONFIG.sideways.MAX_RETRIES;

// Testing delays (from shared config)
const SIDEWAYS_DELAY_MIN_MS = REPLY_CONFIG.delays.SIDEWAYS_MIN_MS;
const SIDEWAYS_DELAY_MAX_MS = REPLY_CONFIG.delays.SIDEWAYS_MAX_MS;
const BETWEEN_TWEETS_DELAY_MS = REPLY_CONFIG.delays.BETWEEN_TWEETS_MS;

// NOTE: For production, update REPLY_CONFIG.delays to human-like values (5-30 min, 10-60 min, etc.)

/**
 * Score a comment to determine if it's worth replying to
 * EXPORTED for use by monitor
 */
export function scoreComment(text: string): number {
  const t = text.toLowerCase();
  let score = 0;

  // Questions are engagement gold
  if (t.includes('?')) score += 2;

  // Specific questions are better
  if (t.includes('how') || t.includes('why') || t.includes('what')) score += 1;

  // Substance matters
  if (t.length > 40) score += 1;

  // Numbers/data = real interest
  if (/\d/.test(t)) score += 1;

  // Topic keywords (bonus)
  if (t.includes('bankerbot') || t.includes('wallchain') || t.includes('klout')) score += 1;

  // Penalize spam
  if (/(http|www\.)/.test(t)) score -= 2;  // Link spam
  if (/(scam|fraud|idiot|fuck|bot)/.test(t)) score -= 5;  // Toxic
  if (t.length < 8) score -= 2;  // Too short

  return score;
}

/**
 * Pick which alt should reply to a comment
 * CRITICAL: If commenter is an alt, pick a DIFFERENT alt to avoid self-reply
 * EXPORTED for use by monitor
 */
export function pickAltForSideways(text: string, commenterHandle: string): string {
  const t = text.toLowerCase();
  const ourAlts = [...ALT_ACCOUNTS];

  // If commenter is one of our alts, exclude them from selection
  const availableAlts = isOurAccount(commenterHandle)
    ? ourAlts.filter(alt => alt !== commenterHandle)
    : ourAlts;

  // Safety check: ensure we have at least one alt available
  if (availableAlts.length === 0) {
    throw new Error(`No available alts for sideways reply (commenter: ${commenterHandle})`);
  }

  // Topic-based selection (only from available alts)
  if (t.includes('how') || t.includes('why') || t.includes('work') || t.includes('broke')) {
    const alt = availableAlts.find(alt => alt === '@FIZZonAbstract');
    if (alt) return alt;
  }

  if (t.includes('farm') || t.includes('meta') || t.includes('degen') || t.includes('airdrop')) {
    const alt = availableAlts.find(alt => alt === '@Rick_Rupen');
    if (alt) return alt;
  }

  if (t.includes('design') || t.includes('ux') || t.includes('video') || t.includes('vibe')) {
    const alt = availableAlts.find(alt => alt === '@Dope_MusicVideo');
    if (alt) return alt;
  }

  // Default: aplep333 (human tester tone) or first available alt
  const defaultAlt = availableAlts.find(alt => alt === '@aplep333');
  return defaultAlt || availableAlts[0]!;
}

/**
 * Check if comment is spam or toxic (simple filter)
 * EXPORTED for use by monitor
 */
export function isSpamOrToxic(text: string): boolean {
  const t = text.toLowerCase();
  
  // Link-only spam
  if (/^(http|www\.)/.test(t.trim())) return true;
  
  // Toxic keywords
  if (/(scam|fraud|idiot|fuck|bot|spam)/.test(t)) return true;
  
  // Too short
  if (t.length < 8) return true;
  
  return false;
}

// NOTE: Time-of-day and age checks removed for testing. Add back for production.
// Helper functions (getCookiePath, getAccountCfgForAlt) moved to shared utils/altHelpers.ts

/**
 * Check how many sideways replies exist for a root tweet
 */
async function countSidewaysForRoot(rootTweetId: string): Promise<number> {
  const { count, error } = await supabase
    .from('sideways_replies')
    .select('*', { count: 'exact', head: true })
    .eq('root_tweet_id', rootTweetId);

  if (error) {
    console.error('❌ Error counting sideways replies:', error);
    return 0;
  }

  return count || 0;
}

/**
 * Check how many sideways replies an alt has made for a root tweet
 */
async function countSidewaysForAltPerRoot(rootTweetId: string, altHandle: string): Promise<number> {
  const { count, error } = await supabase
    .from('sideways_replies')
    .select('*', { count: 'exact', head: true })
    .eq('root_tweet_id', rootTweetId)
    .eq('alt_handle', altHandle);

  if (error) {
    console.error('❌ Error counting alt sideways replies:', error);
    return 0;
  }

  return count || 0;
}

/**
 * Check if we already replied to this comment
 */
async function alreadyRepliedToComment(parentTweetId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('sideways_replies')
    .select('id')
    .eq('parent_tweet_id', parentTweetId)
    .limit(1)
    .single();

  // Handle "no rows found" case gracefully (this is expected when checking)
  if (error) {
    // PGRST116 = no rows found (PostgREST error code)
    // Also check for null data as fallback
    if (error.code === 'PGRST116' || error.message?.includes('No rows')) {
      return false; // No existing reply, safe to proceed
    }
    // Other errors should be logged
    console.error('❌ Error checking sideways reply:', error);
    return false; // On error, assume not replied (safer to check than skip)
  }

  return !!data; // If data exists, we already replied
}

/**
 * Recovery function: Reset stuck opportunities (if process crashed)
 * Call this manually if opportunities are stuck as processed but never replied
 */
export async function recoverStuckOpportunities(): Promise<void> {
  console.log('🔧 Recovering stuck opportunities...');
  
  // Find opportunities marked as processed but no reply_tweet_id (likely stuck)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  const { data: stuck, error } = await supabase
    .from('sideways_opportunities')
    .select('*')
    .eq('processed', true)
    .is('reply_tweet_id', null)
    .lt('processed_at', oneHourAgo) // Processed more than 1 hour ago
    .limit(50);
  
  if (error) {
    console.error('❌ Error finding stuck opportunities:', error);
    return;
  }
  
  if (!stuck || stuck.length === 0) {
    console.log('ℹ️ No stuck opportunities found');
    return;
  }
  
  console.log(`🔧 Found ${stuck.length} stuck opportunities, resetting...`);
  
  // Reset them for retry (unless max retries exceeded)
  for (const opp of stuck) {
    if ((opp.retry_count || 0) >= MAX_RETRIES) {
      // Max retries exceeded - leave as processed
      continue;
    }
    
    await supabase
      .from('sideways_opportunities')
      .update({ 
        processed: false,
        processed_at: null,
        last_error: 'Recovered from stuck state'
      })
      .eq('id', opp.id);
  }
  
  console.log(`✅ Reset ${stuck.length} stuck opportunities`);
}

/**
 * Main function: Process sideways opportunities flagged by monitor
 */
export async function processSidewaysReplies(): Promise<void> {
  console.log('🔄 Starting sideways reply processing...');
  
  // Optional: Run recovery first (can be called separately)
  // await recoverStuckOpportunities();

  // Get unprocessed opportunities flagged by monitor
  // Use atomic UPDATE with RETURNING to prevent race conditions
  // This ensures only one process can claim each opportunity
  const { data: opportunities, error } = await supabase
    .from('sideways_opportunities')
    .update({ processed: true }) // Atomically mark as processed
    .eq('processed', false)
    .order('detected_at', { ascending: true })
    .limit(20)
    .select(); // Return the updated rows

  if (error) {
    console.error('❌ Error fetching sideways opportunities:', error);
    return;
  }

  if (!opportunities || opportunities.length === 0) {
    console.log('ℹ️ No sideways opportunities to process');
    return;
  }
  
  // Opportunities are now marked as processed atomically
  // If processing fails, we'll handle retry logic below

  console.log(`📋 Found ${opportunities.length} sideways opportunities to process`);

  // Get root tweet text for context (from response_queue)
  const rootTweetIds = [...new Set(opportunities.map(o => o.root_tweet_id))];
  const { data: rootTasks } = await supabase
    .from('response_queue')
    .select('post_id, post_url, post_text')
    .in('post_id', rootTweetIds);

  const rootTweetMap = new Map(rootTasks?.map(t => [t.post_id, t]) || []);

  // Process each opportunity
  for (const opp of opportunities) {
    try {
      // Check if we already replied to this comment (safety check)
      if (await alreadyRepliedToComment(opp.parent_tweet_id)) {
        // Already handled - mark as processed with success
        await supabase
          .from('sideways_opportunities')
          .update({ 
            processed: true, 
            processed_at: new Date().toISOString(),
            last_error: null
          })
          .eq('id', opp.id);
        continue;
      }

      // Check caps (may have changed since monitor flagged)
      const totalSideways = await countSidewaysForRoot(opp.root_tweet_id);
      if (totalSideways >= MAX_SIDEWAYS_PER_ROOT) {
        console.log(`ℹ️ Max sideways replies reached for tweet ${opp.root_tweet_id}`);
        // Cap reached - mark as processed (skipped due to cap)
        await supabase
          .from('sideways_opportunities')
          .update({ 
            processed: true, 
            processed_at: new Date().toISOString(),
            last_error: 'Cap reached'
          })
          .eq('id', opp.id);
        continue;
      }

      const altCount = await countSidewaysForAltPerRoot(opp.root_tweet_id, opp.recommended_alt_handle);
      if (altCount >= MAX_SIDEWAYS_PER_ALT_PER_ROOT) {
        console.log(`ℹ️ Alt cap reached for ${opp.recommended_alt_handle} on tweet ${opp.root_tweet_id}`);
        // Alt cap reached - mark as processed (skipped due to cap)
        await supabase
          .from('sideways_opportunities')
          .update({ 
            processed: true, 
            processed_at: new Date().toISOString(),
            last_error: 'Alt cap reached'
          })
          .eq('id', opp.id);
        continue;
      }

      // Get root tweet text (prefer stored text, fallback to response_queue)
      const rootTweetText = opp.root_tweet_text || rootTweetMap.get(opp.root_tweet_id)?.post_text || '';
      
      // Use stored parent tweet URL (stored by monitor)
      const parentTweetUrl = opp.parent_tweet_url;
      
      if (!parentTweetUrl) {
        console.error(`❌ Missing parent_tweet_url for opportunity ${opp.id}`);
        await supabase
          .from('sideways_opportunities')
          .update({ 
            processed: true, 
            processed_at: new Date().toISOString(),
            last_error: 'Missing parent_tweet_url'
          })
          .eq('id', opp.id);
        continue;
      }

      // Generate reply
      console.log(`🤖 [${opp.recommended_alt_handle}] Generating sideways reply to ${opp.commenter_handle}...`);
      
      const replyText = await generatePersonaReply({
        mode: 'sideways',
        altHandle: opp.recommended_alt_handle,
        rootTweetText,
        parentText: opp.comment_text,
        fromUser: opp.commenter_handle
      });

      // Filter garbage
      if (isGarbage(replyText)) {
        console.log(`⚠️ [${opp.recommended_alt_handle}] Generated reply was garbage, skipping`);
        // Garbage reply - mark as processed (skipped)
        await supabase
          .from('sideways_opportunities')
          .update({ 
            processed: true, 
            processed_at: new Date().toISOString(),
            last_error: 'Generated garbage reply'
          })
          .eq('id', opp.id);
        continue;
      }

      // TESTING DELAY: Fast for development (5-60 seconds)
      const delay = Math.floor(Math.random() * (SIDEWAYS_DELAY_MAX_MS - SIDEWAYS_DELAY_MIN_MS)) + SIDEWAYS_DELAY_MIN_MS;
      const delaySeconds = Math.round(delay / 1000);
      console.log(`⏳ [${opp.recommended_alt_handle}] Waiting ${delaySeconds} seconds before posting...`);
      await new Promise(resolve => setTimeout(resolve, delay));

      // Post reply (with error handling for cookie/auth errors)
      let replyUrl: string | null = null;
      let postError: Error | null = null;
      
      try {
        replyUrl = await replyFromAlt(
          opp.recommended_alt_handle,
          getCookiePath(opp.recommended_alt_handle),
          parentTweetUrl,
          replyText
        );
      } catch (error) {
        postError = error as Error;
        console.error(`❌ [${opp.recommended_alt_handle}] Error posting reply:`, postError.message);
      }

      if (!replyUrl) {
        console.error(`❌ [${opp.recommended_alt_handle}] Failed to post sideways reply`);
        
        // Check if it's a cookie/auth error (don't retry - move to next account)
        const errorMessage = postError?.message?.toLowerCase() || '';
        const isAuthError = errorMessage.includes('cookie') || 
                           errorMessage.includes('auth') || 
                           errorMessage.includes('login') ||
                           errorMessage.includes('unauthorized');
        
        if (isAuthError) {
          // Cookie/auth error - log and mark as failed (no retry)
          await supabase
            .from('sideways_opportunities')
            .update({ 
              processed: true, 
              processed_at: new Date().toISOString(),
              retry_count: MAX_RETRIES, // Mark as max retries to prevent retry
              last_error: `Cookie/auth error - no retry: ${postError?.message || 'Unknown'}`
            })
            .eq('id', opp.id);
          console.error(`🚨 Cookie/auth error for ${opp.recommended_alt_handle} - skipping retry, moving to next account`);
          continue;
        }
        
        // Increment retry count
        const newRetryCount = (opp.retry_count || 0) + 1;
        
        if (newRetryCount >= MAX_RETRIES) {
          // Max retries reached - mark as processed with error
          await supabase
            .from('sideways_opportunities')
            .update({ 
              processed: true, 
              processed_at: new Date().toISOString(),
              retry_count: newRetryCount,
              last_error: `Max retries exceeded: ${postError?.message || 'Unknown error'}`
            })
            .eq('id', opp.id);
          
          // TODO: Alert on failure (implement alerting system)
          console.error(`🚨 ALERT: Failed to post sideways reply after ${MAX_RETRIES} attempts: ${opp.id}`);
        } else {
          // Mark as unprocessed for retry
          await supabase
            .from('sideways_opportunities')
            .update({ 
              processed: false,  // Unmark for retry
              retry_count: newRetryCount,
              last_error: `Posting failed: ${postError?.message || 'Unknown error'}`
            })
            .eq('id', opp.id);
        }
        continue;
      }

      // Save to sideways_replies table (tracks posted replies)
      const { error: insertError } = await supabase
        .from('sideways_replies')
        .insert({
          root_tweet_id: opp.root_tweet_id,
          parent_tweet_id: opp.parent_tweet_id,
          alt_handle: opp.recommended_alt_handle,
          reply_tweet_id: extractTweetId(replyUrl),
          score: opp.score
        });

      if (insertError) {
        console.error(`❌ Error saving sideways reply:`, insertError);
        continue;
      }

      // Mark opportunity as processed (success)
      await supabase
        .from('sideways_opportunities')
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          reply_tweet_id: extractTweetId(replyUrl),
          last_error: null  // Clear any previous errors
        })
        .eq('id', opp.id);

      console.log(`✅ [${opp.recommended_alt_handle}] Posted sideways reply to ${opp.commenter_handle}`);

      // Small delay between opportunities (testing: 10 seconds)
      await new Promise(resolve => setTimeout(resolve, BETWEEN_TWEETS_DELAY_MS));

    } catch (error) {
      console.error(`❌ Error processing sideways opportunity ${opp.id}:`, error);
    }
  }

  console.log('✅ Sideways reply processing complete');
}
```

---

## Phase 7: Inbound Reply Service

### File: `mvp/src/services/inboundReplyService.ts` (NEW)

**Purpose:** Detect and process inbound @mentions and replies to our alts

```typescript
import { createClient } from '@supabase/supabase-js';
import { ALT_ACCOUNTS } from '../config/altAccounts';
import { generatePersonaReply, ReplyMode } from '../generation';
import { replyFromAlt } from '../publish/playwright'; // Reuse existing publish module
import { extractTweetId } from '../utils/tweetUtils';
import { isGarbage } from '../utils/contentFilter'; // Shared utility
import { getCookiePath, getAccountCfgForAlt } from '../utils/altHelpers'; // Shared helpers

// Use shared configuration constants
import { REPLY_CONFIG } from '../config/replyConfig';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_INBOUND_PER_ALT_PER_HOUR = REPLY_CONFIG.inbound.MAX_PER_ALT_PER_HOUR;
const MAX_REPLIES_PER_USER_PER_ALT_PER_DAY = REPLY_CONFIG.inbound.MAX_PER_USER_PER_ALT_PER_DAY;
const MIN_SCORE_THRESHOLD = REPLY_CONFIG.inbound.MIN_SCORE_THRESHOLD;

// Testing delays (from shared config)
const INBOUND_DELAY_MIN_MS = REPLY_CONFIG.delays.INBOUND_MIN_MS;
const INBOUND_DELAY_MAX_MS = REPLY_CONFIG.delays.INBOUND_MAX_MS;

// NOTE: For production, update REPLY_CONFIG.delays to human-like values (10-60 min, etc.)

/**
 * Score an inbound message
 */
function scoreInbound(text: string): number {
  const t = text.toLowerCase();
  let score = 0;

  if (t.includes('?')) score += 2;
  if (/\d/.test(t)) score += 1;
  if (t.includes('how') || t.includes('why') || t.includes('what')) score += 1;
  if (t.length > 30) score += 1;

  // Penalize spam
  if (/(http|www\.)/.test(t)) score -= 2;
  if (/(scam|fraud|idiot|fuck|bot)/.test(t)) score -= 4;
  if (t.length < 8) score -= 2;

  return score;
}

// Helper functions (getCookiePath, getAccountCfgForAlt) moved to shared utils/altHelpers.ts

/**
 * Check if we already processed this inbound tweet
 */
async function inboundExists(altHandle: string, sourceTweetId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('inbound_alt_replies')
    .select('id')
    .eq('alt_handle', altHandle)
    .eq('source_tweet_id', sourceTweetId)
    .single();

  // Handle "no rows found" case gracefully
  if (error) {
    if (error.code === 'PGRST116' || error.message?.includes('No rows')) {
      return false; // No existing record, safe to proceed
    }
    console.error('❌ Error checking inbound:', error);
    return false; // On error, assume not exists (safer to check than skip)
  }

  return !!data;
}

/**
 * Check rate limits for an alt
 */
async function checkAltRateLimit(altHandle: string): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  const { count, error } = await supabase
    .from('inbound_alt_replies')
    .select('*', { count: 'exact', head: true })
    .eq('alt_handle', altHandle)
    .eq('replied', true)
    .gte('created_at', oneHourAgo);

  if (error) {
    console.error('❌ Error checking rate limit:', error);
    return false;
  }

  return (count || 0) < MAX_INBOUND_PER_ALT_PER_HOUR;
}

/**
 * Check user-alt pair rate limit
 */
async function checkUserAltRateLimit(altHandle: string, userHandle: string): Promise<boolean> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  const { count, error } = await supabase
    .from('inbound_alt_replies')
    .select('*', { count: 'exact', head: true })
    .eq('alt_handle', altHandle)
    .eq('source_user_handle', userHandle)
    .eq('replied', true)
    .gte('created_at', oneDayAgo);

  if (error) {
    console.error('❌ Error checking user-alt rate limit:', error);
    return false;
  }

  return (count || 0) < MAX_REPLIES_PER_USER_PER_ALT_PER_DAY;
}

// NOTE: Inbound detection is handled by monitor's detectInboundOpportunities() function.
// This service only processes opportunities flagged by the monitor.

/**
 * Process inbound replies that need responses
 */
export async function processInboundReplies(): Promise<void> {
  console.log('🔄 Starting inbound reply processing...');

  // Get unreplied inbound mentions (flagged by monitor)
  const { data: inboundRows, error } = await supabase
    .from('inbound_alt_replies')
    .select('*')
    .eq('replied', false)
    .order('created_at', { ascending: true })
    .limit(20);

  if (error) {
    console.error('❌ Error fetching inbound replies:', error);
    return;
  }

  if (!inboundRows || inboundRows.length === 0) {
    console.log('ℹ️ No unreplied inbound mentions found');
    return;
  }

  console.log(`📋 Found ${inboundRows.length} unreplied inbound mentions`);

  // Process each inbound with spacing to avoid bursts
  for (const row of inboundRows) {
    try {
      // Check rate limits
      if (!(await checkAltRateLimit(row.alt_handle))) {
        console.log(`⚠️ Rate limit reached for ${row.alt_handle}, skipping`);
        continue;
      }

      if (!(await checkUserAltRateLimit(row.alt_handle, row.source_user_handle))) {
        console.log(`⚠️ User rate limit reached for ${row.alt_handle} ↔ ${row.source_user_handle}, skipping`);
        continue;
      }

      // Use stored tweet text (stored at insert time)
      const sourceTweetText = row.source_tweet_text || '';
      
      if (!sourceTweetText) {
        // Mark as processed but no reply (no text available)
        await supabase
          .from('inbound_alt_replies')
          .update({ replied: true })
          .eq('id', row.id);
        continue;
      }

      const score = scoreInbound(sourceTweetText);
      if (score < MIN_SCORE_THRESHOLD) {
        // Mark as processed but no reply (low score)
        await supabase
          .from('inbound_alt_replies')
          .update({ replied: true })
          .eq('id', row.id);
        continue;
      }

      // Try to get root tweet context if available
      let rootTweetText = '';
      if (row.in_reply_to_tweet_id) {
        // Try to find root tweet from response_queue
        const { data: rootTask } = await supabase
          .from('response_queue')
          .select('post_text')
          .eq('post_id', row.in_reply_to_tweet_id)
          .single();
        
        rootTweetText = rootTask?.post_text || '';
      }

      // Generate reply
      console.log(`🤖 [${row.alt_handle}] Generating inbound reply to ${row.source_user_handle}...`);
      
      const replyText = await generatePersonaReply({
        mode: 'inbound',
        altHandle: row.alt_handle,
        rootTweetText,
        parentText: sourceTweetText,
        fromUser: row.source_user_handle
      });

      // Filter garbage
      if (isGarbage(replyText)) {
        console.log(`⚠️ [${row.alt_handle}] Generated reply was garbage, marking as processed`);
        await supabase
          .from('inbound_alt_replies')
          .update({ replied: true })
          .eq('id', row.id);
        continue;
      }

      // TESTING DELAY: Fast for development (10-90 seconds)
      const delay = Math.floor(Math.random() * (INBOUND_DELAY_MAX_MS - INBOUND_DELAY_MIN_MS)) + INBOUND_DELAY_MIN_MS;
      const delaySeconds = Math.round(delay / 1000);
      console.log(`⏳ [${row.alt_handle}] Waiting ${delaySeconds} seconds before posting inbound reply...`);
      await new Promise(resolve => setTimeout(resolve, delay));

      // Build source tweet URL (we'll need username - might need to store it)
      const sourceTweetUrl = `https://x.com/${row.source_user_handle.replace('@', '')}/status/${row.source_tweet_id}`;
      
      // Check account health before posting (simple check - could be enhanced)
      // TODO: Add proper account health check (cookies valid, account not suspended)
      
      // Post reply (reuse existing publish/playwright function)
      const replyUrl = await replyFromAlt(row.alt_handle, getCookiePath(row.alt_handle), sourceTweetUrl, replyText);

      if (!replyUrl) {
        console.error(`❌ [${row.alt_handle}] Failed to post inbound reply`);
        
        // TODO: Alert on failure (implement alerting system)
        console.error(`🚨 ALERT: Failed to post inbound reply for ${row.alt_handle} → ${row.source_user_handle}`);
        
        // Check if account might be suspended/expired
        // TODO: Add account health check and alert if account issues detected
        
        await supabase
          .from('inbound_alt_replies')
          .update({ replied: true })
          .eq('id', row.id);
        continue;
      }

      // Update database
      const { error: updateError } = await supabase
        .from('inbound_alt_replies')
        .update({
          replied: true,
          reply_tweet_id: extractTweetId(replyUrl)
        })
        .eq('id', row.id);

      if (updateError) {
        console.error(`❌ Error updating inbound reply:`, updateError);
      } else {
        console.log(`✅ [${row.alt_handle}] Posted inbound reply to ${row.source_user_handle}`);
      }

      // Small delay between inbound replies (testing: 10 seconds)
      await new Promise(resolve => setTimeout(resolve, 10000));

    } catch (error) {
      console.error(`❌ Error processing inbound ${row.id}:`, error);
    }
  }

  console.log('✅ Inbound reply processing complete');
}

// NOTE: Inbound detection is handled by monitor's detectInboundOpportunities() function.
// This service only processes opportunities flagged by the monitor.
```

---

## Phase 8: CLI Commands

### File: `mvp/src/cli.ts` (MODIFY)

**Command Structure:**

- `npm run swarm respond` - **RUN FIRST** - Existing amplify mode (alts reply directly to Pelpa tweets, sets `status='posted'`)
- `npm run swarm monitor` - **RUN SECOND** - Scans Pelpa tweets, detects opportunities, flags in Supabase
  - Detects sideways opportunities (requires `response_queue.status='posted'` tweets)
  - Detects inbound opportunities (requires `sideways_replies` table to have entries)
- `npm run swarm sideways` - **RUN THIRD** - Processes flagged sideways opportunities, posts replies
- `npm run swarm inbound` - **RUN FOURTH** - Processes flagged inbound opportunities, posts replies
- `npm run swarm engage` - Runs both `sideways` + `inbound` together (convenience command)

**CRITICAL: Execution Order**

The commands MUST be run in this order:

1. **`swarm respond`** - Posts initial amplify replies, sets `status='posted'` in `response_queue`
2. **`swarm monitor`** - Detects sideways opportunities (checks `response_queue.status='posted'`)
3. **`swarm sideways`** - Processes and posts sideways replies (creates `sideways_replies` entries)
4. **`swarm monitor`** (again) - Detects inbound opportunities (checks `sideways_replies` table)
5. **`swarm inbound`** - Processes and posts inbound replies

**Note:** For inbound detection to work, you need to run `monitor` again AFTER `sideways` has posted replies, since inbound detection checks the `sideways_replies` table.

**Add new swarm subcommands:**

```typescript
// In the swarm command handler, add:

if (subCmd === "sideways") {
  console.log("[cli] 🔄 Processing sideways replies...");
  
  const { processSidewaysReplies } = await import("./services/sidewaysReplyService");
  
  try {
    await processSidewaysReplies();
    console.log("[cli] ✅ Sideways reply processing complete");
  } catch (error) {
    console.error("[cli] ❌ Sideways reply processing failed:", error);
  }
  
  return;
}

if (subCmd === "inbound") {
  console.log("[cli] 🔄 Processing inbound replies...");
  
  const { processInboundReplies } = await import("./services/inboundReplyService");
  
  try {
    await processInboundReplies();
    console.log("[cli] ✅ Inbound reply processing complete");
  } catch (error) {
    console.error("[cli] ❌ Inbound reply processing failed:", error);
  }
  
  return;
}

if (subCmd === "engage") {
  console.log("[cli] 🔄 Running full engagement cycle (sideways + inbound)...");
  
  const { processSidewaysReplies } = await import("./services/sidewaysReplyService");
  const { processInboundReplies } = await import("./services/inboundReplyService");
  
  try {
    // Step 1: Process sideways opportunities
    await processSidewaysReplies();
    
    // Step 2: Process inbound opportunities
    await processInboundReplies();
    
    console.log("[cli] ✅ Full engagement cycle complete");
  } catch (error) {
    console.error("[cli] ❌ Engagement cycle failed:", error);
  }
  
  return;
}

if (subCmd === "recover") {
  console.log("[cli] 🔧 Recovering stuck opportunities...");
  
  const { recoverStuckOpportunities } = await import("./services/sidewaysReplyService");
  
  try {
    await recoverStuckOpportunities();
    console.log("[cli] ✅ Recovery complete");
  } catch (error) {
    console.error("[cli] ❌ Recovery failed:", error);
  }
  
  return;
}
```

**Update usage message:**
```typescript
console.error("[cli] Usage: npm run cli swarm <start|once|agent|queue|logs|review|dashboard|monitor|respond|premium|sideways|inbound|engage|recover>");
```

**Note:** 
- Monitor handles detection and flagging. Reply services (`sideways`, `inbound`) process flags separately.
- **CRITICAL:** Monitor must run AFTER `respond` (needs `status='posted'` tweets) and AFTER `sideways` (for inbound detection)
- **Execution:** For now, will run all steps automatically in sequence, then set up loops at set time points later
- **Rate limiting:** X.com rate limits enforced via `REPLY_CONFIG.rateLimits` to keep process natural
- Alerting for failures and account issues: TODO (will implement but not now)
- Performance monitoring: TODO (high priority)

---

## Phase 9: Refactor ResponseAgent (Minimal Change)

### File: `mvp/src/agents/responseAgent.ts` (MODIFY)

**Extract commentOnPost to use shared utility:**

```typescript
// At top of file, add import:
import { replyFromAlt } from '../publish/playwright'; // Fixed: correct import path

// MODIFY commentOnPost method to use shared utility:
async commentOnPost(postUrl: string, response: string): Promise<string | null> {
  try {
    // Use shared utility instead of inline Playwright code
    const replyUrl = await replyFromAlt(
      this.responseAccount,
      this.cookiePath,
      postUrl,
      response
    );

    if (replyUrl) {
      console.log(`✅ [${this.responseAccount}] Successfully posted comment`);
      return replyUrl;
    }

    return null;
  } catch (error) {
    console.error('❌ Error commenting on post:', error);
    return null;
  }
}
```

**Note:** This removes ~60 lines of duplicate Playwright code and reuses the shared utility.

---

## Implementation Order

### Step 1: Database Setup
1. **Create migration SQL file:** `mvp/supabase/sideways-inbound-schema.sql`
   - Include all table definitions from Phase 1
   - Include all indexes
   - Include RLS policies (if needed)
   - Test migration before proceeding
2. Run Supabase migration to create:
   - `sideways_opportunities` table (monitor flags)
     - **CRITICAL:** Include `parent_tweet_url` column (full URL for replying)
     - Include `retry_count` and `last_error` columns for retry tracking
     - Include `detected_at` and `processed_at` timestamps
   - `sideways_replies` table (tracks posted replies)
   - `inbound_alt_replies` table (tracks inbound mentions)
3. **Verify schema:** After migration, verify all columns exist and constraints are correct

### Step 2: Shared Utilities
1. Create `mvp/src/config/altAccounts.ts` (constants)
2. Create `mvp/src/config/replyConfig.ts` (shared constants for sideways/inbound)
3. Create `mvp/src/utils/tweetUtils.ts` (ID/URL helpers)
4. Create `mvp/src/utils/contentFilter.ts` (export `isGarbage()` function)
5. Create `mvp/src/utils/altHelpers.ts` (shared `getCookiePath()`, `getAccountCfgForAlt()`)

### Step 3: Extend Existing Files (Maximize Reuse)
1. Modify `mvp/src/publish/playwright.ts`:
   - Update `replyTo()` to return `string | null` (reply URL)
   - Enhance posting method for reliability
   - Add `createAccountCfg()` helper function
   - Add `replyFromAlt()` wrapper function
2. Modify `mvp/src/ingest/playwrightScraper.ts`:
   - Add `TweetReply` interface
   - Add `fetchTweetReplies()` function (reuses existing `loadCookies()` and patterns)
   - Add retry wrapper for reliability

### Step 4: Extend Generation
1. Modify `mvp/src/generation.ts`:
   - Add `ReplyMode` type and `ReplyContext` interface
   - Add `generatePersonaReply()` function
   - Update `generateReplyForAlt()` to call new function (backward compatible)

### Step 5: Sideways Service (Scoring & Selection Logic)
1. Create `mvp/src/services/sidewaysReplyService.ts`
2. Import `REPLY_CONFIG` from `../config/replyConfig` (use shared constants)
3. Implement `scoreComment()`, `pickAltForSideways()`, and `isSpamOrToxic()` functions
4. **EXPORT** these functions for use by monitor (add `export` keyword)
5. Implement `processSidewaysReplies()` to consume opportunities
   - **CRITICAL:** Use atomic UPDATE with RETURNING to prevent race conditions
   - **CRITICAL:** Use `parent_tweet_url` from database (don't construct URL)
   - Add retry logic (max retries from config, then alert and mark as failed)
   - Add alerting placeholder for failures (TODO)
6. Implement `recoverStuckOpportunities()` function for manual recovery
7. **CRITICAL:** Ensure alt-to-alt selection avoids self-replies
8. Import shared helpers from `../utils/altHelpers` (don't duplicate `getCookiePath`, `getAccountCfgForAlt`)

### Step 6: Monitor Integration (Detection)
1. Modify `mvp/src/services/pelpa333Monitor.ts` (NOTE: File is in `services/` directory, not `monitoring/`):
   - Import `scoreComment`, `pickAltForSideways`, `isSpamOrToxic` from `./sidewaysReplyService` (same directory)
   - Import `getAccountCfgForAlt` from `../utils/altHelpers`
   - Import `fetchTweetReplies` from `../ingest/playwrightScraper`
   - Import `REPLY_CONFIG` from `../config/replyConfig` (use shared constants)
   - Add `detectSidewaysOpportunities()` function
     - **CRITICAL:** Only checks tweets with `response_queue.status = 'posted'` (requires `swarm respond` to run first)
     - **CRITICAL:** Store `reply.url` in `parent_tweet_url` field (full URL needed for replying)
     - **CRITICAL:** Store `task.post_text` in `root_tweet_text` field (for context in generation)
     - **CRITICAL:** Skip tweets older than 48 hours (tweet age filtering)
     - **CRITICAL:** Wrap scraper call in try-catch to handle failures gracefully
     - **CRITICAL:** Handle UNIQUE constraint violations gracefully (duplicate detection)
   - Add `detectInboundOpportunities()` function (handles ALL inbound detection)
     - **CRITICAL:** Checks `sideways_replies` table (requires `swarm sideways` to run first)
   - **CRITICAL:** Call these functions inside `monitorPelpa333()` method:
     - Call `detectSidewaysOpportunities()` for each posted tweet (check `response_queue.status = 'posted'`)
     - Call `detectInboundOpportunities()` once per monitor cycle (will be empty if sideways hasn't run yet)
     - Wrap both calls in try-catch blocks to prevent crashes
   - **NOTE:** Monitor runs manually for now (no automated scheduling)
   - **EXECUTION ORDER:** Run `swarm respond` → `swarm monitor` → `swarm sideways` → `swarm monitor` (again) → `swarm inbound`

### Step 7: Inbound Service
1. Create `mvp/src/services/inboundReplyService.ts`
2. Import `REPLY_CONFIG` from `../config/replyConfig` (use shared constants)
3. Import shared helpers from `../utils/altHelpers` (don't duplicate `getCookiePath`, `getAccountCfgForAlt`)
4. Implement `processInboundReplies()` to consume flagged opportunities (monitor handles detection)
5. Add rate limiting checks (use constants from REPLY_CONFIG)
6. Add alerting placeholder for failures (TODO)
7. Add account health check placeholder (TODO - alert if account suspended/expired)
8. **NOTE:** Do NOT implement `detectInboundFromSidewaysReplies()` - monitor handles all detection

### Step 8: CLI Integration
1. Modify `mvp/src/cli.ts` to add:
   - `swarm sideways` - Process sideways opportunities
   - `swarm inbound` - Process inbound opportunities
   - `swarm engage` - Run both together
   - `swarm recover` - Recover stuck opportunities (optional manual command)

### Step 9: Refactor ResponseAgent (Optional)
1. Modify `mvp/src/agents/responseAgent.ts`:
   - Import `isGarbage` from `../utils/contentFilter` instead of using private method
   - Import `replyFromAlt` from `../publish/playwright` (NOT `../utils/replyPoster` - that file doesn't exist)
   - Update `commentOnPost()` to use `replyFromAlt()` from `../publish/playwright` (reuses existing function)
   - Remove private `isGarbage()` method (now using shared utility)
   - **NOTE:** `ResponseAgent` uses persistent browser/page, while `replyFromAlt()` creates new browser per call - this is acceptable for refactoring

### Step 10: Create Migration SQL File
1. Create `mvp/supabase/sideways-inbound-schema.sql`:
   - Include all table definitions from Phase 1
   - Include all indexes
   - Include RLS policies (if needed)
   - Test migration before proceeding
   - **Verify:** After migration, check that all columns exist and constraints are correct

### Step 11: Testing
1. **CRITICAL: Test Supabase UPDATE with RETURNING FIRST:** Verify atomic UPDATE pattern works before proceeding:
   ```typescript
   const { data, error } = await supabase
     .from('sideways_opportunities')
     .update({ processed: true })
     .eq('processed', false)
     .order('detected_at', { ascending: true })
     .limit(20)
     .select();
   ```
   - **MUST VERIFY:** Test this pattern in isolation before implementing `processSidewaysReplies()`
   - If this doesn't work, use alternative: SELECT first, then UPDATE individually with row-level locking
   - **Fallback pattern:** Use `SELECT ... FOR UPDATE SKIP LOCKED` if available, or SELECT then UPDATE with WHERE clause to prevent race conditions
2. **Test URL extraction:** Verify `extractTweetId()` handles various formats:
   - `https://x.com/user/status/1234567890`
   - `https://x.com/user/status/1234567890?s=20`
   - `https://twitter.com/user/status/1234567890`
3. **Test monitor detection:**
   - Run `npm run swarm monitor` - Verify opportunities are flagged
   - Check `sideways_opportunities` table for flagged opportunities
   - Check `inbound_alt_replies` table for flagged inbound mentions
4. **Test sideways processing:**
   - Run `npm run swarm sideways` - Test sideways reply processing
   - Verify replies are posted and saved to `sideways_replies`
   - Test alt-to-alt sideways replies
5. **Test inbound processing:**
   - Run `npm run swarm inbound` - Test inbound reply processing
   - Verify replies are posted and `inbound_alt_replies.replied` is updated
6. **Verify constraints:**
   - Verify deduplication works (UNIQUE constraints)
   - Verify caps are enforced (max 6 per root, max 2 per alt)
   - Verify retry logic works (max 3 retries)
7. **Test error handling:**
   - Test scraper failures don't crash monitor
   - Test posting failures trigger retry logic
   - Test stuck opportunities recovery (`swarm recover`)

---

## Key Design Decisions

### 1. Alt-to-Alt Replies ✅
- **DON'T filter out our accounts** - Allow alts to reply to other alts' comments
- **Avoid self-replies** - If `@FIZZonAbstract` comments, pick a different alt to reply
- **Natural engagement** - Alts can have conversations in Pelpa threads
- **Intentional alt-to-alt engagement** - We WANT alts to comment on each other (no loop prevention needed)

### 2. Only ONE Alt Per Comment ✅
- **Database UNIQUE constraint** - `UNIQUE (parent_tweet_id, alt_handle)` enforces this
- **Check before posting** - `alreadyRepliedToComment()` prevents duplicates
- **First alt wins** - Whichever alt processes first gets to reply

### 3. Lowkey Engagement ✅
- **Max 6 sideways per Pelpa post** - Keeps threads alive but not spammy
- **Max 2 per alt per post** - Prevents one alt dominating
- **Testing delays** - 5-60 seconds for sideways, 10-90 seconds for inbound (fast for development)
- **Quality scoring** - Only reply to good comments (score >= 3)
- **Monitor-based detection** - Monitor flags opportunities, reply services process separately
- **Decoupled architecture** - Detection (monitor) separate from action (reply services)

### 4. Reuse Existing Infrastructure ✅
- Use `llmService.chat()` (not `generateCompletion`)
- Use `response_queue` table (existing) - **CRITICAL:** Check `status = 'posted'` to identify tweets to check
- Use existing character files and loader
- Export `isGarbage()` to shared utility (`contentFilter.ts`) for reuse
- **Reuse `publish/playwright.ts` `replyTo()`** - Extend existing function instead of creating new file
- **Reuse `ingest/playwrightScraper.ts`** - Add `fetchTweetReplies()` to existing file instead of creating new file
- Use existing cookie/Playwright patterns from `playwrightScraper.ts`
- Use existing `AccountCfg` type from `config/accountsNew.ts`
- **Standardize cookie paths:** Use `getCookiePath()` helper from `altHelpers.ts` everywhere (replaces inconsistent `./secrets/` vs `../../secrets/`)

### 5. Browser Instance Strategy ✅
- **Current approach:** `replyFromAlt()` creates a new browser instance per reply
- **Trade-off:** Slower but simpler, avoids state management issues
- **Rationale:** Acceptable for MVP - each reply is independent, no shared state needed
- **Future optimization:** Could reuse browser instances with proper cleanup, but not critical

### 6. Error Handling & Retry Logic ✅
- **Scraping:** Added retry logic to `fetchTweetReplies()` (3 attempts with exponential backoff)
- **Monitor detection:** Wrap detection function calls in try-catch to prevent crashes
- **Supabase errors:** Improved error code handling for "no rows found" cases (PGRST116)
- **Reply posting:** Fallback to page URL if DOM extraction fails
- **Alt selection:** Added safety check to prevent empty array access
- **Retry logic:** Max 3 retries per opportunity, then mark as failed
- **Stuck recovery:** Manual recovery function for opportunities stuck in processed state
- **Cookie expiration:** NO RETRY on cookie failures - log error, mark as failed, move to next account (prevents infinite retry loops)

---

## Example Flow

### Scenario: Alt-to-Alt Sideways Reply

```
1. Pelpa posts: "@kloutgg is building something cool!"

2. All 4 alts amplify (like/RT/comment):
   - @FIZZonAbstract: "Chrome UI needed..."
   - @Rick_Rupen: "Focus on core..."
   - @Dope_MusicVideo: "Design matters..."
   - @aplep333: "Curious to test..."

3. User @cryptouser comments: "How does this work?"

4. System processes sideways:
   - Fetches replies → finds @cryptouser's comment
   - Scores: 4 (question + "how" + length) → passes
   - Picks alt: Contains "how" → @FIZZonAbstract
   - Generates: "It's automated but needs chrome UI..."
   - Posts: @FIZZonAbstract replies to @cryptouser
   - Saves to sideways_replies table

5. @Rick_Rupen comments: "Anyone tried the alpha yet?"

6. System processes sideways:
   - Finds @Rick_Rupen's comment
   - Scores: 3 (question + length) → passes
   - Picks alt: Since commenter is @Rick_Rupen, exclude from selection
   - Available: [@FIZZonAbstract, @Dope_MusicVideo, @aplep333]
   - Picks: @aplep333 (default for questions)
   - Generates: "Haven't tried it yet, but curious..."
   - Posts: @aplep333 replies to @Rick_Rupen ← ALT-TO-ALT
   - Saves to sideways_replies table

7. @cryptouser replies: "@FIZZonAbstract thanks! What about the API?"

8. System detects inbound:
   - Finds reply to @FIZZonAbstract
   - Inserts into inbound_alt_replies
   - Processes: Scores 3 → passes
   - Generates: "API docs are in the pinned thread..."
   - Posts: @FIZZonAbstract replies back ← INBOUND
   - Updates inbound_alt_replies (replied=true)
```

---

## Configuration (Optional)

### File: `mvp/config/replyConfig.yaml` (NEW - Optional)

```yaml
sideways_replies:
  enabled: true
  max_per_root: 6
  max_per_alt_per_root: 2
  min_score: 3
  delay_min_ms: 5000
  delay_max_ms: 60000

inbound_replies:
  enabled: true
  max_per_alt_per_hour: 8
  max_per_user_per_alt_per_day: 2
  min_score: 2
  delay_min_ms: 10000
  delay_max_ms: 90000
```

Or add to existing `mvp/config/accounts.yaml`:

```yaml
# Add to accounts.yaml
sideways_replies:
  max_per_root: 6
  max_per_alt_per_root: 2
  min_score: 3

inbound_replies:
  max_per_alt_per_hour: 8
  max_per_user_per_alt_per_day: 2
  min_score: 2
```

---

## Testing Checklist

- [ ] Sideways reply to user comment works
- [ ] Sideways reply to alt comment works (alt-to-alt)
- [ ] Only ONE alt can reply to same comment (UNIQUE constraint)
- [ ] Caps are enforced (max 6 per root, max 2 per alt)
- [ ] Inbound detection works (replies to our alt's comments)
- [ ] Inbound processing works (alt responds to @mentions)
- [ ] Rate limits work (max per hour, max per user per day)
- [ ] Deduplication works (doesn't reply twice)
- [ ] Garbage filtering works (skips low-quality replies)
- [ ] Character consistency (replies match persona)
- [ ] Parent tweet URL is stored correctly by monitor
- [ ] Retry logic works (max retries from config)
- [ ] Race condition prevention works (atomic UPDATE with RETURNING)
- [ ] Stuck recovery works (`swarm recover` command)
- [ ] Constants are shared (no duplication between monitor and services)
- [ ] Alerting placeholders are in place (TODO: implement alerting system)

---

## Summary

This plan:
- ✅ Allows alt-to-alt replies (doesn't filter out our accounts)
- ✅ Ensures only ONE alt starts sideways per comment (database + checks)
- ✅ Keeps it lowkey (caps and scoring)
- ✅ **Monitor-based detection** - Reuses existing monitor infrastructure
- ✅ **Decoupled architecture** - Detection (monitor) separate from action (reply services)
- ✅ **Testing delays** - Fast for development (5-60s, 10-90s, 10s)
- ✅ Reuses existing infrastructure (minimal changes)
- ✅ Provides clear examples for implementation
- ✅ Maintains backward compatibility (existing code still works)
- ✅ **Command structure:** `respond`, `monitor`, `sideways`, `inbound`, `engage`
- ✅ **Execution order:** `respond` → `monitor` → `sideways` → `monitor` (again) → `inbound`

## Implementation Notes

### Critical Fixes Applied:
1. **`isGarbage()` Export:** Created `mvp/src/utils/contentFilter.ts` to export shared function
2. **Reply URL Extraction:** Enhanced to extract from DOM with fallback to page URL
3. **Alt Selection Safety:** Added guard to prevent empty array access
4. **Error Handling:** Improved Supabase error code handling for edge cases
5. **Retry Logic:** Added retry wrapper to `fetchTweetReplies()` for reliability
6. **Function Exports:** Exported `scoreComment()`, `pickAltForSideways()`, `isSpamOrToxic()` from `sidewaysReplyService.ts` for monitor use
7. **Shared Helpers:** Created `utils/altHelpers.ts` to avoid duplicating `getCookiePath()` and `getAccountCfgForAlt()`
8. **Import Path Fix:** Fixed ResponseAgent import from `../utils/replyPoster` to `../publish/playwright`
9. **Removed Duplicate Detection:** Removed `detectInboundFromSidewaysReplies()` from inbound service - monitor handles all detection
10. **Monitor Imports:** Added proper imports to monitor for `getAccountCfgForAlt`, `fetchTweetReplies`, and scoring functions
11. **Parent Tweet URL:** Added `parent_tweet_url` column to store full URL (fixes incorrect URL construction)
12. **Race Condition Fix:** Use atomic UPDATE with RETURNING to prevent race conditions (no window between SELECT and UPDATE)
13. **Retry Logic:** Added `retry_count` and `last_error` columns, max retries from shared config
14. **Stuck Recovery:** Added `recoverStuckOpportunities()` function to reset stuck opportunities manually
15. **Constants Consolidation:** Created `replyConfig.ts` - single source of truth for all constants
16. **Alerting Placeholders:** Added TODO comments for alerting on failures and account issues (to be implemented)
17. **Manual Monitor:** Documented that monitor runs manually for now (no automated scheduling)
18. **File Path Fix:** Corrected monitor file path from `monitoring/pelpa333Monitor.ts` to `services/pelpa333Monitor.ts`
19. **Monitor Function Calls:** Added explicit calls to detection functions inside `monitorPelpa333()` method
20. **Error Handling:** Added try-catch blocks around detection functions to prevent crashes
21. **Migration Script:** Added step to create migration SQL file before database setup
22. **Testing Updates:** Added tests for Supabase UPDATE syntax, URL extraction, and error handling
23. **Cookie Path Standardization:** Documented use of `getCookiePath()` helper to standardize paths

### Known Limitations (Acceptable for MVP):
- Browser instances created per reply (slower but simpler) - **Matches existing `publish/playwright.ts` pattern** - **Actually good for keeping lowkey**
- No transaction safety for caps (race conditions possible but unlikely) - **Mitigated by atomic UPDATE with RETURNING** - **TODO: Investigate transaction safety**
- Nested reply detection assumes simple structure (may need enhancement later)
- Monitor runs manually for now (no automated scheduling) - **TODO: Will set up loops at set time points after initial testing**
- Performance monitoring deferred to later phase - **TODO: High priority**
- Alerting system needs to be implemented (TODO: add alerting for failures and account issues) - **Will implement but not now**
- **Stuck opportunities:** If process crashes after atomic UPDATE, use `swarm recover` command to reset them
- **Supabase UPDATE syntax:** **CRITICAL:** Must verify UPDATE with RETURNING works - if not, use alternative pattern (SELECT then UPDATE)
- **URL extraction:** May need enhancement for edge cases (different X.com URL formats) - **TODO: Keep for later**
- **Character files:** Assumes character files have `style.chat` array (optional chaining makes this safe)
- **Cookie expiration:** No retry on cookie/auth errors - logs and moves to next account (prevents infinite retry loops)
- **Scraper reliability:** No fallback selectors yet - **TODO: Keep for later**
- **Rate limiting:** X.com rate limits enforced via `REPLY_CONFIG.rateLimits` to keep process natural
- **Tweet age filtering:** Implemented (48 hours max) - skips old tweets
- **Character consistency:** Strict adherence to character profiles - never deviate from established persona

### Code Reuse Summary:
- **New Files Created:** 7 new files (altAccounts, replyConfig, tweetUtils, contentFilter, altHelpers, sidewaysReplyService, inboundReplyService)
- **Existing Files Extended:** 2 files (`publish/playwright.ts`, `ingest/playwrightScraper.ts`)
- **Existing Files Modified:** 4 files (`generation.ts`, `responseAgent.ts`, `cli.ts`, `services/pelpa333Monitor.ts`)
- **Reuse Rate:** ~85% of functionality reuses existing code patterns (infrastructure, scraping, posting, generation, CLI)
- **New Code:** Only ~15% is truly new (business logic for sideways/inbound workflows, scoring, alt selection)
- **Shared Utilities:** 
  - Helper functions (`getCookiePath`, `getAccountCfgForAlt`) centralized in `utils/altHelpers.ts`
  - Configuration constants centralized in `config/replyConfig.ts` (single source of truth)

### What We're Reusing (Not Reinventing):

#### Infrastructure & Low-Level Functions:
1. ✅ **`publish/playwright.ts` `replyTo()`** - Extend existing function instead of creating `replyPoster.ts`
   - Reuses cookie loading, browser initialization, Playwright patterns
   - Enhances to return URL and improve posting reliability (incorporates ResponseAgent's better selectors/events)
   - **Why not ResponseAgent.commentOnPost()?** ResponseAgent uses persistent browser/page (initialized once), while `replyTo()` creates new browser per call (simpler, more isolated, matches existing pattern)

2. ✅ **`ingest/playwrightScraper.ts`** - Add `fetchTweetReplies()` to existing file
   - Reuses `loadCookies()` function
   - Reuses browser initialization pattern
   - Reuses scrolling and extraction patterns from `fetchUserTimeline()`
   - Reuses `AccountCfg` type
   
3. ✅ **Cookie Loading** - Reuse from `playwrightScraper.ts` `loadCookies()`
   - No need to duplicate cookie normalization logic
   
4. ✅ **Browser Patterns** - Reuse from existing files
   - Browser context creation (locale, timezone)
   - Browser launch options (headless, proxy)
   - Page navigation and waiting patterns
   
5. ✅ **Tweet Extraction** - Reuse patterns from `fetchUserTimeline()`
   - Selector patterns (`[data-testid="tweet"]`)
   - Text extraction (`[data-testid="tweetText"]`)
   - ID extraction from time links
   - User handle extraction
   
6. ✅ **Supabase Client** - Reuse initialization pattern
   - Same pattern as `ResponseAgent` and `pelpa333Monitor`
   
7. ✅ **Character System** - Reuse existing
   - `loadCharacter()` function
   - Character file format
   - Generation patterns (`generateReplyForAlt()` extended, not replaced)

#### Existing Workflows (What We're NOT Duplicating):
8. ✅ **Monitor Detection** - Extend existing `pelpa333Monitor.ts` instead of creating new monitor
   - Adds detection functions to existing monitor class
   - Reuses existing browser/page initialization
   - Reuses existing Supabase patterns

9. ✅ **Generation System** - Extend existing `generation.ts` instead of creating new generator
   - Adds `generatePersonaReply()` function (new mode support)
   - Updates `generateReplyForAlt()` to call new function (backward compatible)
   - Reuses existing character loading and LLM patterns

10. ✅ **CLI Structure** - Extend existing `cli.ts` instead of creating new CLI
    - Adds new subcommands to existing `swarm` command structure
    - Reuses existing command parsing and error handling

### What's New (Can't Reuse - Different Business Logic):

1. **New Services** (`sidewaysReplyService.ts`, `inboundReplyService.ts`)
   - **Why new?** Different workflow than ResponseAgent:
     - ResponseAgent: Amplify mode (reply to Pelpa tweets from queue)
     - Sideways: Reply to comments within Pelpa threads
     - Inbound: Reply to mentions/replies to our alts
   - **Could we extend ResponseAgent?** No - different data sources, different logic, different caps/limits

2. **Database Tables** - New tables for tracking sideways/inbound opportunities
   - **Why new?** Different data model than `response_queue`:
     - `response_queue`: Pelpa tweets to amplify
     - `sideways_opportunities`: Comments to reply to
     - `inbound_alt_replies`: Mentions/replies to our alts

3. **Scoring Logic** - New scoring functions for comment quality
   - **Why new?** Different criteria than amplify mode:
     - Amplify: Always reply (quality checked by LLM)
     - Sideways/Inbound: Score comments first, only reply if high quality

4. **Alt Selection** - New logic for picking which alt replies
   - **Why new?** Different selection criteria:
     - Amplify: Uses `response_queue.recommended_alt_handle` (from monitor)
     - Sideways: Picks alt based on comment content/persona match
     - Inbound: Uses alt that received the mention

5. **Constants & Helpers** - New alt account list and helpers
   - **Why new?** Centralized config (good practice) - could potentially reuse from existing config files

### Opportunities to Reuse More (Future Improvements):

1. **ResponseAgent's `commentOnPost()` Logic** - Currently duplicating some logic in enhanced `replyTo()`
   - **Option:** Extract shared reply posting logic to utility function
   - **Trade-off:** Adds abstraction layer, but reduces duplication
   - **Current:** Enhancing `replyTo()` with ResponseAgent's better patterns (acceptable)

2. **Existing Config Files** - Alt accounts might already be defined elsewhere
   - **Check:** Review `mvp/config/accounts.yaml` or similar files
   - **Current:** Creating new `altAccounts.ts` for clarity (acceptable if no existing source)

3. **Monitor's Scraping Patterns** - Could potentially reuse more from `pelpa333Monitor.ts`
   - **Current:** Reusing `fetchTweetReplies()` which uses same patterns (good)

**Result:** ~85% code reuse - we're extending existing files and patterns rather than creating duplicates. New code is only for new business logic that can't be reused.

---

## Testing vs Production Delays

### Current (Testing):
- **Sideways:** 5-60 seconds between replies
- **Inbound:** 10-90 seconds between replies  
- **Between tweets:** 10 seconds

**Rationale:** Fast for development and testing. Allows quick iteration.

### Production Recommendations:
For production, increase delays to human-like values:
- **Sideways:** 5-30 minutes (reading + thinking time)
- **Inbound:** 10-60 minutes (faster response but still human-like)
- **Between tweets:** 30 minutes - 2 hours (prevents burst patterns)
- **Tweet age:** Skip tweets older than 48 hours (already implemented in detection)
- **Rate limits:** Enforce X.com rate limits from `REPLY_CONFIG.rateLimits` to keep process natural

**Note:** Update delay constants in `sidewaysReplyService.ts` and `inboundReplyService.ts` when moving to production.

---

## Future Enhancements (Post-MVP)

### High Priority:
1. **Performance Monitoring:** Add metrics/dashboard for:
   - Opportunities flagged vs processed
   - Processing times
   - Failure rates
   - Queue depth
   - Alt performance metrics
   - **Status:** TODO - High priority

2. **Automated Scheduling:** Set up cron/scheduler for monitor runs
   - **Status:** TODO - Will implement after initial testing
   - **Note:** For now, will run steps automatically in sequence, then set up loops at set time points

### Medium Priority:
3. **Alerting System:** Implement alerts for:
   - Failed replies (after max retries)
   - Account issues (suspended, expired cookies)
   - Processing errors
   - **Status:** TODO - Will implement but not now

4. **Account Health Checks:** Validate cookies and account status before processing
   - **Status:** TODO - Keep in TODO list

5. **Cleanup Jobs:** Remove stale opportunities older than X days
   - **Status:** TODO - Keep in TODO list

6. **Scraper Fallbacks:** Add fallback selectors and error handling for X.com DOM changes
   - **Status:** TODO - Keep for later

7. **URL Extraction Edge Cases:** Handle different X.com URL formats (twitter.com, mobile URLs, etc.)
   - **Status:** TODO - Keep for later

8. **Browser Instance Reuse:** Optimize browser creation (currently creates new browser per reply - good for keeping lowkey, but can optimize after testing)
   - **Status:** TODO - Will address after testing
   - **Note:** Current approach (new browser per reply) is actually good for keeping lowkey

9. **Transaction Safety for Caps:** Add database-level constraints or transactions for cap enforcement
   - **Status:** TODO - Not sure yet, needs investigation

10. **Expand Inbound Detection:** Detect replies to amplify replies (from `respond` command), not just sideways replies
    - **Status:** TODO - Future enhancement

11. **Testing Delays Configuration:** Add environment variable to toggle between testing and production delays
    - **Status:** TODO - Will do later

---


