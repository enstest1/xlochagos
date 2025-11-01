# Research & Content Generation Workflow

## Overview

This document explains how the system researches designated subjects/features and creates insightful posts when adding new projects to track.

## Current Workflow

### 1. Adding a New Project

To add a new project, edit `mvp/config/target-accounts.yaml`:

```yaml
- handle: "@newproject"
  category: "airdrop_farming"
  niche: "airdrop_farming"
  weight: 1.0
  scrape_replies: true
  scrape_limit: 30
  enabled: true
  note: "Description of why this project is interesting"
  url: "https://x.com/newproject"
```

### 2. Designating Research Subjects/Features

**Location**: `mvp/src/services/standalonePremiumGenerator.ts`

The system automatically detects interesting features/protocols using regex patterns in the `specialFeaturePatterns` array:

```typescript
const specialFeaturePatterns = [
  /\bx\s*402\b/i,              // x402 protocol
  /\bx402\b/i,
  /ghost\s*in\s*the\s*shell/i,  // Specific features
  /zora/i,                      // Zora protocol
  /farcaster/i,                 // Farcaster integration
  /prediction/i,                // Prediction markets
  /swap/i,                      // Token swaps
  /burn/i,                      // Token burns
  /airdrop/i                    // Airdrops
];
```

**To Add New Research Subjects:**

1. Add a new regex pattern to `specialFeaturePatterns` array (around line 486)
2. Update the topic description logic in `getTopicDescription()` if needed (line 398)
3. Update the interestingness scoring in `computeInterestingness()` if needed (line 367)

Example for a new feature called "Bridge Protocol":
```typescript
/bridge\s*protocol/i,
/bridge\s*v\d+/i,  // Bridge version numbers
```

### 3. Research Trigger Flow

When a scraped post contains a designated feature:

```
POST SCRAPED → DETECT SPECIAL FEATURE → TRIGGER RESEARCH → BRAINSTORM → GENERATE POST
```

**Step-by-step:**

1. **Scraping**: System scrapes posts from target accounts using Playwright
2. **Detection**: System checks if post contains any `specialFeaturePatterns`
3. **Research** (if detected):
   - LLM analyzes the post to identify technical features/protocols
   - Explains what they are and why they're revolutionary
   - Research is stored and passed to content generation
4. **Brainstorming**:
   - LLM generates 5-7 novel use cases
   - Focuses on revolutionary implications
   - Explores untapped possibilities
5. **Content Generation**:
   - Uses original post + research + brainstorm ideas
   - Rewrites in authentic user voice
   - Maintains proper attribution (doesn't claim others' actions as your own)

### 4. Research Quality Controls

**Current Research Prompt** (`generateAirdropPost`, line ~501):

```
You're analyzing a post from {target.handle}:

POST: {originalPost}

TASK: Identify ONLY special technical features/protocols mentioned 
(like x402, Zora, Farcaster, etc.). Explain what they are and 
why they're revolutionary for Bankr.

Focus on:
- Technical protocols mentioned
- Revolutionary features
- Why this matters for crypto/DeFi

Keep it brief (2-3 sentences max).
```

**Brainstorm Prompt** (line ~532):

```
You found this post from {target.handle}:

ORIGINAL POST: {originalPost}
DEEP RESEARCH: {deepResearch}

TASK: Brainstorm 5-7 novel, exciting use cases or implementations 
that people haven't thought of yet.

Focus on:
- Revolutionary implications for the crypto/DeFi space
- Wild use cases that haven't been explored
- How this could transform how people interact onchain
- Social/community impacts
```

### 5. Content Generation with Research

The final content generation combines:

1. **Original Post**: The actual scraped content to rewrite
2. **Deep Research**: Technical understanding of featured protocols
3. **Brainstormed Angles**: Novel use cases and implications
4. **Account Context**: Any stored research data for the target account

**Output Style**:
- Authentic user discovering cool tech
- Proper attribution (doesn't claim others' experiences as your own)
- Adds actual insight from research
- Casual, conversational tone

### 6. Adding Account-Level Research Data

For deeper context on projects, research can be stored in Supabase `research_data` table:

- **Topic**: Project/account name
- **Summary**: Research findings
- **Source**: Where research came from
- **Created_at**: Timestamp

The system automatically fetches this when generating posts via `getResearchDataForTarget()` (line 418).

## Example: Adding a New Project with Research Subjects

**Scenario**: Adding @newproject that uses "Quantum Bridge" protocol

### Step 1: Add to target-accounts.yaml

```yaml
- handle: "@newproject"
  category: "airdrop_farming"
  enabled: true
  # ... other config
```

### Step 2: Add Research Pattern

In `standalonePremiumGenerator.ts`, add to `specialFeaturePatterns`:

```typescript
/quantum\s*bridge/i,
/qbridge/i,
/qb\d+/i,  // Quantum Bridge version numbers
```

### Step 3: Add Topic Description (Optional)

In `getTopicDescription()`, add handling for quantum bridge:

```typescript
if (hasQuantumBridge) {
  return 'The character appears within quantum field visualizations, 
  with inter-dimensional bridges connecting blockchain networks. 
  Particles and energy streams represent cross-chain transactions.';
}
```

### Step 4: Add Interestingness Boost (Optional)

In `computeInterestingness()`, add boost for quantum bridge mentions:

```typescript
if (/quantum\s*bridge/i.test(text)) topicBoost += 0.15;
```

## Best Practices

1. **Research Patterns**: Use specific, non-overlapping patterns
2. **Topic Diversity**: System already prioritizes diverse topics in selection
3. **Attribution**: System now properly handles posts with others' personal claims
4. **Research Quality**: Keep research brief but substantive (2-3 sentences)
5. **Brainstorming**: Focus on novel, unexplored angles

## Current Projects & Their Research Subjects

### @bankrbot
- **Features**: x402, SDK, banking, HTTP, Telegram, Farcaster, automation, market data, wizard
- **Base Image**: `./assets/bankr-bot/AriqgxQN_400x400.jpg`

### @wallchain
- **Features**: Airdrop farming, cross-chain
- **Base Image**: `./assets/wallchain/wallchain.jpg`

### @kloutgg
- **Features**: Copper-backed stablecoins, prediction markets
- **Base Image**: `./assets/kloutgg/kloutgg.jpg`

## Future Enhancements

Potential improvements to the research system:

1. **Manual Research Tags**: Allow config file to specify research subjects per account
2. **Research Depth Levels**: Different research depth for different feature types
3. **External Research APIs**: Integrate Perplexity or other research tools for deeper context
4. **Research Caching**: Cache research results to avoid redundant LLM calls
5. **Research Validation**: Verify research accuracy before using in content

