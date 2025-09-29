import { log } from '../log';

/**
 * AI Memory Service for xlochagos
 * Handles storing and retrieving AI agent memories, learning patterns, and cross-account intelligence
 */

export interface AgentMemory {
  id?: string;
  account: string;
  type: 'interaction' | 'engagement' | 'preference' | 'behavior' | 'learning' | 'research_content';
  data: Record<string, any>;
  timestamp?: Date;
  relevance_score?: number;
  tags?: string[];
}

export interface ContentPerformance {
  id?: string;
  account: string;
  content_hash: string;
  content_type: string;
  topic: string;
  performance_score: number;
  engagement_metrics: Record<string, any>;
  audience_response?: 'positive' | 'neutral' | 'negative';
  posted_at: Date;
}

export interface LearningPattern {
  id?: string;
  account: string;
  pattern_type: string;
  pattern_data: Record<string, any>;
  confidence_score: number;
  discovery_date?: Date;
  last_validated?: Date;
  validation_count?: number;
}

export interface CrossAccountIntelligence {
  id?: string;
  source_account: string;
  target_accounts: string[];
  intelligence_type: string;
  intelligence_data: Record<string, any>;
  sharing_level?: 'private' | 'limited' | 'public';
  effectiveness_score?: number;
  expires_at?: Date;
}

export interface AgentPersonality {
  id?: string;
  account: string;
  personality_traits: Record<string, any>;
  content_preferences: Record<string, any>;
  posting_patterns: Record<string, any>;
  learning_preferences: Record<string, any>;
  last_updated?: Date;
}

class AIMemoryService {
  private supabaseUrl: string;
  private supabaseKey: string;
  private initialized: boolean = false;

  constructor() {
    this.supabaseUrl = '';
    this.supabaseKey = '';
  }

  private initialize() {
    if (this.initialized) return;
    
    // These will be set from environment variables or config
    this.supabaseUrl = process.env.SUPABASE_URL || 'https://eapuldmifefqxvfzopba.supabase.co';
    this.supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    
    if (!this.supabaseKey) {
      log.warn('Supabase service role key not found. AI memory features will be disabled.');
    }
    
    this.initialized = true;
  }

