/**
 * Image Generation Service
 * Uses Google Gemini Imagen API to generate images with base image references
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { log } from '../log';

export interface GenerateImageParams {
  content: string;
  targetAccount: string; // e.g., 'bankr-bot', 'wallchain', 'kloutgg'
  textOverlay?: string;  // Optional text to add to the image
}

export interface ImageResult {
  success: boolean;
  imageUrl?: string;
  localPath?: string;
  error?: string;
}

export class ImageGenerationService {
  private genAI: GoogleGenerativeAI;
  private assetsPath: string;
  private generatedPath: string;

  constructor() {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_GEMINI_API_KEY not found in environment variables');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.assetsPath = path.join(process.cwd(), 'assets');
    this.generatedPath = path.join(this.assetsPath, 'generated');

    // Ensure directories exist
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.assetsPath)) {
      fs.mkdirSync(this.assetsPath, { recursive: true });
    }
    if (!fs.existsSync(this.generatedPath)) {
      fs.mkdirSync(this.generatedPath, { recursive: true });
    }
  }

  /**
   * Generate an image for premium content
   */
  async generateImage(params: GenerateImageParams): Promise<ImageResult> {
    try {
      const { content, targetAccount, textOverlay } = params;

      log.info({ targetAccount, hasTextOverlay: !!textOverlay }, 'Starting image generation');

      // Load base image if available
      const baseImagePath = path.join(this.assetsPath, targetAccount, 'base.png');
      let baseImageBase64: string | null = null;

      if (fs.existsSync(baseImagePath)) {
        log.info({ baseImagePath }, 'Loading base image');
        const imageBuffer = fs.readFileSync(baseImagePath);
        baseImageBase64 = imageBuffer.toString('base64');
      } else {
        log.warn({ baseImagePath }, 'No base image found, generating from scratch');
      }

      // Generate prompt for image
      const imagePrompt = this.createImagePrompt(content, targetAccount, textOverlay);

      // Call Gemini Imagen API
      const model = this.genAI.getGenerativeModel({ model: 'imagen-4.0-generate-001' });

      const requestConfig: any = {
        prompt: imagePrompt,
      };

      // If we have a base image, include it as a reference
      if (baseImageBase64) {
        requestConfig.reference_image = {
          mimeType: 'image/png',
          data: baseImageBase64
        };
      }

      log.info({ prompt: imagePrompt.substring(0, 100) }, 'Calling Imagen API');

      const result = await model.generateImage(requestConfig);
      
      // Extract image data
      if (result.response?.candidates?.[0]?.image) {
        const imageData = result.response.candidates[0].image.data;
        
        // Save image to local file
        const fileName = `${targetAccount}_${Date.now()}.png`;
        const filePath = path.join(this.generatedPath, fileName);
        fs.writeFileSync(filePath, Buffer.from(imageData, 'base64'));

        log.info({ fileName, filePath }, 'Image generated successfully');

        return {
          success: true,
          localPath: filePath,
          imageUrl: filePath // Can be replaced with CDN URL later
        };
      } else {
        throw new Error('No image data in API response');
      }

    } catch (error) {
      log.error({ error: (error as Error).message }, 'Image generation failed');
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Create a prompt for image generation
   */
  private createImagePrompt(
    content: string,
    targetAccount: string,
    textOverlay?: string
  ): string {
    const accountNames: Record<string, string> = {
      'bankr-bot': 'Bankr Bot - AI-powered DeFi banking platform',
      'wallchain': 'Wallchain - AttentionFi ecosystem',
      'kloutgg': 'Kloutgg - SocialFi platform on Solana'
    };

    const accountTheme = accountNames[targetAccount] || targetAccount;

    let prompt = `Create a modern, professional social media image for a crypto/DeFi post about: ${accountTheme}\n\n`;

    // Add content context
    if (content) {
      prompt += `Content: ${content.substring(0, 200)}\n\n`;
    }

    // Add style requirements
    prompt += `Style requirements:
- Modern, clean design
- Professional color scheme (blues, purples, gradients)
- Cryptocurrency/blockchain aesthetic
- Social media optimized (1:1 or 16:9 aspect ratio)
- Eye-catching and shareable
- Minimal text overlay (if text added, make it bold and readable)
`;

    // Add text overlay instruction if provided
    if (textOverlay) {
      prompt += `\nText overlay to include: "${textOverlay}"\n`;
      prompt += `Make the text overlay prominent, stylish, and readable.`;
    } else {
      prompt += `\nNo text overlay needed - focus on visual design.`;
    }

    // Add base image reference instruction
    prompt += `\nIf a reference image is provided, use it as a style guide and incorporate similar colors, branding, or design elements while creating something new and unique.`;

    return prompt;
  }

  /**
   * List available base images
   */
  listBaseImages(): Record<string, string[]> {
    const result: Record<string, string[]> = {};

    const accountFolders = ['bankr-bot', 'wallchain', 'kloutgg'];
    
    for (const folder of accountFolders) {
      const folderPath = path.join(this.assetsPath, folder);
      if (fs.existsSync(folderPath)) {
        const files = fs.readdirSync(folderPath);
        result[folder] = files.filter(f => 
          f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg')
        );
      } else {
        result[folder] = [];
      }
    }

    return result;
  }
}



