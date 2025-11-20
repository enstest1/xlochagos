/**
 * Premium Content Generator Agent
 * Dedicated agent for generating high-quality airdrop-focused content for @pelpa333 manual posting
 */

import { log } from '../log';
import { llmService } from '../services/llmService';
import { ImageGeneratorAgent } from './imageGeneratorAgent';
import crypto from 'crypto';
import fs from 'fs';
import yaml from 'yaml';

interface PremiumTargetAccount {
  handle: string;
  category: string;
  niche: string;
  weight: number;
  scrape_replies: boolean;
  scrape_limit: number;
  enabled: boolean;
  note: string;
  url: string;
}

interface PremiumPost {
  content_text: string;
  content_hash: string;
  content_type: 'research'; // Must match database constraint: 'original', 'commentary', 'research', 'news'
  topic_tags: string[];
  quality_score: number;
  confidence_score: number;
  status: 'pending_manual_review';
  created_by_agent: 'premium_content_generator';
  metadata: {
    tier: 'premium';
    llm_generated: true;
    target_account: string;
    airdrop_focus: true;
    image_generated: boolean;
    image_url?: string;
  };
}

export class PremiumContentGeneratorAgent {
  private premiumTargets: PremiumTargetAccount[] = [];
  private config: any;
  private imageGenerator: ImageGeneratorAgent;
  
  constructor() {
    this.loadPremiumTargets();
    this.loadConfig();
    this.imageGenerator = new ImageGeneratorAgent();
  }
  
