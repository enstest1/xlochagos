import { HeuristicResult, ContentConfig } from '../types';
import { logContentRejection } from '../log';

export class ContentHeuristics {
  private readonly banPhrases: string[];
  private readonly spamIndicators: RegExp[];
  private readonly minimumQuality: number;
  private readonly config: ContentConfig;

  constructor(config: ContentConfig) {
    this.config = config;
    this.banPhrases = config.ban_phrases.map(p => p.toLowerCase());
    this.minimumQuality = 0.6;

    // Enhanced spam detection patterns
    this.spamIndicators = [
      /^(introducing|announcing|we'?re excited|check this out)/i,
      /[🚀✨🎉🔥💥⭐️]{2,}/,
      /(game-?changer|revolutionary|breakthrough|disruptive)/i,
      /(must-see|don'?t miss|limited time|act now)/i,
      /(.)\1{3,}/, // Repeated characters (!!!! or ....)
      /(click here|learn more|find out|discover how)/i,
      /\b(amazing|incredible|awesome|fantastic|mind-?blowing)\b/i,
      /(you won'?t believe|shocking|unbelievable)/i,
      /\b(secret|exclusive|insider|leaked)\b/i
    ];
  }

  evaluateContent(text: string): HeuristicResult {
    const reasons: string[] = [];
    let score = 1.0;

    // Check banned phrases
    const lowerText = text.toLowerCase();
    for (const phrase of this.banPhrases) {
      if (lowerText.includes(phrase)) {
        reasons.push(`Contains banned phrase: "${phrase}"`);
        score -= 0.3;
      }
    }

    // Check spam indicators
    for (const pattern of this.spamIndicators) {
      if (pattern.test(text)) {
        reasons.push(`Matches spam pattern: ${pattern.source}`);
        score -= 0.2;
      }
    }

    // Check adjective density
    const adjectives = this.countAdjectives(text);
    const words = text.split(/\s+/).length;
    const adjectiveRatio = adjectives / words;

    if (adjectiveRatio > 0.25) {
      reasons.push(`Too many adjectives (${adjectives}/${words})`);
      score -= 0.3;
    }

    // Check for concrete claims
    const hasConcreteClaim = this.hasConcreteElements(text);
    if (this.config.require_claim && !hasConcreteClaim) {
      reasons.push('Lacks concrete claims or specific information');
      score -= 0.4;
    }

    // Check uniqueness
    const uniqueWords = this.countUniqueWords(text);
    if (uniqueWords < this.config.min_unique_words) {
      reasons.push(`Too few unique words (${uniqueWords})`);
      score -= 0.3;
    }

    // Check for link requirement
    const hasLink = /https?:\/\/\S+/.test(text);
    if (this.config.require_link && !hasLink) {
      reasons.push('Missing required link');
      score -= 0.5;
    }

    // Check text length balance
    if (text.length < 50) {
      reasons.push('Text too short to be meaningful');
      score -= 0.2;
    } else if (text.length > this.config.max_length) {
      reasons.push('Text too long for platform');
      score -= 0.1;
    }

    // Check for marketing speak
    const marketingScore = this.detectMarketingSpeak(text);
    if (marketingScore > 0.3) {
      reasons.push(`High marketing speak detected (${(marketingScore * 100).toFixed(1)}%)`);
      score -= marketingScore;
    }

    // Check readability
    const readabilityScore = this.calculateReadability(text);
    if (readabilityScore < 0.3) {
      reasons.push('Poor readability score');
      score -= 0.2;
    }

    // Bonus for specific patterns
    if (this.hasQuantifiableData(text)) {
      score += 0.1;
    }

    if (this.hasTimeReference(text)) {
      score += 0.05;
    }

    if (this.hasAuthoritySignals(text)) {
      score += 0.1;
    }

    if (this.hasSpecificEntities(text)) {
      score += 0.05;
    }

    const finalScore = Math.max(0, Math.min(1, score));
    const passed = finalScore >= this.minimumQuality && reasons.length === 0;

    if (!passed) {
      logContentRejection(
        reasons.join(', '),
        text,
        finalScore
      );
    }

    return {
      passed,
      reasons,
      score: finalScore
    };
  }

  private countAdjectives(text: string): number {
    // Enhanced adjective detection patterns
    const adjectivePatterns = [
      /\b\w+(?:ing|ed|ful|less|ous|ive|able|ible|al|ic|ant|ent)\b/gi,
      /\b(?:amazing|incredible|awesome|fantastic|revolutionary|groundbreaking|innovative|cutting-edge|state-of-the-art)\b/gi,
      /\b(?:perfect|excellent|outstanding|remarkable|extraordinary|exceptional)\b/gi
    ];

    let count = 0;
    for (const pattern of adjectivePatterns) {
      const matches = text.match(pattern);
      count += matches ? matches.length : 0;
    }

    return count;
  }

  private hasConcreteElements(text: string): boolean {
    // Check for numbers, percentages, dates, named entities
    const concretePatterns = [
      /\b\d+(?:[.,]\d+)?%?\b/, // Numbers and percentages
      /\b(?:19|20)\d{2}\b/, // Years
      /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
      /\b[A-Z][a-z]+ [A-Z][a-z]+\b/, // Proper names (basic)
      /\$\d+(?:[.,]\d+)?[kmb]?\b/i, // Money amounts
      /\b\d+(?:\.\d+)? (?:million|billion|thousand|users|customers|downloads|views|subscribers)\b/i,
      /\b(?:study|research|report|analysis|survey|data)\b/i, // Research indicators
      /\b[A-Z]{2,}\b/, // Acronyms/organizations
      /\bversion \d+(?:\.\d+)*\b/i, // Version numbers
    ];

    return concretePatterns.some(pattern => pattern.test(text));
  }

  private countUniqueWords(text: string): number {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2);

    return new Set(words).size;
  }

  private hasQuantifiableData(text: string): boolean {
    const quantifiablePatterns = [
      /\b\d+(?:\.\d+)?(?:x|times)\b/i,
      /\b(?:increased|decreased|grew|dropped|rose|fell) by \d+/i,
      /\b\d+(?:\.\d+)? (?:seconds|minutes|hours|days|weeks|months|years)\b/i,
      /\b(?:faster|slower|higher|lower|more|less) than \d+/i,
      /\b\d+(?:\.\d+)?(?:%|percent|percentage)\b/i,
      /\b(?:up|down) \d+(?:\.\d+)?%\b/i
    ];

    return quantifiablePatterns.some(pattern => pattern.test(text));
  }

  private hasTimeReference(text: string): boolean {
    const timePatterns = [
      /\b(?:today|yesterday|this week|last week|recently|now|currently)\b/i,
      /\b(?:2024|2025)\b/,
      /\b(?:q[1-4]|first quarter|second quarter|third quarter|fourth quarter)\b/i,
      /\b(?:this|last|next) (?:month|year|quarter)\b/i,
      /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
    ];

    return timePatterns.some(pattern => pattern.test(text));
  }

  private hasAuthoritySignals(text: string): boolean {
    const authorityPatterns = [
      /\b(?:professor|dr\.?|phd|researcher|scientist)\b/i,
      /\b(?:university|institute|laboratory|lab)\b/i,
      /\b(?:published|peer.?reviewed|journal|paper)\b/i,
      /\b(?:according to|reports|confirms|announces)\b/i,
      /\b(?:official|confirmed|verified|validated)\b/i,
      /\b(?:ceo|cto|founder|director)\b/i
    ];

    return authorityPatterns.some(pattern => pattern.test(text));
  }

  private hasSpecificEntities(text: string): boolean {
    const entityPatterns = [
      /\b[A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?\b/, // Person names
      /\b[A-Z]{2,}(?:\s[A-Z]{2,})?\b/, // Organizations/Acronyms
      /\b(?:Apple|Google|Microsoft|Amazon|Meta|Tesla|OpenAI|Anthropic)\b/, // Tech companies
      /\b(?:Bitcoin|Ethereum|AI|ML|VR|AR|IoT|5G|Web3)\b/i, // Tech terms
      /\b[A-Z][a-z]+(?:,\s[A-Z]{2})?\b/ // Places (City, State)
    ];

    return entityPatterns.some(pattern => pattern.test(text));
  }

  private detectMarketingSpeak(text: string): number {
    const marketingPhrases = [
      /\b(?:unlock|transform|revolutionize|optimize|maximize|leverage)\b/i,
      /\b(?:boost|enhance|supercharge|turbocharge|streamline)\b/i,
      /\b(?:solution|platform|ecosystem|framework|suite)\b/i,
      /\b(?:next-level|cutting-edge|state-of-the-art|world-class)\b/i,
      /\b(?:seamless|effortless|intuitive|user-friendly)\b/i,
      /\b(?:innovative|disruptive|groundbreaking|paradigm-shifting)\b/i
    ];

    let marketingCount = 0;
    const words = text.split(/\s+/).length;

    for (const pattern of marketingPhrases) {
      const matches = text.match(pattern);
      if (matches) {
        marketingCount += matches.length;
      }
    }

    return marketingCount / words;
  }

  private calculateReadability(text: string): number {
    // Simplified readability score
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const avgWordsPerSentence = words.length / sentences.length;

    // Penalty for very long or very short sentences
    let readabilityScore = 1.0;

    if (avgWordsPerSentence > 25) {
      readabilityScore -= 0.3; // Too complex
    } else if (avgWordsPerSentence < 5) {
      readabilityScore -= 0.2; // Too choppy
    }

    // Check for complex words (simplified)
    const complexWords = words.filter(w => w.length > 12).length;
    const complexWordRatio = complexWords / words.length;

    if (complexWordRatio > 0.2) {
      readabilityScore -= 0.3;
    }

    return Math.max(0, readabilityScore);
  }

  // Check against specific domain blacklists
  checkDomainBlacklist(text: string): { blocked: boolean; domains: string[] } {
    const blockedDomains: string[] = [];

    for (const domain of this.config.blacklist_domains) {
      if (text.includes(domain)) {
        blockedDomains.push(domain);
      }
    }

    return {
      blocked: blockedDomains.length > 0,
      domains: blockedDomains
    };
  }

  // Advanced content quality scoring
  calculateContentQualityScore(text: string): {
    overall: number;
    breakdown: {
      informativeness: number;
      credibility: number;
      engagement: number;
      uniqueness: number;
    };
  } {
    const informativeness = this.scoreInformativeness(text);
    const credibility = this.scoreCredibility(text);
    const engagement = this.scoreEngagement(text);
    const uniqueness = this.scoreUniqueness(text);

    const overall = (informativeness * 0.3 + credibility * 0.3 + engagement * 0.2 + uniqueness * 0.2);

    return {
      overall,
      breakdown: {
        informativeness,
        credibility,
        engagement,
        uniqueness
      }
    };
  }

  private scoreInformativeness(text: string): number {
    let score = 0.5; // Base score

    if (this.hasQuantifiableData(text)) score += 0.2;
    if (this.hasSpecificEntities(text)) score += 0.15;
    if (this.hasConcreteElements(text)) score += 0.15;

    return Math.min(1, score);
  }

  private scoreCredibility(text: string): number {
    let score = 0.5; // Base score

    if (this.hasAuthoritySignals(text)) score += 0.25;
    if (this.hasTimeReference(text)) score += 0.1;

    // Penalty for marketing speak
    const marketingScore = this.detectMarketingSpeak(text);
    score -= marketingScore * 0.5;

    return Math.max(0, Math.min(1, score));
  }

  private scoreEngagement(text: string): number {
    let score = 0.5; // Base score

    // Length sweet spot
    const length = text.length;
    if (length >= 100 && length <= 200) {
      score += 0.2;
    } else if (length < 50 || length > 250) {
      score -= 0.2;
    }

    // Question marks can increase engagement
    const questions = (text.match(/\?/g) || []).length;
    score += Math.min(0.1, questions * 0.05);

    return Math.max(0, Math.min(1, score));
  }

  private scoreUniqueness(text: string): number {
    let score = 0.5; // Base score

    const uniqueWords = this.countUniqueWords(text);
    const totalWords = text.split(/\s+/).length;
    const uniqueRatio = uniqueWords / totalWords;

    score += uniqueRatio * 0.5;

    return Math.min(1, score);
  }
}

// Convenience function for backward compatibility
export function passesHeuristics(text: string, config: ContentConfig): boolean {
  const heuristics = new ContentHeuristics(config);
  const result = heuristics.evaluateContent(text);
  return result.passed;
}