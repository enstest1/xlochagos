/**
 * Playwright-based Account Monitor
 * Integrates with existing monitoring logic but uses Playwright for posting/liking
 */

import { Account, AgentPersonality, PersonalitiesConfig } from '../types';
import { log } from '../log';
import Database from 'better-sqlite3';
import { aiMemoryService, AgentMemory, ContentPerformance } from '../services/aiMemoryService';
import { postTweet, replyTo, like } from '../publish/playwright';
import { twTimeline } from '../ingest/twscrape';
import { fetchUserTimeline as fetchUserTimelineCookies } from '../ingest/cookieScraper';
import { fetchUserTimeline } from '../ingest/playwrightScraper';
import { AccountCfg } from '../config/accountsNew';

interface MonitoringConfig {
  enabled: boolean;
  target_account: string;
  trigger_mentions?: string[];
  actions: {
    comment: boolean;
    like: boolean;
    repost: boolean;
  };
  comment_templates: string[];
  response_delay_minutes: number[];
  max_comments_per_day: number;
  min_time_between_responses: number;
}

interface PostToMonitor {
  id: string;
  text: string;
  author: string;
  timestamp: number;
  url: string;
}

export class PlaywrightAccountMonitor {
  private db: Database.Database;
  private monitoringConfig: MonitoringConfig;
  private personalities: PersonalitiesConfig;
  private lastChecked: number = 0;
  private seenPosts: Set<string> = new Set();
  private playwrightAccount: AccountCfg | null = null;

  constructor(
    db: Database.Database, 
    monitoringConfig: MonitoringConfig, 
    personalities: PersonalitiesConfig = {},
    playwrightAccount: AccountCfg | null = null
  ) {
    this.db = db;
    this.monitoringConfig = monitoringConfig;
    this.personalities = personalities;
    this.playwrightAccount = playwrightAccount;
    this.initializeTables();
  }

