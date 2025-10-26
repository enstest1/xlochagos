/**
 * Spoke Publisher
 * Pulls content from queue and posts with personality
 */

import { log } from '../log';
import { AccountCfg } from '../config/accountsNew';
import { postTweet, postTweetWithImage } from '../publish/playwright';

export class SpokePublisher {
  private account: AccountCfg;
  private personality: string;
  private dailyLimit: number;
  
  constructor(account: AccountCfg, personality: string = 'default', dailyLimit: number = 5) {
    this.account = account;
    this.personality = personality;
    this.dailyLimit = dailyLimit;
  }
  
  /**
   * Main publisher routine
   */
  async run(dryRun: boolean = false): Promise<void> {
    log.info({ 
      account: this.account.handle,
      personality: this.personality,
      dryRun
    }, '[Publisher] Starting routine');
    
    try {
      // 1. Check daily limit
      const dailyCount = await this.getDailyPostCount();
      
      if (dailyCount >= this.dailyLimit) {
        log.info({ 
          account: this.account.handle,
          dailyCount,
          limit: this.dailyLimit
        }, '[Publisher] Daily limit reached');
        return;
      }
      
      // 2. Claim content from queue
      const content = await this.claimContentFromQueue();
      
      if (!content) {
        log.info({ 
          account: this.account.handle
        }, '[Publisher] No content available in queue');
        return;
      }
      
      log.info({
        account: this.account.handle,
        contentId: content.id,
        contentType: content.content_type,
        hasImage: !!content.images
      }, '[Publisher] Claimed content from queue');
      
      // 3. Post to Twitter
      let postUrl = '';
      
      try {
        if (dryRun) {
          log.info({
            account: this.account.handle,
            text: content.content_text.substring(0, 100) + '...',
            hasImage: !!content.images
          }, '[Publisher] DRY RUN: Would post content');
        } else {
          const imagePath = content.images?.images?.[0]?.local_path;
          
          if (imagePath) {
            await postTweetWithImage(this.account, content.content_text, imagePath, false);
          } else {
            await postTweet(this.account, content.content_text, false);
          }
          
          // TODO: Get actual post URL from Twitter
          postUrl = `https://x.com/${this.account.handle.replace('@', '')}/status/PLACEHOLDER`;
        }
        
        // 4. Update queue with success
        await this.updateQueueWithResults(content.id, true, postUrl);
        
        log.info({
          account: this.account.handle,
          contentId: content.id,
          postUrl
        }, '[Publisher] Content posted successfully');
        
      } catch (error) {
        log.error({
          account: this.account.handle,
          contentId: content.id,
          error: (error as Error).message
        }, '[Publisher] Failed to post content');
        
        // Update queue with failure
        await this.updateQueueWithResults(content.id, false, '', (error as Error).message);
      }
      
    } catch (error) {
      log.error({
        account: this.account.handle,
        error: (error as Error).message
      }, '[Publisher] Critical error');
      throw error;
    }
  }
  
  /**
   * Claim content from queue (atomic operation)
   */
  private async claimContentFromQueue(): Promise<any | null> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase not configured');
    }
    
    try {
      // Get one approved content item with images ready
      const getResponse = await fetch(
        `${supabaseUrl}/rest/v1/content_queue?status=eq.approved&image_generation_status=in.(completed,not_needed)&assigned_to_account=is.null&order=quality_score.desc&limit=1`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
          },
        }
      );
      
      if (!getResponse.ok) {
        throw new Error(`HTTP ${getResponse.status}`);
      }
      
      const content = await getResponse.json() as any[];
      
      if (!content || content.length === 0) {
        return null;
      }
      
      const contentItem = content[0];
      
      // Claim it by updating
      const claimResponse = await fetch(
        `${supabaseUrl}/rest/v1/content_queue?id=eq.${contentItem.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            status: 'assigned',
            assigned_to_account: this.account.handle,
            assigned_at: new Date().toISOString()
          })
        }
      );
      
      if (!claimResponse.ok) {
        throw new Error(`Failed to claim content: ${claimResponse.status}`);
      }
      
      return contentItem;
      
    } catch (error) {
      log.error({ 
        error: (error as Error).message 
      }, '[Publisher] Failed to claim content');
      return null;
    }
  }
  
  /**
   * Update queue with posting results
   */
  private async updateQueueWithResults(
    contentId: string,
    success: boolean,
    postUrl: string,
    errorMessage?: string
  ): Promise<void> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return;
    }
    
    try {
      await fetch(`${supabaseUrl}/rest/v1/content_queue?id=eq.${contentId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          status: success ? 'posted' : 'failed',
          posted_at: success ? new Date().toISOString() : null,
          post_url: postUrl || null
        })
      });
      
      // Also log to publisher_assignments table
      await fetch(`${supabaseUrl}/rest/v1/publisher_assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          publisher_account: this.account.handle,
          content_id: contentId,
          posted_at: success ? new Date().toISOString() : null,
          post_url: postUrl || null,
          post_success: success,
          error_message: errorMessage || null
        })
      });
      
    } catch (error) {
      log.warn({ 
        error: (error as Error).message 
      }, '[Publisher] Failed to update queue');
    }
  }
  
  /**
   * Get daily post count for this account
   */
  private async getDailyPostCount(): Promise<number> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return 0;
    }
    
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const response = await fetch(
        `${supabaseUrl}/rest/v1/publisher_assignments?publisher_account=eq.${this.account.handle}&posted_at=gte.${todayStart.toISOString()}&post_success=eq.true&select=count`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            'Prefer': 'count=exact'
          },
        }
      );
      
      if (!response.ok) {
        return 0;
      }
      
        const countHeader = response.headers.get('content-range');
        if (countHeader) {
          const match = countHeader.match(/\/(\d+)$/);
          return match ? parseInt(match[1] || '0') : 0;
        }
      
      return 0;
      
    } catch (error) {
      log.warn({ error: (error as Error).message }, '[Publisher] Failed to get daily count');
      return 0;
    }
  }
}

