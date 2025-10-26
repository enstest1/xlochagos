/**
 * Agent 2: Research Agent
 * Conducts deep research using Perplexity MCP on trending topics
 */

import { log } from '../log';
import { llmService } from '../services/llmService';
import { perplexityService } from '../services/perplexityService';
import fs from 'fs';
import yaml from 'yaml';

interface ResearchTopic {
  topic: string;
  query_template: string;
  category: string;
  frequency: string;
  priority: string;
  enabled: boolean;
}

interface DynamicTopic {
  topic: string;
  source: 'scraped_content' | 'curated_list';
  relevance_score: number;
  trigger_keywords: string[];
  intelligence_ids: string[];
}

interface ResearchData {
  topic: string;
  query: string;
  triggered_by_intelligence_ids: string[];
  research_results: any;
  key_insights: string[];
  sources: string[];
  summary: string;
  created_at: string;
  quality_score: number;
}

export class ResearchAgent {
  private topics: ResearchTopic[] = [];
  private cryptoDiscoveryTopics: string[] = [];
  private dynamicConfig: any = {};
  private researchConfig: any = {};
  
  constructor() {
    this.loadResearchTopics();
  }
  
  private loadResearchTopics() {
    try {
      const configPath = './config/research-topics.yaml';
      const configFile = fs.readFileSync(configPath, 'utf8');
      const config = yaml.parse(configFile);
      
      // Load crypto discovery topics only
      this.cryptoDiscoveryTopics = config.crypto_discovery_topics || [];
      
      // Load dynamic extraction config
      this.dynamicConfig = config.dynamic_extraction || {};
      
      // Load research settings
      this.researchConfig = config.research || {};
      
      // Load fallback topics
      this.topics = (config.fallback_topics || []).filter((t: ResearchTopic) => t.enabled);
      
      log.info({ 
        cryptoDiscoveryTopicCount: this.cryptoDiscoveryTopics.length,
        dynamicExtractionEnabled: this.dynamicConfig.enabled,
        maxAge: this.researchConfig.timeframes?.max_age || '8 days'
      }, '[Agent 2] Loaded crypto discovery research configuration');
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Agent 2] Failed to load research topics');
      this.topics = [];
    }
  }
  
  /**
   * Main agent execution
   */
  async run(): Promise<{ items_processed: number; items_created: number; items_failed: number }> {
    log.info('[Agent 2] Starting research agent...');
    
    try {
      // 1. Get unprocessed intelligence from Agent 1
      const unprocessedIntelligence = await this.getUnprocessedIntelligence();
      
      log.info({ 
        count: unprocessedIntelligence.length 
      }, '[Agent 2] Found unprocessed intelligence');
      
      // 2. Extract trending topics from intelligence
      const trendingTopics = await this.extractTrendingTopics(unprocessedIntelligence);
      
      log.info({ 
        trending: trendingTopics.length 
      }, '[Agent 2] Extracted trending topics');
      
      // 3. Generate dynamic topics from scraped content + curated topics
      const dynamicTopics = await this.generateDynamicTopics(unprocessedIntelligence);
      
      // 4. Research each topic with Perplexity MCP
      const researchResults: ResearchData[] = [];
      let failedCount = 0;
      
      for (const topic of dynamicTopics.slice(0, 10)) {  // Limit to 10 per cycle
        try {
          const timeframe = this.getTimeframeForFrequency(topic.frequency);
          const query = topic.query_template.replace('{timeframe}', timeframe);
          
          log.info({ topic: topic.topic, query }, '[Agent 2] Researching topic...');
          
          // Call Perplexity MCP
          const research = await this.conductPerplexityResearch(query, topic);
          
          if (research) {
            researchResults.push(research);
            
            // Store in Supabase
            await this.storeResearch(research);
          }
          
        } catch (error) {
          log.error({ 
            topic: topic.topic,
            error: (error as Error).message 
          }, '[Agent 2] Research failed');
          failedCount++;
        }
      }
      
      // 4. Mark intelligence as processed by researcher
      if (unprocessedIntelligence.length > 0) {
        await this.markAsProcessedByResearcher(
          unprocessedIntelligence.map((i: any) => i.id)
        );
      }
      
      log.info({
        researched: researchResults.length,
        failed: failedCount,
        markedProcessed: unprocessedIntelligence.length
      }, '[Agent 2] Research agent complete');
      
      return {
        items_processed: unprocessedIntelligence.length,
        items_created: researchResults.length,
        items_failed: failedCount
      };
      
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Agent 2] Critical error');
      throw error;
    }
  }
  
  /**
   * Get unprocessed intelligence from Supabase
   */
  private async getUnprocessedIntelligence(): Promise<any[]> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      log.warn('[Agent 2] Supabase not configured');
      return [];
    }
    
    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/raw_intelligence?processed_by_researcher=eq.false&order=extracted_at.desc&limit=50`,
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
      log.error({ error: (error as Error).message }, '[Agent 2] Failed to get unprocessed intelligence');
      return [];
    }
  }
  
  /**
   * Extract trending topics from intelligence
   */
  private async extractTrendingTopics(intelligence: any[]): Promise<string[]> {
    // Simple topic extraction - count mentions
    const topicCounts: { [key: string]: number } = {};
    
    for (const item of intelligence) {
      const content = (item.raw_content || '').toLowerCase();
      
      // Extract topics (simple keyword matching)
      const keywords = ['defi', 'mev', 'ethereum', 'layer2', 'rollup', 'zk', 'ai', 'trading'];
      
      for (const keyword of keywords) {
        if (content.includes(keyword)) {
          topicCounts[keyword] = (topicCounts[keyword] || 0) + 1;
        }
      }
    }
    
    // Return top trending topics
    return Object.entries(topicCounts)
      .filter(([_, count]) => count >= 3)  // Minimum 3 mentions
      .sort(([_, a], [__, b]) => b - a)
      .slice(0, 10)
      .map(([topic, _]) => topic);
  }
  
  /**
   * Conduct research using Perplexity Sonar API + GPT-4o fallback
   * Implements: https://docs.perplexity.ai/guides/mcp-server
   */
  private async conductPerplexityResearch(query: string, topic: ResearchTopic): Promise<ResearchData | null> {
    try {
      log.info({ query, topic: topic.topic }, '[Agent 2] Conducting research with Perplexity...');
      
      let researchContent = '';
      let sources: string[] = [];
      let method = 'perplexity';
      
      // Try Perplexity first (has web search)
      try {
        const perplexityResult = await perplexityService.research(query);
        researchContent = perplexityResult.content;
        sources = perplexityResult.sources;
        
        log.info({ 
          sourceCount: sources.length 
        }, '[Agent 2] Perplexity research successful');
        
      } catch (perplexityError) {
        // Fallback to GPT-4o if Perplexity fails
        log.warn({ 
          error: (perplexityError as Error).message 
        }, '[Agent 2] Perplexity failed, falling back to GPT-4o');
        
        researchContent = await llmService.generateResearch(topic.topic, query);
        method = 'gpt-4o';
      }
      
      // Parse insights from research
      const insights = this.extractInsights(researchContent);
      
      return {
        topic: topic.topic,
        query: query,
        triggered_by_intelligence_ids: [],
        research_results: {
          method: method,
          content: researchContent,
          model: method === 'perplexity' ? 'sonar-deep-research' : 'openai/gpt-4o'
        },
        key_insights: insights,
        sources: sources,
        summary: researchContent.substring(0, 200),
        created_at: new Date().toISOString(),
        quality_score: method === 'perplexity' ? 0.95 : 0.85  // Perplexity has web search, so higher quality
      };
      
    } catch (error) {
      log.error({ 
        error: (error as Error).message,
        topic: topic.topic
      }, '[Agent 2] All research methods failed');
      
      // Fallback to placeholder
      return {
        topic: topic.topic,
        query: query,
        triggered_by_intelligence_ids: [],
        research_results: {
          error: true,
          message: (error as Error).message
        },
        key_insights: [`Research topic: ${topic.topic}`],
        sources: [],
        summary: `Research query: ${query}`,
        created_at: new Date().toISOString(),
        quality_score: 0.3
      };
    }
  }
  
  /**
   * Extract key insights from research content
   */
  private extractInsights(content: string): string[] {
    // Simple extraction - split by newlines and filter
    const lines = content.split('\n').filter(line => line.trim().length > 10);
    return lines.slice(0, 5);  // Top 5 insights
  }
  
  /**
   * Store research in Supabase
   */
  private async storeResearch(research: ResearchData): Promise<void> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase not configured');
    }
    
    const response = await fetch(`${supabaseUrl}/rest/v1/research_data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(research)
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to store research: ${response.status} - ${error}`);
    }
  }
  
  /**
   * Mark intelligence as processed by researcher
   */
  private async markAsProcessedByResearcher(ids: string[]): Promise<void> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey || ids.length === 0) {
      return;
    }
    
    // Update in batches
    for (const id of ids) {
      try {
        await fetch(`${supabaseUrl}/rest/v1/raw_intelligence?id=eq.${id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ processed_by_researcher: true })
        });
      } catch (error) {
        log.warn({ id, error: (error as Error).message }, '[Agent 2] Failed to mark as processed');
      }
    }
  }
  
  /**
   * Get timeframe string based on frequency
   */
  private getTimeframeForFrequency(frequency: string): string {
    const map: { [key: string]: string } = {
      'daily': '24 hours',
      'every_2_days': '48 hours',
      'every_3_days': '72 hours',
      'weekly': '7 days'
    };
    
    return map[frequency] || '24 hours';
  }

  private async generateDynamicTopics(intelligenceData: any[]): Promise<ResearchTopic[]> {
    const dynamicTopics: ResearchTopic[] = [];
    
    // Generate topics for Crypto Discovery niche only
    const cryptoDiscoveryTopics = await this.generateNicheTopics(
      this.cryptoDiscoveryTopics, 
      intelligenceData, 
      'crypto_discovery',
      this.researchConfig.niche_allocation?.crypto_discovery || 10
    );
    dynamicTopics.push(...cryptoDiscoveryTopics);
    
    // Add fallback topics if no dynamic topics found
    if (dynamicTopics.length === 0) {
      dynamicTopics.push(...this.topics);
    }
    
    log.info({ 
      cryptoDiscoveryTopics: cryptoDiscoveryTopics.length,
      totalDynamicTopics: dynamicTopics.length,
      maxAge: this.researchConfig.timeframes?.max_age || '8 days'
    }, '[Agent 2] Generated crypto discovery dynamic topics');
    
    return dynamicTopics;
  }

  private async generateNicheTopics(
    curatedTopics: string[], 
    intelligenceData: any[], 
    niche: string, 
    maxTopics: number
  ): Promise<ResearchTopic[]> {
    const topics: ResearchTopic[] = [];
    
    // Add curated topics for this niche
    for (const curatedTopic of curatedTopics.slice(0, Math.floor(maxTopics / 2))) {
      topics.push({
        topic: curatedTopic,
        query_template: `What are the latest developments in ${curatedTopic} in the last {timeframe}? Focus on maximum airdrop potential and recent launches.`,
        category: niche,
        frequency: 'daily',
        priority: 'high',
        enabled: true
      });
    }
    
    // Extract dynamic topics from scraped content for this niche
    if (this.dynamicConfig.enabled && intelligenceData.length > 0) {
      const extractedTopics = await this.extractTopicsFromContent(intelligenceData, niche);
      topics.push(...extractedTopics.slice(0, Math.floor(maxTopics / 2)));
    }
    
    return topics.slice(0, maxTopics);
  }

  private async extractTopicsFromContent(intelligenceData: any[], niche?: string): Promise<ResearchTopic[]> {
    const topics: ResearchTopic[] = [];
    const topicIndicators = this.dynamicConfig.topic_indicators || [];
    const categories = this.dynamicConfig.categories || {};
    
    // Analyze each piece of intelligence
    for (const intelligence of intelligenceData) {
      const content = intelligence.raw_content?.toLowerCase() || '';
      
      // Look for topic indicators in the content
      for (const indicator of topicIndicators) {
        if (content.includes(indicator.toLowerCase())) {
          // Create a research topic from this content
          const topicText = this.createTopicFromContent(content, indicator);
          
          if (topicText) {
            // Determine category
            const category = this.determineCategory(content, categories);
            
            topics.push({
              topic: topicText,
              query_template: `What are the latest developments in ${topicText} and related AI trading bot technologies in the last {timeframe}?`,
              category: category,
              frequency: 'daily',
              priority: 'medium',
              enabled: true
            });
          }
        }
      }
    }
    
    // Remove duplicates and limit
    const uniqueTopics = this.removeDuplicateTopics(topics);
    return uniqueTopics.slice(0, this.dynamicConfig.max_dynamic_topics || 8);
  }

  private createTopicFromContent(content: string, indicator: string): string | null {
    // Extract context around the indicator
    const words = content.split(' ');
    const indicatorIndex = words.findIndex(word => word.includes(indicator.toLowerCase()));
    
    if (indicatorIndex === -1) return null;
    
    // Get 2-4 words around the indicator
    const start = Math.max(0, indicatorIndex - 1);
    const end = Math.min(words.length, indicatorIndex + 3);
    const contextWords = words.slice(start, end);
    
    // Clean and create topic
    const topic = contextWords
      .join(' ')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    return topic.length > 3 ? topic : null;
  }

  private determineCategory(content: string, categories: any): string {
    for (const [categoryName, keywords] of Object.entries(categories)) {
      for (const keyword of keywords as string[]) {
        if (content.includes(keyword.toLowerCase())) {
          return categoryName;
        }
      }
    }
    return 'general';
  }

  private removeDuplicateTopics(topics: ResearchTopic[]): ResearchTopic[] {
    const seen = new Set<string>();
    return topics.filter(topic => {
      const key = topic.topic.toLowerCase().trim();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
}

