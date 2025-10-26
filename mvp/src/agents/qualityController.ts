/**
 * Agent 4: Quality Controller
 * Reviews and filters content before approval
 */

import { log } from '../log';
import { analyzePostQuality } from '../content/heuristics';

export class QualityControllerAgent {
  private minQualityScore: number = 0.6;
  private autoApproveScore: number = 0.8;
  
  /**
   * Main agent execution
   */
  async run(): Promise<{ items_processed: number; items_created: number; items_failed: number }> {
    log.info('[Agent 4] Starting quality controller...');
    
    try {
      // 1. Get pending content from Agent 3
      const pendingContent = await this.getPendingContent();
      
      log.info({ 
        count: pendingContent.length 
      }, '[Agent 4] Found pending content for review');
      
      let approvedCount = 0;
      let rejectedCount = 0;
      let failedCount = 0;
      
      // 2. Review each piece of content
      for (const content of pendingContent) {
        try {
          const qualityCheck = this.checkQuality(content);
          
          if (qualityCheck.passed) {
            // Approve content
            await this.approveContent(content.id, qualityCheck.score);
            approvedCount++;
            
            log.info({
              contentId: content.id,
              score: qualityCheck.score,
              preview: content.content_text.substring(0, 50) + '...'
            }, '[Agent 4] Content approved');
          } else {
            // Reject content
            await this.rejectContent(content.id, qualityCheck.reason);
            rejectedCount++;
            
            log.info({
              contentId: content.id,
              score: qualityCheck.score,
              reason: qualityCheck.reason
            }, '[Agent 4] Content rejected');
          }
          
        } catch (error) {
          log.error({
            contentId: content.id,
            error: (error as Error).message
          }, '[Agent 4] Failed to process content');
          failedCount++;
        }
      }
      
      log.info({
        total: pendingContent.length,
        approved: approvedCount,
        rejected: rejectedCount,
        failed: failedCount
      }, '[Agent 4] Quality control complete');
      
      return {
        items_processed: pendingContent.length,
        items_created: approvedCount,  // Approved = created for next step
        items_failed: rejectedCount + failedCount
      };
      
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Agent 4] Critical error');
      throw error;
    }
  }
  
  /**
   * Get pending content from queue
   */
  private async getPendingContent(): Promise<any[]> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return [];
    }
    
    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/content_queue?status=eq.pending_approval&order=created_at.asc&limit=100`,
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
      log.error({ error: (error as Error).message }, '[Agent 4] Failed to get pending content');
      return [];
    }
  }
  
  /**
   * Check content quality
   */
  private checkQuality(content: any): { passed: boolean; score: number; reason: string } {
    try {
      // Use existing heuristics
      const qualityAnalysis = analyzePostQuality(content.content_text, content.topic_tags || []);
      
      // Calculate final score
      const score = qualityAnalysis.overallScore;
      
      // Determine if passed
      const passed = score >= this.minQualityScore && qualityAnalysis.passed;
      
      // Get rejection reason
      const reason = qualityAnalysis.reasons.join('; ');
      
      return {
        passed,
        score,
        reason: passed ? 'Passed quality checks' : reason
      };
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Agent 4] Quality check failed');
      return {
        passed: false,
        score: 0,
        reason: 'Quality check error'
      };
    }
  }
  
  /**
   * Approve content
   */
  private async approveContent(contentId: string, qualityScore: number): Promise<void> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase not configured');
    }
    
    await fetch(`${supabaseUrl}/rest/v1/content_queue?id=eq.${contentId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        status: 'approved',
        quality_score: qualityScore,
        approved_by_agent: 'quality_controller'
      })
    });
  }
  
  /**
   * Reject content
   */
  private async rejectContent(contentId: string, reason: string): Promise<void> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase not configured');
    }
    
    await fetch(`${supabaseUrl}/rest/v1/content_queue?id=eq.${contentId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        status: 'rejected',
        approved_by_agent: 'quality_controller'
        // TODO: Store rejection reason in metadata
      })
    });
  }
}

