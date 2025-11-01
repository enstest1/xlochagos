# GitHub Repositories for Authentic AI Writing

## Top Recommendations for Making Posts More Authentic

### 1. **ai2human** - Transform AI text to human-like
**Repository**: https://github.com/chophe/ai2human

**What it does**:
- Python toolkit using Langchain and OpenAI
- Transforms formal/robotic AI-generated text into natural, engaging content
- Makes text sound more human-like

**Use case**: Post-processing pipeline to humanize generated content

**Installation**:
```bash
git clone https://github.com/chophe/ai2human
cd ai2human
pip install -r requirements.txt
```

---

### 2. **prompt-collections** - Human-AI collaborative prompts
**Repository**: https://github.com/cyharyanto/prompt-collections

**What it does**:
- 🤝 Human-AI collaborative prompt engineering
- 🧠 Mental models for real understanding
- 💡 Frameworks that center human expertise
- 🌱 Grows capability, doesn't just automate

**Use case**: Better prompt engineering for authentic voice

**Key features**:
- Thoughtful critic prompts
- Edge case identification
- Fundamental tension resolution

---

### 3. **dair-ai/Prompt-Engineering-Guide** - Comprehensive prompt guide
**Repository**: https://github.com/dair-ai/Prompt-Engineering-Guide

**What it does**:
- Jupyter notebooks with prompt engineering techniques
- Best practices for various AI models
- Examples and tutorials

**Use case**: Learn and implement better prompting strategies

---

### 4. **felipepimentel/prompts** - Curated optimized prompts
**Repository**: https://github.com/felipepimentel/prompts

**What it does**:
- Curated collection of optimized AI prompts
- Organized by category (academic, art, developer, writing, etc.)
- Tested and optimized for various use cases

**Use case**: Ready-to-use prompts for different content types

**Categories**:
- `writing/` - Content creation prompts
- `developer/` - Developer-focused prompts
- `meta/` - Prompt engineering techniques

---

### 5. **promptslab/Awesome-Prompt-Engineering** - Prompt engineering resources
**Repository**: https://github.com/promptslab/Awesome-Prompt-Engineering

**What it does**:
- Curated list of prompt engineering resources
- Tools, frameworks, and techniques
- Educational content

**Use case**: Discover new tools and techniques

---

### 6. **wasabeef/claude-code-cookbook** - AI writing style checker
**Repository**: https://github.com/wasabeef/claude-code-cookbook

**What it does**:
- `/ai-writing-check` command for detecting AI-like text
- Identifies "AI smell" in writing
- Suggests improvements for natural expression
- Can scan files or entire projects

**Use case**: Post-generation quality check to ensure authenticity

**Example usage**:
```bash
/ai-writing-check --file post.txt
# Detects AI-style expressions and suggests natural alternatives
```

---

### 7. **X-PLUG/WritingBench** - Writing quality benchmark
**Repository**: https://github.com/X-PLUG/WritingBench

**What it does**:
- Comprehensive benchmark for generative writing
- Evaluates writing quality
- Research-backed metrics

**Use case**: Evaluate and improve writing quality metrics

---

### 8. **f/awesome-chatgpt-prompts** - Community-curated prompts
**Repository**: https://github.com/f/awesome-chatgpt-prompts

**What it does**:
- Large collection of community-contributed prompts
- Tested prompts for various scenarios
- Examples of effective prompt patterns

**Use case**: Find prompts that create authentic-sounding content

---

### 9. **MotiaDev/motia-examples** - Viral content prompts
**Repository**: https://github.com/MotiaDev/motia-examples

**What it does**:
- Example: Blog-to-tweet conversion prompts
- Viral content engineering strategies
- Engagement pattern optimization

**Use case**: Create engaging, authentic-sounding social media content

**Example**:
```javascript
// Prompt for viral tweets from technical articles
const prompt = `
You are a viral content strategist for developer communities on X.
Transform this technical article into 3-5 viral tweets that:
1. Use proven engagement patterns (curiosity gaps, lists, quotes)
2. Include specific technical details that establish credibility  
3. Appeal to developers, engineers, and tech influencers
4. Stay within 280 characters while maximizing shareability
`;
```

---

## Integration Strategy for Our Project

### Option 1: Post-Processing Pipeline (Recommended)
Integrate `ai2human` as a post-processing step after content generation:

```
Generate Post → ai2human humanize → Quality Check → Publish
```

**Implementation**:
```python
# Add to standalonePremiumGenerator.ts or new service
import ai2human

def humanize_content(generated_text: str) -> str:
    """Transform AI-generated text to sound more human"""
    # Use ai2human to make content more authentic
    humanized = ai2human.transform(generated_text)
    return humanized
```

### Option 2: Prompt Engineering Enhancement
Use curated prompts from `felipepimentel/prompts` or `prompt-collections` to improve our existing prompts:

**File**: `mvp/src/services/standalonePremiumGenerator.ts`

**Current**: We have custom prompts for authentic user voice
**Enhancement**: Incorporate proven patterns from these repos

### Option 3: Quality Check Integration
Add `ai-writing-check` equivalent to our quality control:

**File**: `mvp/src/agents/qualityController.ts`

**Add**:
- Detect "AI smell" in generated content
- Flag posts that sound too robotic
- Suggest improvements

---

## Quick Start: ai2human Integration

### Step 1: Clone and Install
```bash
cd mvp
git clone https://github.com/chophe/ai2human.git tools/ai2human
cd tools/ai2human
pip install -r requirements.txt
```

### Step 2: Create Integration Service
```typescript
// mvp/src/services/contentHumanizer.ts
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export class ContentHumanizer {
  async humanize(text: string): Promise<string> {
    // Write text to temp file
    const tempFile = path.join(__dirname, '../../temp/humanize_input.txt');
    fs.writeFileSync(tempFile, text);
    
    // Call ai2human
    const result = execSync(
      `python tools/ai2human/ai_detector_adv.py ${tempFile}`,
      { encoding: 'utf-8' }
    );
    
    // Return humanized text
    return result;
  }
}
```

### Step 2: Integrate into Pipeline
```typescript
// In standalonePremiumGenerator.ts
import { ContentHumanizer } from './contentHumanizer';

const humanizer = new ContentHumanizer();

// After content generation
const generatedContent = await llmService.generatePremiumContent(...);
const humanizedContent = await humanizer.humanize(generatedContent);

// Use humanizedContent instead of generatedContent
```

---

## Recommended Priority

1. **Immediate**: Start with `ai2human` for post-processing (Option 1)
2. **Short-term**: Review and integrate prompts from `felipepimentel/prompts`
3. **Medium-term**: Add quality checking with AI writing detection
4. **Long-term**: Build custom humanization based on successful patterns

---

## Resources

- **Prompt Engineering Guide**: https://github.com/dair-ai/Prompt-Engineering-Guide
- **Awesome Prompts**: https://github.com/f/awesome-chatgpt-prompts
- **AI Writing Tools**: https://github.com/topics/ai-writing-assistant
- **Content Generation Tools**: https://github.com/topics/ai-content-generation

---

*Last Updated: 2025-11-01*
*Focus: Making AI-generated posts sound more authentic and human-like*

