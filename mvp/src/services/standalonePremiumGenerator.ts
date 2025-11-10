import { log } from '../log';
import { llmService } from './llmService';
import { targetAccountScraper } from './targetAccountScraper';
import { ResearchAgent } from '../agents/researchAgent';
import { ImageGeneratorAgent } from '../agents/imageGeneratorAgent';
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
  posts_to_generate?: number;
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
  images?: any; // Add images field to the interface
}

export class StandalonePremiumGenerator {
  private premiumTargets: PremiumTarget[] = [];
  private hubAccount: AccountCfg;
  private researchAgent: ResearchAgent;
  private imageGenerator: ImageGeneratorAgent;

  constructor(hubAccount: AccountCfg) {
    this.hubAccount = hubAccount;
    this.researchAgent = new ResearchAgent();
    this.imageGenerator = new ImageGeneratorAgent();
    this.loadPremiumTargets();
  }

  private loadPremiumTargets(): void {
    try {
      const configPath = './config/target-accounts.yaml';
      const configFile = fs.readFileSync(configPath, 'utf8');
      const config = yaml.parse(configFile);
      
      const allTargets = config.target_accounts || [];
      log.info({ allTargetsCount: allTargets.length, allTargets: allTargets.map((t: any) => ({ handle: t.handle, enabled: t.enabled, category: t.category })) }, '[Standalone Premium] All targets from config');
      
      this.premiumTargets = allTargets
        .filter(
          (a: PremiumTarget) => a.enabled && a.category === 'airdrop_farming'
        )
        .map((target: PremiumTarget) => ({
          ...target,
          posts_to_generate: typeof target.posts_to_generate === 'number'
            ? Math.max(0, Math.floor(target.posts_to_generate))
            : 4
        }));
      log.info({ targets: this.premiumTargets.map(t => t.handle), count: this.premiumTargets.length }, '[Standalone Premium] Loaded premium targets');
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Standalone Premium] Failed to load premium targets config');
      this.premiumTargets = [];
    }
  }

  public async scrapePremiumTargets(): Promise<void> {
    try {
      const targetsToScrape = this.premiumTargets.filter(t => (t.posts_to_generate ?? 0) > 0);

      if (targetsToScrape.length === 0) {
        log.warn('[Standalone Premium] No targets enabled for scraping (posts_to_generate == 0)');
        return;
      }

      log.info({ targets: targetsToScrape.map(t => t.handle) }, '[Standalone Premium] Scraping premium targets...');
      
      await targetAccountScraper.initialize();
      const targetHandles = targetsToScrape.map(t => t.handle);
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
    log.info('[Standalone Premium] Skipping general research - will research individual posts only when special features detected...');
    // No general research - we'll research individual posts only when they contain special features
    // This prevents generic research from contaminating all posts
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
        const researchResult = await perplexityService.search(query); // Using cheaper 'sonar' model instead of 'sonar-deep-research'
        
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
      
      // Generate 4 posts per target account (using actual scraped posts)
      const generationTargets = this.premiumTargets.filter(t => (t.posts_to_generate ?? 0) > 0);

      log.info({ 
        totalTargets: generationTargets.length, 
        targets: generationTargets.map(t => `${t.handle}(${t.posts_to_generate ?? 0})`),
        totalIntelligence: intelligence.length,
        intelligenceByTarget: generationTargets.reduce((acc, t) => {
          acc[t.handle] = intelligence.filter(item => item.source_account === t.handle).length;
          return acc;
        }, {} as Record<string, number>)
      }, '[Standalone Premium] Starting post generation for all targets');
      
      for (const target of generationTargets) {
        const targetIntelligence = intelligence.filter(item => 
          item.source_account === target.handle
        );
        
        if (targetIntelligence.length === 0) {
          log.warn({ 
            target: target.handle, 
            totalIntelligence: intelligence.length,
            otherTargets: intelligence.map(i => i.source_account).filter((v, i, a) => a.indexOf(v) === i)
          }, '[Standalone Premium] No intelligence for target - skipping');
          continue;
        }

        // Pick the top interesting + diverse posts for this target
        // Generate 4 posts for each target
        const desiredCount = target.posts_to_generate ?? 4;
        const postCount = Math.max(0, desiredCount);
        const picked = this.pickTopInteresting(targetIntelligence, postCount);
        
        if (postCount === 0) {
          log.info({ target: target.handle }, '[Standalone Premium] Target configured for 0 posts - skipping generation');
          continue;
        }

        log.info({ target: target.handle, requested: postCount, found: targetIntelligence.length, picked: picked.length }, '[Standalone Premium] Post selection');
        const numPostsToGenerate = Math.min(picked.length, postCount); // Generate up to 4, or fewer if not enough intelligence
        
        for (let i = 1; i <= numPostsToGenerate; i++) {
          try {
            const { post, imagePath } = await this.generateAirdropPost(target, picked, i, numPostsToGenerate);
            posts.push(post);
            log.info({ 
              target: target.handle, 
              postNumber: i,
              postId: post.id,
              imagePath: imagePath || 'None'
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

      // IMPORTANT: Use the latest scraped posts regardless of processed flag to avoid repeating old items
      const response = await fetch(
        `${supabaseUrl}/rest/v1/raw_intelligence?${handleFilter}&order=extracted_at.desc&limit=100`,
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

      const items = await response.json() as any[];

      // Deduplicate by post_id when available to minimize repeats
      const seen = new Set<string>();
      const deduped = items.filter(it => {
        const pid = it.metadata?.post_id || it.id;
        if (seen.has(pid)) return false;
        seen.add(pid);
        return true;
      });

      return deduped;
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Standalone Premium] Failed to get researched intelligence');
      return [];
    }
  }

  // Select the top N interesting posts with diversity
  private pickTopInteresting(items: any[], maxCount: number): any[] {
    if (items.length === 0) return [];
    
    const scored = items.map(it => ({ it, score: this.computeInterestingness(it) }))
      .sort((a, b) => b.score - a.score);

    const selected: any[] = [];
    const seenTopics = new Set<string>();

    // First pass: prioritize diverse topics
    for (const s of scored) {
      const text: string = (s.it.raw_content || '').toLowerCase();
      const topicKey = this.topicSignature(text);
      if (!seenTopics.has(topicKey)) {
        selected.push(s.it);
        seenTopics.add(topicKey);
      }
      if (selected.length >= maxCount) break;
    }

    // Second pass: if we don't have enough diverse topics, fill with top-scoring posts regardless of topic
    if (selected.length < maxCount) {
      for (const s of scored) {
        if (selected.length >= maxCount) break;
        // Only add if not already selected
        if (!selected.includes(s.it)) {
          selected.push(s.it);
        }
      }
    }

    // If still not enough (fewer items than requested), return what we have
    return selected.length > 0 ? selected : items.slice(0, Math.min(maxCount, items.length));
  }

  private computeInterestingness(item: any): number {
    const text: string = (item.raw_content || '').toLowerCase();
    const hasLink = /https?:\/\//i.test(text);
    const lengthBonus = Math.min(0.2, (text.length / 200) * 0.2);

    // Special topics
    const boosts = [
      { re: /\bx\s*402\b|\bx402\b/i, w: 0.35 },
      { re: /farcaster/i, w: 0.2 },
      { re: /zora/i, w: 0.15 },
      { re: /prediction|market/i, w: 0.15 },
      { re: /ai|agent/i, w: 0.1 },
    ];
    let topicBoost = 0;
    for (const b of boosts) if (b.re.test(text)) topicBoost += b.w;

    const linkBonus = hasLink ? 0.1 : 0;
    const recencyBonus = 0.25; // items are already ordered by newest; give uniform recency bias

    return Math.min(1, 0.3 + lengthBonus + topicBoost + linkBonus + recencyBonus);
  }

  private topicSignature(text: string): string {
    if (/\bx\s*402\b|\bx402\b/i.test(text)) return 'x402';
    if (/farcaster/i.test(text)) return 'farcaster';
    if (/zora/i.test(text)) return 'zora';
    if (/prediction|market/i.test(text)) return 'prediction';
    if (/airdrop/i.test(text)) return 'airdrop';
    return 'general';
  }

  private getTopicDescription(
    hasX402: boolean, hasBanking: boolean, hasHTTP: boolean,
    hasTelegram: boolean, hasFarcaster: boolean, hasAutomation: boolean,
    hasMarket: boolean, hasSDK: boolean, hasWizard: boolean
  ): string {
    if (hasX402 || (hasHTTP && hasBanking)) {
      return 'The character appears within a glowing holographic HUD overlay floating above a cyberpunk cityscape. Neon blue/green UI elements display payment flows, circuit patterns, and cryptographic networks. Blurred city lights create depth.';
    } else if (hasTelegram || hasFarcaster || hasAutomation) {
      return 'The character is integrated into a futuristic messaging network visualization. Glowing data streams connect to distant nodes representing messaging platforms. Holographic chat interfaces float around the character. Network lines pulse with information flow.';
    } else if (hasMarket || hasBanking) {
      return 'The character is centered with luminous financial data streams and cryptocurrency flows orbiting around it. Abstract market visualizations show price movements as neon energy ribbons. Trading interfaces and chart patterns emerge in the background.';
    } else if (hasSDK || hasHTTP) {
      return 'The character floats within a holographic code visualization. Glowing lines of code, API endpoints, and network protocols surround it as geometric patterns. Circuit boards extend into the distance. Floating UI panels show developer tools.';
    } else if (hasWizard) {
      return 'The character appears as a digital arcane entity, holding a glowing blue orb containing cryptocurrency networks. Holographic runes and code patterns mix with mystical elements. Magical energy flows through the cyberpunk environment.';
    } else {
      return 'The character is integrated into a futuristic tech-themed scene with holographic UI elements, glowing data networks, and digital interfaces. Neon-lit architecture provides backdrop depth.';
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
    postNumber: number,
    totalPosts: number
  ): Promise<{ post: PremiumPost; imagePath: string | null }> {
    const postId = crypto.randomUUID();
    
    // Pick ONE actual scraped post to rewrite
    // Prioritize posts that mention x402 or key features, then fill with others
    const scorePost = (txt: string) => {
      const t = (txt || '').toLowerCase();
      let s = 0;
      if (/(^|\b)x\s*402\b/.test(t) || t.includes('x402')) s += 5;
      if (t.includes('wizard') || t.includes('orb')) s += 2;
      if (t.includes('zora')) s += 1;
      if (t.includes('farcaster')) s += 1;
      return s + Math.min(2, Math.floor((txt || '').length / 120));
    };

    const intelligenceSorted = [...intelligence].sort((a, b) =>
      scorePost((b.raw_content || '')) - scorePost((a.raw_content || ''))
    );

    const idx = (postNumber - 1) % intelligenceSorted.length;
    const intelligenceToRewrite = intelligenceSorted[idx];
    if (!intelligenceToRewrite) {
      log.error('[Standalone Premium] No intelligence to rewrite');
      throw new Error('No intelligence available for rewriting');
    }

    const originalPost = intelligenceToRewrite.raw_content || '';
    
    // STEP 1: Smart Research - Only research special features/technologies
    log.info('[Standalone Premium] Analyzing post for special features...');
    
    // Check if post contains special features that need research
    const specialFeaturePatterns = [
      /\bx\s*402\b/i,
      /\bx402\b/i,
      /ghost\s*in\s*the\s*shell/i,
      /zora/i,
      /farcaster/i,
      /prediction/i,
      /swap/i,
      /burn/i,
      /airdrop/i
    ];
    const hasSpecialFeatures = specialFeaturePatterns.some((re) => re.test(originalPost));
    
    let deepResearch = '';
    if (hasSpecialFeatures) {
      const researchPrompt = `You're analyzing a post from ${target.handle}:

POST:
${originalPost}

TASK: Identify ONLY special technical features/protocols mentioned (like x402, Zora, Farcaster, etc.). Explain what they are and why they're revolutionary for Bankr.

Focus on:
- Technical protocols mentioned
- Revolutionary features
- Why this matters for crypto/DeFi

Keep it brief (2-3 sentences max).`;

      try {
        const research = await llmService.generatePremiumContent(
          { content: researchPrompt, source_account: target.handle },
          null,
          'research'
        );
        deepResearch = research;
        log.info('[Standalone Premium] Special feature research completed');
      } catch (error) {
        log.error({ error: (error as Error).message }, '[Standalone Premium] Research failed');
      }
    } else {
      log.info('[Standalone Premium] No special features detected, skipping research');
    }

    // STEP 2: Brainstorm Revolutionary Angles
    log.info('[Standalone Premium] Brainstorming revolutionary angles...');
    const brainstormPrompt = `You found this post from ${target.handle}:

ORIGINAL POST:
${originalPost}

DEEP RESEARCH:
${deepResearch}

TASK: Brainstorm 5-7 novel, exciting use cases or implementations that people haven't thought of yet.

Focus on:
- Revolutionary implications for the crypto/DeFi space
- Wild use cases that haven't been explored
- How this could transform how people interact onchain
- Social/community impacts

Format each use case in 1 sentence.
Example: "Group betting in Telegram - imagine coordinating collective trades with friends"

Brainstorm now:`;

    let brainstormIdeas = '';
    try {
      const brainstorm = await llmService.generatePremiumContent(
        { content: brainstormPrompt, source_account: target.handle },
        null,
        'research'
      );
      brainstormIdeas = brainstorm;
      log.info('[Standalone Premium] Brainstorming completed');
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Standalone Premium] Brainstorming failed');
    }

    // Get account-level context
    const allResearchData = await this.getResearchDataForTarget(target.handle);
    const researchSummary = allResearchData.map(r => r.summary).join('\n\n');

    // STEP 3: Generate High-Engagement Twitter Content
    log.info('[Standalone Premium] Generating Twitter-optimized content...');
    
    // Analyze original post to detect if it contains someone else's first-person statements
    const hasPersonalClaim = /\b(I|I've|I'm|I'd|my|myself)\s+(claimed|tracked|got|earned|received|found|discovered|noticed|built|made|did|have|had)\b/i.test(originalPost);
    const hasSpecificNumbers = /\d+[,.]?\d*\s*\$?BNKR/i.test(originalPost);
    const isObservation = hasPersonalClaim || hasSpecificNumbers;
    
    const prompt = `YOUR ROLE: You're a crypto user who stumbled across something cool about ${target.handle} and wants to share it naturally. Write like you're texting a friend, not posting a press release.

CRITICAL RULES:
1. If the original mentions someone else's specific results (like "I claimed 222k $BNKR"), observe it - don't claim it as yours
2. Match the ENERGY and TONE of the original post - if it's technical, be technical; if it's casual, be casual
3. Vary your sentence structure - don't always start the same way
4. Write naturally - sometimes start with the feature, sometimes with context, sometimes with a question

ORIGINAL POST FROM ${target.handle}:
"${originalPost}"

CONTEXT (for understanding, not to copy):
${deepResearch || 'No special context'}
${brainstormIdeas ? `Possible angles: ${brainstormIdeas}` : ''}

TASK: Rewrite this authentically. Make it sound like a real person sharing something they actually care about.

WRITING GUIDELINES:
- Natural variation: Mix up how you start - sometimes dive right in, sometimes set context, sometimes ask a question
- Conversational tone: Use contractions, casual language, "IMO" when it fits, but don't force it
- Authentic reactions: Share real thoughts - excitement, skepticism, curiosity, comparisons
- Personal voice: Write like YOU think this matters, not like a PR team
- ${isObservation ? 'If original has specific numbers/claims, frame as observation: "Looks like...", "Seems...", "Interesting that..."' : 'Write naturally - no forced phrases. Start however feels right for THIS specific post.'}
- Keep it under 220 characters
- NO emojis or hashtags
- Include ${target.handle} naturally - like you're talking about them, not promoting them

EXAMPLES OF NATURAL STYLE (notice how they vary):

"@KASTcard allows bank transfers now? That's actually huge. Free virtual card too. Neobanks are crushing it rn."

"Someone mentioned claiming 222k $BNKR from @bankrbot weekly rewards. Rewards seem consistent - might be worth checking."

"@bankrbot's x402 SDK integration is wild. Between this and @glider_fi, there's almost no reason to manually trade anymore."

"@glider_fi and @KaitoAI partnered, but it's just a 20% boost for new signups via ref link. Doesn't help existing users. Wonder if they'll add a leaderboard later?"

"@bankrbot just launched their Security Module - over 1% of supply already staked. Interesting approach to network security."

"Trying out @wallchain's new SpeedRun feature. The 5X multiplier for Epoch 3 is tempting but curious about long-term sustainability."

"Noticed @kloutgg is working on real-time trading trends instead of another prediction market. Could be interesting if they execute well."

Write your rewrite naturally - make it YOUR voice reacting to THIS specific post:`;

    const content = await llmService.generatePremiumContent(
      { content: prompt, source_account: target.handle },
      { summary: researchSummary },
      'research'
    );

    // Generate image for the post (using scraped content and research as context)
    let imagePath = null;
    try {
      log.info({ target: target.handle }, '[Standalone Premium] Generating image...');
      
      // Create prompt for image generation based on content and target account
      const accountName = target.handle.replace('@', '').replace('_', ' ').replace('-', ' ');
      
      // Select base image based on target account
      // Map account handles to their base image files
      const accountHandle = target.handle.replace('@', '').toLowerCase();
      let baseImagePath = `./assets/bankr-bot/AriqgxQN_400x400.jpg`; // Default to Bankr bot
      
      if (accountHandle === 'bankrbot' || accountHandle === 'bankr') {
        baseImagePath = `./assets/bankr-bot/AriqgxQN_400x400.jpg`;
      } else if (accountHandle === 'wallchain' || accountHandle === 'wallchain_xyz') {
        baseImagePath = `./assets/wallchain/wallchain.jpg`;
      } else if (accountHandle === 'kloutgg' || accountHandle === 'klout') {
        baseImagePath = `./assets/kloutgg/kloutgg.jpg`;
      }
      
      // Check if image exists, fallback to default if not
      if (!fs.existsSync(baseImagePath)) {
        log.warn({ accountHandle, attemptedPath: baseImagePath }, '[Standalone Premium] Base image not found, using default');
        baseImagePath = `./assets/bankr-bot/AriqgxQN_400x400.jpg`;
      }
      
      // Create a contextual prompt based on the specific post content
      const shortPost = originalPost.replace(/\s+/g, ' ').trim().slice(0, 280);
      
      // Comprehensive topic detection - Mix Ghost in the Shell with random artistic styles
      const lowerPost = originalPost.toLowerCase();
      
      // Random artistic style variations to add variety - expanded pool for true randomness
      const artisticStyles = [
        { name: "Dalí-surrealist", desc: "Surreal melting landscapes with distorted perspectives, dreamlike vast horizons, rubber duck elements floating" },
        { name: "50's comic book", desc: "Bold Pop Art aesthetics with Ben-Day dots, thick black outlines, primary colors, dramatic action lines" },
        { name: "surf-culture retro", desc: "Vibrant vintage surf aesthetic with palm trees, beach waves, 60s California color palette, sun-faded tones" },
        { name: "medieval fantasy", desc: "Gothic architecture, ornate tapestries, castles, dragons, illuminated manuscript borders, rich deep colors" },
        { name: "cyberpunk noir", desc: "Blade Runner aesthetics, rain-soaked neon-lit streets, dark shadows, futuristic detective atmosphere" },
        { name: "vaporwave synthwave", desc: "Retro-futuristic 80s aesthetic, grid patterns, pastel gradients, palm trees, sunsets, nostalgia" },
        { name: "japanese woodblock", desc: "Ukiyo-e style with bold flat colors, stylized nature, iconic wave patterns, traditional Japanese composition" },
        { name: "art deco", desc: "Geometric patterns, bold gold accents, symmetry, luxury aesthetics, roaring 20s elegance" },
        { name: "grunge grimy", desc: "Raw urban textures, distressed edges, overlaid elements, high contrast, street art vibes" },
        { name: "minimalist modern", desc: "Clean lines, negative space, bold simple forms, modern design, contemporary elegance" },
        { name: "impressionist painterly", desc: "Brushstroke textures, visible paint application, soft color blending, dappled light effects, Monet-like atmosphere" },
        { name: "Bauhaus geometric", desc: "Clean geometric forms, primary colors, sans-serif typography, grid-based composition, modernist simplicity" },
        { name: "psychedelic 60s", desc: "Vibrant tie-dye patterns, swirling mandalas, optical illusions, Day-Glo colors, peace symbols" },
        { name: "steampunk Victorian", desc: "Brass gears, steam engines, Victorian fashion, clockwork mechanisms, brown and bronze palette" },
        { name: "post-apocalyptic wasteland", desc: "Desert ruins, rusted metal, dust storms, muted browns and oranges, industrial decay" },
        { name: "glitch art digital", desc: "RGB channel separation, data corruption aesthetics, pixel distortion, digital artifacts, tech glitch vibes" },
        { name: "baroque ornate", desc: "Elaborate decorative details, dramatic chiaroscuro lighting, rich velvets, ornate gold frames, theatrical composition" },
        { name: "constructivist Russian", desc: "Dynamic diagonal compositions, red and black color scheme, industrial symbols, bold geometric shapes" },
        { name: "kawaii cute", desc: "Bright cheerful colors, rounded soft forms, sparkles and stars, big eyes, playful anime aesthetics" },
        { name: "film noir monochrome", desc: "High contrast black and white, dramatic shadows, venetian blind patterns, cigarette smoke, atmospheric" },
        { name: "abstraction expressionist", desc: "Bold brush strokes, emotional intensity, chaotic energy, non-representational forms, expressive paint" },
        { name: "brutalist concrete", desc: "Raw concrete textures, massive geometric structures, heavy shadows, monochromatic palette, architectural brutalism" },
        { name: "neon signage Hong Kong", desc: "Dense neon light displays, Chinese characters, narrow alleys, vibrant warm glow, cyberpunk city vibes" },
        { name: "Byzantine mosaic", desc: "Gold leaf backgrounds, tessellated patterns, religious iconography, rich jewel tones, intricate tile work" },
        { name: "punk rock DIY", desc: "Hand-drawn elements, safety pins, ripped textures, anarchist symbols, rebellious street aesthetic" }
      ];
      
      // Pick a random style for this post
      const randomStyle = artisticStyles[Math.floor(Math.random() * artisticStyles.length)]!;
      
      // Detect topics with priority order (more specific first)
      const hasX402 = /\bx\s*402\b|\bx402\b|payment\s+protocol/i.test(lowerPost);
      const hasBanking = /banking|bank|capital\s+markets|fair\s+launch/i.test(lowerPost);
      const hasHTTP = /https?|http|web|api|endpoint|protocol/i.test(lowerPost);
      const hasTelegram = /telegram|tg|dm|direct\s+message/i.test(lowerPost);
      const hasFarcaster = /farcaster|fc|farcaster\s+dm/i.test(lowerPost);
      const hasAutomation = /automate|automation|nightly|summary|scheduled|auto/i.test(lowerPost);
      const hasMarket = /market|trading|price|chart|defi|swap|token|coin/i.test(lowerPost);
      const hasSDK = /sdk|develop|api|code|query|chain|integrate/i.test(lowerPost);
      const hasWizard = /wizard|orb|fantasy|arcane/i.test(lowerPost);
      
      // Random anime/animation base styles for variety
      const animeBaseStyles = [
        { name: "Ghost in the Shell", desc: "Cyberpunk anime aesthetic with holographic HUD overlays, neon-lit cityscapes, philosophical tech atmosphere, detailed mechanical elements" },
        { name: "Akira", desc: "Dark cyberpunk animation style with intense colors, motorcycle action, Neo-Tokyo dystopian atmosphere, hand-drawn detail" },
        { name: "Studio Ghibli", desc: "Whimsical hand-painted aesthetic with soft pastels, magical realism, detailed nature backgrounds, warm lighting, Miyazaki style" },
        { name: "Neon Genesis Evangelion", desc: "Psychological sci-fi anime with religious symbolism, geometric patterns, intense dramatic lighting, apocalyptic atmosphere" },
        { name: "Cowboy Bebop", desc: "Noir jazz aesthetic with space western vibes, muted earth tones, cinematic framing, retro-futuristic technology" },
        { name: "Attack on Titan", desc: "Dramatic action anime with dynamic camera angles, intense shadows, epic scale compositions, dark fantasy atmosphere" },
        { name: "Demon Slayer", desc: "Beautiful watercolor effects, flowing particle animations, vibrant elemental powers, traditional Japanese aesthetics" },
        { name: "One Piece", desc: "Energetic cartoon style with exaggerated expressions, bold outlines, vibrant tropical colors, adventurous pirate atmosphere" },
        { name: "JoJo's Bizarre Adventure", desc: "Fashion-forward aesthetic with dramatic poses, bold color schemes, muscular character design, high-fashion poses" },
        { name: "Your Name (Makoto Shinkai)", desc: "Hyper-realistic backgrounds with photorealistic skies, beautiful weather effects, soft romantic lighting, detailed cityscapes" },
        { name: "Paprika (Satoshi Kon)", desc: "Surreal dreamlike animation with fluid transformations, reality-bending visuals, psychological horror elements, vibrant colors" },
        { name: "Cyberpunk: Edgerunners", desc: "Bright neon cyberpunk with intense color saturation, fast-paced action, brutalist architecture, cybernetic enhancements" },
        { name: "Arcane (League of Legends)", desc: "3D painted aesthetic with cinematic lighting, steampunk elements, rich textures, dramatic character close-ups" },
        { name: "Spirited Away", desc: "Magical realism with detailed environments, mystical creatures, soft watercolor effects, traditional Japanese architecture" },
        { name: "Blade Runner Black Lotus", desc: "Dark sci-fi animation with rain-soaked streets, neon reflections, film noir atmosphere, technological dystopia" },
        { name: "The Animatrix", desc: "Anthology style mixing multiple animation techniques, cyberpunk themes, varied artistic approaches, Matrix universe" },
        { name: "Redline", desc: "Hyper-detailed hand-drawn animation with extreme motion blur, vibrant colors, high-speed action, retro-futuristic racing" },
        { name: "Tron: Uprising", desc: "Digital grid aesthetics with neon lines, geometric patterns, light cycle trails, virtual world environments" },
        { name: "Final Fantasy: Advent Children", desc: "Realistic CGI anime with detailed character models, epic fantasy battles, magical particle effects, cinematic quality" },
        { name: "The Legend of Korra", desc: "Western animation style with Asian influences, dynamic action choreography, steampunk elements, elemental powers" }
      ];
      
      // Randomly select anime base style
      const randomAnimeBase = animeBaseStyles[Math.floor(Math.random() * animeBaseStyles.length)]!;
      
      // Build scene with random anime base + random artistic style + topic-specific elements
      let sceneDirective = '';
      const topicDescription = this.getTopicDescription(hasX402, hasBanking, hasHTTP, hasTelegram, hasFarcaster, hasAutomation, hasMarket, hasSDK, hasWizard);
      
      // Combine: Random Anime Base + Random Artistic Style + Topic elements
      sceneDirective = `MANDATORY STYLE: ${randomAnimeBase.name} animation aesthetic creatively fused with ${randomStyle.name} artistic style. ${randomAnimeBase.desc}. ${randomStyle.desc}. ${topicDescription}`;
      
      log.info({ animeBase: randomAnimeBase.name, artisticStyle: randomStyle.name, target: target.handle }, '[Standalone Premium] Selected random base and artistic styles');
      
      // Build the prompt with explicit instructions to USE the provided image
      const contextualPrompt = `You are creating an image-to-image transformation. The provided base image shows the Bankr bot character - you MUST use THIS EXACT CHARACTER in your output, just place it in a new scene.

WHAT TO DO:
1. Look at the provided base image - this is the Bankr bot character you MUST include
2. Take that exact character and place it in the scene described below
3. Do NOT create a new character or simplify it - use the actual Bankr bot from the image

Context (for scene only, never render text): "${shortPost}"

${sceneDirective}

MANDATORY CHARACTER REQUIREMENTS:
- The Bankr bot character from the provided base image MUST appear in the final output
- Use the actual character design, proportions, and style from the base image
- Place this character in the scene - do NOT replace it with a generic computer or pixelated face
- The character should be clearly recognizable as the Bankr bot from your input image

SCENE REQUIREMENTS:
- Style: Ghost in the Shell anime / cyberpunk aesthetic with holographic elements
- Lighting: Cinematic, volumetric glow, strong rim lights, neon accents
- Palette: Deep purple/black backgrounds, neon cyan/teal/green for tech elements, warm orange accents
- Composition: Bankr bot character is the central focus, integrated naturally into the scene
- Quality: Professional digital art, anime-inspired stylization, high detail

TECHNICAL:
- Square 1:1 format (1024x1024px minimum)
- NO text, logos, UI mockups, charts, or watermarks
- Output only the image - no captions

Transform the provided Bankr bot character into this scene while keeping the character recognizable and faithful to the base image.`;

      // Generate the image WITH the bankr bot base image
      const imageResults = await this.imageGenerator.generateImage(contextualPrompt, postId, { 
        baseImagePath: baseImagePath 
      });
      
      if (imageResults && imageResults.length > 0) {
        imagePath = imageResults[0].local_path;
        log.info({ imagePath }, '[Standalone Premium] Image generated successfully');
      }
      
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Standalone Premium] Image generation error');
    }
    
    const post: PremiumPost = {
      id: postId,
      content_text: content.trim(),
      content_hash: crypto.createHash('sha256').update(content.trim()).digest('hex'),
      content_type: 'research',
      topic_tags: [target.handle, 'airdrop_farming', 'premium'],
      quality_score: 0.9, // High quality for premium posts
      status: 'pending_manual_review',
      created_by_agent: 'standalone_premium_generator',
      created_at: new Date().toISOString(),
      images: imagePath ? { images: [{ local_path: imagePath }], primary_image: 0 } : undefined
    };
    
    return { post, imagePath };
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
