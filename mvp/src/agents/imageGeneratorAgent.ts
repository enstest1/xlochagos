/**
 * Agent 6: Image Generator
 * Generates images using Google Gemini Imagen API
 */

import { log } from '../log';
import fs from 'fs';
import path from 'path';

export class ImageGeneratorAgent {
  private imageStoragePath = './persist/images';
  private model = 'imagen-4.0-generate-001';
  
  constructor() {
    this.ensureImageDirectory();
  }
  
  /**
   * Main agent execution
   */
  async run(): Promise<{ items_processed: number; items_created: number; items_failed: number }> {
    log.info('[Agent 6] Starting image generator...');
    
    try {
      // 1. Get approved content that needs images
      const contentNeedingImages = await this.getContentNeedingImages();
      
      log.info({ 
        count: contentNeedingImages.length 
      }, '[Agent 6] Found content needing images');
      
      if (contentNeedingImages.length === 0) {
        return {
          items_processed: 0,
          items_created: 0,
          items_failed: 0
        };
      }
      
      let successCount = 0;
      let failedCount = 0;
      
      // 2. Generate images for each
      for (const content of contentNeedingImages.slice(0, 50)) {  // Max 50 per cycle
        try {
          // Check if this content type should have images
          if (!this.shouldGenerateImage(content)) {
            await this.markAsNotNeeded(content.id);
            continue;
          }
          
          // Generate image prompt from content
          const imagePrompt = this.generateImagePrompt(content);
          
          // Call Imagen API
          const images = await this.generateImage(imagePrompt, content.id);
          
          // Update content queue with images
          await this.updateContentWithImages(content.id, images, imagePrompt);
          
          successCount++;
          
          log.info({
            contentId: content.id,
            prompt: imagePrompt
          }, '[Agent 6] Generated image');
          
        } catch (error) {
          log.error({
            contentId: content.id,
            error: (error as Error).message
          }, '[Agent 6] Failed to generate image');
          
          await this.markAsFailed(content.id, (error as Error).message);
          failedCount++;
        }
      }
      
      log.info({
        processed: contentNeedingImages.length,
        success: successCount,
        failed: failedCount
      }, '[Agent 6] Image generation complete');
      
      return {
        items_processed: contentNeedingImages.length,
        items_created: successCount,
        items_failed: failedCount
      };
      
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Agent 6] Critical error');
      throw error;
    }
  }
  
  /**
   * Get content that needs images
   */
  private async getContentNeedingImages(): Promise<any[]> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return [];
    }
    
    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/content_queue?status=eq.approved&image_generation_status=eq.pending&order=quality_score.desc&limit=5`,
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
      log.error({ error: (error as Error).message }, '[Agent 6] Failed to get content');
      return [];
    }
  }
  
  /**
   * Check if this content type should have images
   */
  private shouldGenerateImage(content: any): boolean {
    const contentType = content.content_type;
    const generateForTypes = ['research', 'analysis', 'original'];
    
    return generateForTypes.includes(contentType);
  }
  
  /**
   * Generate image prompt from content
   */
  private generateImagePrompt(content: any): string {
    const text = content.content_text.toLowerCase();
    const topics = content.topic_tags || [];
    
    // Topic-based prompts
    if (topics.includes('defi') || text.includes('defi')) {
      return "abstract DeFi visualization with blockchain network connections, modern tech aesthetic, blue and purple gradient, clean professional style";
    }
    else if (topics.includes('eth_research') || topics.includes('ethereum') || text.includes('ethereum')) {
      return "ethereum network visualization with glowing connected nodes, clean modern style, blue and white colors, futuristic tech aesthetic";
    }
    else if (topics.includes('mev') || text.includes('mev')) {
      return "MEV transaction ordering concept visualization, abstract tech diagram, dark mode aesthetic, orange and black colors, professional";
    }
    else if (topics.includes('ai_crypto') || topics.includes('ai') || text.includes(' ai ')) {
      return "AI and blockchain intersection visualization, neural network nodes connecting to cryptocurrency blockchain, futuristic aesthetic, purple and cyan gradient";
    }
    else if (topics.includes('security') || text.includes('security') || text.includes('hack')) {
      return "blockchain security visualization with cryptographic shield, modern minimal design, blue and green colors, professional tech aesthetic";
    }
    else if (topics.includes('market') || text.includes('price') || text.includes('trading')) {
      return "cryptocurrency market abstract visualization, candlestick chart patterns, professional financial aesthetic, blue and gold colors";
    }
    else {
      return "cryptocurrency blockchain technology concept, abstract network visualization, modern minimalist aesthetic, professional tech style, blue gradient";
    }
  }
  
  /**
   * Generate image using Imagen API
   */
  private async generateImage(prompt: string, contentId: string): Promise<any[]> {
    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    
    if (!apiKey) {
      throw new Error('Google GenAI API key not configured');
    }
    
    log.info({ prompt }, '[Agent 6] Calling Imagen API...');
    
    try {
      // Call Imagen API via REST
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:predict`,
        {
          method: 'POST',
          headers: {
            'x-goog-api-key': apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            instances: [{ prompt: prompt }],
            parameters: {
              sampleCount: 1,  // Generate 1 image
              aspectRatio: '16:9'
            }
          })
        }
      );
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Imagen API error: ${response.status} - ${error}`);
      }
      
      const result = await response.json() as any;
      
      // Extract image data and save locally
      const images = [];
      
      if (result.predictions && result.predictions.length > 0) {
        for (let i = 0; i < result.predictions.length; i++) {
          const prediction = result.predictions[i];
          
          // Image is in bytesBase64Encoded field
          const imageData = prediction.bytesBase64Encoded || prediction.image || prediction.imageBytes;
          
          if (imageData) {
            // Save to local storage
            const fileName = `${contentId}-${i}.png`;
            const localPath = path.join(this.imageStoragePath, fileName);
            const buffer = Buffer.from(imageData, 'base64');
            fs.writeFileSync(localPath, buffer);
            
            images.push({
              url: null,  // TODO: Upload to CDN if needed
              local_path: localPath,
              prompt: prompt,
              aspect_ratio: '16:9',
              generated_at: new Date().toISOString()
            });
            
            log.info({ 
              file: fileName,
              size: buffer.length
            }, '[Agent 6] Saved image');
          }
        }
      }
      
      // Log successful generation
      await this.logImageGeneration(contentId, prompt, 'success', images.map(img => img.local_path));
      
      return images;
      
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Agent 6] Imagen API failed');
      await this.logImageGeneration(contentId, prompt, 'failed', [], (error as Error).message);
      throw error;
    }
  }
  
  /**
   * Update content queue with images
   */
  private async updateContentWithImages(contentId: string, images: any[], prompt: string): Promise<void> {
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
        images: {
          images: images,
          primary_image: 0
        },
        image_prompt: prompt,
        image_generation_status: 'completed',
        image_by_agent: 'image_generator'
      })
    });
  }
  
  /**
   * Mark as not needing images
   */
  private async markAsNotNeeded(contentId: string): Promise<void> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) return;
    
    await fetch(`${supabaseUrl}/rest/v1/content_queue?id=eq.${contentId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        image_generation_status: 'not_needed'
      })
    });
  }
  
  /**
   * Mark as failed
   */
  private async markAsFailed(contentId: string, errorMessage: string): Promise<void> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) return;
    
    await fetch(`${supabaseUrl}/rest/v1/content_queue?id=eq.${contentId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        image_generation_status: 'failed'
      })
    });
  }
  
  /**
   * Log image generation
   */
  private async logImageGeneration(
    contentId: string,
    prompt: string,
    status: string,
    imageUrls: string[],
    errorMessage?: string
  ): Promise<void> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) return;
    
    try {
      await fetch(`${supabaseUrl}/rest/v1/image_generation_logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          content_id: contentId,
          prompt: prompt,
          model: this.model,
          status: status,
          image_urls: imageUrls,
          error_message: errorMessage || null
        })
      });
    } catch (error) {
      log.warn({ error: (error as Error).message }, '[Agent 6] Failed to log image generation');
    }
  }
  
  /**
   * Ensure image directory exists
   */
  private ensureImageDirectory(): void {
    if (!fs.existsSync(this.imageStoragePath)) {
      fs.mkdirSync(this.imageStoragePath, { recursive: true });
      log.info({ path: this.imageStoragePath }, '[Agent 6] Created image storage directory');
    }
  }
}

