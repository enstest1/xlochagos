/**
 * LLM Service
 * Integrates OpenRouter (for LLM access) and OpenPipe (for training data)
 * Based on: https://openrouter.ai/docs/quickstart and https://docs.openpipe.ai/introduction
 */

import { log } from '../log';

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMResponse {
  content: string;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class LLMService {
  private openRouterApiKey: string;
  private openPipeApiKey: string;
  private openPipeProjectId: string;
  
  constructor() {
    this.openRouterApiKey = process.env.OPENROUTER_API_KEY || '';
    this.openPipeApiKey = process.env.OPENPIPE_API_KEY || '';
    this.openPipeProjectId = process.env.OPENPIPE_PROJECT_ID || 'xlochagos-training';
    
    if (!this.openRouterApiKey) {
      log.warn('[LLM Service] OpenRouter API key not configured');
    }
    
    if (!this.openPipeApiKey) {
      log.warn('[LLM Service] OpenPipe API key not configured (training data collection disabled)');
    }
  }
  
  /**
   * Call OpenRouter LLM with OpenPipe tracking
   * Based on: https://openrouter.ai/docs/quickstart
   */
  async chat(
    messages: LLMMessage[],
    model: string = 'openai/gpt-4o',
    options: {
      temperature?: number;
      max_tokens?: number;
      logToOpenPipe?: boolean;
      tags?: Record<string, any>;
    } = {}
  ): Promise<LLMResponse> {
    if (!this.openRouterApiKey) {
      throw new Error('OpenRouter API key not configured');
    }
    
    const {
      temperature = 0.7,
      max_tokens = 500,
      logToOpenPipe = true,
      tags = {}
    } = options;
    
    try {
      log.info({ 
        model, 
        messageCount: messages.length,
        logToOpenPipe
      }, '[LLM Service] Calling OpenRouter...');
      
      // Prepare request body
      const requestBody: any = {
        model,
        messages,
        temperature,
        max_tokens
      };
      
      // Add OpenPipe headers if enabled
      const headers: any = {
        'Authorization': `Bearer ${this.openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/yourusername/xlochagos',  // For OpenRouter leaderboard
        'X-Title': 'XlochaGOS'  // For OpenRouter leaderboard
      };
      
      // Add OpenPipe tracking headers if enabled
      if (logToOpenPipe && this.openPipeApiKey) {
        headers['op-log-request'] = 'true';
        headers['op-api-key'] = this.openPipeApiKey;
        
        // Add tags for OpenPipe
        if (Object.keys(tags).length > 0) {
          requestBody.metadata = {
            openpipe: {
              tags: {
                project: this.openPipeProjectId,
                ...tags
              }
            }
          };
        }
      }
      
      // Call OpenRouter API
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
      }
      
      const result = await response.json() as any;
      
      log.info({
        model: result.model,
        tokens: result.usage?.total_tokens
      }, '[LLM Service] OpenRouter response received');
      
      return {
        content: result.choices[0]?.message?.content || '',
        model: result.model,
        usage: {
          prompt_tokens: result.usage?.prompt_tokens || 0,
          completion_tokens: result.usage?.completion_tokens || 0,
          total_tokens: result.usage?.total_tokens || 0
        }
      };
      
    } catch (error) {
      log.error({ 
        error: (error as Error).message,
        model
      }, '[LLM Service] Failed to call LLM');
      throw error;
    }
  }
  
  /**
   * Generate research using GPT-4o
   */
  async generateResearch(topic: string, query: string): Promise<string> {
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: 'You are a crypto/DeFi research analyst. Provide concise, factual analysis with key insights.'
      },
      {
        role: 'user',
        content: `Research topic: ${topic}\n\nQuery: ${query}\n\nProvide a concise summary with 3-5 key insights.`
      }
    ];
    
    const response = await this.chat(messages, process.env.OPENROUTER_MODEL_RESEARCH || 'openai/gpt-4o', {
      temperature: 0.3,  // Lower temperature for factual research
      max_tokens: 500,
      logToOpenPipe: true,
      tags: {
        agent: 'researcher',
        topic: topic,
        type: 'research'
      }
    });
    
    return response.content;
  }
  
  /**
   * Generate premium content from intelligence + research
   */
  async generatePremiumContent(
    intelligence: any,
    research: any | null,
    sourceType: 'twitter' | 'rss' | 'research'
  ): Promise<string> {
    const systemPrompt = `You are a sophisticated crypto analyst creating high-quality Twitter content.

Rules:
- Maximum 260 characters (leave room for links)
- Insightful, not promotional
- Professional tone with occasional personality
- No emojis (unless critical to meaning)
- No hype words (revolutionary, game-changer, etc.)
- Focus on substance over style
- Include nuance and balanced perspective`;

    let userPrompt = '';
    
    if (sourceType === 'twitter') {
      const author = intelligence.source_account || 'an account';
      const original = intelligence.raw_content;
      
      userPrompt = `Create insightful commentary on this tweet from ${author}:\n\n"${original}"\n\n`;
      
      if (research) {
        userPrompt += `\nRelated research: ${research.summary}\n\n`;
      }
      
      userPrompt += 'Write a thoughtful response that adds value to the conversation.';
      
    } else if (sourceType === 'rss') {
      userPrompt = `Create an engaging post about this news:\n\nTitle: ${intelligence.title}\nSummary: ${intelligence.summary}\n\nWrite a concise, insightful take on why this matters.`;
      
    } else {
      userPrompt = `Based on this research:\n\n${research?.summary || intelligence.raw_content}\n\nCreate an insightful post that shares a key takeaway.`;
    }
    
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
    
    const response = await this.chat(messages, process.env.OPENROUTER_MODEL_WRITER || 'openai/gpt-4o', {
      temperature: 0.8,  // Higher for creativity
      max_tokens: 280,
      logToOpenPipe: true,
      tags: {
        agent: 'content_writer',
        source_type: sourceType,
        quality_tier: 'premium',
        target: 'pelpa333'
      }
    });
    
    return response.content;
  }
  
  /**
   * Generate auto-post content (cheaper, rule-based alternative)
   */
  generateAutoContent(
    intelligence: any,
    research: any | null
  ): string {
    // Rule-based generation for auto-posts (no LLM cost)
    const author = intelligence.source_account || 'an account';
    
    const templates = [
      `Interesting take from ${author}. Worth noting this aligns with recent developments.`,
      `${author} raises good points here. The implications for DeFi are significant.`,
      `This ${author} thread is worth reading. Key insights on the current state of Ethereum.`,
      `Solid analysis from ${author}. The technical depth here is impressive.`,
      `${author} with some valuable perspective on this topic.`
    ];
    
    const index = Math.floor(Math.random() * templates.length);
    return templates[index]!;
  }
}

// Export singleton
export const llmService = new LLMService();