  private loadPremiumTargets(): void {
    try {
      const configPath = './config/target-accounts.yaml';
      const configFile = fs.readFileSync(configPath, 'utf8');
      const config = yaml.parse(configFile);
      
      // Filter for airdrop farming targets
      this.premiumTargets = (config.target_accounts || [])
        .filter((a: PremiumTargetAccount) => a.enabled && a.category === 'airdrop_farming');
      
      log.info({ 
        targetCount: this.premiumTargets.length,
        targets: this.premiumTargets.map(t => t.handle)
      }, '[Premium Generator] Loaded premium targets');
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Premium Generator] Failed to load targets');
      this.premiumTargets = [];
    }
  }
  
  private loadConfig(): void {
    try {
      const configPath = './config/agent-config.yaml';
      const configFile = fs.readFileSync(configPath, 'utf8');
      const fullConfig = yaml.parse(configFile);
      this.config = fullConfig.premium_content_generator || {
        posts_per_account: 3,
        use_image_generation: true,
        airdrop_focus: true
      };
      
      log.info({
        postsPerAccount: this.config.posts_per_account,
        useImages: this.config.use_image_generation,
        airdropFocus: this.config.airdrop_focus
      }, '[Premium Generator] Loaded config');
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Premium Generator] Failed to load config');
      this.config = { posts_per_account: 3, use_image_generation: true, airdrop_focus: true };
    }
  }
  
  /**
   * Main agent execution - Generate premium posts for @pelpa333
   */
  async run(): Promise<{ items_processed: number; items_created: number; items_failed: number }> {
    log.info('[Premium Generator] Starting premium content generation for @pelpa333...');
    
    try {
      // 1. Get intelligence from premium targets
      const intelligence = await this.getPremiumIntelligence();
      
      log.info({
        intelligence: intelligence.length,
        targets: this.premiumTargets.length
      }, '[Premium Generator] Retrieved premium intelligence');
      
      // 2. Generate premium posts
      const generatedPosts: PremiumPost[] = [];
      let failedCount = 0;
      
      for (const target of this.premiumTargets) {
        try {
          // Get intelligence for this specific target
          const targetIntelligence = intelligence.filter(item => 
            item.source_account === target.handle
          );
          
          if (targetIntelligence.length === 0) {
            log.warn({ target: target.handle }, '[Premium Generator] No intelligence found for target');
            continue;
          }
          
          // Generate 3 posts per target
          const postsPerTarget = this.config.posts_per_account || 3;
          for (let i = 0; i < postsPerTarget; i++) {
            try {
              const post = await this.generatePremiumPost(target, targetIntelligence, i);
              if (post) {
                await this.storePremiumPost(post);
                generatedPosts.push(post);
                log.info({ 
                  target: target.handle, 
                  postNumber: i + 1,
                  content: post.content_text.substring(0, 100) + '...'
                }, '[Premium Generator] Generated premium post');
              }
            } catch (error) {
              log.error({ 
                target: target.handle, 
                postNumber: i + 1,
                error: (error as Error).message 
              }, '[Premium Generator] Failed to generate post');
              failedCount++;
            }
          }
          
        } catch (error) {
          log.error({ 
            target: target.handle,
            error: (error as Error).message 
          }, '[Premium Generator] Failed to process target');
          failedCount++;
        }
      }
      
      log.info({
        targets: this.premiumTargets.length,
        generated: generatedPosts.length,
        failed: failedCount
      }, '[Premium Generator] Premium content generation complete');
      
      return {
        items_processed: this.premiumTargets.length,
        items_created: generatedPosts.length,
        items_failed: failedCount
      };
      
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Premium Generator] Critical error');
      throw error;
    }
  }
  
  /**
   * Generate a premium post for a specific target account
   */
  private async generatePremiumPost(
    target: PremiumTargetAccount, 
    intelligence: any[], 
    variationNumber: number
  ): Promise<PremiumPost | null> {
    try {
      // Select intelligence item for this variation
      const intelligenceItem = intelligence[variationNumber % intelligence.length];
      
      // Generate premium content using LLM
      const contentText = await this.generateAirdropContent(target, intelligenceItem);
      
      // Generate image if enabled
      let imageUrl = '';
      if (this.config.use_image_generation) {
        try {
          imageUrl = await this.generateAirdropImage(target, intelligenceItem);
        } catch (error) {
          log.warn({ error: (error as Error).message }, '[Premium Generator] Image generation failed');
        }
      }
      
      // Create content hash
      const contentHash = crypto.createHash('sha256').update(contentText).digest('hex').slice(0, 16);
      
      return {
        content_text: contentText,
        content_hash: contentHash,
        content_type: 'research', // Must be one of: 'original', 'commentary', 'research', 'news'
        topic_tags: [target.category, target.niche, 'airdrop', 'premium'],
        quality_score: 0.95, // Premium posts get highest quality score
        confidence_score: 0.9,
        status: 'pending_manual_review',
        created_by_agent: 'premium_content_generator',
        metadata: {
          tier: 'premium',
          llm_generated: true,
          target_account: target.handle,
          airdrop_focus: true,
          image_generated: !!imageUrl,
          image_url: imageUrl
        }
      };
      
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Premium Generator] Failed to generate premium post');
      return null;
    }
  }
  
  /**
   * Generate airdrop-focused content using LLM
   */
  private async generateAirdropContent(target: PremiumTargetAccount, intelligence: any): Promise<string> {
    try {
      const prompt = this.buildAirdropPrompt(target, intelligence);
      
      // Use LLM service to generate premium content
      const content = await llmService.generatePremiumContent(intelligence, null, 'twitter');
      
      // Ensure content is airdrop-focused and within character limits
      let finalContent = content;
      if (finalContent.length > 280) {
        finalContent = finalContent.substring(0, 277) + '...';
      }
      
      // Add airdrop-focused elements if not present
      if (!finalContent.toLowerCase().includes('airdrop') && !finalContent.toLowerCase().includes('farming')) {
        finalContent = `🚀 AIRDROP ALERT: ${finalContent}`;
      }
      
      return finalContent;
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Premium Generator] Failed to generate airdrop content');
      
      // Fallback to template-based content
      return this.generateFallbackAirdropContent(target, intelligence);
    }
  }
  
  /**
   * Build prompt for airdrop content generation
   */
  private buildAirdropPrompt(target: PremiumTargetAccount, intelligence: any): string {
    return `You are @pelpa333, a crypto influencer focused on airdrop farming and early crypto opportunities.

Target Account: ${target.handle}
Intelligence: ${intelligence.raw_content}

Generate a premium Twitter post about this airdrop opportunity that:
1. Focuses on airdrop farming potential
2. Highlights key benefits and opportunities
3. Uses engaging, informative language
4. Stays under 280 characters
5. Includes relevant hashtags
6. Appeals to crypto enthusiasts looking for airdrops

Make it sound like @pelpa333's authentic voice while being informative about the airdrop opportunity.`;
  }
  
  /**
   * Generate fallback airdrop content if LLM fails
   */
  private generateFallbackAirdropContent(target: PremiumTargetAccount, intelligence: any): string {
    const templates = [
      `🚀 AIRDROP ALERT: ${target.handle} has some interesting developments. This could be a great farming opportunity for early adopters. #Airdrop #Crypto`,
      `💎 FARMING OPPORTUNITY: ${target.handle} is showing promising signs. Worth keeping an eye on for potential airdrops. #DeFi #Airdrop`,
      `⚡ EARLY ACCESS: ${target.handle} might have airdrop potential. Time to start farming! #Crypto #Airdrop #Farming`
    ];
    
    const template = templates[Math.floor(Math.random() * templates.length)];
    return template || `🚀 AIRDROP ALERT: ${target.handle} showing potential for farming opportunities. #Airdrop #Crypto`;
  }
  
  /**
   * Generate airdrop-focused image
   */
  private async generateAirdropImage(target: PremiumTargetAccount, intelligence: any): Promise<string> {
    try {
      // For now, skip image generation to focus on content generation
      // TODO: Implement proper image generation later
      log.info({ target: target.handle }, '[Premium Generator] Skipping image generation for now');
      return '';
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Premium Generator] Failed to generate image');
      return '';
    }
  }
  
  /**
   * Scrape premium targets for fresh intelligence
   */
  private async scrapePremiumTargets(): Promise<void> {
    try {
      log.info({ targets: this.premiumTargets.map(t => t.handle) }, '[Premium Generator] Scraping premium targets...');
      
      // Import the target account scraper
      const { targetAccountScraper } = await import('../services/targetAccountScraper');
      
      // Initialize and scrape only premium targets
      await targetAccountScraper.initialize();
      
      // Scrape only the premium target accounts
      const targetHandles = this.premiumTargets.map(t => t.handle);
      const posts = await targetAccountScraper.scrapeSpecificTargetAccounts(targetHandles);
      
      // Store the intelligence
      if (posts.length > 0) {
        await targetAccountScraper.storeTargetAccountIntelligence(posts);
        log.info({ count: posts.length }, '[Premium Generator] Stored premium intelligence');
      }
      
      await targetAccountScraper.cleanup();
      log.info('[Premium Generator] Premium target scraping complete');
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Premium Generator] Failed to scrape premium targets');
    }
  }
  
  /**
   * Get intelligence from premium targets
   */
  private async getPremiumIntelligence(): Promise<any[]> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return [];
    }
    
    try {
      // First, scrape the premium targets to get fresh intelligence
      await this.scrapePremiumTargets();
      
      // Then get the intelligence from database
      const targetHandles = this.premiumTargets.map(t => t.handle);
      const handleFilter = targetHandles.map(handle => `source_account.eq.${handle}`).join(',');
      
      const response = await fetch(
        `${supabaseUrl}/rest/v1/raw_intelligence?${handleFilter}&processed_by_researcher=eq.true&order=extracted_at.desc&limit=100`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
          },
        }
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json() as any[];
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Premium Generator] Failed to get premium intelligence');
      return [];
    }
  }
  
  /**
   * Store premium post in content queue
   */
  private async storePremiumPost(post: PremiumPost): Promise<void> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase not configured');
    }
    
    const response = await fetch(`${supabaseUrl}/rest/v1/content_queue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(post)
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to store premium post: ${response.status} - ${error}`);
    }
  }
}

// Export singleton instance
export const premiumContentGenerator = new PremiumContentGeneratorAgent();
