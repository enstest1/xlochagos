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


