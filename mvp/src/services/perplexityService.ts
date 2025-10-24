/**
 * Perplexity Service
 * Integrates Perplexity Sonar API for web search and research
 * Based on: https://docs.perplexity.ai/guides/mcp-server
 * MCP Repo: https://github.com/perplexityai/modelcontextprotocol
 */

import { log } from '../log';

interface PerplexitySearchResult {
  content: string;
  sources: string[];
  citations: any[];
}

export class PerplexityService {
  private apiKey: string;
  private baseUrl = 'https://api.perplexity.ai';
  
  constructor() {
    this.apiKey = process.env.PERPLEXITY_API_KEY || '';
    
    if (!this.apiKey) {
      log.warn('[Perplexity] API key not configured');
    }
  }
  
  /**
   * Perform web search using Perplexity Search API
   * Tool: perplexity_search
   */
  async search(query: string): Promise<PerplexitySearchResult> {
    if (!this.apiKey) {
      throw new Error('Perplexity API key not configured');
    }
    
    try {
      log.info({ query }, '[Perplexity] Performing web search...');
      
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'sonar',  // Quick search model
          messages: [
            {
              role: 'system',
              content: 'You are a helpful research assistant. Provide concise, factual information with sources.'
            },
            {
              role: 'user',
              content: query
            }
          ],
          temperature: 0.2,
          max_tokens: 500,
          return_citations: true,
          return_related_questions: false
        })
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Perplexity API error: ${response.status} - ${error}`);
      }
      
      const result = await response.json() as any;
      
      const content = result.choices[0]?.message?.content || '';
      const citations = result.citations || [];
      const sources = citations.map((c: any) => c.url || c).filter(Boolean);
      
      log.info({
        contentLength: content.length,
        sourceCount: sources.length
      }, '[Perplexity] Search complete');
      
      return {
        content,
        sources,
        citations
      };
      
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Perplexity] Search failed');
      throw error;
    }
  }
  
  /**
   * Perform deep research using Sonar Deep Research model
   * Tool: perplexity_research
   */
  async research(query: string): Promise<PerplexitySearchResult> {
    if (!this.apiKey) {
      throw new Error('Perplexity API key not configured');
    }
    
    try {
      log.info({ query }, '[Perplexity] Performing deep research...');
      
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'sonar-deep-research',  // Deep research model
          messages: [
            {
              role: 'system',
              content: 'You are an expert research analyst. Provide comprehensive, well-sourced analysis.'
            },
            {
              role: 'user',
              content: query
            }
          ],
          temperature: 0.1,  // Lower for factual research
          max_tokens: 1000,
          return_citations: true,
          return_related_questions: true
        })
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Perplexity API error: ${response.status} - ${error}`);
      }
      
      const result = await response.json() as any;
      
      const content = result.choices[0]?.message?.content || '';
      const citations = result.citations || [];
      const sources = citations.map((c: any) => c.url || c).filter(Boolean);
      
      log.info({
        contentLength: content.length,
        sourceCount: sources.length
      }, '[Perplexity] Deep research complete');
      
      return {
        content,
        sources,
        citations
      };
      
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Perplexity] Research failed');
      throw error;
    }
  }
  
  /**
   * Quick ask using Sonar Pro
   * Tool: perplexity_ask
   */
  async ask(question: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Perplexity API key not configured');
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'sonar-pro',
          messages: [
            {
              role: 'user',
              content: question
            }
          ],
          temperature: 0.3,
          max_tokens: 300
        })
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Perplexity API error: ${response.status} - ${error}`);
      }
      
      const result = await response.json() as any;
      return result.choices[0]?.message?.content || '';
      
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Perplexity] Ask failed');
      throw error;
    }
  }
}

// Export singleton
export const perplexityService = new PerplexityService();


