import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { log } from '../log';

export interface MemoryEntry {
  id?: string;
  account: string;
  type: 'interaction' | 'engagement' | 'preference' | 'behavior' | 'learning';
  data: any;
  timestamp: Date;
  relevance_score: number;
  tags: string[];
}

export interface InteractionMemory {
  post_id: string;
  action: 'like' | 'comment' | 'repost' | 'follow';
  target_account: string;
  success: boolean;
  engagement_received: number;
  response_time_ms: number;
}

export interface EngagementMemory {
  content_type: string;
  topic: string;
  performance_score: number;
  optimal_timing: string;
  audience_response: 'positive' | 'neutral' | 'negative';
}

export interface PreferenceMemory {
  topics: string[];
  content_styles: string[];
  posting_times: string[];
  successful_patterns: string[];
}

export class MemoryService {
  private supabase: SupabaseClient | null = null;
  private enabled: boolean = false;

  constructor() {
    this.initializeSupabase();
  }

  private initializeSupabase(): void {
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      log.warn('Supabase credentials not found, memory service disabled');
      return;
    }

    try {
      this.supabase = createClient(url, anonKey);
      this.enabled = true;
      log.info('Supabase memory service initialized');
    } catch (error) {
      log.error({ error: (error as Error).message }, 'Failed to initialize Supabase');
      this.enabled = false;
    }
  }

  async storeInteraction(account: string, interaction: InteractionMemory): Promise<void> {
    if (!this.enabled) {
      log.debug('Memory service disabled, skipping interaction storage');
      return;
    }

    try {
      const memoryEntry: MemoryEntry = {
        account,
        type: 'interaction',
        data: interaction,
        timestamp: new Date(),
        relevance_score: this.calculateInteractionRelevance(interaction),
        tags: this.extractInteractionTags(interaction)
      };

      const { error } = await this.supabase!
        .from('agent_memory')
        .insert(memoryEntry);

      if (error) {
        log.error({ error: error.message, interaction }, 'Failed to store interaction');
      } else {
        log.debug({ account, interaction }, 'Stored interaction in memory');
      }
    } catch (error) {
      log.error({ error: (error as Error).message }, 'Failed to store interaction');
    }
  }

  async storeEngagement(account: string, engagement: EngagementMemory): Promise<void> {
    if (!this.enabled) {
      log.debug('Memory service disabled, skipping engagement storage');
      return;
    }

    try {
      const memoryEntry: MemoryEntry = {
        account,
        type: 'engagement',
        data: engagement,
        timestamp: new Date(),
        relevance_score: this.calculateEngagementRelevance(engagement),
        tags: this.extractEngagementTags(engagement)
      };

      const { error } = await this.supabase!
        .from('agent_memory')
        .insert(memoryEntry);

      if (error) {
        log.error({ error: error.message, engagement }, 'Failed to store engagement');
      } else {
        log.debug({ account, engagement }, 'Stored engagement in memory');
      }
    } catch (error) {
      log.error({ error: (error as Error).message }, 'Failed to store engagement');
    }
  }

  async getRelevantMemories(
    account: string, 
    query: string, 
    type?: MemoryEntry['type'],
    limit: number = 10
  ): Promise<MemoryEntry[]> {
    if (!this.enabled) {
      log.debug('Memory service disabled, returning empty memories');
      return [];
    }

    try {
      let queryBuilder = this.supabase!
        .from('agent_memory')
        .select('*')
        .eq('account', account)
        .order('relevance_score', { ascending: false })
        .limit(limit);

      if (type) {
        queryBuilder = queryBuilder.eq('type', type);
      }

      // Add semantic search if vector embeddings are available
      if (query) {
        queryBuilder = queryBuilder.or(`tags.cs.{${query}},data->>title.ilike.%${query}%`);
      }

      const { data, error } = await queryBuilder;

      if (error) {
        log.error({ error: error.message, query }, 'Failed to retrieve memories');
        return [];
      }

      log.debug({ account, query, count: data?.length || 0 }, 'Retrieved relevant memories');
      return data || [];
    } catch (error) {
      log.error({ error: (error as Error).message }, 'Failed to retrieve memories');
      return [];
    }
  }

  async getCrossAccountLearning(targetAccount: string, excludeAccount?: string): Promise<MemoryEntry[]> {
    if (!this.enabled) {
      return [];
    }

    try {
      let queryBuilder = this.supabase!
        .from('agent_memory')
        .select('*')
        .neq('account', targetAccount)
        .order('relevance_score', { ascending: false })
        .limit(20);

      if (excludeAccount) {
        queryBuilder = queryBuilder.neq('account', excludeAccount);
      }

      const { data, error } = await queryBuilder;

      if (error) {
        log.error({ error: error.message }, 'Failed to retrieve cross-account learning');
        return [];
      }

      log.debug({ targetAccount, count: data?.length || 0 }, 'Retrieved cross-account learning');
      return data || [];
    } catch (error) {
      log.error({ error: (error as Error).message }, 'Failed to retrieve cross-account learning');
      return [];
    }
  }

  async getOptimalTiming(account: string): Promise<{ hour: number; performance: number }[]> {
    const memories = await this.getRelevantMemories(account, '', 'engagement');
    
    const timingData: { [hour: number]: { count: number; totalScore: number } } = {};
    
    memories.forEach(memory => {
      if (memory.type === 'engagement' && memory.data.optimal_timing) {
        const hour = parseInt(memory.data.optimal_timing.split(':')[0]);
        if (!timingData[hour]) {
          timingData[hour] = { count: 0, totalScore: 0 };
        }
        timingData[hour].count++;
        timingData[hour].totalScore += memory.data.performance_score || 0;
      }
    });

    return Object.entries(timingData)
      .map(([hour, data]) => ({
        hour: parseInt(hour),
        performance: data.totalScore / data.count
      }))
      .sort((a, b) => b.performance - a.performance);
  }

  async getContentPreferences(account: string): Promise<PreferenceMemory> {
    const memories = await this.getRelevantMemories(account, '', 'preference');
    
    if (memories.length === 0) {
      return {
        topics: [],
        content_styles: [],
        posting_times: [],
        successful_patterns: []
      };
    }

    // Aggregate preferences from memory
    const preferences: PreferenceMemory = {
      topics: [],
      content_styles: [],
      posting_times: [],
      successful_patterns: []
    };

    memories.forEach(memory => {
      if (memory.data.topics) preferences.topics.push(...memory.data.topics);
      if (memory.data.content_styles) preferences.content_styles.push(...memory.data.content_styles);
      if (memory.data.posting_times) preferences.posting_times.push(...memory.data.posting_times);
      if (memory.data.successful_patterns) preferences.successful_patterns.push(...memory.data.successful_patterns);
    });

    // Remove duplicates and return top preferences
    preferences.topics = [...new Set(preferences.topics)].slice(0, 10);
    preferences.content_styles = [...new Set(preferences.content_styles)].slice(0, 5);
    preferences.posting_times = [...new Set(preferences.posting_times)].slice(0, 5);
    preferences.successful_patterns = [...new Set(preferences.successful_patterns)].slice(0, 5);

    return preferences;
  }

  private calculateInteractionRelevance(interaction: InteractionMemory): number {
    let score = 0.5; // Base score

    // Higher relevance for successful interactions
    if (interaction.success) score += 0.3;

    // Higher relevance for high engagement
    if (interaction.engagement_received > 10) score += 0.2;
    else if (interaction.engagement_received > 5) score += 0.1;

    // Higher relevance for fast response times (good performance)
    if (interaction.response_time_ms < 5000) score += 0.1;

    return Math.min(1.0, score);
  }

  private calculateEngagementRelevance(engagement: EngagementMemory): number {
    let score = 0.5; // Base score

    // Higher relevance for high performance
    score += engagement.performance_score * 0.3;

    // Higher relevance for positive audience response
    if (engagement.audience_response === 'positive') score += 0.2;

    return Math.min(1.0, score);
  }

  private extractInteractionTags(interaction: InteractionMemory): string[] {
    const tags = [interaction.action, interaction.target_account];
    
    if (interaction.success) tags.push('successful');
    if (interaction.engagement_received > 5) tags.push('high-engagement');
    
    return tags;
  }

  private extractEngagementTags(engagement: EngagementMemory): string[] {
    const tags = [engagement.content_type, engagement.topic];
    
    if (engagement.audience_response === 'positive') tags.push('positive-response');
    if (engagement.performance_score > 0.8) tags.push('high-performance');
    
    return tags;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }> {
    if (!this.enabled) {
      return { status: 'unhealthy', details: { reason: 'Supabase not configured' } };
    }

    try {
      const { data, error } = await this.supabase!
        .from('agent_memory')
        .select('count')
        .limit(1);

      if (error) {
        return { status: 'unhealthy', details: { error: error.message } };
      }

      return { status: 'healthy', details: { connection: 'successful' } };
    } catch (error) {
      return { status: 'unhealthy', details: { error: (error as Error).message } };
    }
  }
}

export const memoryService = new MemoryService();



