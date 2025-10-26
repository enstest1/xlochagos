/**
 * Content Generation Service
 * Integrates RSS feeds, content variation, quality filtering, and AI memory
 */

import { SourceItem, PostDraft } from '../types';
import { loadRssFeeds } from '../sources/cypherSwarm';
import { ContentVariationEngine } from '../content/variation';
import { analyzePostQuality } from '../content/heuristics';
import { aiMemoryService } from './aiMemoryService';
import { log } from '../log';
import crypto from 'crypto';

export interface ContentGenerationOptions {
  minScore?: number;
  maxPosts?: number;
  useVariation?: boolean;
  useQualityFilter?: boolean;
  generateMultipleVariations?: number;
  account?: string;
}

export interface GeneratedContent {
  draft: PostDraft;
  sourceItem: SourceItem;
  qualityScore: number;
  passed: boolean;
  reason?: string | undefined;
}

export class ContentGenerationService {
  private variationEngine: ContentVariationEngine;
  
  constructor() {
    this.variationEngine = new ContentVariationEngine();
  }

  /**
   * Generate content from RSS feeds
   */
  async generateContentFromFeeds(options: ContentGenerationOptions = {}): Promise<GeneratedContent[]> {
    const {
      minScore = 0.6,
      maxPosts = 10,
      useVariation = true,
      useQualityFilter = true,
      generateMultipleVariations = 1,
      account = '@DefaultAccount'
    } = options;

    log.info({ 
      minScore, 
      maxPosts, 
      useVariation, 
      useQualityFilter,
      account
    }, 'Generating content from RSS feeds');

    try {
      // 1. Load RSS feeds
      const sourceItems = await loadRssFeeds();
      log.info({ itemCount: sourceItems.length }, 'Loaded source items from RSS');

      // 2. Filter by minimum score
      const qualifyingItems = sourceItems.filter(item => item.score >= minScore);
      log.info({ 
        originalCount: sourceItems.length,
        qualifyingCount: qualifyingItems.length,
        minScore
      }, 'Filtered items by score');

      // 3. Generate content for each qualifying item
      const generatedContent: GeneratedContent[] = [];

      for (const item of qualifyingItems.slice(0, maxPosts)) {
        // Generate base post
        const basePost = this.composePost(item);

        // Generate variations if requested
        const variations = generateMultipleVariations;
        for (let i = 0; i < variations; i++) {
          let post = { ...basePost };

          // Apply variation
          if (useVariation && i > 0) {
            post = this.variationEngine.addContentVariation(post, i);
          }

          // Quality check
          let qualityScore = 1.0;
          let passed = true;
          let reason: string | undefined;

          if (useQualityFilter) {
            const qualityCheck = analyzePostQuality(post.text, item.tags || []);
            qualityScore = qualityCheck.overallScore;
            passed = qualityCheck.passed;

            if (!passed) {
              reason = qualityCheck.reasons.join('; ');
              log.info({
                postPreview: post.text.substring(0, 50) + '...',
                qualityScore,
                reasons: qualityCheck.reasons
              }, 'Post failed quality check');
            }
          }

          generatedContent.push({
            draft: post,
            sourceItem: item,
            qualityScore,
            passed,
            reason
          });

          // Store in AI memory for learning
          if (account) {
            await this.storeContentMemory(account, item, post, qualityScore, passed);
          }
        }
      }

      const passedContent = generatedContent.filter(c => c.passed);
      log.info({
        totalGenerated: generatedContent.length,
        passed: passedContent.length,
        failed: generatedContent.length - passedContent.length,
        account
      }, 'Content generation complete');

      return generatedContent;

    } catch (error) {
      log.error({ error: (error as Error).message, account }, 'Failed to generate content');
      throw error;
    }
  }

  /**
   * Compose a post from a source item
   */
  private composePost(item: SourceItem): PostDraft {
    // Get title and summary
    const title = item.title || '';
    const summary = item.summary || '';
    const url = item.url;

    // Create engaging post format
    let text = '';

    // Short title format (under 50 chars)
    if (title.length < 50) {
      text = `${title}\n\n${summary}\n\n${url}`;
    } 
    // Long title - use summary only
    else if (summary && summary.length > 0) {
      text = `${summary}\n\n${url}`;
    }
    // Fallback to title + url
    else {
      text = `${title}\n\n${url}`;
    }

    // Ensure it fits in 280 characters
    if (text.length > 277) {
      // Calculate how much space we have for content (280 - url length - spacing)
      const urlLength = url.length;
      const availableSpace = 280 - urlLength - 5; // 5 chars for spacing/newlines

      if (summary && summary.length > 0) {
        text = summary.substring(0, availableSpace) + '...\n\n' + url;
      } else {
        text = title.substring(0, availableSpace) + '...\n\n' + url;
      }
    }

    // Create content hash
    const contentHash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);

    return {
      text: text.trim(),
      sourceUrl: url,
      contentHash,
      confidence: item.score
    };
  }

  /**
   * Store content generation in AI memory for learning
   */
  private async storeContentMemory(
    account: string,
    sourceItem: SourceItem,
    post: PostDraft,
    qualityScore: number,
    passed: boolean
  ): Promise<void> {
    try {
      await aiMemoryService.storeMemory({
        account,
        type: 'research_content',
        data: {
          source_url: sourceItem.url,
          source_title: sourceItem.title,
          source_score: sourceItem.score,
          source_category: sourceItem.tags?.[0] || 'unknown',
          generated_text: post.text,
          quality_score: qualityScore,
          passed_quality_check: passed,
          content_hash: post.contentHash,
          timestamp: new Date().toISOString()
        },
        relevance_score: qualityScore,
        tags: ['content_generation', ...(sourceItem.tags || [])]
      });
    } catch (error) {
      log.warn({ error: (error as Error).message }, 'Failed to store content memory');
    }
  }

  /**
   * Get high-quality content ready for posting
   */
  async getReadyToPostContent(options: ContentGenerationOptions = {}): Promise<PostDraft[]> {
    const generated = await this.generateContentFromFeeds(options);
    
    return generated
      .filter(c => c.passed)
      .sort((a, b) => b.qualityScore - a.qualityScore)
      .slice(0, options.maxPosts || 10)
      .map(c => c.draft);
  }

  /**
   * Get content by category
   */
  async getContentByCategory(category: string, options: ContentGenerationOptions = {}): Promise<GeneratedContent[]> {
    const allContent = await this.generateContentFromFeeds(options);
    
    return allContent.filter(c => 
      c.sourceItem.tags?.includes(category)
    );
  }
}

// Export singleton instance
export const contentGenerationService = new ContentGenerationService();

