import { chromium, Browser, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface PelpaPost {
  id: string;
  text: string;
  url: string;
  timestamp: Date;
  mentions: string[];
  hasTargetMentions: boolean;
  targetMentions: string[];
}

export class Pelpa333Monitor {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private readonly targetAccounts = ['@kloutgg', '@wallchain', '@bankrbot'];
  private readonly pelpa333Handle = '@pelpa333';

  async initialize(): Promise<void> {
    try {
      this.browser = await chromium.launch({ 
        headless: false, // Use visible browser like responseAgent for better success rate
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      this.page = await this.browser.newPage();
      
      // Load saved cookies for authentication
      const fs = require('fs');
      const path = require('path');
      const cookiesPath = path.join(__dirname, '../../secrets/FIZZonAbstract.cookies.json');
      try {
        if (fs.existsSync(cookiesPath)) {
          const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
          // Fix cookie format for Playwright compatibility
          const validCookies = cookies.map((cookie: any) => ({
            ...cookie,
            sameSite: cookie.sameSite === 'no_restriction' ? 'None' : 
                     cookie.sameSite === 'lax' ? 'Lax' : 
                     cookie.sameSite === 'strict' ? 'Strict' : 'Lax'
          }));
          await this.page.context().addCookies(validCookies);
          console.log('✅ Loaded authentication cookies');
        } else {
          console.log('⚠️ Cookie file not found at:', cookiesPath);
        }
      } catch (cookieError) {
        console.log('⚠️ Failed to load cookies:', cookieError instanceof Error ? cookieError.message : String(cookieError));
      }
      
      // Set realistic browser headers
      await this.page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      
      console.log('✅ Pelpa333 Monitor initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Pelpa333 Monitor:', error);
      throw error;
    }
  }

  async scrapePelpa333Timeline(limit: number = 20): Promise<PelpaPost[]> {
    if (!this.page) {
      throw new Error('Monitor not initialized. Call initialize() first.');
    }

    try {
      console.log(`🔍 Scraping @pelpa333 timeline (last ${limit} posts)...`);
      
      await this.page.goto(`https://x.com/${this.pelpa333Handle.replace('@', '')}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      // Wait for timeline to load
      console.log('⏳ Waiting for timeline to load (5 seconds)...');
      await this.page.waitForSelector('[data-testid="tweet"]', { timeout: 15000 });
      await this.page.waitForTimeout(5000); // Give it even more time to fully load

      // Scroll EXTRA slowly multiple times to load more posts
      console.log('📜 Scrolling EXTRA slowly to load posts (10 scrolls)...');
      for (let i = 0; i < 10; i++) {
        await this.page.evaluate(() => {
          window.scrollBy(0, 300); // Scroll even slower, 300px at a time
        });
        await this.page.waitForTimeout(3000); // Wait 3 seconds between scrolls (very patient)
        console.log(`📜 Scroll ${i + 1}/10 complete`);
      }
      
      // Wait a final moment for content to settle
      console.log('⏳ Waiting for content to settle (5 seconds)...');
      await this.page.waitForTimeout(5000);

      // Extract posts - get MORE than the limit to ensure we catch all recent posts
      const posts = await this.page.evaluate((postLimit) => {
        const tweetElements = document.querySelectorAll('[data-testid="tweet"]');
        console.log('📊 Total tweets found in DOM:', tweetElements.length);
        const posts: PelpaPost[] = [];

        // Get MORE posts than requested to filter properly
        for (let i = 0; i < Math.min(tweetElements.length, postLimit * 2); i++) {
          const tweet = tweetElements[i];
          
          if (!tweet) continue;
          
          try {
            // Extract post text
            const textElement = tweet.querySelector('[data-testid="tweetText"]');
            const text = textElement?.textContent?.trim() || '';

            // Extract post URL
            const linkElement = tweet.querySelector('a[href*="/status/"]');
            const relativeUrl = linkElement?.getAttribute('href') || '';
            const url = relativeUrl ? `https://x.com${relativeUrl}` : '';

            // Extract timestamp
            const timeElement = tweet.querySelector('time');
            const timestamp = timeElement?.getAttribute('datetime') || new Date().toISOString();

            // Extract post ID from URL
            const postId = relativeUrl.split('/status/')[1]?.split('?')[0] || `post_${Date.now()}_${i}`;

            if (text && url) {
              posts.push({
                id: postId,
                text,
                url,
                timestamp: new Date(timestamp),
                mentions: [],
                hasTargetMentions: false,
                targetMentions: []
              });
            }
          } catch (error) {
            console.warn('Error extracting post data:', error);
          }
        }

        // TEMPORARY: Return all posts without 24h filter to debug
        // TODO: Re-enable filter once we confirm scraping works
        console.log('📅 All posts timestamped:', posts.map(p => ({ id: p.id, time: p.timestamp.toISOString() })));
        
        // Sort by most recent and return the requested amount
        return posts
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
          .slice(0, postLimit);
      }, limit);

      console.log(`📋 Raw scraped: ${posts.length} posts`);
      
      // Process mentions for each post
      const processedPosts = posts.map(post => this.processMentions(post));

      console.log(`✅ Scraped ${processedPosts.length} posts from @pelpa333`);
      
      // Log posts with target mentions
      const postsWithTargetMentions = processedPosts.filter(p => p.hasTargetMentions);
      if (postsWithTargetMentions.length > 0) {
        console.log(`🎯 Found ${postsWithTargetMentions.length} posts with target mentions:`, 
          postsWithTargetMentions.map(p => `${p.targetMentions.join(', ')} in post ${p.id}`));
      }

      return processedPosts;

    } catch (error) {
      console.error('❌ Error scraping @pelpa333 timeline:', error);
      throw error;
    }
  }

  private processMentions(post: PelpaPost): PelpaPost {
    // Extract all mentions from post text
    const mentionRegex = /@\w+/g;
    const mentions = post.text.match(mentionRegex) || [];
    
    // Check for target account mentions
    const targetMentions = mentions.filter(mention => 
      this.targetAccounts.includes(mention.toLowerCase())
    );

    return {
      ...post,
      mentions,
      hasTargetMentions: targetMentions.length > 0,
      targetMentions
    };
  }

  async storePelpa333Intelligence(posts: PelpaPost[]): Promise<void> {
    try {
      if (posts.length === 0) {
        console.log('ℹ️ No @pelpa333 posts to store');
        return;
      }

      const postUrls = posts.map(post => post.url);
      let existingUrls = new Set<string>();

      if (postUrls.length > 0) {
        const { data: existingRows, error: existingError } = await supabase
          .from('raw_intelligence')
          .select('source_url')
          .in('source_url', postUrls);

        if (existingError) {
          console.error('❌ Error checking existing @pelpa333 posts:', existingError);
        } else if (existingRows) {
          existingUrls = new Set(existingRows.map(row => row.source_url).filter((url): url is string => !!url));
        }
      }

      const newPosts = posts.filter(post => !existingUrls.has(post.url));

      if (newPosts.length === 0) {
        console.log(`ℹ️ All ${posts.length} scraped @pelpa333 posts already exist in raw_intelligence. Skipping insert.`);
        return;
      }

      const intelligenceData = newPosts.map(post => ({
        source_type: 'twitter_scrape',
        source_account: '@pelpa333',
        source_url: post.url,
        title: `@pelpa333 Post: ${post.text.substring(0, 100)}...`,
        raw_content: post.text,
        summary: post.hasTargetMentions ? `Post mentions target accounts: ${post.targetMentions.join(', ')}` : 'Regular post from @pelpa333',
        metadata: {
          post_id: post.id,
          mentions: post.mentions,
          target_mentions: post.targetMentions,
          has_target_mentions: post.hasTargetMentions,
          post_timestamp: post.timestamp.toISOString()
        },
        processed_by_researcher: false,
        processed_by_writer: false,
        extracted_at: new Date().toISOString()
      }));

      const { error } = await supabase
        .from('raw_intelligence')
        .insert(intelligenceData);

      if (error) {
        throw error;
      }

      const skippedCount = posts.length - newPosts.length;
      if (skippedCount > 0) {
        console.log(`ℹ️ Skipped ${skippedCount} duplicate @pelpa333 posts`);
      }
      console.log(`✅ Stored ${intelligenceData.length} new @pelpa333 posts in raw_intelligence`);
      
    } catch (error) {
      console.error('❌ Error storing @pelpa333 intelligence:', error);
      throw error;
    }
  }

  async monitorPelpa333(): Promise<void> {
    try {
      const posts = await this.scrapePelpa333Timeline(20);
      await this.storePelpa333Intelligence(posts);
      
      // Check for posts that need immediate response
      const urgentPosts = posts.filter(p => p.hasTargetMentions);
      if (urgentPosts.length > 0) {
        console.log(`🚨 ${urgentPosts.length} posts need immediate attention!`);
        // This will trigger the Response Agent
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

  private async triggerResponseAgent(posts: PelpaPost[]): Promise<void> {
    try {
      console.log(`🔍 Creating response tasks for ${posts.length} posts...`);
      
      // Store urgent posts for Response Agent to process
      if (posts.length === 0) {
        console.log('ℹ️ No posts provided for response tasks');
        return;
      }

      const postIds = posts.map(post => post.id);
      let existingTaskIds = new Set<string>();

      const { data: existingTasks, error: existingTasksError } = await supabase
        .from('response_queue')
        .select('post_id,status')
        .in('post_id', postIds);

      if (existingTasksError) {
        console.error('❌ Error checking existing response tasks:', existingTasksError);
      } else if (existingTasks) {
        const blockedStatuses = new Set(['pending_response', 'generating_response', 'response_ready', 'posted']);
        existingTaskIds = new Set(
          existingTasks
            .filter(task => task.post_id && blockedStatuses.has(task.status))
            .map(task => task.post_id!)
        );
      }

      const newPosts = posts.filter(post => !existingTaskIds.has(post.id));

      if (newPosts.length === 0) {
        console.log('ℹ️ All posts already have response tasks. Skipping creation.');
        return;
      }

      const responseTasks = newPosts.map(post => ({
        post_id: post.id,
        post_url: post.url,
        post_text: post.text,
        target_mentions: post.targetMentions,
        status: 'pending_response'
      }));
      
      console.log('📝 Response tasks to insert:', JSON.stringify(responseTasks, null, 2));
      
      const { data, error } = await supabase
        .from('response_queue')
        .insert(responseTasks);

      if (error) {
        console.error('❌ Error triggering Response Agent:', error);
        console.error('❌ Error details:', JSON.stringify(error, null, 2));
      } else {
        const skipped = posts.length - newPosts.length;
        if (skipped > 0) {
          console.log(`ℹ️ Skipped ${skipped} response tasks that already existed`);
        }
        console.log(`🎯 Triggered Response Agent for ${newPosts.length} posts`);
        console.log('✅ Response tasks created successfully');
      }
    } catch (error) {
      console.error('❌ Exception in triggerResponseAgent:', error);
    }
  }

  async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
    console.log('✅ Pelpa333 Monitor cleaned up');
  }
}

// Export singleton instance
export const pelpa333Monitor = new Pelpa333Monitor();
