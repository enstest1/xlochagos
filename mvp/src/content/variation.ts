import crypto from 'crypto';
import { PostDraft } from '../types';
import { logContentVariation } from '../log';

export class ContentVariationEngine {
  private readonly variations = {
    prefixes: [
      '', // No prefix (original)
      'Quick take: ',
      'Worth noting: ',
      'Interesting: ',
      'Update: ',
      'FYI: ',
      'Breaking: ',
      'Analysis: '
    ],

    linkPhrases: [
      'Link: ',
      'Source: ',
      'Details: ',
      'More: ',
      'Read: ',
      'Full story: ',
      '' // No phrase (original)
    ],

    punctuationStyles: [
      (text: string) => text, // Original
      (text: string) => text.replace(/\./g, ''), // Remove periods
      (text: string) => text.replace(/,/g, ' –'), // Replace commas with dashes
      (text: string) => text.replace(/!/g, '.'), // Replace exclamations
    ],

    sentenceConnectors: [
      ' ',
      ' — ',
      '. ',
      ', ',
      '; '
    ]
  };

  addContentVariation(draft: PostDraft, seed?: number): PostDraft {
    // Use content hash as seed for consistent variation per content
    const actualSeed = seed || this.hashToSeed(draft.contentHash);
    const rng = this.createSeededRNG(actualSeed);

    // Extract link from end of text
    const linkMatch = draft.text.match(/\s+(https?:\/\/\S+)$/);
    if (!linkMatch) return draft; // No link found, return as-is

    const [, link] = linkMatch;
    const textWithoutLink = draft.text.replace(/\s+(https?:\/\/\S+)$/, '');

    // Apply variations based on seeded randomness
    const prefix = this.variations.prefixes[Math.floor(rng() * this.variations.prefixes.length)];
    const linkPhrase = this.variations.linkPhrases[Math.floor(rng() * this.variations.linkPhrases.length)];
    const punctuationStyle = this.variations.punctuationStyles[Math.floor(rng() * this.variations.punctuationStyles.length)];

    // Apply text transformations
    let variedText = prefix + textWithoutLink;
    if (punctuationStyle) {
      variedText = punctuationStyle(variedText);
    }

    // Apply sentence connector variation
    if (rng() > 0.7) { // 30% chance to vary connectors
      const connector = this.variations.sentenceConnectors[Math.floor(rng() * this.variations.sentenceConnectors.length)];
      if (connector) {
        variedText = variedText.replace(/\. /g, connector);
      }
    }

    // Reconstruct with link
    variedText = variedText.trim() + ' ' + linkPhrase + link;

    // Ensure it fits within length limits
    if (variedText.length > 280) {
      // If too long, fall back to simpler variation
      variedText = textWithoutLink.trim() + ' ' + link;
    }

    // Create varied hash
    const variedHash = this.createContentHash(variedText);

    logContentVariation(draft.contentHash, variedHash, actualSeed);

    return {
      ...draft,
      text: variedText,
      contentHash: variedHash,
      variationSeed: actualSeed
    };
  }

  // Apply subtle word variations to avoid pattern detection
  applyWordVariations(text: string, seed: number): string {
    const rng = this.createSeededRNG(seed);

    const synonymMap = {
      'and': ['&', 'and', 'plus'],
      'the': ['the', 'this', 'that'],
      'with': ['with', 'using', 'via'],
      'new': ['new', 'latest', 'recent'],
      'first': ['first', '1st', 'initial'],
      'now': ['now', 'currently', 'today'],
      'here': ['here', 'below', 'following']
    };

    let variedText = text;

    // Apply synonym substitutions with low probability
    for (const [original, synonyms] of Object.entries(synonymMap)) {
      if (rng() > 0.8 && synonyms.length > 0) { // 20% chance to replace each word
        const synonym = synonyms[Math.floor(rng() * synonyms.length)];
        if (synonym) {
          const regex = new RegExp(`\\b${original}\\b`, 'gi');
          variedText = variedText.replace(regex, synonym);
        }
      }
    }

    return variedText;
  }

  // Check similarity against existing content patterns
  async calculateContentSimilarity(text1: string, text2: string): Promise<number> {
    // Simple word-based similarity using Jaccard index
    const words1 = new Set(text1.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2));

