import { chromium, Browser, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { scoreComment, pickAltForSideways, isSpamOrToxic } from './sidewaysReplyService'; // Same directory
import { isOurAccount } from '../config/altAccounts';
import { getAccountCfgForAlt } from '../utils/altHelpers'; // Shared helper
import { fetchTweetReplies } from '../ingest/playwrightScraper';
import { REPLY_CONFIG } from '../config/replyConfig'; // Shared constants

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
  private readonly targetAccounts = [
    '@bankrbot',
    '@kloutgg',
    '@wallchain',
    '@reya_xyz',
    '@HeyElsaAI',
    '@Alignerz_',
    '@spaace_io',
    '@Velvet_Capital',
    '@OneAnalog',
    '@wardenprotocol',
    '@beyond__tech',
    '@SCORProtocol'
  ];
  private readonly pelpa333Handle = '@pelpa333';

  // Use shared constants
  private readonly MAX_SIDEWAYS_PER_ROOT = REPLY_CONFIG.sideways.MAX_PER_ROOT;
  private readonly MAX_SIDEWAYS_PER_ALT_PER_ROOT = REPLY_CONFIG.sideways.MAX_PER_ALT_PER_ROOT;
  private readonly MIN_SCORE_THRESHOLD = REPLY_CONFIG.sideways.MIN_SCORE_THRESHOLD;

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
      
      // Navigate to profile with replies tab (since user tags accounts in replies)
      const profileUrl = `https://x.com/${this.pelpa333Handle.replace('@', '')}`;
      await this.page.goto(profileUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      // Check for and handle Cloudflare security check
      const { handleCloudflareCheck } = await import('../utils/cloudflareHandler');
      const hasCloudflare = await handleCloudflareCheck(this.page, 30000);
      
      if (hasCloudflare) {
        console.log('⏳ Cloudflare check handled, waiting for page to load...');
        await this.page.waitForTimeout(3000);
      }

      // Scrape MAIN timeline first (where new posts appear)
      console.log('📑 Scraping MAIN timeline (where new posts appear)...');
      
      // Wait for timeline to load
      console.log('⏳ Waiting for timeline to load (5 seconds)...');
      try {
        await this.page.waitForSelector('[data-testid="tweet"]', { timeout: 20000 });
        console.log('✅ Found tweet elements in DOM');
      } catch (err) {
        console.log('⚠️ No tweets found initially, will try after scrolling');
      }
      await this.page.waitForTimeout(5000); // Give it even more time to fully load
      
      // Extract posts from initial load FIRST (before scrolling) - these are the newest posts
      console.log('🔍 Extracting posts from initial load (newest posts)...');
      const initialPosts = await this.page.evaluate(() => {
        const tweets = document.querySelectorAll('[data-testid="tweet"]');
        const posts: any[] = [];
        const debug: string[] = [];
        
        for (let i = 0; i < Math.min(tweets.length, 15); i++) {
          const tweet = tweets[i];
          if (!tweet) continue;
          
          try {
            const textEl = tweet.querySelector('[data-testid="tweetText"]');
            const text = textEl?.textContent?.trim() || '';
            const timeEl = tweet.querySelector('time');
            const timestamp = timeEl?.getAttribute('datetime') || '';
            
            // Try multiple methods to get URL
            let href = '';
            const linkEl = tweet.querySelector('a[href*="/status/"]');
            if (linkEl) {
              href = linkEl.getAttribute('href') || '';
            } else if (timeEl && timeEl.parentElement && timeEl.parentElement.tagName === 'A') {
              href = (timeEl.parentElement as HTMLAnchorElement).getAttribute('href') || '';
            }
            
            const postId = href.split('/status/')[1]?.split('?')[0]?.split('/')[0] || '';
            const url = href ? (href.startsWith('http') ? href : `https://x.com${href}`) : '';
            
            if (!postId) {
              debug.push(`Tweet ${i + 1}: No postId (href: ${href})`);
              continue;
            }
            if (!text) {
              debug.push(`Tweet ${i + 1}: No text`);
              continue;
            }
            if (!timestamp) {
              debug.push(`Tweet ${i + 1}: No timestamp`);
              continue;
            }
            
            const postTimestamp = new Date(timestamp);
            const fortyEightHoursAgo = Date.now() - (48 * 60 * 60 * 1000);
            const ageHours = Math.round((Date.now() - postTimestamp.getTime()) / (60 * 60 * 1000));
            
            if (postTimestamp.getTime() >= fortyEightHoursAgo) {
              posts.push({
                id: postId,
                text,
                url,
                timestamp: postTimestamp,
                mentions: [],
                hasTargetMentions: false,
                targetMentions: []
              });
              debug.push(`✅ Tweet ${i + 1}: Added (ID=${postId}, age=${ageHours}h)`);
            } else {
              debug.push(`⏭️ Tweet ${i + 1}: Skipped (ID=${postId}, age=${ageHours}h, older than 48h)`);
            }
          } catch (e) {
            debug.push(`❌ Tweet ${i + 1}: Error - ${String(e)}`);
          }
        }
        
        return { posts, debug };
      });
      
      console.log(`✅ Extracted ${initialPosts.posts.length} posts from initial load`);
      if (initialPosts.debug && initialPosts.debug.length > 0) {
        console.log(`📝 Initial extraction debug:`, initialPosts.debug.slice(0, 10).join(' | '));
      }
      
      // Debug: Check how many tweets are visible before scrolling
      const initialCheck = await this.page.evaluate(() => {
        const tweets = document.querySelectorAll('[data-testid="tweet"]');
        const initialPosts: any[] = [];
        
        for (let i = 0; i < Math.min(tweets.length, 10); i++) {
          const tweet = tweets[i];
          if (!tweet) continue;
          
          const textEl = tweet.querySelector('[data-testid="tweetText"]');
          const text = textEl?.textContent?.trim() || '';
          const timeEl = tweet.querySelector('time');
          const timestamp = timeEl?.getAttribute('datetime') || '';
          const linkEl = tweet.querySelector('a[href*="/status/"]');
          const href = linkEl?.getAttribute('href') || '';
          const postId = href.split('/status/')[1]?.split('?')[0] || '';
          
          if (postId && timestamp) {
            initialPosts.push({
              id: postId,
              text: text.substring(0, 50),
              timestamp: timestamp,
              age: timestamp ? Math.round((Date.now() - new Date(timestamp).getTime()) / (60 * 60 * 1000)) : 'unknown'
            });
          }
        }
        
        return {
          count: tweets.length,
          posts: initialPosts
        };
      });
      
      console.log(`🔍 Initial tweet count before scrolling: ${initialCheck.count}`);
      if (initialCheck.posts.length > 0) {
        console.log(`📋 Top ${initialCheck.posts.length} posts before scrolling:`);
        initialCheck.posts.forEach((p: any, idx: number) => {
          console.log(`  ${idx + 1}. ID: ${p.id}, Age: ${p.age}h, Text: "${p.text}..."`);
        });
      }

      // Increased scrolling to ensure we capture all new posts
      const scrollCount = 20; // Increased from 12 to 20 to ensure we load all new posts
      console.log(`📜 Scrolling to load posts (${scrollCount} scrolls)...`);
      for (let i = 0; i < scrollCount; i++) {
        // Random scroll distance (smaller)
        const scrollDistance = 200 + Math.random() * 300; // 200-500px
        await this.page.evaluate((distance) => {
          window.scrollBy(0, distance);
        }, scrollDistance);
        
        // LONGER wait time between scrolls
        const waitTime = 4000 + Math.random() * 3000; // 4-7 seconds
        await this.page.waitForTimeout(waitTime);
        console.log(`📜 Scroll ${i + 1}/${scrollCount} complete (waited ${Math.round(waitTime/1000)}s)`);
        
        // Occasional longer pause
        if (Math.random() < 0.3 && i > 2) {
          const pauseTime = 10000 + Math.random() * 10000; // 10-20 second pause
          console.log(`⏸️  Taking a break (${Math.round(pauseTime/1000)}s)...`);
          await this.page.waitForTimeout(pauseTime);
        }
      }
      
      // Wait a final moment for content to settle
      console.log('⏳ Waiting for content to settle (8 seconds)...');
      await this.page.waitForTimeout(8000);

      // Extract posts - get MORE than the limit to ensure we catch all recent posts
      const result = await this.page.evaluate((postLimit) => {
        const tweetElements = document.querySelectorAll('[data-testid="tweet"]');
        const tweetCount = tweetElements.length;
        const debugInfo: any[] = [];
        const posts: PelpaPost[] = [];
        
        debugInfo.push(`Found ${tweetCount} tweet elements in DOM`);

        // Process ALL tweets found (not just postLimit * 3)
        const maxToProcess = Math.min(tweetElements.length, postLimit * 3);
        debugInfo.push(`Processing ${maxToProcess} of ${tweetCount} tweets`);
        
        for (let i = 0; i < maxToProcess; i++) {
          const tweet = tweetElements[i];
          
          if (!tweet) {
            debugInfo.push(`Tweet ${i} is null/undefined`);
            continue;
          }
          
          try {
            // Extract post text
            const textElement = tweet.querySelector('[data-testid="tweetText"]');
            const text = textElement?.textContent?.trim() || '';
            
            if (!text) {
              // Try alternative text selectors
              const altText = tweet.textContent?.trim() || '';
              debugInfo.push(`Tweet ${i + 1}: No text from tweetText, trying alt. Alt text length: ${altText.length}`);
            }

            // Extract timestamp FIRST (more reliable)
            const timeElement = tweet.querySelector('time');
            const timestamp = timeElement?.getAttribute('datetime') || '';
            
            if (!timestamp) {
              debugInfo.push(`Tweet ${i + 1}: No timestamp found (time element missing or no datetime attribute)`);
            }
            
            // Extract post URL from time element's parent (more reliable method)
            // The time element is usually wrapped in an <a> tag with the tweet URL
            let relativeUrl = '';
            let url = '';
            let postId = '';
            
            if (timeElement) {
              const timeParent = timeElement.parentElement;
              if (timeParent && timeParent.tagName === 'A') {
                relativeUrl = timeParent.getAttribute('href') || '';
              } else {
                // Fallback: look for link in tweet
                const linkElement = tweet.querySelector('a[href*="/status/"]');
                relativeUrl = linkElement?.getAttribute('href') || '';
              }
            } else {
              // Fallback: try direct link search
              const linkElement = tweet.querySelector('a[href*="/status/"]');
              relativeUrl = linkElement?.getAttribute('href') || '';
            }
            
            // Try multiple selectors for URL if first attempt failed
            if (!relativeUrl) {
              const allLinks = tweet.querySelectorAll('a[href*="/status/"]');
              if (allLinks.length > 0 && allLinks[0]) {
                relativeUrl = allLinks[0].getAttribute('href') || '';
                debugInfo.push(`Tweet ${i + 1}: Found URL via fallback selector: ${relativeUrl}`);
              } else {
                debugInfo.push(`Tweet ${i + 1}: No URL found - checked time parent and all /status/ links`);
              }
            }

            // Extract post ID from URL
            if (relativeUrl) {
              url = relativeUrl.startsWith('http') ? relativeUrl : `https://x.com${relativeUrl}`;
              postId = relativeUrl.split('/status/')[1]?.split('?')[0]?.split('/')[0] || '';
            }

            // CRITICAL: Skip posts without valid ID/URL (don't generate fake IDs)
            if (!postId || !url || !text) {
              debugInfo.push(`Skipping tweet ${i + 1}: missing ID (${postId || 'none'}), URL (${url || 'none'}), or text (length: ${text.length})`);
              continue;
            }
            
            // Debug: Log successful extraction
            debugInfo.push(`Extracted post ${i + 1}: ID=${postId}, timestamp=${timestamp || 'none'}, text length=${text.length}`);

            // Parse timestamp
            const postTimestamp = timestamp ? new Date(timestamp) : new Date();
            
            // Filter: Only include posts from last 48 hours (reduced from 7 days for faster monitoring)
            const fortyEightHoursAgo = Date.now() - (48 * 60 * 60 * 1000);
            const postAge = Date.now() - postTimestamp.getTime();
            const ageHours = Math.round(postAge / (60 * 60 * 1000));
            
            if (postTimestamp.getTime() < fortyEightHoursAgo) {
              debugInfo.push(`Skipping post ${i + 1} (ID=${postId}): ${ageHours}h old (${postTimestamp.toISOString()}) - older than 48h`);
              continue;
            }
            
            debugInfo.push(`✅ Post ${i + 1} (ID=${postId}) passed 48h filter: ${ageHours}h old`);

            posts.push({
              id: postId,
              text,
              url,
              timestamp: postTimestamp,
              mentions: [],
              hasTargetMentions: false,
              targetMentions: []
            });
          } catch (error) {
            console.warn(`Error extracting post data for tweet ${i}:`, error);
          }
        }

        // Sort by most recent first
        posts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        
        // Return both posts and debug info
        return {
          posts: posts.slice(0, postLimit),
          debug: debugInfo,
          totalFound: tweetCount,
          extracted: posts.length,
          allExtracted: posts // Return all extracted posts before limit
        };
      }, limit);

      const scrollingPosts = result.posts || [];
      const allExtracted = result.allExtracted || [];
      console.log(`📋 Raw scraped from scrolling: ${scrollingPosts.length} posts (after limit)`);
      console.log(`🔍 Extraction Debug: Found ${result.totalFound} tweets, extracted ${result.extracted} posts total`);
      
      // Combine initial posts with posts found after scrolling
      const allPostsMap = new Map<string, PelpaPost>();
      
      // Add initial posts first (they're the newest)
      initialPosts.posts.forEach((post: PelpaPost) => {
        allPostsMap.set(post.id, post);
      });
      
      // Add posts from scrolling (may have duplicates)
      allExtracted.forEach((post: PelpaPost) => {
        if (!allPostsMap.has(post.id)) {
          allPostsMap.set(post.id, post);
        }
      });
      
      // Convert back to array and sort by timestamp (newest first)
      const combinedPosts = Array.from(allPostsMap.values()).sort((a, b) => 
        b.timestamp.getTime() - a.timestamp.getTime()
      );
      
      console.log(`📋 Combined: ${combinedPosts.length} posts total (${initialPosts.posts.length} from initial load + ${allExtracted.length} from scrolling)`);
      
      // Show all extracted posts (before limit)
      if (combinedPosts.length > 0) {
        console.log(`\n📊 All extracted posts (combined):`);
        combinedPosts.slice(0, 10).forEach((p: PelpaPost, idx: number) => {
          const ageHours = Math.round((Date.now() - p.timestamp.getTime()) / (60 * 60 * 1000));
          console.log(`  ${idx + 1}. ID: ${p.id}, Age: ${ageHours}h, Text: "${p.text.substring(0, 60)}..."`);
        });
      }
      
      if (result.debug && result.debug.length > 0) {
        console.log(`\n📝 Debug details (first 15):`, result.debug.slice(0, 15).join(' | '));
        if (result.debug.length > 15) {
          console.log(`   ... and ${result.debug.length - 15} more debug messages`);
        }
      }
      
      // Apply limit after combining
      const posts = combinedPosts.slice(0, limit);
      
      // Filter posts older than 48 hours (filter AFTER extraction, like working version)
      const now = Date.now();
      const fortyEightHoursAgo = now - (48 * 60 * 60 * 1000);
      const recentPosts = posts.filter(p => {
        const postAge = now - p.timestamp.getTime();
        return postAge <= (48 * 60 * 60 * 1000); // Post must be <= 48 hours old
      });
      
      const skippedOldPosts = posts.length - recentPosts.length;
      if (skippedOldPosts > 0) {
        console.log(`⏭️ Skipped ${skippedOldPosts} posts older than 48 hours`);
      }
      
      // Deduplicate posts by ID (in case same post appears multiple times)
      const uniquePostsMap = new Map<string, PelpaPost>();
      for (const post of recentPosts) {
        if (!uniquePostsMap.has(post.id)) {
          uniquePostsMap.set(post.id, post);
        } else {
          console.log(`⚠️ Duplicate post ID detected: ${post.id}, keeping first occurrence`);
        }
      }
      const deduplicatedPosts = Array.from(uniquePostsMap.values());
      
      if (deduplicatedPosts.length < recentPosts.length) {
        console.log(`🔄 Removed ${recentPosts.length - deduplicatedPosts.length} duplicate posts`);
      }
      
      // Log all scraped posts with details
      console.log(`\n📝 Scraped Posts Details (within 48 hours):`);
      deduplicatedPosts.forEach((post, idx) => {
        const ageHours = Math.round((now - post.timestamp.getTime()) / (60 * 60 * 1000));
        console.log(`  ${idx + 1}. ID: ${post.id}, Age: ${ageHours}h`);
        console.log(`     URL: ${post.url}`);
        console.log(`     Time: ${post.timestamp.toISOString()}`);
        console.log(`     Text: ${post.text.substring(0, 100)}${post.text.length > 100 ? '...' : ''}`);
      });
      
      // Process mentions for each post
      const processedPosts = deduplicatedPosts.map(post => this.processMentions(post));

      console.log(`\n✅ Scraped ${processedPosts.length} posts from @pelpa333`);
      
      // Log posts with target mentions
      const postsWithTargetMentions = processedPosts.filter(p => p.hasTargetMentions);
      if (postsWithTargetMentions.length > 0) {
        console.log(`\n🎯 Found ${postsWithTargetMentions.length} posts with target mentions:`);
        postsWithTargetMentions.forEach((p, idx) => {
          console.log(`  ${idx + 1}. Post ID: ${p.id}`);
          console.log(`     Mentions: ${p.targetMentions.join(', ')}`);
          console.log(`     URL: ${p.url}`);
          console.log(`     Text: ${p.text.substring(0, 100)}...`);
        });
      } else {
        console.log(`\nℹ️ No posts with target mentions found in this scrape`);
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

      console.log(`\n📊 Deduplication Check:`);
      console.log(`  Total scraped: ${posts.length}`);
      console.log(`  Already in DB: ${posts.length - newPosts.length}`);
      console.log(`  New posts: ${newPosts.length}`);
      
      if (newPosts.length > 0) {
        console.log(`\n🆕 New Posts to Store:`);
        newPosts.forEach((post, idx) => {
          console.log(`  ${idx + 1}. ID: ${post.id}, URL: ${post.url}`);
        });
      }

      if (newPosts.length === 0) {
        console.log(`\nℹ️ All ${posts.length} scraped @pelpa333 posts already exist in raw_intelligence. Skipping insert.`);
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
        // Handle duplicate key errors gracefully (unique constraint on source_url)
        if (error.code === '23505') {
          console.log(`⚠️ Some posts already exist in database (duplicate URLs), inserting individually...`);
          // Try inserting one at a time to see which ones are new
          let successCount = 0;
          for (const item of intelligenceData) {
            const { error: singleError } = await supabase
              .from('raw_intelligence')
              .insert(item);
            if (!singleError) {
              successCount++;
            }
          }
          console.log(`✅ Stored ${successCount} new posts (skipped ${intelligenceData.length - successCount} duplicates)`);
          return; // Don't throw, just log and continue
        }
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

  /**
   * Detect sideways opportunities from replies to Pelpa tweets
   */
  private async detectSidewaysOpportunities(tweetId: string, tweetUrl: string): Promise<void> {
    try {
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

        // Skip tweets older than 24 hours (reduced from 92 hours for faster processing)
        const tweetAge = Date.now() - new Date(reply.created_at).getTime();
        const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours (reduced from 92)
        if (tweetAge > maxAgeMs) continue; // Too old, skip

        // Score the comment
        const score = scoreComment(reply.text);
        if (score < this.MIN_SCORE_THRESHOLD) continue; // Not worth replying

        // Pick which alt should reply
        const recommendedAlt = pickAltForSideways(reply.text, reply.user_handle);

        // Check caps (max 6 per root, max 2 per alt per root)
        const { count: totalCount } = await supabase
          .from('sideways_opportunities')
          .select('*', { count: 'exact', head: true })
          .eq('root_tweet_id', tweetId)
          .eq('processed', false);

        if ((totalCount || 0) >= this.MAX_SIDEWAYS_PER_ROOT) continue; // Cap reached

        const { count: altCount } = await supabase
          .from('sideways_opportunities')
          .select('*', { count: 'exact', head: true })
          .eq('root_tweet_id', tweetId)
          .eq('recommended_alt_handle', recommendedAlt)
          .eq('processed', false);

        if ((altCount || 0) >= this.MAX_SIDEWAYS_PER_ALT_PER_ROOT) continue; // Alt cap reached

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
    } catch (error) {
      console.error(`❌ Error in detectSidewaysOpportunities for ${tweetId}:`, error);
      // Don't throw - let monitor continue
    }
  }

  /**
   * Detect inbound opportunities (replies to our alt's comments)
   * This runs during monitor cycles to flag inbound opportunities
   */
  private async detectInboundOpportunities(): Promise<void> {
    try {
      // Get recent sideways replies we posted
      const { data: sidewaysReplies } = await supabase
        .from('sideways_replies')
        .select('reply_tweet_id, alt_handle')
        .not('reply_tweet_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!sidewaysReplies || sidewaysReplies.length === 0) return;

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
    } catch (error) {
      console.error('❌ Error in detectInboundOpportunities:', error);
      // Don't throw - let monitor continue
    }
  }

  async monitorPelpa333(): Promise<void> {
    if (!this.page || !this.browser) {
      throw new Error('Monitor not initialized. Call initialize() first.');
    }
    
    try {
      const posts = await this.scrapePelpa333Timeline(20);
      await this.storePelpa333Intelligence(posts);
      
      // NOTE: Sideways and inbound detection moved to separate 'sideways-monitor' command
      // This keeps the main monitor fast and focused on Pelpa timeline scraping
      
      // Check for posts that need immediate response
      // Filter: Only process posts from last 48 hours (reduced from 72 hours)
      const fortyEightHoursAgo = Date.now() - (48 * 60 * 60 * 1000);
      const now = Date.now();
      
      // Log post ages for debugging
      const postsWithMentions = posts.filter(p => p.hasTargetMentions);
      if (postsWithMentions.length > 0) {
        console.log(`\n📅 Checking post ages (48-hour filter):`);
        postsWithMentions.forEach(post => {
          const postAge = now - post.timestamp.getTime();
          const ageHours = Math.round(postAge / (60 * 60 * 1000));
          const isRecent = postAge <= (48 * 60 * 60 * 1000);
          console.log(`  Post ${post.id}: ${ageHours}h old (${post.timestamp.toISOString()}) - ${isRecent ? '✅ RECENT' : '⏭️ TOO OLD'}`);
        });
      }
      
      const recentPosts = posts.filter(p => {
        const postAge = now - p.timestamp.getTime();
        return postAge <= (48 * 60 * 60 * 1000); // Post must be <= 48 hours old
      });
      
      const urgentPosts = recentPosts.filter(p => p.hasTargetMentions);
      const skippedOldPosts = postsWithMentions.length - urgentPosts.length;
      
      if (skippedOldPosts > 0) {
        console.log(`\n⏭️ Skipped ${skippedOldPosts} posts older than 48 hours`);
      }
      
      if (urgentPosts.length > 0) {
        console.log(`🚨 ${urgentPosts.length} posts need immediate attention (within 48 hours)!`);
        // This will trigger the Response Agent
        try {
          await this.triggerResponseAgent(urgentPosts);
        } catch (responseError) {
          console.error('❌ Failed to trigger Response Agent:', responseError);
        }
      } else {
        console.log(`ℹ️ No recent posts with target mentions (within 48 hours)`);
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
        // Only block if task is actively being processed or already completed successfully
        // Allow creating new tasks for 'failed' status (retry failed tasks)
        // Reset 'generating_response' and 'response_ready' back to 'pending_response' (they're stuck)
        const blockedStatuses = new Set(['pending_response', 'posted']);
        const stuckStatuses = new Set(['generating_response', 'response_ready']);
        
        // Reset stuck tasks back to pending_response so they can be retried
        const stuckTasks = existingTasks.filter(task => task.post_id && stuckStatuses.has(task.status));
        if (stuckTasks.length > 0) {
          console.log(`🔄 Resetting ${stuckTasks.length} stuck tasks back to pending_response...`);
          for (const task of stuckTasks) {
            try {
              await supabase
                .from('response_queue')
                .update({ status: 'pending_response' })
                .eq('post_id', task.post_id);
            } catch (error) {
              console.error(`❌ Failed to reset task ${task.post_id}:`, error);
            }
          }
        }
        
        // Block only on active/completed statuses
        existingTaskIds = new Set(
          existingTasks
            .filter(task => task.post_id && blockedStatuses.has(task.status))
            .map(task => task.post_id!)
        );
      }

      const newPosts = posts.filter(post => !existingTaskIds.has(post.id));

      console.log(`\n📊 Response Queue Check:`);
      console.log(`  Total posts with mentions: ${posts.length}`);
      console.log(`  Already in queue: ${posts.length - newPosts.length}`);
      console.log(`  New tasks to create: ${newPosts.length}`);

      if (newPosts.length === 0) {
        console.log('\nℹ️ All posts already have response tasks. Skipping creation.');
        return;
      }

      const responseTasks = newPosts.map(post => ({
        post_id: post.id,
        post_url: post.url,
        post_text: post.text,
        target_mentions: post.targetMentions,
        status: 'pending_response'
      }));
      
      console.log(`\n📝 Creating ${responseTasks.length} response tasks:`);
      responseTasks.forEach((task, idx) => {
        console.log(`  ${idx + 1}. Post ID: ${task.post_id}`);
        console.log(`     URL: ${task.post_url}`);
        console.log(`     Mentions: ${task.target_mentions.join(', ')}`);
        console.log(`     Text: ${task.post_text.substring(0, 80)}...`);
      });
      
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

  /**
   * Monitor sideways and inbound opportunities (separate from main monitor)
   * This is time-intensive and should be run less frequently
   */
  async monitorSidewaysAndInbound(): Promise<void> {
    if (!this.page || !this.browser) {
      throw new Error('Monitor not initialized. Call initialize() first.');
    }
    
    try {
      console.log('\n🔍 Starting sideways and inbound opportunity detection...');
      
      // Detect sideways opportunities for posted tweets
      // IMPORTANT: Check ALL posted tweets from response_queue, not just scraped ones
      // This ensures we don't miss sideways opportunities on older posts we've responded to
      console.log('\n🔍 Checking for sideways opportunities on posted tweets...');
      try {
        // Only check tweets from last 24 hours for sideways detection
        const twentyFourHoursAgo = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();
        
        const { data: postedTasks, error: postedError } = await supabase
          .from('response_queue')
          .select('post_id, post_url, post_text')
          .eq('status', 'posted')
          .gte('created_at', twentyFourHoursAgo) // Only check tweets from last 24 hours
          .order('created_at', { ascending: false })
          .limit(50); // Check last 50 posted tweets for sideways opportunities
        
        if (postedError) {
          console.error('❌ Error fetching posted tweets for sideways detection:', postedError);
        } else if (postedTasks && postedTasks.length > 0) {
          console.log(`📋 Found ${postedTasks.length} posted tweets to check for sideways opportunities (last 24 hours)`);
          
          for (const task of postedTasks) {
            if (!task.post_id || !task.post_url) continue;
            
            try {
              await this.detectSidewaysOpportunities(task.post_id, task.post_url);
            } catch (error) {
              console.error(`❌ Error detecting sideways opportunities for post ${task.post_id}:`, error);
              // Continue to next post - don't crash entire cycle
            }
          }
        } else {
          console.log('ℹ️ No posted tweets found in response_queue (last 24 hours)');
        }
      } catch (error) {
        console.error('❌ Error in sideways opportunity detection:', error);
        // Don't throw - continue with rest of monitoring
      }
      
      // Detect inbound opportunities (replies to our alt's comments)
      try {
        await this.detectInboundOpportunities();
      } catch (error) {
        console.error('❌ Error detecting inbound opportunities:', error);
        // Continue - don't crash entire cycle
      }
      
      console.log('\n✅ Sideways and inbound monitoring complete');
    } catch (error) {
      console.error('❌ Error in sideways/inbound monitoring cycle:', error);
      throw error;
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
