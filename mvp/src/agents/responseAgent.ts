import { chromium, Browser, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { generateReplyForAlt } from '../generation';

dotenv.config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ResponseTask {
  id: string;
  post_id: string;
  post_url: string;
  post_text: string;
  target_mentions: string[];
  status: 'pending_response' | 'generating_response' | 'response_ready' | 'posted' | 'failed';
  generated_response?: string;
  response_url?: string;
  created_at: string;
  processed_at?: string;
}

type ResponseHistoryEntry = {
  response: string;
  response_url?: string;
  timestamp: string;
};

type ResponseHistory = Record<string, ResponseHistoryEntry>;

export interface ResponseAgentConfig {
  handle: string;
  cookiePath: string;
  responderSequence: string[];
  shouldRetweet?: boolean; // Defaults to true if not specified
}

export class ResponseAgent {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private readonly responseAccount: string;
  private readonly cookiePath: string;
  private readonly responderSequence: string[];
  private readonly shouldRetweet: boolean;

  constructor(config: ResponseAgentConfig) {
    this.responseAccount = config.handle;
    this.cookiePath = config.cookiePath;
    this.responderSequence = config.responderSequence;
    this.shouldRetweet = config.shouldRetweet !== false; // Defaults to true
  }

  async initialize(): Promise<void> {
    try {
      this.browser = await chromium.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      this.page = await this.browser.newPage();

      // Load saved cookies for authentication
      const fs = require('fs');
      const cookiesPath = path.isAbsolute(this.cookiePath)
        ? this.cookiePath
        : path.join(process.cwd(), this.cookiePath);
      try {
        if (fs.existsSync(cookiesPath)) {
          const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
          const validCookies = cookies.map((cookie: any) => ({
            ...cookie,
            sameSite: cookie.sameSite === 'no_restriction' ? 'None' :
                     cookie.sameSite === 'lax' ? 'Lax' :
                     cookie.sameSite === 'strict' ? 'Strict' : 'Lax'
          }));
          await this.page.context().addCookies(validCookies);
          console.log(`✅ Loaded authentication cookies for ${this.responseAccount}`);
        } else {
          console.log('⚠️ Cookie file not found at:', cookiesPath);
        }
      } catch (cookieError) {
        console.log('⚠️ Failed to load cookies:', cookieError instanceof Error ? cookieError.message : String(cookieError));
      }

      await this.page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      console.log(`✅ Response Agent (${this.responseAccount}) initialized`);
    } catch (error) {
      console.error('❌ Failed to initialize Response Agent:', error);
      throw error;
    }
  }

  async checkForPendingResponses(): Promise<ResponseTask[]> {
    try {
      const { data, error } = await supabase
        .from('response_queue')
        .select('*')
        .eq('status', 'pending_response')
        .order('created_at', { ascending: true })
        .limit(10);

      if (error) {
        throw error;
      }

      console.log(`📋 [${this.responseAccount}] Found ${data?.length || 0} pending response tasks`);
      return data || [];

    } catch (error) {
      console.error('❌ Error checking for pending responses:', error);
      return [];
    }
  }

  async generateResponse(post: ResponseTask): Promise<string> {
    try {
      console.log(`🤖 [${this.responseAccount}] Generating persona response...`);

      const personaResponse = await generateReplyForAlt(this.responseAccount, post.post_text);
      const cleaned = personaResponse.trim().replace(/\s+/g, ' ');

      if (!cleaned || this.isGarbage(cleaned)) {
        console.log(`⚠️ [${this.responseAccount}] Persona reply looked weak, falling back to short response.`);
        return this.generateFallbackResponse();
      }

      return cleaned;
    } catch (error) {
      console.error(`❌ [${this.responseAccount}] Persona generation failed:`, error);
      return this.generateFallbackResponse();
    }
  }

  async likePost(postUrl: string): Promise<boolean> {
    try {
      if (!this.page) {
        throw new Error('Response Agent not initialized');
      }

      console.log(`👍 [${this.responseAccount}] Liking post: ${postUrl}`);
      
      await this.page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      
      // Wait for page to load
      await this.page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });

      // If the post is already liked, Twitter shows the "unlike" button instead
      const unlikeButton = this.page.locator('[data-testid="unlike"]').first();
      if (await unlikeButton.isVisible()) {
        console.log(`ℹ️ [${this.responseAccount}] Post already liked – skipping like action`);
        return true;
      }
      
      // Find and click the like button
      const likeButton = this.page.locator('[data-testid="like"]').first();
      
      if ((await likeButton.count()) === 0) {
        console.log(`⚠️ [${this.responseAccount}] Like button not found (possibly already liked or unavailable)`);
        return false;
      }
      
      await likeButton.click();
      await this.page.waitForTimeout(2000);
      console.log(`✅ [${this.responseAccount}] Successfully liked the post`);
      return true;

    } catch (error) {
      console.error('❌ Error liking post:', error);
      return false;
    }
  }

  async retweetPost(postUrl: string): Promise<boolean> {
    try {
      if (!this.page) {
        throw new Error('Response Agent not initialized');
      }

      console.log(`🔄 [${this.responseAccount}] Retweeting post: ${postUrl}`);
      
      // Navigate to post if not already there
      if (this.page.url() !== postUrl) {
        await this.page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });
      }

      // Check if already retweeted - Twitter shows "unretweet" button if already retweeted
      const unretweetButton = this.page.locator('[data-testid="unretweet"]').first();
      if (await unretweetButton.isVisible()) {
        console.log(`ℹ️ [${this.responseAccount}] Post already retweeted – skipping retweet action`);
        return true;
      }

      // Find and click the retweet button
      const retweetButton = this.page.locator('[data-testid="retweet"]').first();
      
      if ((await retweetButton.count()) === 0) {
        console.log(`⚠️ [${this.responseAccount}] Retweet button not found (possibly already retweeted or unavailable)`);
        return false;
      }

      // Click retweet button - this opens a menu
      await retweetButton.click();
      await this.page.waitForTimeout(1000);

      // Find and click the "Repost" option in the menu (not "Quote Tweet")
      // The menu contains options like "Repost" and "Quote Post"
      const repostOption = this.page.locator('text=Repost').first();
      
      if ((await repostOption.count()) === 0) {
        // Try alternative selector - sometimes it's just clicking the button again
        // or the menu might have different text
        const retweetConfirm = this.page.locator('[data-testid="Dropdown"]').locator('text=/Repost|Retweet/i').first();
        if ((await retweetConfirm.count()) > 0) {
          await retweetConfirm.click();
        } else {
          // Fallback: try clicking retweet button again (some UIs auto-confirm)
          await retweetButton.click();
        }
      } else {
        await repostOption.click();
      }

      // Wait for retweet to complete
      await this.page.waitForTimeout(2000);
      console.log(`✅ [${this.responseAccount}] Successfully retweeted the post`);
      return true;

    } catch (error) {
      console.error('❌ Error retweeting post:', error);
      return false;
    }
  }

  async commentOnPost(postUrl: string, response: string): Promise<string | null> {
    try {
      if (!this.page) {
        throw new Error('Response Agent not initialized');
      }

      console.log(`💬 [${this.responseAccount}] Commenting on post: ${postUrl}`);
      console.log(`Comment: "${response}"`);
      
      await this.page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      
      // Wait for page to load
      await this.page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });
      
      // Find and click the reply button
      const replyButton = await this.page.locator('[data-testid="reply"]').first();
      await replyButton.click();
      
      // Wait for reply modal to open and overlays to clear
      await this.page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 5000 });
      
      // Wait for overlays to clear
      await this.page.waitForTimeout(2000);
      
      // Option 3: Try different selectors
      const textarea = this.page.locator('[aria-label="Post text"]').first();
      
      // Try to click and type
      await textarea.click({ force: true });
      await textarea.press('Control+a');
      await textarea.press('Delete');
      
      // Type with realistic delays
      await textarea.type(response, { delay: 20 });
      
      // Trigger additional events
      await textarea.dispatchEvent('input');
      await textarea.dispatchEvent('change');
      await textarea.dispatchEvent('keyup');
      
      // Wait a moment for the text to be processed
      await this.page.waitForTimeout(2000);
      
      // Option 5: Use keyboard shortcut to submit
      await textarea.press('Control+Enter', { delay: 20 });
      
      // Wait for the reply to be posted
      await this.page.waitForTimeout(3000);
      
      // Get the URL of the posted reply
      const currentUrl = this.page.url();
      console.log(`✅ [${this.responseAccount}] Successfully posted comment`);
      
      return currentUrl;

    } catch (error) {
      console.error('❌ Error commenting on post:', error);
      return null;
    }
  }

  async processResponseTask(task: ResponseTask): Promise<void> {
    try {
      console.log(`🎯 [${this.responseAccount}] Processing response task for post ${task.post_id}...`);

      const history = this.parseResponseHistory(task.generated_response);
      if (history[this.responseAccount]) {
        console.log(`ℹ️ ${this.responseAccount} has already responded to ${task.post_id}, skipping.`);
        await this.updateStatusForRemaining(task, history, task.response_url);
        return;
      }

      // Update status to generating
      await this.updateTaskStatus(task.id, 'generating_response');

      // Generate response
      const response = await this.generateResponse(task);

      // Like the original post
      const liked = await this.likePost(task.post_url);
      if (!liked) {
        console.log('⚠️ Failed to like post, but continuing with retweet/comment');
      }

      // Retweet the post (if enabled)
      if (this.shouldRetweet) {
        const retweeted = await this.retweetPost(task.post_url);
        if (!retweeted) {
          console.log('⚠️ Failed to retweet post, but continuing with comment');
        }
        // Add delay after retweet before commenting (1-2 seconds)
        await this.page?.waitForTimeout(1500);
      }

      // Comment on the post
      const commentUrl = await this.commentOnPost(task.post_url, response);

      if (!commentUrl) {
        await this.updateTaskStatus(task.id, 'failed');
        console.log(`❌ Failed to comment on @pelpa333 post ${task.post_id}`);
        return;
      }

      history[this.responseAccount] = {
        response,
        response_url: commentUrl,
        timestamp: new Date().toISOString()
      };

      await this.updateStatusForRemaining(task, history, commentUrl);
      console.log(`✅ ${this.responseAccount} responded to @pelpa333 post ${task.post_id}`);

    } catch (error) {
      console.error(`❌ Error processing response task ${task.id}:`, error);
      await this.updateTaskStatus(task.id, 'failed');
    }
  }

  private parseResponseHistory(raw?: string | null): ResponseHistory {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as ResponseHistory;
      }
    } catch {
      // Ignore parse error
    }

    // Legacy string response (assume FIZZ handled it)
    return raw
      ? {
          '@FIZZonAbstract': {
            response: raw,
            timestamp: ''
          }
        }
      : {};
  }

  private async updateStatusForRemaining(task: ResponseTask, history: ResponseHistory, lastUrl?: string | null): Promise<void> {
    const remaining = this.responderSequence.filter(handle => !history[handle]);
    const nextStatus = remaining.length === 0 ? 'posted' : 'pending_response';
    await this.updateTaskStatus(task.id, nextStatus, history, lastUrl || task.response_url || undefined);
  }

  private async updateTaskStatus(taskId: string, status: string, history?: ResponseHistory, responseUrl?: string): Promise<void> {
    try {
      const updateData: any = {
        status,
        processed_at: new Date().toISOString()
      };

      if (history) {
        updateData.generated_response = JSON.stringify(history);
      }

      if (responseUrl) {
        updateData.response_url = responseUrl;
      }

      const { error } = await supabase
        .from('response_queue')
        .update(updateData)
        .eq('id', taskId);

      if (error) {
        throw error;
      }

    } catch (error) {
      console.error('❌ Error updating task status:', error);
    }
  }

  async runResponseCycle(): Promise<void> {
    try {
      console.log(`🔄 [${this.responseAccount}] Starting Response Agent cycle...`);

      const pendingTasks = await this.checkForPendingResponses();

      if (pendingTasks.length === 0) {
        console.log(`📭 [${this.responseAccount}] No pending response tasks`);
        return;
      }

      // Initialize browser if needed
      if (!this.browser || !this.page) {
        console.log(`🚀 Initializing Response Agent browser for ${this.responseAccount}...`);
        await this.initialize();
      }

      console.log(`🎯 [${this.responseAccount}] Processing ${pendingTasks.length} response tasks...`);

      for (const task of pendingTasks) {
        await this.processResponseTask(task);
        
        // Add delay between responses to avoid rate limiting
        await this.page?.waitForTimeout(5000);
      }

      console.log(`✅ [${this.responseAccount}] Response Agent cycle completed`);

    } catch (error) {
      console.error('❌ Error in Response Agent cycle:', error);
    }
  }

  async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
    console.log(`✅ Response Agent (${this.responseAccount}) cleaned up`);
  }

  private isGarbage(text: string): boolean {
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
      'great'
    ];

    const lower = trimmed.toLowerCase();
    return blacklist.includes(lower);
  }

  private generateFallbackResponse(): string {
    const options = [
      'Interesting approach.',
      'This looks promising.',
      'Great innovation here.',
      'Exciting development.',
      'Love this direction.',
      'Solid progress here.',
      'This could be big.',
      'Nice work on this.',
      'Impressive development.',
      'Looking forward to this.'
    ];

    return options[Math.floor(Math.random() * options.length)]!;
  }
}
