import { chromium, Browser, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';
import yaml from 'yaml';

dotenv.config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface TargetAccountPost {
  id: string;
  text: string;
  url: string;
  timestamp: Date;
  account: string;
  hashtags: string[];
  mentions: string[];
  links: string[];
}

export interface TargetAccount {
  handle: string;
  category: string;
  niche: string;
  weight: number;
  scrape_replies: boolean;
  scrape_limit: number;
  enabled: boolean;
  note: string;
  url: string;
  topics?: string[];
}

export class TargetAccountScraper {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private targetAccounts: TargetAccount[] = [];

  constructor() {
    this.loadTargetAccounts();
  }

  private loadTargetAccounts(): void {
    try {
      const configPath = './config/target-accounts.yaml';
      const configFile = fs.readFileSync(configPath, 'utf8');
      const config = yaml.parse(configFile);
      
      this.targetAccounts = (config.target_accounts || []).filter((a: TargetAccount) => a.enabled);
      console.log(`✅ Loaded ${this.targetAccounts.length} target accounts from config`);
    } catch (error) {
      console.error('❌ Failed to load target accounts config:', error);
      // Fallback to hardcoded accounts if config fails
      this.targetAccounts = [
        { handle: '@bankrbot', category: 'airdrop_farming', niche: 'airdrop_farming', weight: 1.0, scrape_replies: true, scrape_limit: 30, enabled: true, note: 'Banking integration', url: 'https://x.com/bankrbot' },
        { handle: '@wallchain', category: 'airdrop_farming', niche: 'airdrop_farming', weight: 1.0, scrape_replies: true, scrape_limit: 30, enabled: true, note: 'DeFi protocols', url: 'https://x.com/wallchain' },
        { handle: '@kloutgg', category: 'airdrop_farming', niche: 'airdrop_farming', weight: 1.0, scrape_replies: true, scrape_limit: 30, enabled: true, note: 'Airdrop tracking', url: 'https://x.com/kloutgg' }
      ];
    }
  }

  async initialize(): Promise<void> {
    // Skip if already initialized
    if (this.browser && this.page) {
      console.log('✅ Target Account Scraper already initialized');
      return;
    }
    
    try {
      this.browser = await chromium.launch({ 
        headless: false,  // Show browser so we can see what's happening
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      this.page = await this.browser.newPage();
      
      // Load saved cookies for authentication
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
          console.log('✅ Loaded authentication cookies for scraping');
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
      
      console.log('✅ Target Account Scraper initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Target Account Scraper:', error);
      throw error;
    }
  }

  async scrapeTargetAccount(account: string, limit: number = 10): Promise<TargetAccountPost[]> {
    if (!this.page) {
      throw new Error('Scraper not initialized. Call initialize() first.');
    }

    try {
      const cleanHandle = account.replace('@', '');
      console.log(`🔍 Scraping ${account} timeline (last ${limit} posts) with slow, detailed extraction...`);
      
      await this.page.goto(`https://x.com/${cleanHandle}`, {
        waitUntil: 'domcontentloaded',  // Faster than networkidle, less likely to timeout
        timeout: 60000  // Back to 1 minute since domcontentloaded is faster
      });

      // Wait for timeline to load
      await this.page.waitForSelector('[data-testid="tweet"]', { timeout: 15000 });
      await this.page.waitForTimeout(3000); // Let content settle

      console.log(`🔍 Starting aggressive scrolling to load more posts...`);
      
      // Aggressive scrolling with stabilization: stop when no new tweets appear
      let lastCount = 0;
      for (let scrollIteration = 0; scrollIteration < 20; scrollIteration++) {
        console.log(`📜 Scroll iteration ${scrollIteration + 1}/10`);
        
        // Scroll down more aggressively
        await this.page.evaluate(() => {
          window.scrollBy(0, 1000); // Scroll 1000px instead of 500px
        });
        
        // Wait for lazy loading
        await this.page.waitForTimeout(2000);
        
        // Check how many tweets we have loaded
        const tweetCount = await this.page.evaluate(() => {
          return document.querySelectorAll('[data-testid="tweet"]').length;
        });
        console.log(`📊 Loaded ${tweetCount} tweets so far`);

        // Stop early if no growth for 3 iterations
        if (tweetCount <= lastCount) {
          if (scrollIteration >= 3) break;
        } else {
          lastCount = tweetCount;
        }
      }
      
      await this.page.waitForTimeout(5000); // Final settle time
      console.log(`✅ Scrolling complete`);

      console.log(`🔍 Expanding "read more" buttons and extracting full content...`);

      // Extract posts with full text (including expanded content)
      const posts = await this.page.evaluate(async (params: {postLimit: number, accountHandle: string}) => {
        const {postLimit, accountHandle} = params;
        const tweetElements = document.querySelectorAll('[data-testid="tweet"]');
        const posts: any[] = [];

        // Helper sleep in page context
        const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

        for (let i = 0; i < Math.min(tweetElements.length, postLimit * 2); i++) {
          const tweet = tweetElements[i];
          
          if (!tweet) continue;
          
          try {
            // Bring each tweet into view to encourage lazy content expansion
            (tweet as HTMLElement).scrollIntoView({ behavior: 'instant', block: 'center' });
            await sleep(300);
            // IMPORTANT: Look for and expand "read more" buttons
            const readMoreButton = tweet.querySelector('[role="button"]');
            if (readMoreButton && readMoreButton.textContent?.toLowerCase().includes('read')) {
              (readMoreButton as HTMLElement).click();
              await sleep(200);
            }

            // Extract post text - get ALL text from tweet content area
            const textContainer = tweet.querySelector('[data-testid="tweetText"]')?.parentElement;
            let text = '';
            
            if (textContainer) {
              // Get all text nodes recursively to capture full expanded text
              const textNodes: string[] = [];
              const walker = document.createTreeWalker(
                textContainer,
                NodeFilter.SHOW_TEXT,
                null
              );
              
              let node;
              while (node = walker.nextNode()) {
                const textContent = node.textContent?.trim();
                if (textContent && textContent.length > 0) {
                  textNodes.push(textContent);
                }
              }
              
              text = textNodes.join(' ').trim() || textContainer.textContent?.trim() || '';
            }

            // Extract post URL
            const linkElement = tweet.querySelector('a[href*="/status/"]');
            const relativeUrl = linkElement?.getAttribute('href') || '';
            const url = relativeUrl ? `https://x.com${relativeUrl}` : '';

            // Extract timestamp
            const timeElement = tweet.querySelector('time');
            const timestamp = timeElement?.getAttribute('datetime') || new Date().toISOString();

            // Extract post ID from URL
            const postId = relativeUrl.split('/status/')[1]?.split('?')[0] || `post_${Date.now()}_${i}`;

            // Extract hashtags
            const hashtagElements = tweet.querySelectorAll('a[href^="/hashtag/"]');
            const hashtags = Array.from(hashtagElements).map(el => el.textContent?.trim()).filter(Boolean);

            // Extract mentions
            const mentionElements = tweet.querySelectorAll('a[href^="/"]');
            const mentions = Array.from(mentionElements)
              .map(el => el.textContent?.trim())
              .filter(text => text?.startsWith('@'));

            // Extract links
            const linkElements = tweet.querySelectorAll('a[href^="http"]');
            const links = Array.from(linkElements).map(el => el.getAttribute('href')).filter(Boolean) as string[];

            if (text && url) {
              posts.push({
                id: postId,
                text,
                url,
                timestamp: new Date(timestamp),
                account: accountHandle,
                hashtags: hashtags as string[],
                mentions: mentions as string[],
                links
              });
            }
          } catch (error) {
            console.warn('Error extracting post data:', error);
          }
        }

        return posts;
      }, {postLimit: limit, accountHandle: account});

      console.log(`✅ Scraped ${(posts as any[]).length} posts from ${account} with full content`);
      
      // Store each scraped post to database to preserve ALL valuable data
      for (const post of posts as TargetAccountPost[]) {
        try {
          await this.storePostToDatabase(post);
        } catch (error) {
          console.warn(`⚠️ Failed to store post ${post.id}:`, error);
        }
      }

      return posts as TargetAccountPost[];

    } catch (error) {
      console.error(`❌ Error scraping ${account} timeline:`, error);
      throw error;
    }
  }

  private async storePostToDatabase(post: TargetAccountPost): Promise<void> {
    try {
      const accountConfig = this.targetAccounts.find(acc => acc.handle === post.account);
      
      const intelligenceData = {
        source_type: 'twitter_scrape',
        source_account: post.account,
        source_url: post.url,
        title: `${post.account} Post`,
        raw_content: post.text,
        summary: post.text.substring(0, 200),
        metadata: {
          post_id: post.id,
          account: post.account,
          hashtags: post.hashtags,
          mentions: post.mentions,
          links: post.links,
          post_timestamp: post.timestamp.toISOString(),
          related_topics: accountConfig?.topics || [],
          full_text_length: post.text.length
        },
        extracted_at: new Date().toISOString(),
        processed_by_researcher: false,
        processed_by_writer: false
      };

      const { error } = await supabase
        .from('raw_intelligence')
        .insert(intelligenceData);

      if (error) {
        // Ignore duplicate errors
        if (error.code !== '23505') {
          console.error(`❌ Failed to store post:`, error);
        }
      }
    } catch (error) {
      console.error(`❌ Error storing post:`, error);
    }
  }

  async scrapeAllTargetAccounts(): Promise<TargetAccountPost[]> {
    const allPosts: TargetAccountPost[] = [];

    for (const account of this.targetAccounts) {
      try {
        const posts = await this.scrapeTargetAccount(account.handle, 10);
        allPosts.push(...posts);
        
        // Add delay between accounts to avoid rate limiting
        await this.page?.waitForTimeout(3000);
      } catch (error) {
        console.error(`❌ Failed to scrape ${account.handle}:`, error);
      }
    }

    console.log(`✅ Total scraped ${allPosts.length} posts from all target accounts`);
    return allPosts;
  }

  async scrapeSpecificTargetAccounts(targetHandles: string[]): Promise<TargetAccountPost[]> {
    const allPosts: TargetAccountPost[] = [];
    
    // Filter to only enabled accounts that match the target handles
    const accountsToScrape = this.targetAccounts.filter(account => 
      targetHandles.includes(account.handle) && account.enabled
    );
    
    for (const account of accountsToScrape) {
      try {
        const posts = await this.scrapeTargetAccount(account.handle, account.scrape_limit);
        allPosts.push(...posts);
        await this.page?.waitForTimeout(3000);
      } catch (error) {
        console.error(`❌ Failed to scrape ${account.handle}:`, error);
      }
    }
    
    console.log(`✅ Total scraped ${allPosts.length} posts from ${targetHandles.length} premium target accounts`);
    return allPosts;
  }

  async storeTargetAccountIntelligence(posts: TargetAccountPost[]): Promise<void> {
    try {
      if (posts.length === 0) {
        console.log('ℹ️ No target account posts to store');
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
          console.error('❌ Error checking existing target posts:', existingError);
        } else if (existingRows) {
          existingUrls = new Set(existingRows.map(row => row.source_url).filter((url): url is string => !!url));
        }
      }

      const newPosts = posts.filter(post => !existingUrls.has(post.url));

      if (newPosts.length === 0) {
        console.log(`ℹ️ All ${posts.length} scraped target posts already exist in raw_intelligence. Skipping insert.`);
        return;
      }

      const intelligenceData = newPosts.map(post => {
        const accountConfig = this.targetAccounts.find(acc => acc.handle === post.account);
        
        return {
          source_type: 'twitter_scrape',
          source_account: post.account,
          source_url: post.url,
          title: `${post.account} Post: ${post.text.substring(0, 100)}...`,
          raw_content: post.text,
          summary: `Post from ${post.account} with ${post.hashtags.length} hashtags and ${post.mentions.length} mentions`,
          metadata: {
            post_id: post.id,
            account: post.account,
            hashtags: post.hashtags,
            mentions: post.mentions,
            links: post.links,
            post_timestamp: post.timestamp.toISOString(),
            related_topics: accountConfig?.topics || []
          },
          processed_by_researcher: false,
          processed_by_writer: false,
          extracted_at: new Date().toISOString()
        };
      });

      const { error } = await supabase
        .from('raw_intelligence')
        .insert(intelligenceData);

      if (error) {
        throw error;
      }

      const skippedCount = posts.length - newPosts.length;
      if (skippedCount > 0) {
        console.log(`ℹ️ Skipped ${skippedCount} duplicate target account posts`);
      }
      console.log(`✅ Stored ${intelligenceData.length} new target account posts in raw_intelligence`);
      
    } catch (error) {
      console.error('❌ Error storing target account intelligence:', error);
      throw error;
    }
  }

  private calculatePostQuality(post: TargetAccountPost): number {
    let score = 0.7; // Base score

    // Higher score for posts with relevant hashtags
    const relevantHashtags = post.hashtags.filter(tag => 
      ['defi', 'crypto', 'trading', 'ai', 'yield', 'protocol', 'banking'].some(keyword =>
        tag.toLowerCase().includes(keyword)
      )
    );
    score += relevantHashtags.length * 0.05;

    // Higher score for posts with links
    if (post.links.length > 0) {
      score += 0.1;
    }

    // Higher score for longer, more informative posts
    if (post.text.length > 100) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  async monitorTargetAccounts(): Promise<void> {
    try {
      const posts = await this.scrapeAllTargetAccounts();
      await this.storeTargetAccountIntelligence(posts);
      
      // Trigger research agent for high-quality posts
      const highQualityPosts = posts.filter(post => this.calculatePostQuality(post) > 0.8);
      if (highQualityPosts.length > 0) {
        console.log(`🔬 ${highQualityPosts.length} high-quality posts found, triggering research`);
        await this.triggerResearchAgent(highQualityPosts);
      }
      
    } catch (error) {
      console.error('❌ Error in target account monitoring cycle:', error);
    }
  }

  private async triggerResearchAgent(posts: TargetAccountPost[]): Promise<void> {
    // Extract topics for research
    const topics = posts.flatMap(post => {
      const accountConfig = this.targetAccounts.find(acc => acc.handle === post.account);
      return accountConfig?.topics || [];
    });

    // Store research triggers
    const { error } = await supabase
      .from('research_triggers')
      .insert(topics.map(topic => ({
        topic,
        source: 'target_accounts',
        priority: 'high',
        status: 'pending',
        created_at: new Date().toISOString()
      })));

    if (error) {
      console.error('❌ Error triggering Research Agent:', error);
    } else {
      console.log(`🎯 Triggered Research Agent for ${topics.length} topics`);
    }
  }

  async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    console.log('✅ Target Account Scraper cleaned up');
  }
}

// Export singleton instance
export const targetAccountScraper = new TargetAccountScraper();
