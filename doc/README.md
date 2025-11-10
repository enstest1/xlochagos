# Assets Folder for Image Generation

## Folder Structure

```
assets/
├── bankr-bot/     # Base images and brand assets for @bankrbot posts
├── wallchain/     # Base images and brand assets for @wallchain posts
├── kloutgg/       # Base images and brand assets for @kloutgg posts
└── generated/     # AI-generated images (output folder)
```

## How to Use

1. **Place your base images** in the appropriate folder (e.g., `bankr-bot/logo.png`)
2. **Run the premium content generator** - it will:
   - Load the base image
   - Upload it to Google Gemini Imagen API
   - Generate a new image with text overlay
   - Save to `generated/` folder

## File Formats Supported

- **Base images**: PNG, JPG, JPEG (recommended: PNG with transparency)
- **Output format**: PNG (saved to `generated/` folder)

## Example Usage

For @bankrbot posts:
1. Add `bankr-bot/logo.png` with the @bankrbot logo
2. Run: `npm run cli -- swarm premium-standalone`
3. Gemini will generate images with text like:
   - "🚀 AI-Powered DeFi Platform"
   - "💎 Early Access Available"
   - "⚡ Revolutionary Banking Tech"

## Notes

- Gemini Imagen can overlay text on your base images
- Generated images are saved with timestamps for tracking
- You can preview generated images before posting