  /**
   * Store an agent memory
   */
  async storeMemory(memory: AgentMemory): Promise<string | null> {
    this.initialize();
    if (!this.supabaseKey) {
      log.warn('Cannot store memory: Supabase not configured');
      return null;
    }

    try {
      const response = await fetch(`${this.supabaseUrl}/rest/v1/agent_memory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.supabaseKey}`,
          'apikey': this.supabaseKey,
        },
        body: JSON.stringify({
          account: memory.account,
          type: memory.type,
          data: memory.data,
          timestamp: memory.timestamp?.toISOString() || new Date().toISOString(),
          relevance_score: memory.relevance_score || 0.5,
          tags: memory.tags || [],
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json() as { id: string };
      log.info({ memoryId: result.id, account: memory.account, type: memory.type }, 'Memory stored successfully');
      return result.id;
    } catch (error) {
      log.error({ error: (error as Error).message, memory }, 'Failed to store memory');
      return null;
    }
  }

  /**
   * Retrieve memories for an account with optional filtering
   */
  async getMemories(
    account: string,
    options: {
      type?: string;
      limit?: number;
      since?: Date;
      minRelevance?: number;
    } = {}
  ): Promise<AgentMemory[]> {
    this.initialize();
    if (!this.supabaseKey) {
      log.warn('Cannot retrieve memories: Supabase not configured');
      return [];
    }

    try {
      let url = `${this.supabaseUrl}/rest/v1/agent_memory?account=eq.${account}&order=timestamp.desc`;
      
      if (options.type) {
        url += `&type=eq.${options.type}`;
      }
      
      if (options.since) {
        url += `&timestamp=gte.${options.since.toISOString()}`;
      }
      
      if (options.minRelevance) {
        url += `&relevance_score=gte.${options.minRelevance}`;
      }
      
      if (options.limit) {
        url += `&limit=${options.limit}`;
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.supabaseKey}`,
          'apikey': this.supabaseKey,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const memories = await response.json() as AgentMemory[];
      log.info({ account, count: memories.length }, 'Retrieved memories');
      return memories;
    } catch (error) {
      log.error({ error: (error as Error).message, account }, 'Failed to retrieve memories');
      return [];
    }
  }

  /**
   * Store content performance data
   */
  async storeContentPerformance(performance: ContentPerformance): Promise<string | null> {
    this.initialize();
    if (!this.supabaseKey) {
      log.warn('Cannot store content performance: Supabase not configured');
      return null;
    }

    try {
      const response = await fetch(`${this.supabaseUrl}/rest/v1/content_performance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.supabaseKey}`,
          'apikey': this.supabaseKey,
        },
        body: JSON.stringify({
          account: performance.account,
          content_hash: performance.content_hash,
          content_type: performance.content_type,
          topic: performance.topic,
          performance_score: performance.performance_score,
          engagement_metrics: performance.engagement_metrics,
          audience_response: performance.audience_response,
          posted_at: performance.posted_at.toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json() as { id: string };
      log.info({ performanceId: result.id, account: performance.account }, 'Content performance stored');
      return result.id;
    } catch (error) {
      log.error({ error: (error as Error).message, performance }, 'Failed to store content performance');
      return null;
    }
  }

  /**
   * Get top performing content for an account
   */
  async getTopPerformingContent(
    account: string,
    limit: number = 10
  ): Promise<ContentPerformance[]> {
    this.initialize();
    if (!this.supabaseKey) {
      return [];
    }

    try {
      const response = await fetch(
        `${this.supabaseUrl}/rest/v1/top_performing_content?account=eq.${account}&limit=${limit}`,
        {
          headers: {
            'Authorization': `Bearer ${this.supabaseKey}`,
            'apikey': this.supabaseKey,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json() as ContentPerformance[];
    } catch (error) {
      log.error({ error: (error as Error).message, account }, 'Failed to get top performing content');
      return [];
    }
  }

  /**
   * Store a learning pattern
   */
  async storeLearningPattern(pattern: LearningPattern): Promise<string | null> {
    this.initialize();
    if (!this.supabaseKey) {
      return null;
    }

    try {
      const response = await fetch(`${this.supabaseUrl}/rest/v1/learning_patterns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.supabaseKey}`,
          'apikey': this.supabaseKey,
        },
        body: JSON.stringify({
          account: pattern.account,
          pattern_type: pattern.pattern_type,
          pattern_data: pattern.pattern_data,
          confidence_score: pattern.confidence_score,
          discovery_date: pattern.discovery_date?.toISOString() || new Date().toISOString(),
          last_validated: pattern.last_validated?.toISOString() || new Date().toISOString(),
          validation_count: pattern.validation_count || 1,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json() as { id: string };
      log.info({ patternId: result.id, account: pattern.account }, 'Learning pattern stored');
      return result.id;
    } catch (error) {
      log.error({ error: (error as Error).message, pattern }, 'Failed to store learning pattern');
      return null;
    }
  }

  /**
   * Store cross-account intelligence
   */
  async storeCrossAccountIntelligence(intelligence: CrossAccountIntelligence): Promise<string | null> {
    this.initialize();
    if (!this.supabaseKey) {
      return null;
    }

    try {
      const response = await fetch(`${this.supabaseUrl}/rest/v1/cross_account_intelligence`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.supabaseKey}`,
          'apikey': this.supabaseKey,
        },
        body: JSON.stringify({
          source_account: intelligence.source_account,
          target_accounts: intelligence.target_accounts,
          intelligence_type: intelligence.intelligence_type,
          intelligence_data: intelligence.intelligence_data,
          sharing_level: intelligence.sharing_level || 'private',
          effectiveness_score: intelligence.effectiveness_score || 0.5,
          expires_at: intelligence.expires_at?.toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json() as { id: string };
      log.info({ intelligenceId: result.id, source: intelligence.source_account }, 'Cross-account intelligence stored');
      return result.id;
    } catch (error) {
      log.error({ error: (error as Error).message, intelligence }, 'Failed to store cross-account intelligence');
      return null;
    }
  }

  /**
   * Get or create agent personality
   */
  async getAgentPersonality(account: string): Promise<AgentPersonality | null> {
    this.initialize();
    if (!this.supabaseKey) {
      return null;
    }

    try {
      const response = await fetch(
        `${this.supabaseUrl}/rest/v1/agent_personalities?account=eq.${account}`,
        {
          headers: {
            'Authorization': `Bearer ${this.supabaseKey}`,
            'apikey': this.supabaseKey,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const personalities = await response.json() as AgentPersonality[];
      return personalities.length > 0 ? personalities[0]! : null;
    } catch (error) {
      log.error({ error: (error as Error).message, account }, 'Failed to get agent personality');
      return null;
    }
  }

  /**
   * Update agent personality
   */
  async updateAgentPersonality(personality: AgentPersonality): Promise<boolean> {
    this.initialize();
    if (!this.supabaseKey) {
      return false;
    }

    try {
      const existing = await this.getAgentPersonality(personality.account);
      
      const response = await fetch(
        `${this.supabaseUrl}/rest/v1/agent_personalities`,
        {
          method: existing ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.supabaseKey}`,
            'apikey': this.supabaseKey,
          },
          body: JSON.stringify({
            account: personality.account,
            personality_traits: personality.personality_traits,
            content_preferences: personality.content_preferences,
            posting_patterns: personality.posting_patterns,
            learning_preferences: personality.learning_preferences,
            last_updated: new Date().toISOString(),
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      log.info({ account: personality.account }, 'Agent personality updated');
      return true;
    } catch (error) {
      log.error({ error: (error as Error).message, personality }, 'Failed to update agent personality');
      return false;
    }
  }

  /**
   * Get recent memories across all accounts for insights
   */
  async getRecentMemories(limit: number = 50): Promise<AgentMemory[]> {
    this.initialize();
    if (!this.supabaseKey) {
      return [];
    }

    try {
      const response = await fetch(
        `${this.supabaseUrl}/rest/v1/recent_memories?limit=${limit}`,
        {
          headers: {
            'Authorization': `Bearer ${this.supabaseKey}`,
            'apikey': this.supabaseKey,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json() as AgentMemory[];
    } catch (error) {
      log.error({ error: (error as Error).message }, 'Failed to get recent memories');
      return [];
    }
  }

  /**
   * Analyze engagement patterns for an account
   */
  async analyzeEngagementPatterns(account: string): Promise<Record<string, any>> {
    const memories = await this.getMemories(account, { type: 'engagement' });
    const contentPerformance = await this.getTopPerformingContent(account);

    return {
      total_engagements: memories.length,
      avg_relevance: memories.reduce((sum, m) => sum + (m.relevance_score || 0), 0) / memories.length || 0,
      top_content_types: contentPerformance.map(cp => cp.content_type),
      recent_activity: memories.slice(0, 10).map(m => ({
        type: m.type,
        timestamp: m.timestamp,
        relevance: m.relevance_score,
      })),
    };
  }
}

export const aiMemoryService = new AIMemoryService();
