/**
 * Agent 5: Learning Agent
 * Analyzes content performance and identifies successful patterns
 */

import { log } from '../log';
import { aiMemoryService } from '../services/aiMemoryService';

export class LearningAgent {
  
  /**
   * Main agent execution
   */
  async run(): Promise<{ items_processed: number; items_created: number; items_failed: number }> {
    log.info('[Agent 5] Starting learning agent...');
    
    try {
      // 1. Get recently posted content (last 24 hours)
      const postedContent = await this.getRecentlyPostedContent();
      
      log.info({ 
        count: postedContent.length 
      }, '[Agent 5] Found recently posted content');
      
      if (postedContent.length === 0) {
        log.info('[Agent 5] No content to analyze yet');
        return {
          items_processed: 0,
          items_created: 0,
          items_failed: 0
        };
      }
      
      let patternsFound = 0;
      let failedCount = 0;
      
      // 2. Analyze engagement for each post
      for (const content of postedContent) {
        try {
          // Get engagement metrics (would need to scrape the posted tweet)
          // For now, use placeholder
          const metrics = {
            likes: 0,
            retweets: 0,
            replies: 0,
            impressions: 0
          };
          
          const performance = this.calculatePerformance(metrics);
          
          // Store performance data
          await this.storeContentPerformance(content, metrics, performance);
          
          // If high performing, extract pattern
          if (performance > 0.7) {
            await this.storeLearningPattern(content, 'high_performer');
            patternsFound++;
          }
          
        } catch (error) {
          log.error({
            contentId: content.id,
            error: (error as Error).message
          }, '[Agent 5] Failed to analyze content');
          failedCount++;
        }
      }
      
      // 3. Generate insights from all patterns
      if (patternsFound > 0) {
        await this.generateInsights();
      }
      
      log.info({
        analyzed: postedContent.length,
        patternsFound,
        failed: failedCount
      }, '[Agent 5] Learning agent complete');
      
      return {
        items_processed: postedContent.length,
        items_created: patternsFound,
        items_failed: failedCount
      };
      
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Agent 5] Critical error');
      throw error;
    }
  }
  
  /**
   * Get recently posted content
   */
  private async getRecentlyPostedContent(): Promise<any[]> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return [];
    }
    
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const response = await fetch(
        `${supabaseUrl}/rest/v1/content_queue?status=eq.posted&posted_at=gte.${oneDayAgo}&order=posted_at.desc`,
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
      log.error({ error: (error as Error).message }, '[Agent 5] Failed to get posted content');
      return [];
    }
  }
  
  /**
   * Calculate performance score from metrics
   */
  private calculatePerformance(metrics: any): number {
    // Simple weighted scoring
    const likes = metrics.likes || 0;
    const retweets = metrics.retweets || 0;
    const replies = metrics.replies || 0;
    
    // Weighted formula (retweets and replies worth more)
    const score = (likes * 1 + retweets * 3 + replies * 5) / 100;
    
    return Math.min(1.0, Math.max(0, score));
  }
  
  /**
   * Store content performance in Supabase
   */
  private async storeContentPerformance(content: any, metrics: any, performanceScore: number): Promise<void> {
    try {
      await aiMemoryService.storeContentPerformance({
        account: content.assigned_to_account || '@Unknown',
        content_hash: content.content_hash,
        content_type: content.content_type,
        topic: content.topic_tags?.[0] || 'general',
        performance_score: performanceScore,
        engagement_metrics: metrics,
        audience_response: performanceScore > 0.7 ? 'positive' : performanceScore > 0.4 ? 'neutral' : 'negative',
        posted_at: new Date(content.posted_at)
      });
    } catch (error) {
      log.warn({ error: (error as Error).message }, '[Agent 5] Failed to store performance');
    }
  }
  
  /**
   * Store learning pattern
   */
  private async storeLearningPattern(content: any, patternType: string): Promise<void> {
    try {
      await aiMemoryService.storeLearningPattern({
        account: content.assigned_to_account || '@XlochaGOS',
        pattern_type: patternType,
        pattern_data: {
          content_type: content.content_type,
          topic_tags: content.topic_tags,
          quality_score: content.quality_score,
          has_image: !!content.images,
          text_preview: content.content_text.substring(0, 100)
        },
        confidence_score: 0.8
      });
    } catch (error) {
      log.warn({ error: (error as Error).message }, '[Agent 5] Failed to store pattern');
    }
  }
  
  /**
   * Generate insights from patterns
   */
  private async generateInsights(): Promise<void> {
    log.info('[Agent 5] Generating insights from patterns...');
    
    // Get top performing content
    const topContent = await aiMemoryService.getTopPerformingContent('@XlochaGOS', 10);
    
    if (topContent.length > 0) {
      log.info({
        topContentCount: topContent.length,
        avgScore: topContent.reduce((sum, c) => sum + c.performance_score, 0) / topContent.length
      }, '[Agent 5] Generated insights');
    }
  }
}