    const words2 = new Set(text2.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2));

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  // Generate multiple variations for A/B testing
  generateMultipleVariations(draft: PostDraft, count: number = 3): PostDraft[] {
    const variations: PostDraft[] = [draft]; // Include original

    for (let i = 1; i < count; i++) {
      const seed = this.hashToSeed(draft.contentHash + i.toString());
      const variation = this.addContentVariation(draft, seed);
      variations.push(variation);
    }

    return variations;
  }

  // Apply temporal variations (time-sensitive adjustments)
  applyTemporalVariation(draft: PostDraft): PostDraft {
    const now = new Date();
    const hour = now.getHours();

    // Adjust tone based on time of day
    let text = draft.text;

    if (hour >= 6 && hour < 12) {
      // Morning - add energy
      text = text.replace(/\binteresting\b/gi, 'exciting');
    } else if (hour >= 12 && hour < 18) {
      // Afternoon - professional tone
      text = text.replace(/\bcool\b/gi, 'noteworthy');
    } else if (hour >= 18 && hour < 22) {
      // Evening - casual tone
      text = text.replace(/\bsignificant\b/gi, 'important');
    }

    return {
      ...draft,
      text,
      contentHash: this.createContentHash(text)
    };
  }

  // Anti-pattern detection and mitigation
  detectAndMitigatePatterns(drafts: PostDraft[]): PostDraft[] {
    if (drafts.length < 2) return drafts;

    const patterns = this.detectCommonPatterns(drafts);

    return drafts.map((draft, index) => {
      if (patterns.commonPrefixes.length > 0 && patterns.commonPrefixes[0] && draft.text.startsWith(patterns.commonPrefixes[0])) {
        // Vary the prefix
        const seed = this.hashToSeed(draft.contentHash + 'prefix');
        return this.addContentVariation(draft, seed);
      }

      if (patterns.commonSuffixes.length > 0) {
        const linkMatch = draft.text.match(/\s+(https?:\/\/\S+)$/);
        if (linkMatch && patterns.commonSuffixes.some(suffix => draft.text.includes(suffix))) {
          // Vary the link phrase
          const seed = this.hashToSeed(draft.contentHash + 'suffix');
          return this.addContentVariation(draft, seed);
        }
      }

      return draft;
    });
  }

  private detectCommonPatterns(drafts: PostDraft[]): {
    commonPrefixes: string[];
    commonSuffixes: string[];
    repeatedPhrases: string[];
  } {
    const prefixes = drafts.map(d => d.text.split(/[.!?]/)[0]).filter(p => p !== undefined);
    const suffixes = drafts.map(d => {
      const parts = d.text.split(' ');
      return parts.slice(-3).join(' '); // Last 3 words before link
    });

    // Find common patterns (simplified)
    const prefixCounts = this.countOccurrences(prefixes);
    const suffixCounts = this.countOccurrences(suffixes);

    return {
      commonPrefixes: Object.keys(prefixCounts).filter(p => prefixCounts[p] && prefixCounts[p] > 1),
      commonSuffixes: Object.keys(suffixCounts).filter(s => suffixCounts[s] && suffixCounts[s] > 1),
      repeatedPhrases: [] // Could be extended for phrase detection
    };
  }

  private countOccurrences(items: string[]): Record<string, number> {
    return items.reduce((acc, item) => {
      acc[item] = (acc[item] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private hashToSeed(hash: string): number {
    const hashBuffer = crypto.createHash('md5').update(hash).digest();
    return hashBuffer.readUInt32BE(0);
  }

  private createSeededRNG(seed: number): () => number {
    let state = seed;
    return () => {
      // Simple LCG (Linear Congruential Generator)
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  private createContentHash(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
  }

  // Preserve important elements while varying presentation
  preserveKeyElements(draft: PostDraft): {
    keyPhrases: string[];
    urls: string[];
    mentions: string[];
    hashtags: string[];
  } {
    const text = draft.text;

    return {
      keyPhrases: this.extractKeyPhrases(text),
      urls: text.match(/https?:\/\/\S+/g) || [],
      mentions: text.match(/@\w+/g) || [],
      hashtags: text.match(/#\w+/g) || []
    };
  }

  private extractKeyPhrases(text: string): string[] {
    // Extract quoted phrases and technical terms
    const quotedPhrases = text.match(/"[^"]+"/g) || [];
    const technicalTerms = text.match(/\b[A-Z]{2,}\b/g) || []; // Acronyms
    const numbers = text.match(/\b\d+(?:\.\d+)?(?:[%$€£¥]|\s*(?:million|billion|thousand|percent))\b/g) || [];

    return [...quotedPhrases, ...technicalTerms, ...numbers];
  }

  // Quality check for variations
  validateVariation(original: PostDraft, varied: PostDraft): {
    valid: boolean;
    issues: string[];
    similarity: number;
  } {
    const issues: string[] = [];

    // Check length
    if (varied.text.length > 280) {
      issues.push('Variation exceeds character limit');
    }

    // Check that key elements are preserved
    const originalElements = this.preserveKeyElements(original);
    const variedElements = this.preserveKeyElements(varied);

    if (originalElements.urls.length !== variedElements.urls.length) {
      issues.push('URL count mismatch');
    }

    // Check similarity (should be similar but not identical)
    const similarity = this.calculateSyntacticSimilarity(original.text, varied.text);

    if (similarity < 0.3) {
      issues.push('Variation too different from original');
    } else if (similarity > 0.95) {
      issues.push('Variation too similar to original');
    }

    return {
      valid: issues.length === 0,
      issues,
      similarity
    };
  }

  private calculateSyntacticSimilarity(text1: string, text2: string): number {
    // Character-level similarity for syntactic comparison
    const chars1 = text1.toLowerCase().replace(/\s+/g, '');
    const chars2 = text2.toLowerCase().replace(/\s+/g, '');

    const maxLength = Math.max(chars1.length, chars2.length);
    if (maxLength === 0) return 1;

    let matches = 0;
    const minLength = Math.min(chars1.length, chars2.length);

    for (let i = 0; i < minLength; i++) {
      if (chars1[i] === chars2[i]) {
        matches++;
      }
    }

    return matches / maxLength;
  }
}