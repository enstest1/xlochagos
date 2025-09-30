import { log } from '../log';
import { XApiService } from '../services/xApiService';
import { aiMemoryService } from '../services/aiMemoryService';
import { SourceItem } from '../types';

interface ResearchConfig {
  enabled: boolean;
  target_accounts: string[];
  max_posts_per_day: number;
  content_storage: boolean;
  research_interval_minutes: number;
  content_freshness_hours: number;
}

export class ResearchMonitor {
  private xApiService: XApiService;
  private config: ResearchConfig;
  private lastResearchCheck: number = 0;

  constructor(config: ResearchConfig) {
    this.config = config;
    this.xApiService = new XApiService();
  }

  async initializeXApi(username: string, password: string): Promise<boolean> {
    try {
      log.info({ username }, 'Initializing Research Monitor X API service');
      const success = await this.xApiService.login(username, password);
      
      if (success) {
        log.info({ username }, 'Research Monitor X API service initialized successfully');
      } else {
        log.error({ username }, 'Failed to initialize Research Monitor X API service');
      }
      
      return success;
    } catch (error) {
      log.error({ 
        username, 
        error: (error as Error).message 
      }, 'Error initializing Research Monitor X API service');
      return false;
    }
  }

  async collectResearchContent(): Promise<SourceItem[]> {
    if (!this.config.enabled) {
      log.info('Research monitoring is disabled');
      return [];
    }

    log.info({ 
      targetAccounts: this.config.target_accounts,
      maxPosts: this.config.max_posts_per_day 
    }, 'Starting research content collection');

    const researchItems: SourceItem[] = [];

    try {
      for (const account of this.config.target_accounts) {
        log.info({ account }, 'Collecting research content from account');
        
        try {
          const posts = await this.xApiService.getRecentPosts(account, 10);
          
          if (posts.length === 0) {
            log.info({ account }, 'No posts found from research account');
            continue;
          }

          for (const post of posts) {
            // Check if content is fresh enough
            const postAge = Date.now() - post.timestamp;
            const maxAge = this.config.content_freshness_hours * 60 * 60 * 1000;
            
            if (postAge > maxAge) {
              log.info({ 
                account, 
                postId: post.id, 
                ageHours: Math.round(postAge / (60 * 60 * 1000))
              }, 'Skipping old research content');
              continue;
            }

            // Create research item
            const researchItem: SourceItem = {
              url: post.url,
              primaryUrl: post.url,
              title: post.text.substring(0, 100) + '...',
              summary: post.text,
              score: this.calculateResearchScore(post, account),
              tags: [account, 'research', 'live_content'],
              extractedAt: Date.now()
            };

            researchItems.push(researchItem);

            // Store in Supabase if enabled
            if (this.config.content_storage) {
              await this.storeResearchContent(post, account);
            }

            log.info({ 
              account, 
              postId: post.id,
              score: researchItem.score,
              textPreview: post.text.substring(0, 50) + '...'
            }, 'Collected research content');
          }

        } catch (error) {
          log.error({ 
            account, 
            error: (error as Error).message 
          }, 'Error collecting research content from account');
        }
      }

      // Sort by score (highest first)
      researchItems.sort((a, b) => b.score - a.score);

      log.info({ 
        totalItems: researchItems.length,
        topScore: researchItems[0]?.score || 0
      }, 'Research content collection complete');

      this.lastResearchCheck = Date.now();
      return researchItems;

    } catch (error) {
      log.error({ 
        error: (error as Error).message 
      }, 'Error in research content collection');
      return [];
    }
  }

  private calculateResearchScore(post: any, account: string): number {
    let score = 0.5; // Base score

    // Boost for specific accounts
    const accountBoosts: Record<string, number> = {
      '@trylimitless': 0.9,
      '@bankrbot': 0.85,
      '@wallchain_xyz': 0.8
    };
    score += accountBoosts[account] || 0.5;

    // Boost for crypto/DeFi keywords
    const cryptoKeywords = ['DeFi', 'yield', 'protocol', 'staking', 'liquidity', 'swap', 'bridge'];
    const keywordMatches = cryptoKeywords.filter(keyword => 
      post.text.toLowerCase().includes(keyword.toLowerCase())
    ).length;
    score += keywordMatches * 0.1;

    // Boost for engagement indicators
    if (post.text.includes('🚀') || post.text.includes('💎')) score += 0.1;
    if (post.text.includes('announcing') || post.text.includes('launch')) score += 0.15;

    // Penalty for marketing speak
    const marketingPhrases = ['check this out', 'don\'t miss', 'limited time'];
    const marketingMatches = marketingPhrases.filter(phrase => 
      post.text.toLowerCase().includes(phrase.toLowerCase())
    ).length;
    score -= marketingMatches * 0.1;

    return Math.min(Math.max(score, 0), 1); // Clamp between 0 and 1
  }

  private async storeResearchContent(post: any, sourceAccount: string): Promise<void> {
    try {
      await aiMemoryService.storeMemory({
        account: '@aplep333',
        type: 'research_content',
        data: {
          source_account: sourceAccount,
          post_id: post.id,
          post_text: post.text,
          post_url: post.url,
          post_author: post.author,
          timestamp: new Date(post.timestamp).toISOString(),
          relevance_topics: this.extractTopics(post.text)
        },
        relevance_score: this.calculateResearchScore(post, sourceAccount),
        tags: ['research', sourceAccount, 'content_source', 'live_data']
      });

      log.info({ 
        sourceAccount, 
        postId: post.id 
      }, 'Stored research content in Supabase');

    } catch (error) {
      log.error({ 
        sourceAccount, 
        postId: post.id,
        error: (error as Error).message 
      }, 'Error storing research content');
    }
  }

  private extractTopics(text: string): string[] {
    const topics: string[] = [];
    
    const topicKeywords: Record<string, string[]> = {
      'DeFi': ['defi', 'yield', 'liquidity', 'swap', 'protocol'],
      'staking': ['staking', 'validator', 'rewards'],
      'bridge': ['bridge', 'cross-chain', 'multichain'],
      'launch': ['launch', 'announcing', 'coming soon'],
      'partnership': ['partnership', 'collaboration', 'integration']
    };

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(keyword => text.toLowerCase().includes(keyword))) {
        topics.push(topic);
      }
    }

    return topics;
  }

  shouldRunResearchCheck(): boolean {
    const intervalMs = this.config.research_interval_minutes * 60 * 1000;
    return Date.now() - this.lastResearchCheck > intervalMs;
  }

  getLastCheckTime(): Date {
    return new Date(this.lastResearchCheck);
  }
}

