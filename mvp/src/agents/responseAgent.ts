import { chromium, Browser, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { llmService } from '../services/llmService';
import { PelpaPost } from '../services/pelpa333Monitor';
import * as dotenv from 'dotenv';

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

export class ResponseAgent {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private readonly responseAccount = '@FIZZonAbstract';

  async initialize(): Promise<void> {
    try {
      this.browser = await chromium.launch({ 
        headless: false, // Keep visible for debugging
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
      
      console.log('✅ Response Agent initialized');
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
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      console.log(`📋 Found ${data?.length || 0} pending response tasks`);
      return data || [];

    } catch (error) {
      console.error('❌ Error checking for pending responses:', error);
      return [];
    }
  }

  async generateResponse(post: ResponseTask): Promise<string> {
    try {
      console.log(`🤖 Generating response for ${post.target_mentions.join(', ')} mention...`);

      const context = this.buildResponseContext(post);
      const prompt = this.buildResponsePrompt(post, context);

      // Create intelligence object for the LLM service
      const intelligence = {
        topic: `Response to @pelpa333 mentioning ${post.target_mentions.join(', ')}`,
        context,
        requirements: {
          tone: 'casual and engaging',
          length: 'very short (15-20 words maximum)',
          style: 'direct and relevant to the post content',
          includeCallToAction: false
        }
      };

      const response = await llmService.generatePremiumContent(
        intelligence,
        null, // No research data needed for responses
        'twitter'
      );

      // Validate word count and character count
      const wordCount = response.split(' ').length;
      const charCount = response.length;
      
      if (wordCount > 15 || charCount > 140) {
        console.log(`⚠️ Response too long (${wordCount} words, ${charCount} chars), creating short response...`);
        
        // Create a very short response based on the post content
        const shortResponses = [
          "Interesting approach!",
          "This looks promising.",
          "Great innovation here.",
          "Exciting development!",
          "Love this direction.",
          "Solid progress here.",
          "This could be big.",
          "Nice work on this.",
          "Impressive development.",
          "Looking forward to this."
        ];
        
        const randomResponse = shortResponses[Math.floor(Math.random() * shortResponses.length)];
        console.log(`✅ Short response: "${randomResponse}"`);
        return randomResponse || "Great work!";
      }

      console.log(`✅ Generated response: "${response}" (${wordCount} words)`);
      return response;

    } catch (error) {
      console.error('❌ Error generating response:', error);
      throw error;
    }
  }

  private buildResponseContext(post: ResponseTask): string {
    const targetAccount = post.target_mentions[0]; // Focus on primary mention
        
    const contextMap = {
      '@trylimitless': 'AI trading bots, algorithmic trading strategies, market analysis, bot performance metrics',
      '@wallchain_xyz': 'DeFi protocols, yield farming opportunities, protocol updates, liquidity mining',
      '@bankrbot': 'Banking integration, traditional finance convergence, RWA (Real World Assets), institutional adoption'
    };

    const relevantContext = contextMap[targetAccount as keyof typeof contextMap] || 'crypto and blockchain developments';
    
    return `Post by @pelpa333: "${post.post_text}"\n\nContext: ${relevantContext}\n\nGenerate a relevant, insightful response that adds value to the conversation.`;
  }

  private buildResponsePrompt(post: ResponseTask, context: string): string {
    return `You are @FIZZonAbstract. @pelpa333 posted: "${post.post_text}"

CRITICAL: Your response must be EXACTLY 15-20 words. Count your words carefully.

Examples of good responses (count the words):
- "Interesting approach! How's the performance so far?" (8 words)
- "This could be a game-changer for DeFi adoption." (9 words)
- "Love the innovation here. What's the next step?" (9 words)

Response (EXACTLY 15-20 words, count them):`;
  }

  async likePost(postUrl: string): Promise<boolean> {
    try {
      if (!this.page) {
        throw new Error('Response Agent not initialized');
      }

      console.log(`👍 Liking post: ${postUrl}`);
      
      await this.page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      
      // Wait for page to load
      await this.page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });
      
      // Find and click the like button
      const likeButton = await this.page.locator('[data-testid="like"]').first();
      
      if (await likeButton.isVisible()) {
        await likeButton.click();
        await this.page.waitForTimeout(2000);
        console.log('✅ Successfully liked the post');
        return true;
      } else {
        console.log('⚠️ Like button not found or already liked');
        return false;
      }

    } catch (error) {
      console.error('❌ Error liking post:', error);
      return false;
    }
  }

  async commentOnPost(postUrl: string, response: string): Promise<string | null> {
    try {
      if (!this.page) {
        throw new Error('Response Agent not initialized');
      }

      console.log(`💬 Commenting on post: ${postUrl}`);
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
      await textarea.type(response, { delay: 150 });
      
      // Trigger additional events
      await textarea.dispatchEvent('input');
      await textarea.dispatchEvent('change');
      await textarea.dispatchEvent('keyup');
      
      // Wait a moment for the text to be processed
      await this.page.waitForTimeout(2000);
      
      // Option 5: Use keyboard shortcut to submit
      await textarea.press('Control+Enter');
      
      // Wait for the reply to be posted
      await this.page.waitForTimeout(3000);
      
      // Get the URL of the posted reply
      const currentUrl = this.page.url();
      console.log('✅ Successfully posted comment');
      
      return currentUrl;

    } catch (error) {
      console.error('❌ Error commenting on post:', error);
      return null;
    }
  }

  async processResponseTask(task: ResponseTask): Promise<void> {
    try {
      console.log(`🎯 Processing response task for post ${task.post_id}...`);

      // Update status to generating
      await this.updateTaskStatus(task.id, 'generating_response');

      // Generate response
      const response = await this.generateResponse(task);

      // Update task with generated response
      await this.updateTaskWithResponse(task.id, response, 'response_ready');

      // Like the original post
      const liked = await this.likePost(task.post_url);
      if (!liked) {
        console.log('⚠️ Failed to like post, but continuing with comment');
      }

      // Comment on the post
      const commentUrl = await this.commentOnPost(task.post_url, response);

      if (commentUrl) {
        // Update task as completed
        await this.updateTaskStatus(task.id, 'posted', commentUrl);
        console.log(`✅ Successfully responded to @pelpa333 post ${task.post_id}`);
      } else {
        // Mark as failed
        await this.updateTaskStatus(task.id, 'failed');
        console.log(`❌ Failed to comment on @pelpa333 post ${task.post_id}`);
      }

    } catch (error) {
      console.error(`❌ Error processing response task ${task.id}:`, error);
      await this.updateTaskStatus(task.id, 'failed');
    }
  }

  private async updateTaskStatus(taskId: string, status: string, responseUrl?: string): Promise<void> {
    try {
      const updateData: any = {
        status,
        processed_at: new Date().toISOString()
      };

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

  private async updateTaskWithResponse(taskId: string, response: string, status: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('response_queue')
        .update({
          generated_response: response,
          status,
          processed_at: new Date().toISOString()
        })
        .eq('id', taskId);

      if (error) {
        throw error;
      }

    } catch (error) {
      console.error('❌ Error updating task with response:', error);
    }
  }

  async runResponseCycle(): Promise<void> {
    try {
      console.log('🔄 Starting Response Agent cycle...');

      const pendingTasks = await this.checkForPendingResponses();

      if (pendingTasks.length === 0) {
        console.log('📭 No pending response tasks');
        return;
      }

      // Initialize browser if needed
      if (!this.browser || !this.page) {
        console.log('🚀 Initializing Response Agent browser...');
        await this.initialize();
      }

      console.log(`🎯 Processing ${pendingTasks.length} response tasks...`);

      for (const task of pendingTasks) {
        await this.processResponseTask(task);
        
        // Add delay between responses to avoid rate limiting
        await this.page?.waitForTimeout(5000);
      }

      console.log('✅ Response Agent cycle completed');

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
    console.log('✅ Response Agent cleaned up');
  }
}

// Export singleton instance
export const responseAgent = new ResponseAgent();
