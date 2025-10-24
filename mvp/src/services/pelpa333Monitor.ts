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
  private readonly targetAccounts = ['@trylimitless', '@wallchain_xyz', '@bankrbot'];
  private readonly pelpa333Handle = '@pelpa333';

  async initialize(): Promise<void> {
    try {
      this.browser = await chromium.launch({ 
        headless: true,
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
      await this.page.waitForSelector('[data-testid="tweet"]', { timeout: 15000 });

      // Scroll to load more posts if needed
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await this.page.waitForTimeout(2000);

      // Extract posts
      const posts = await this.page.evaluate((postLimit) => {
        const tweetElements = document.querySelectorAll('[data-testid="tweet"]');
        const posts: PelpaPost[] = [];

        for (let i = 0; i < Math.min(tweetElements.length, postLimit); i++) {
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

        return posts;
      }, limit);

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
      const intelligenceData = posts.map(post => ({
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

      console.log(`✅ Stored ${intelligenceData.length} @pelpa333 posts in raw_intelligence`);
      
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
      const responseTasks = posts.map(post => ({
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
        console.log(`🎯 Triggered Response Agent for ${posts.length} posts`);
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
