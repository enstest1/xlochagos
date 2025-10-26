/**
 * Test Image Generation
 * Quick test script to verify image generation is working
 */

import { ImageGeneratorAgent } from './src/agents/imageGeneratorAgent';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testImageGeneration() {
  console.log('🧪 Testing Image Generation...\n');

  // Check API key
  if (!process.env.GOOGLE_GENAI_API_KEY) {
    console.error('❌ Error: GOOGLE_GENAI_API_KEY not set in .env');
    process.exit(1);
  }

  console.log('✅ API key found\n');

  // Create image generator
  const imageGenerator = new ImageGeneratorAgent();

  try {
    console.log('🔄 Running image generator...\n');
    const result = await imageGenerator.run();

    console.log('📊 Results:');
    console.log(`   - Items processed: ${result.items_processed}`);
    console.log(`   - Images created: ${result.items_created}`);
    console.log(`   - Failed: ${result.items_failed}`);

    if (result.items_created > 0) {
      console.log('\n✅ Image generation successful!');
      console.log('📁 Check the persist/images/ directory for generated images');
    } else {
      console.log('\n⚠️ No images were generated');
      console.log('💡 This could mean:');
      console.log('   - No approved content is pending images');
      console.log('   - Content type doesn\'t require images');
      console.log('   - Images already generated for pending content');
    }
  } catch (error) {
    console.error('\n❌ Error testing image generation:', (error as Error).message);
    process.exit(1);
  }
}

testImageGeneration();