  private initializeTables() {
    // Table to track posts we've already responded to
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS monitored_posts (
        post_id TEXT PRIMARY KEY,
        target_account TEXT NOT NULL,
        post_text TEXT,
        post_url TEXT,
        post_timestamp INTEGER,
        responded_at INTEGER,
        responses_count INTEGER DEFAULT 0
      )
    `);

    // Table to track our responses
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bot_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id TEXT NOT NULL,
        bot_account TEXT NOT NULL,
        response_type TEXT NOT NULL, -- 'comment', 'like', 'repost'
        response_content TEXT,
        response_timestamp INTEGER,
        success BOOLEAN DEFAULT false,
        FOREIGN KEY (post_id) REFERENCES monitored_posts(post_id)
      )
    `);
  }

  async monitorAndRespond(dryRun: boolean = true): Promise<void> {
    if (!this.monitoringConfig.enabled) {
      log.info('Account monitoring is disabled');
      return;
    }

    if (!this.playwrightAccount) {
      log.error('No Playwright account configured for monitoring');
      return;
    }

    log.info({ 
      target: this.monitoringConfig.target_account,
      account: this.playwrightAccount.handle,
      dryRun 
    }, 'Starting Playwright account monitoring');

    try {
      // Get recent posts from target account using twscrape
      const newPosts = await this.getRecentPosts();
      
      if (newPosts.length === 0) {
        log.info('No new posts found');
        return;
      }

      log.info({ 
        newPostsCount: newPosts.length,
        target: this.monitoringConfig.target_account 
      }, 'Found new posts to monitor');

      // HUMAN BEHAVIOR: Process posts until we find the first unprocessed one, then stop
      for (const post of newPosts) {
        const wasProcessed = await this.processPost(post, dryRun);
        if (wasProcessed) {
          log.info({ postId: post.id }, 'HUMAN BEHAVIOR: Processed one post, stopping to avoid bot detection');
          break; // Only process one post per run to maintain human-like activity
        }
      }

      this.lastChecked = Date.now();
      
    } catch (error) {
      log.error({ 
        error: (error as Error).message,
        target: this.monitoringConfig.target_account 
      }, 'Error in account monitoring');
    }
  }

  private async getRecentPosts(): Promise<PostToMonitor[]> {
    try {
      // Extract username from target account (remove @ if present)
      const targetUsername = this.monitoringConfig.target_account.replace('@', '');
      
      log.info({ targetUsername }, 'Fetching recent posts using twscrape');
      
      // Use Playwright to scrape REAL posts from target account  
      const tweets = await fetchUserTimeline(
        targetUsername,
        this.playwrightAccount!,
        20
      );
      
      if (tweets.length === 0) {
        log.info({ targetUsername }, 'No posts found from target account');
        return [];
      }

      // Convert Tweet to PostToMonitor format
      const posts: PostToMonitor[] = tweets.map(tweet => ({
        id: tweet.id,
        text: tweet.text,
        author: tweet.author,
        timestamp: new Date(tweet.date).getTime(),
        url: tweet.url
      }));

      // Filter out posts we've already processed
      const newPosts = posts.filter(post => !this.seenPosts.has(post.id));
      
      log.info({ 
        targetUsername,
        totalPosts: posts.length,
        newPosts: newPosts.length,
        alreadyProcessed: posts.length - newPosts.length
      }, 'Filtered posts for processing');
      
      // Filter posts based on trigger mentions
      if (this.monitoringConfig.trigger_mentions && this.monitoringConfig.trigger_mentions.length > 0) {
        const filteredPosts = newPosts.filter(post => 
          this.monitoringConfig.trigger_mentions!.some(mention => 
            post.text.toLowerCase().includes(mention.toLowerCase())
          )
        );
        
        log.info({ 
          targetUsername,
          triggerMentions: this.monitoringConfig.trigger_mentions,
          qualifyingPosts: filteredPosts.length
        }, 'Posts filtered by trigger mentions');
        
        // HUMAN BEHAVIOR: Return ALL qualifying posts (any trigger mention), sorted by recency
        if (filteredPosts.length > 0) {
          // Sort by timestamp descending (most recent first)
          filteredPosts.sort((a, b) => b.timestamp - a.timestamp);

          log.info({ 
            totalQualifyingPosts: filteredPosts.length,
          }, 'HUMAN BEHAVIOR: Found qualifying posts with any trigger mention, sorted by recency.');
          
          return filteredPosts;
        }
        
        return [];
      }
      
      return newPosts;
    } catch (error) {
      log.error({ 
        targetAccount: this.monitoringConfig.target_account,
        error: (error as Error).message 
      }, 'Failed to fetch recent posts');
      return [];
    }
  }

  private async processPost(post: PostToMonitor, dryRun: boolean): Promise<boolean> {
    // Check if we've already FULLY responded to this post (both like AND comment)
    const accountHandle = this.playwrightAccount!.handle;
    
    const responses = this.db.prepare(`
      SELECT response_type, COUNT(*) as count FROM bot_responses 
      WHERE post_id = ? AND bot_account = ? GROUP BY response_type
    `).all(post.id, accountHandle) as any[];

    const hasLike = responses.some(r => r.response_type === 'like' && r.count > 0);
    const hasComment = responses.some(r => r.response_type === 'comment' && r.count > 0);

    // If we have both like and comment, skip this post
    if (hasLike && hasComment) {
      log.info({ postId: post.id, hasLike, hasComment, account: accountHandle }, 'Post already fully processed by this account (both like and comment), skipping');
      return false;
    }

    // If we have partial responses, log what we're missing
    if (hasLike || hasComment) {
      log.info({ postId: post.id, hasLike, hasComment, account: accountHandle }, 'Post partially processed by this account, will complete missing actions');
    }

    // Store the post in our database
    this.db.prepare(`
      INSERT OR REPLACE INTO monitored_posts 
      (post_id, target_account, post_text, post_url, post_timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(post.id, post.author, post.text, post.url, post.timestamp);

    this.seenPosts.add(post.id);

    log.info({ 
      postId: post.id,
      postText: post.text.substring(0, 100) + '...',
      dryRun 
    }, 'Processing new post with Playwright');

    // Schedule response with human-like delay
    await this.scheduleResponse(post, Date.now(), dryRun);
    
    // Return true to indicate we processed a post
    return true;
  }

  private async scheduleResponse(post: PostToMonitor, scheduledTime: number, dryRun: boolean): Promise<void> {
    try {
      // Check daily limits
      const dailyResponses = this.getDailyResponseCount(this.playwrightAccount!.handle);
      if (dailyResponses >= this.monitoringConfig.max_comments_per_day) {
        log.info({ 
          account: this.playwrightAccount!.handle,
          dailyCount: dailyResponses 
        }, 'Daily response limit reached');
        return;
      }

      // Find which mention triggered this response
      const triggeredMention = this.monitoringConfig.trigger_mentions?.find(mention => 
        post.text.toLowerCase().includes(mention.toLowerCase())
      );

      // Generate comment using personality-specific templates
      const personality = this.personalities[this.playwrightAccount!.handle];
      const commentTemplates = personality?.comment_templates || this.monitoringConfig.comment_templates;
      
      // Log which personality is being used
      if (personality) {
        log.info({ 
          account: this.playwrightAccount!.handle,
          personalityType: personality.bio[0]?.substring(0, 50) + '...',
          templateCount: commentTemplates.length
        }, 'Using personality-specific comment templates');
      } else {
        log.info({ 
          account: this.playwrightAccount!.handle,
          templateCount: commentTemplates.length
        }, 'Using default comment templates (no personality found)');
      }
      
      const commentTemplate = commentTemplates[
        Math.floor(Math.random() * commentTemplates.length)
      ] || "Great insight! 💡";
      
      const finalComment = triggeredMention 
        ? commentTemplate.replace('{mention}', triggeredMention)
        : commentTemplate;

      log.info({ 
        account: this.playwrightAccount!.handle,
        postId: post.id,
        triggeredMention,
        comment: finalComment,
        dryRun 
      }, 'Responding to post with Playwright');

      // HUMAN BEHAVIOR: Add realistic delay before any action (15-45 seconds)
      const humanDelay = Math.floor(Math.random() * 30000) + 15000; // 15-45 seconds
      log.info({ 
        account: this.playwrightAccount!.handle,
        delayMs: humanDelay,
        delaySeconds: Math.round(humanDelay / 1000)
      }, 'HUMAN BEHAVIOR: Waiting realistic delay before action');
      
      await new Promise(resolve => setTimeout(resolve, humanDelay));

      // Check if we've already liked this post
      const existingLike = this.db.prepare(`
        SELECT * FROM bot_responses WHERE post_id = ? AND bot_account = ? AND response_type = 'like'
      `).get(post.id, this.playwrightAccount!.handle) as any;

      // HUMAN BEHAVIOR: Like the post (1 like + 1 comment per post is natural)
      if (this.monitoringConfig.actions.like && !existingLike) {
        if (dryRun) {
          log.info({ 
            account: this.playwrightAccount!.handle,
            postId: post.id,
            action: 'like',
            dryRun: true
          }, 'DRY RUN: Would like post');
          
          this.recordResponse(post.id, this.playwrightAccount!.handle, 'like', '', Date.now(), true);
        } else {
          log.info({ 
            account: this.playwrightAccount!.handle,
            postId: post.id,
            action: 'like',
            dryRun: false
          }, 'Liking post via Playwright');
          
          try {
            await like(this.playwrightAccount!, post.url, false);
            
            log.info({ 
              account: this.playwrightAccount!.handle,
              postId: post.id,
              action: 'like'
            }, 'Successfully liked post');
            
            this.recordResponse(post.id, this.playwrightAccount!.handle, 'like', '', Date.now(), true);
            
            // Store AI memory for successful like
            await aiMemoryService.storeMemory({
              account: this.playwrightAccount!.handle,
              type: 'engagement',
              data: {
                action: 'like',
                post_id: post.id,
                post_author: post.author,
                triggered_mention: triggeredMention,
                post_text: post.text.substring(0, 100) + '...',
                success: true,
                timestamp: new Date().toISOString()
              },
              relevance_score: 0.7,
              tags: ['like', 'engagement', triggeredMention || 'general']
            });
          } catch (error) {
            log.error({ 
              account: this.playwrightAccount!.handle,
              postId: post.id,
              action: 'like',
              error: (error as Error).message
            }, 'Failed to like post');
            
            this.recordResponse(post.id, this.playwrightAccount!.handle, 'like', '', Date.now(), false);
          }
        }
      }

      // Check if we've already commented on this post
      const existingComment = this.db.prepare(`
        SELECT * FROM bot_responses WHERE post_id = ? AND bot_account = ? AND response_type = 'comment'
      `).get(post.id, this.playwrightAccount!.handle) as any;

      // Comment on the post using Playwright
      if (this.monitoringConfig.actions.comment && !existingComment) {
        if (dryRun) {
          log.info({ 
            account: this.playwrightAccount!.handle,
            postId: post.id,
            action: 'comment',
            comment: finalComment,
            dryRun: true
          }, 'DRY RUN: Would comment on post');
          
          this.recordResponse(post.id, this.playwrightAccount!.handle, 'comment', finalComment || '', Date.now(), true);
        } else {
          log.info({ 
            account: this.playwrightAccount!.handle,
            postId: post.id,
            action: 'comment',
            comment: finalComment,
            dryRun: false
          }, 'Commenting on post via Playwright');
          
          try {
            await replyTo(this.playwrightAccount!, post.url, finalComment || '', false);
            
            log.info({ 
              account: this.playwrightAccount!.handle,
              postId: post.id,
              action: 'comment',
              comment: finalComment
            }, 'Successfully commented on post');
            
            this.recordResponse(post.id, this.playwrightAccount!.handle, 'comment', finalComment || '', Date.now(), true);
            
            // Store AI memory for successful comment
            await aiMemoryService.storeMemory({
              account: this.playwrightAccount!.handle,
              type: 'engagement',
              data: {
                action: 'comment',
                post_id: post.id,
                post_author: post.author,
                triggered_mention: triggeredMention,
                post_text: post.text.substring(0, 100) + '...',
                comment_text: finalComment,
                success: true,
                timestamp: new Date().toISOString()
              },
              relevance_score: 0.8, // Comments are more valuable than likes
              tags: ['comment', 'engagement', triggeredMention || 'general']
            });
          } catch (error) {
            log.error({ 
              account: this.playwrightAccount!.handle,
              postId: post.id,
              action: 'comment',
              error: (error as Error).message
            }, 'Failed to comment on post');
            
            this.recordResponse(post.id, this.playwrightAccount!.handle, 'comment', finalComment || '', Date.now(), false);
          }
        }
      }

      // Update response count for the post
      this.db.prepare(`
        UPDATE monitored_posts 
        SET responses_count = responses_count + 1 
        WHERE post_id = ?
      `).run(post.id);

    } catch (error) {
      log.error({ 
        account: this.playwrightAccount!.handle,
        postId: post.id,
        error: (error as Error).message 
      }, 'Error responding to post');
    }
  }

  private getDailyResponseCount(accountHandle: string): number {
    const today = new Date().toISOString().split('T')[0];
    
    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM bot_responses 
      WHERE bot_account = ? 
      AND DATE(response_timestamp, 'unixepoch') = ?
    `).get(accountHandle, today) as any;

    return result?.count || 0;
  }

  private recordResponse(postId: string, accountHandle: string, responseType: string, content: string, timestamp: number, success: boolean): void {
    this.db.prepare(`
      INSERT INTO bot_responses 
      (post_id, bot_account, response_type, response_content, response_timestamp, success)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(postId, accountHandle, responseType, content, timestamp, success ? 1 : 0);
  }

  // Get monitoring statistics
  getMonitoringStats(): any {
    const totalPosts = this.db.prepare(`
      SELECT COUNT(*) as count FROM monitored_posts
    `).get() as any;

    const totalResponses = this.db.prepare(`
      SELECT COUNT(*) as count FROM bot_responses
    `).get() as any;

    const responsesByType = this.db.prepare(`
      SELECT response_type, COUNT(*) as count 
      FROM bot_responses 
      GROUP BY response_type
    `).all();

    return {
      totalPostsMonitored: totalPosts.count,
      totalResponses: totalResponses.count,
      responsesByType,
      lastChecked: new Date(this.lastChecked).toISOString()
    };
  }
}
