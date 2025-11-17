# OpenPipe + Humanization Integration Strategy

## Current OpenPipe Integration

**How it works**:
- OpenPipe headers (`op-log-request`, `op-api-key`) added to OpenRouter API calls
- Automatic request/response logging via HTTP headers
- Training data collected for fine-tuning future models
- Located in: `mvp/src/services/llmService.ts`

**Current Flow**:
```
LLM Service → OpenRouter API (with OpenPipe headers) → Response logged → Content returned
```

---

## Integration Options

### ✅ Option 1: Prompt Enhancement (RECOMMENDED)
**Best for OpenPipe integration**

**How it works**:
- Enhance existing prompts with humanization instructions
- LLM generates human-like content directly
- All calls logged to OpenPipe automatically
- Training data includes humanized output

**Implementation**:
1. Update prompts in `standalonePremiumGenerator.ts`
2. Add humanization guidelines to system/user prompts
3. No code changes to OpenPipe integration needed

**Pros**:
- ✅ Everything logged to OpenPipe
- ✅ Trains on final output (humanized)
- ✅ No additional services
- ✅ No extra API calls

**Cons**:
- ⚠️ Requires prompt engineering skill
- ⚠️ May need iteration to get right

---

### Option 2: Post-Processing with Separate LLM Call
**Good for OpenPipe, but adds cost**

**How it works**:
- First LLM call: Generate content (logged to OpenPipe)
- Second LLM call: Humanize content (also logged to OpenPipe)
- Both calls tracked for training

**Implementation**:
```typescript
// In standalonePremiumGenerator.ts
const generatedContent = await llmService.chat(...); // Logged to OpenPipe

// Humanization as another LLM call
const humanizationPrompt = `
Transform this AI-generated text to sound more human and authentic:
${generatedContent}

Make it sound like a real person wrote it, not an AI.
`;

const humanized = await llmService.chat([
  { role: 'system', content: 'You are a text humanization expert.' },
  { role: 'user', content: humanizationPrompt }
], 'openai/gpt-4o', {
  logToOpenPipe: true,
  tags: { step: 'humanization', agent: 'content_writer' }
}); // Also logged to OpenPipe
```

**Pros**:
- ✅ Both steps logged to OpenPipe
- ✅ Clear separation of concerns
- ✅ Can A/B test different humanization approaches

**Cons**:
- ❌ Doubles LLM API costs
- ❌ Adds latency (2 API calls)
- ❌ More complex pipeline

---

### Option 3: External Tool (ai2human)
**Not ideal for OpenPipe**

**How it works**:
- Generate content with LLM (logged to OpenPipe)
- Post-process with Python tool `ai2human` (NOT logged)
- OpenPipe only sees original output

**Implementation**:
```typescript
const generatedContent = await llmService.chat(...); // Logged to OpenPipe

// External Python script (not logged)
const humanized = await execSync(
  `python tools/ai2human/humanize.py "${generatedContent}"`
);
```

**Pros**:
- ✅ Specialized tool for humanization
- ✅ Can use pre-trained models

**Cons**:
- ❌ NOT logged to OpenPipe
- ❌ Requires Python environment
- ❌ Training data doesn't include final output
- ❌ Additional dependency

---

## Recommended Approach: Enhanced Prompts

### Current Prompt Structure
```typescript
const prompt = `YOUR ROLE: You are a crypto user...
STYLE ELEMENTS:
1. First-person discovery...
2. Casual, conversational...
...`;
```

### Enhanced Prompt (with humanization)
```typescript
const prompt = `YOUR ROLE: You are a crypto user who just discovered something about Bankr and wants to share it authentically. Write like a real person talking to friends, NOT a marketer.

CRITICAL: Sound genuinely human, not AI-generated. Use:
- Natural sentence flow (some shorter, some longer)
- Occasional typos or casual abbreviations (IMO, tbh)
- Personal opinions and hesitations
- Real-world context and comparisons
- Conversational filler words where natural ("I mean", "honestly", "kinda")
- Avoid: Perfect grammar, corporate speak, generic phrases

ORIGINAL POST TO REWRITE:
"${originalPost}"

[... rest of prompt ...]

YOUR REWRITE (must sound like a real human wrote this, not AI):`;
```

### Additional Prompt Enhancements

Add these to system prompt:
```typescript
const systemPrompt = `You are creating authentic social media content. Your writing must:
1. Use varied sentence lengths (some 5 words, some 20)
2. Include personal opinions with uncertainty ("seems like", "might be", "IMO")
3. Use natural language patterns (contractions, casual phrasing)
4. Avoid perfect structure - real people don't write perfectly
5. Include specific details that show real engagement
6. Sound like you're texting a friend, not writing marketing copy`;
```

---

## Implementation Plan

### Phase 1: Prompt Enhancement (Week 1)
1. ✅ Update prompts in `standalonePremiumGenerator.ts`
2. ✅ Add humanization guidelines to system prompts
3. ✅ Test with 10-20 posts
4. ✅ Review OpenPipe logs to verify quality

### Phase 2: A/B Testing (Week 2)
1. Generate posts with enhanced prompts
2. Compare against current output
3. Measure "AI smell" reduction
4. Adjust prompts based on results

### Phase 3: Optional LLM-Based Humanization (Week 3+)
If prompts aren't enough, add dedicated humanization step:
1. Add second LLM call for humanization
2. Tag appropriately for OpenPipe
3. Compare costs vs. quality improvement

---

## OpenPipe Tags for Humanization

If using Option 2 (separate LLM call), add tags:

```typescript
await llmService.chat(messages, model, {
  logToOpenPipe: true,
  tags: {
    agent: 'content_writer',
    step: 'humanization',
    quality_tier: 'premium',
    humanization_method: 'llm-refinement'
  }
});
```

This helps OpenPipe:
- Track humanization patterns
- Learn which humanization works best
- Fine-tune future models with humanization built-in

---

## Cost Comparison

### Option 1: Enhanced Prompts
- Cost: Same as current (~$0.02 per post)
- OpenPipe: ✅ Logs final output
- Training: ✅ On humanized content

### Option 2: Two LLM Calls
- Cost: 2x current (~$0.04 per post)
- OpenPipe: ✅ Logs both steps
- Training: ✅ On both generation and humanization

### Option 3: External Tool
- Cost: Same + Python runtime overhead
- OpenPipe: ❌ Only logs original output
- Training: ❌ Doesn't learn humanization

---

## Recommendation

**Start with Option 1 (Enhanced Prompts)** because:
1. ✅ Everything stays in OpenPipe ecosystem
2. ✅ No additional costs
3. ✅ Training data includes final output
4. ✅ Simple to implement
5. ✅ Can always add Option 2 later if needed

If Option 1 doesn't achieve desired authenticity, then add Option 2 (dedicated humanization LLM call) with proper OpenPipe tagging.

---

*Last Updated: 2025-11-01*
*Focus: Integrating humanization while maintaining OpenPipe training data quality*

