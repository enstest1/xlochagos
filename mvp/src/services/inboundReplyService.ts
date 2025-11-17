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

