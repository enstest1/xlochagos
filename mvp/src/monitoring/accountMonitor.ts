import { Account, AgentPersonality, PersonalitiesConfig } from '../types';
import { log } from '../log';
import { GoatXPublisher } from '../publishers/goatx';
import Database from 'better-sqlite3';
import { XApiService, XPost } from '../services/xApiService';
import { aiMemoryService, AgentMemory, ContentPerformance } from '../services/aiMemoryService';

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

export class AccountMonitor {
  private db: Database.Database;
  private monitoringConfig: MonitoringConfig;
  private personalities: PersonalitiesConfig;
  private lastChecked: number = 0;
  private seenPosts: Set<string> = new Set();
  private xApiService: XApiService;

  constructor(db: Database.Database, monitoringConfig: MonitoringConfig, personalities: PersonalitiesConfig = {}) {
    this.db = db;
    this.monitoringConfig = monitoringConfig;
    this.personalities = personalities;
    this.xApiService = new XApiService();
    this.initializeTables();
  }

  async initializeXApi(username: string, password: string): Promise<boolean> {
    try {
      log.info({ username }, 'Initializing X API service with login');
      const success = await this.xApiService.login(username, password);
      
      if (success) {
        log.info({ username }, 'X API service initialized successfully');
      } else {
        log.error({ username }, 'Failed to initialize X API service');
      }
      
      return success;
    } catch (error) {
      log.error({ 
        username, 
        error: (error as Error).message 
      }, 'Error initializing X API service');
      return false;
    }
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

  async monitorAndRespond(accounts: Account[], dryRun: boolean = true): Promise<void> {
    if (!this.monitoringConfig.enabled) {
      log.info('Account monitoring is disabled');
      return;
    }

    log.info({ 
      target: this.monitoringConfig.target_account,
      dryRun 
    }, 'Starting account monitoring');

    try {
      // Get recent posts from target account (simulated for now)
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
        const wasProcessed = await this.processPost(post, accounts, dryRun);
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
      
      log.info({ targetUsername }, 'Fetching recent posts from X API');
      
      // Fetch recent posts from the target account
      const xPosts = await this.xApiService.getRecentPosts(targetUsername, 20);
      
      if (xPosts.length === 0) {
        log.info({ targetUsername }, 'No posts found from target account');
        return [];
      }

      // Convert XPost to PostToMonitor format
      const posts: PostToMonitor[] = xPosts.map(xPost => ({
        id: xPost.id,
        text: xPost.text,
        author: xPost.author,
        timestamp: xPost.timestamp,
        url: xPost.url
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
      }, 'Failed to fetch recent posts from X API');
      return [];
    }
  }

  private async processPost(post: PostToMonitor, accounts: Account[], dryRun: boolean): Promise<boolean> {
    // Check if we've already FULLY responded to this post (both like AND comment)
    const existing = this.db.prepare(`
      SELECT * FROM monitored_posts WHERE post_id = ?
    `).get(post.id) as any;

    // Check if @aplep333 specifically has both like AND comment responses for this post
    const firstAccount = accounts[0]; // Get the first account (aplep333)
    const accountHandle = firstAccount ? firstAccount.handle : '';
    
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
    }, 'Processing new post');

    // Select which accounts should respond (staggered responses)
    const activeAccounts = accounts.filter(acc => acc.active);
    
    // Process with the first available account
    if (activeAccounts.length > 0) {
      const account = activeAccounts[0]; // Use first account
      
      if (account) {
        log.info({ 
          account: account.handle,
          postId: post.id
        }, 'Processing post with first available account');
        
        // Schedule response with human-like delay
        await this.scheduleResponse(post, account, Date.now(), dryRun);
        
        // Return true to indicate we processed a post
        return true;
      }
    }
    
    // If we get here, no account was available to process the post
    return false;
  }

