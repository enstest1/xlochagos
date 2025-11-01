/**
 * Agent 6: Image Generator
 * Generates images using Google Gemini Imagen API
 */

import { log } from '../log';
import fs from 'fs';
import path from 'path';

export class ImageGeneratorAgent {
  private imageStoragePath = './assets/generated';
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
    const text: string = (content.content_text || '').toLowerCase();
    const topics: string[] = content.topic_tags || [];

    // Shared guardrails / quality bar
    const baseDirectives = [
      "Do NOT include any text overlays, UI, logos, or watermarks",
      "No screenshots, charts, or phone mockups",
      "High detail, sharp focus, cinematic lighting, volumetric light, glossy highlights",
      "Professional digital art, cohesive color grading, clean composition"
    ];

    // Bankr bot character style
    const bankrCharacter = [
      "Subject: retro-styled friendly computer/mascot with a glowing pixel smile",
      "Form: slick, rounded panel edges, minimal dials, subtle glow trim",
      "Palette: deep purples, neon cyan, mint, and warm orange accent",
      "Background: dark purple-to-black gradient vignette"
    ];

    // Always-on integration + style directive
    const coreStyle = "Integrate the provided Bankr bot base image into the scene; style inspired by Ghost in the Shell anime with holographic UI motifs and cyberpunk city bokeh";

    // Heuristic themes
    if (text.includes('x402')) {
      return [
        coreStyle,
        "Theme: onchain internet payment system x402 as neon HUD",
        ...bankrCharacter,
        "Style: Ghost in the Shell / cyberpunk UI, holographic glass panels, scanlines, bokeh city lights",
        "Composition: hero HUD floating in front of city window, parallax UI layers",
        ...baseDirectives
      ].join('. ');
    }
    if (text.includes('wizard') || topics.includes('fantasy')) {
      return [
        coreStyle,
        "Theme: arcane banker wizard holding a glowing blue orb",
        ...bankrCharacter,
        "Style: hyper‑realistic character illustration, ornate robe details, subtle runes, cinematic rim light",
        "Composition: mid‑shot, subject centered, castle/bank silhouette in soft depth of field",
        ...baseDirectives
      ].join('. ');
    }
    if (topics.includes('defi') || text.includes('defi')) {
      return [
        coreStyle,
        "Theme: DeFi money flows visualized as luminous streams around the mascot",
        ...bankrCharacter,
        "Style: abstract networks, token coins orbiting, motion trails",
        "Composition: dynamic swirl around subject, balanced negative space",
        ...baseDirectives
      ].join('. ');
    }
    if (topics.includes('security') || text.includes('security') || text.includes('hack')) {
      return [
        coreStyle,
        "Theme: cryptographic security shield protecting onchain systems",
        ...bankrCharacter,
        "Style: hard specular highlights, hex shields, lock glyphs as light",
        ...baseDirectives
      ].join('. ');
    }
    if (topics.includes('market') || text.includes('trading') || text.includes('price')) {
      return [
        coreStyle,
        "Theme: market momentum and liquidity",
        ...bankrCharacter,
        "Style: flowing candlestick energy ribbons, gold accents, teal highlights",
        ...baseDirectives
      ].join('. ');
    }

    // Fallback general style
    return [
      coreStyle,
      "Theme: futuristic onchain computing",
      ...bankrCharacter,
      "Style: premium concept art, tasteful neon, elegant minimal UI motifs",
      ...baseDirectives
    ].join('. ');
  }
  
  /**
   * Generate image using Imagen API
   * Public method for external callers (e.g., premium content generator)
   */
  public async generateImage(prompt: string, contentId: string, options?: { baseImagePath?: string }): Promise<any[]> {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    
    if (!apiKey) {
      throw new Error('Google GenAI API key not configured');
    }
    
    log.info({ prompt }, '[Agent 6] Calling Gemini Image API...');
    
    try {
      // Prepare the request body for Gemini native image generation
      // If base image is provided, put it FIRST so Gemini sees it as the subject to transform
      const parts: any[] = [];
      
      if (options?.baseImagePath && fs.existsSync(options.baseImagePath)) {
        log.info({ baseImage: options.baseImagePath }, '[Agent 6] Using base image');
        
        // Convert base image to base64
        const baseImageBuffer = fs.readFileSync(options.baseImagePath);
        const baseImageBase64 = baseImageBuffer.toString('base64');
        // Detect mime type from extension
        const ext = options.baseImagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        
        // Put the image FIRST so Gemini understands it's the subject
        parts.push({
          inlineData: {
            mimeType: ext,
            data: baseImageBase64
          }
        });
      }
      
      // Then add the text prompt that describes how to transform/place the character
      parts.push({ text: prompt });

      const requestBody: any = {
        contents: [{
          parts: parts
        }],
        generationConfig: {
          responseModalities: ["Image"],
          imageConfig: {
            aspectRatio: "16:9"  // Landscape format optimized for Twitter/X feed
          }
        }
      };

      // Call Gemini API via REST
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`,
        {
          method: 'POST',
          headers: {
            'x-goog-api-key': apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        }
      );
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${error}`);
      }
      
      const result = await response.json() as any;
      
      // Extract image data and save locally
      const images = [];
      
      if (result.candidates && result.candidates[0] && result.candidates[0].content) {
        for (const part of result.candidates[0].content.parts) {
          if (part.inlineData) {
            // Save the generated image
            const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
            const filename = `${contentId}-${images.length}.png`;
            const filepath = path.join(this.imageStoragePath, filename);
            
            fs.writeFileSync(filepath, imageBuffer);
            
            images.push({
              url: null,  // TODO: Upload to CDN if needed
              local_path: filepath,
              prompt: prompt,
              aspect_ratio: '1:1',
              generated_at: new Date().toISOString()
            });
            
            log.info({ file: filename, size: imageBuffer.length }, '[Agent 6] Saved image');
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

