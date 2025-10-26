import { log } from '../log';
import { llmService } from './llmService';
import { targetAccountScraper } from './targetAccountScraper';
import { ResearchAgent } from '../agents/researchAgent';
import { AccountCfg } from '../config/accountsNew';
import crypto from 'crypto';
import fs from 'fs';
import yaml from 'yaml';

interface PremiumTarget {
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
  id: string;
  content_text: string;
  content_hash: string;
  content_type: string;
  topic_tags: string[];
  quality_score: number;
  status: string;
  created_by_agent: string;
  created_at: string;
}

export class StandalonePremiumGenerator {
  private premiumTargets: PremiumTarget[] = [];
  private hubAccount: AccountCfg;
  private researchAgent: ResearchAgent;

  constructor(hubAccount: AccountCfg) {
    this.hubAccount = hubAccount;
    this.researchAgent = new ResearchAgent();
    this.loadPremiumTargets();
  }

  private loadPremiumTargets(): void {
    try {
      const configPath = './config/target-accounts.yaml';
      const configFile = fs.readFileSync(configPath, 'utf8');
      const config = yaml.parse(configFile);
      
      this.premiumTargets = (config.target_accounts || []).filter(
        (a: PremiumTarget) => a.enabled && a.category === 'airdrop_farming'
      );
      log.info({ targets: this.premiumTargets.map(t => t.handle), count: this.premiumTargets.length }, '[Standalone Premium] Loaded premium targets');
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Standalone Premium] Failed to load premium targets config');
      this.premiumTargets = [];
    }
  }

  public async scrapePremiumTargets(): Promise<void> {
    try {
      log.info({ targets: this.premiumTargets.map(t => t.handle) }, '[Standalone Premium] Scraping premium targets...');
      
      await targetAccountScraper.initialize();
      const targetHandles = this.premiumTargets.map(t => t.handle);
      const posts = await targetAccountScraper.scrapeSpecificTargetAccounts(targetHandles);
      
      if (posts.length > 0) {
        await targetAccountScraper.storeTargetAccountIntelligence(posts);
        log.info({ count: posts.length }, '[Standalone Premium] Stored premium intelligence');
      }
      
      await targetAccountScraper.cleanup();
      log.info('[Standalone Premium] Premium target scraping complete');
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Standalone Premium] Failed to scrape premium targets');
      throw error;
    }
  }

  public async researchPremiumIntelligence(): Promise<void> {
    log.info('[Standalone Premium] Researching premium intelligence with account-specific focus...');
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        log.error('[Standalone Premium] Supabase URL or Key not configured');
        return;
      }

      // Get intelligence from database for premium targets
      const targetHandles = this.premiumTargets.map(t => t.handle);
      const handleFilter = targetHandles.map(handle => `source_account.eq.${handle}`).join(',');

      const response = await fetch(
        `${supabaseUrl}/rest/v1/raw_intelligence?${handleFilter}&processed_by_researcher=eq.false&order=extracted_at.desc&limit=100`,
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
      
      const intelligence = await response.json() as any[];
      
      if (intelligence.length === 0) {
        log.warn('[Standalone Premium] No intelligence found for research');
        return;
      }
      
      // Research each premium target account specifically
      await this.researchAccountSpecificIntelligence(intelligence);
      
      // Mark as processed
      await this.markIntelligenceAsProcessed(intelligence.map(i => i.id));
      
      log.info({ count: intelligence.length }, '[Standalone Premium] Research complete');
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Standalone Premium] Failed to research intelligence');
      throw error;
    }
  }

  private async researchAccountSpecificIntelligence(intelligence: any[]): Promise<void> {
    // Group intelligence by account
    const byAccount = intelligence.reduce((acc, item) => {
      if (!acc[item.source_account]) acc[item.source_account] = [];
      acc[item.source_account].push(item);
      return acc;
    }, {} as Record<string, any[]>);

    // Research each account
    for (const [account, items] of Object.entries(byAccount)) {
      log.info({ account, itemCount: (items as any[]).length }, '[Standalone Premium] Researching account-specific intelligence');
      
      try {
        await this.researchAccountIntelligence(account, items as any[]);
      } catch (error) {
        log.error({ account, error: (error as Error).message }, '[Standalone Premium] Failed to research account');
      }
    }
  }

  private async researchAccountIntelligence(accountHandle: string, intelligence: any[]): Promise<void> {
    const { perplexityService } = await import('../services/perplexityService');
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) return;

    // Extract key content from intelligence
    const recentContent = intelligence
      .slice(0, 10)
      .map(i => i.raw_content || i.content || '')
      .filter(c => c.length > 0)
      .join('\n\n---\n\n');

    if (!recentContent) return;

    const accountName = accountHandle.replace('@', '');

    // Research queries for airdrop farming engagement
    const researchQueries = [
      {
        topic: `${accountHandle} - Account Analysis`,
        query: `What is ${accountHandle} (${accountName})? What do they do? What are their main products, features, or services? Focus on recent developments and what makes them unique.`
      },
      {
        topic: `${accountHandle} - Airdrop Potential`,
        query: `Does ${accountHandle} (${accountName}) have a token or potential for airdrops? What are the user incentives and rewards? How can users earn or qualify for airdrops through engagement?`
      },
      {
        topic: `${accountHandle} - Recent Activity`,
        query: `What are the most recent developments, partnerships, features, or announcements from ${accountHandle} (${accountName})? Focus on the last 7 days.`
      }
    ];

    // Perform research for each query
    for (const { topic, query } of researchQueries) {
      try {
        const researchResult = await perplexityService.research(query);
        
        if (researchResult) {
          // Store research in database
          await this.storeResearchData({
            topic,
            query,
            triggered_by_intelligence_ids: intelligence.map(i => i.id),
            research_results: researchResult,
            key_insights: [],
            sources: researchResult.sources || [],
            summary: researchResult.content || '',
            created_at: new Date().toISOString(),
            quality_score: 0.9
          });
          
          log.info({ topic }, '[Standalone Premium] Stored research data');
        }
      } catch (error) {
        log.error({ topic, error: (error as Error).message }, '[Standalone Premium] Failed to research topic');
      }
    }
  }

  private async markIntelligenceAsProcessed(intelligenceIds: string[]): Promise<void> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) return;

    for (const id of intelligenceIds) {
      try {
        await fetch(`${supabaseUrl}/rest/v1/raw_intelligence?id=eq.${id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ processed_by_researcher: true })
        });
      } catch (error) {
        log.error({ id, error: (error as Error).message }, '[Standalone Premium] Failed to mark as processed');
      }
    }
  }

  private async storeResearchData(data: any): Promise<void> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) return;

    try {
      await fetch(`${supabaseUrl}/rest/v1/research_data`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Standalone Premium] Failed to store research data');
    }
  }

  async generatePremiumPosts(): Promise<void> {
    try {
      log.info('[Standalone Premium] Generating premium posts...');
      
      // Get researched intelligence
      const intelligence = await this.getResearchedIntelligence();
      
      if (intelligence.length === 0) {
        log.warn('[Standalone Premium] No researched intelligence found for content generation');
        return;
      }

      const posts: PremiumPost[] = [];
      
      // Generate 2 posts per target account
      for (const target of this.premiumTargets) {
        const targetIntelligence = intelligence.filter(item => 
          item.source_account === target.handle
        );
        
        if (targetIntelligence.length === 0) {
          log.warn({ target: target.handle }, '[Standalone Premium] No intelligence for target');
          continue;
        }

        // Generate 2 posts per target account
        for (let i = 1; i <= 2; i++) {
          try {
            const post = await this.generateAirdropPost(target, targetIntelligence, i);
            posts.push(post);
            log.info({ 
              target: target.handle, 
              postNumber: i,
              postId: post.id 
            }, '[Standalone Premium] Generated post');
          } catch (error) {
            log.error({ 
              target: target.handle, 
              postNumber: i,
              error: (error as Error).message 
            }, '[Standalone Premium] Failed to generate post');
          }
        }
      }

      // Store posts in database
      await this.storePremiumPosts(posts);
      
      log.info({ 
        totalPosts: posts.length,
        targets: this.premiumTargets.length 
      }, '[Standalone Premium] Premium post generation complete');
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Standalone Premium] Failed to generate premium posts');
      throw error;
    }
  }

  private async getResearchedIntelligence(): Promise<any[]> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return [];
    }
    
    try {
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
      log.error({ error: (error as Error).message }, '[Standalone Premium] Failed to get researched intelligence');
      return [];
    }
  }

  private async getResearchDataForTarget(handle: string): Promise<any[]> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return [];
    }
    
    try {
      // Search for research data related to this account
      const accountName = handle.replace('@', '');
      const response = await fetch(
        `${supabaseUrl}/rest/v1/research_data?topic=ilike.*${accountName}*&order=created_at.desc&limit=5`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
          },
        }
      );
      
      if (!response.ok) {
        return [];
      }
      
      return await response.json() as any[];
    } catch (error) {
      log.error({ error: (error as Error).message, handle }, '[Standalone Premium] Failed to get research data for target');
      return [];
    }
  }

  private async generateAirdropPost(
    target: PremiumTarget, 
    intelligence: any[], 
    postNumber: number
  ): Promise<PremiumPost> {
    const postId = crypto.randomUUID();
    
    // Create context from actual scraped content
    const recentPosts = intelligence
      .slice(0, 5) // Take top 5 most recent
      .map(item => `${item.raw_content || item.content || 'No content available'}`)
      .join('\n\n---\n\n');

    // Get research data for this specific account
    const researchData = await this.getResearchDataForTarget(target.handle);
    const researchSummary = researchData.map(r => r.summary).join('\n\n');

    // Generate engaging airdrop-focused content
    const prompt = `You are @pelpa333, an expert at airdrop farming through community engagement. Create a compelling, insightful Twitter post that will attract attention from ${target.handle} and their community.

TARGET ACCOUNT: ${target.handle} (${target.note})
ACCOUNT URL: ${target.url}

RECENT POSTS FROM THE ACCOUNT:
${recentPosts}

ACCOUNT RESEARCH:
${researchSummary || 'No additional research available'}

REQUIREMENTS (STRICT - FOLLOW ALL):
1. Tag ${target.handle} to get their attention
2. Focus on what makes this project exciting or unique based on their recent posts
3. Highlight potential airdrop opportunities or community value
4. Use relevant emojis (2-4 max)
5. Include a question or call-to-action to encourage engagement
6. Keep under 260 characters
7. Sound natural, enthusiastic, and knowledgeable
8. 90% intelligent insights, 10% humor/creative suggestion (only if highly relevant)
9. Don't be obvious or salesy
10. Make it specific to what they're actually doing/talking about

Example high-quality post format:
"${target.handle.replace('@', '')} is [specific insight from their posts] - [why it matters]. [Question or CTA]. [emoji]"

Generate ONE exceptional post that will drive engagement and airdrop rewards:`;

    const content = await llmService.generatePremiumContent(
      { content: prompt, source_account: target.handle },
      { summary: researchSummary },
      'research'
    );
    
    return {
      id: postId,
      content_text: content.trim(),
      content_hash: crypto.createHash('sha256').update(content.trim()).digest('hex'),
      content_type: 'research',
      topic_tags: [target.handle, 'airdrop_farming', 'premium'],
      quality_score: 0.9, // High quality for premium posts
      status: 'pending_manual_review',
      created_by_agent: 'standalone_premium_generator',
      created_at: new Date().toISOString()
    };
  }

  private async storePremiumPosts(posts: PremiumPost[]): Promise<void> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      log.error('[Standalone Premium] Missing Supabase credentials');
      return;
    }

    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/content_queue`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(posts)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      log.info({ count: posts.length }, '[Standalone Premium] Stored premium posts in database');
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Standalone Premium] Failed to store premium posts');
      throw error;
    }
  }
}