  private async scheduleResponse(post: PostToMonitor, account: Account, scheduledTime: number, dryRun: boolean): Promise<void> {
    const publisher = new GoatXPublisher(account, { dryRun });

    try {
      // Check daily limits
      const dailyResponses = this.getDailyResponseCount(account.handle);
      if (dailyResponses >= this.monitoringConfig.max_comments_per_day) {
        log.info({ 
          account: account.handle,
          dailyCount: dailyResponses 
        }, 'Daily response limit reached');
        return;
      }

      // Find which mention triggered this response
      const triggeredMention = this.monitoringConfig.trigger_mentions?.find(mention => 
        post.text.toLowerCase().includes(mention.toLowerCase())
      );

      // Generate comment using personality-specific templates
      const personality = this.personalities[account.handle];
      const commentTemplates = personality?.comment_templates || this.monitoringConfig.comment_templates;
      
      // Log which personality is being used
      if (personality) {
        log.info({ 
          account: account.handle,
          personalityType: personality.bio[0]?.substring(0, 50) + '...',
          templateCount: commentTemplates.length
        }, 'Using personality-specific comment templates');
      } else {
        log.info({ 
          account: account.handle,
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
        account: account.handle,
        postId: post.id,
        triggeredMention,
        comment: finalComment,
        dryRun 
      }, 'Responding to post');

      // HUMAN BEHAVIOR: Add realistic delay before any action (15-45 seconds)
      const humanDelay = Math.floor(Math.random() * 30000) + 15000; // 15-45 seconds
      log.info({ 
        account: account.handle,
        delayMs: humanDelay,
        delaySeconds: Math.round(humanDelay / 1000)
      }, 'HUMAN BEHAVIOR: Waiting realistic delay before action');
      
      await new Promise(resolve => setTimeout(resolve, humanDelay));

      // Check if we've already liked this post
      const existingLike = this.db.prepare(`
        SELECT * FROM bot_responses WHERE post_id = ? AND bot_account = ? AND response_type = 'like'
      `).get(post.id, account.handle) as any;

      if (existingLike) {
        log.info({ postId: post.id, account: account.handle }, 'Already liked this post, skipping like');
      }

      // HUMAN BEHAVIOR: Like the post (1 like + 1 comment per post is natural)
      if (this.monitoringConfig.actions.like && !existingLike) {
        if (dryRun) {
          log.info({ 
            account: account.handle,
            postId: post.id,
            action: 'like',
            dryRun: true
          }, 'DRY RUN: Would like post');
          
          this.recordResponse(post.id, account.handle, 'like', '', Date.now(), true);
        } else {
          log.info({ 
            account: account.handle,
            postId: post.id,
            action: 'like',
            dryRun: false
          }, 'Liking post via X API');
          
          const likeResult = await this.xApiService.likeTweet(post.id);
          
          if (likeResult.success) {
            log.info({ 
              account: account.handle,
              postId: post.id,
              action: 'like'
            }, 'Successfully liked post');
            
            this.recordResponse(post.id, account.handle, 'like', '', Date.now(), true);
            
            // Store AI memory for successful like
            await aiMemoryService.storeMemory({
              account: account.handle,
              type: 'engagement',
              data: {
                action: 'like',
                post_id: post.id,
                post_author: post.author,
                triggered_mention: triggeredMention,
                post_text: post.text.substring(0, 100) + '...', // Store first 100 chars
                success: true,
                timestamp: new Date().toISOString()
              },
              relevance_score: 0.7,
              tags: ['like', 'engagement', triggeredMention || 'general']
            });
          } else {
            log.error({ 
              account: account.handle,
              postId: post.id,
              action: 'like',
              error: likeResult.error
            }, 'Failed to like post');
            
            this.recordResponse(post.id, account.handle, 'like', '', Date.now(), false);
          }
        }
      }

      // Check if we've already commented on this post
      const existingComment = this.db.prepare(`
        SELECT * FROM bot_responses WHERE post_id = ? AND bot_account = ? AND response_type = 'comment'
      `).get(post.id, account.handle) as any;

      if (existingComment) {
        log.info({ postId: post.id, account: account.handle }, 'Already commented on this post, skipping comment');
      }

      // Comment on the post (real API call)
      if (this.monitoringConfig.actions.comment && !existingComment) {
        if (dryRun) {
          log.info({ 
            account: account.handle,
            postId: post.id,
            action: 'comment',
            comment: finalComment,
            dryRun: true
          }, 'DRY RUN: Would comment on post');
          
          this.recordResponse(post.id, account.handle, 'comment', finalComment || '', Date.now(), true);
        } else {
          log.info({ 
            account: account.handle,
            postId: post.id,
            action: 'comment',
            comment: finalComment,
            dryRun: false
          }, 'Commenting on post via X API');
          
          const commentResult = await this.xApiService.replyToTweet(post.id, finalComment || '');
          
          if (commentResult.success) {
            log.info({ 
              account: account.handle,
              postId: post.id,
              action: 'comment',
              commentId: commentResult.id
            }, 'Successfully commented on post');
            
            this.recordResponse(post.id, account.handle, 'comment', finalComment || '', Date.now(), true);
            
            // Store AI memory for successful comment
            await aiMemoryService.storeMemory({
              account: account.handle,
              type: 'engagement',
              data: {
                action: 'comment',
                post_id: post.id,
                post_author: post.author,
                triggered_mention: triggeredMention,
                post_text: post.text.substring(0, 100) + '...',
                comment_text: finalComment,
                comment_id: commentResult.id,
                success: true,
                timestamp: new Date().toISOString()
              },
              relevance_score: 0.8, // Comments are more valuable than likes
              tags: ['comment', 'engagement', triggeredMention || 'general']
            });
          } else {
            log.error({ 
              account: account.handle,
              postId: post.id,
              action: 'comment',
              error: commentResult.error
            }, 'Failed to comment on post');
            
            this.recordResponse(post.id, account.handle, 'comment', finalComment || '', Date.now(), false);
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
        account: account.handle,
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
