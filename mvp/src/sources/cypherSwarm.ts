import { SourceItem, RssFeed, CypherSwarmConfig } from '../types';
import fs from 'fs';
import { log } from '../log';
import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 10000, // 10 second timeout
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  }
});

export async function readCypherSwarmItems(filePath: string): Promise<SourceItem[]> {
  if (!fs.existsSync(filePath)) {
    log.warn({ filePath }, 'Cypher-Swarm file not found, using RSS feeds');
    return await loadRssFeeds();
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    const items: SourceItem[] = [];
    
    for (const line of lines) {
      try {
        const item = JSON.parse(line) as SourceItem;
        if (isValidSourceItem(item)) {
          items.push(item);
        }
      } catch (error) {
        log.warn({ line, error: (error as Error).message }, 'Failed to parse JSONL line');
      }
    }
    
    log.info({ count: items.length, filePath }, 'Loaded Cypher-Swarm items');
    
    // If no items from file, fallback to RSS feeds
    if (items.length === 0) {
      log.info('No items from file, loading RSS feeds');
      return await loadRssFeeds();
    }
    
    return items;
    
  } catch (error) {
    log.error({ filePath, error: (error as Error).message }, 'Failed to read Cypher-Swarm file');
    return await loadRssFeeds();
  }
}

export async function loadRssFeeds(): Promise<SourceItem[]> {
  try {
    const config = await loadCypherSwarmConfig();
    
    if (!config.enabled) {
      log.info('CypherSwarm disabled, using mock data');
      return getMockSourceItems();
    }

    const items: SourceItem[] = [];
    const enabledFeeds = config.rss_feeds.filter(feed => feed.enabled);

    log.info({ feedCount: enabledFeeds.length }, 'Loading RSS feeds');

    // Process feeds in parallel with error handling
    const feedPromises = enabledFeeds.map(async (feed) => {
      try {
        const feedItems = await parseRssFeed(feed);
        items.push(...feedItems);
        log.info({ feed: feed.name, itemCount: feedItems.length }, 'Loaded RSS feed');
      } catch (error) {
        log.warn({ feed: feed.name, error: (error as Error).message }, 'Failed to load RSS feed');
      }
    });

    await Promise.allSettled(feedPromises);

    // Sort by score (highest first) and limit to reasonable number
    const sortedItems = items
      .sort((a, b) => b.score - a.score)
      .slice(0, 50); // Limit to 50 items

    log.info({ totalItems: sortedItems.length }, 'RSS feeds loaded successfully');
    return sortedItems;

  } catch (error) {
    log.error({ error: (error as Error).message }, 'Failed to load RSS feeds, using mock data');
    return getMockSourceItems();
  }
}

async function parseRssFeed(feed: RssFeed): Promise<SourceItem[]> {
  const items: SourceItem[] = [];
  
  try {
    const rss = await parser.parseURL(feed.url);
    
    for (const item of rss.items.slice(0, 10)) { // Limit to 10 items per feed
      if (item.link && item.title) {
        const sourceItem: SourceItem = {
          url: item.link,
          title: item.title,
          summary: cleanSummary(item.contentSnippet || item.content || ''),
          score: calculateItemScore(item, feed.weight),
          tags: [feed.category],
          extractedAt: item.pubDate ? new Date(item.pubDate).getTime() : Date.now()
        };

        if (isValidSourceItem(sourceItem)) {
          items.push(sourceItem);
        }
      }
    }
  } catch (error) {
    throw new Error(`Failed to parse RSS feed ${feed.name}: ${(error as Error).message}`);
  }

  return items;
}

function calculateItemScore(item: any, feedWeight: number): number {
  let score = 0.5; // Base score

  // Boost score based on feed weight
  score += feedWeight * 0.3;

  // Boost for recent content (last 24 hours)
  if (item.pubDate) {
    const pubDate = new Date(item.pubDate);
    const now = new Date();
    const hoursAgo = (now.getTime() - pubDate.getTime()) / (1000 * 60 * 60);
    
    if (hoursAgo < 24) {
      score += 0.2;
    } else if (hoursAgo < 168) { // 1 week
      score += 0.1;
    }
  }

  // Boost for content quality indicators
  const title = item.title?.toLowerCase() || '';
  const summary = item.contentSnippet?.toLowerCase() || '';
  const content = title + ' ' + summary;

  // Technical/research content gets higher scores
  if (content.includes('research') || content.includes('analysis') || content.includes('study')) {
    score += 0.15;
  }

  // DeFi/crypto specific terms
  if (content.includes('defi') || content.includes('ethereum') || content.includes('mev')) {
    score += 0.1;
  }

  // API/technical updates
  if (content.includes('api') || content.includes('update') || content.includes('release')) {
    score += 0.1;
  }

  // Penalize marketing speak
  if (content.includes('announcing') || content.includes('exciting') || content.includes('revolutionary')) {
    score -= 0.1;
  }

  return Math.max(0, Math.min(1, score));
}

function cleanSummary(summary: string): string {
  // Remove HTML tags and clean up text
  return summary
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200); // Limit length
}

async function loadCypherSwarmConfig(): Promise<CypherSwarmConfig> {
  try {
    const configPath = './config/accounts.yaml';
    const configFile = fs.readFileSync(configPath, 'utf8');
    const yaml = await import('yaml');
    const config = yaml.parse(configFile);
    
    return config.cypherswarm || {
      enabled: false,
      content_posting: false,
      monitoring_only: true,
      test_mode: true,
      rss_feeds: []
    };
  } catch (error) {
    log.error({ error: (error as Error).message }, 'Failed to load CypherSwarm config');
    return {
      enabled: false,
      content_posting: false,
      monitoring_only: true,
      test_mode: true,
      rss_feeds: []
    };
  }
}

function isValidSourceItem(item: any): item is SourceItem {
  return (
    typeof item === 'object' &&
    typeof item.url === 'string' &&
    typeof item.score === 'number' &&
    item.score >= 0 &&
    item.score <= 1
  );
}

function getMockSourceItems(): SourceItem[] {
  return [
    {
      url: 'https://example.com/tech-innovation',
      title: 'Revolutionary Tech Innovation Changes Everything',
      summary: 'A groundbreaking technological advancement is reshaping industries and creating new opportunities for innovation and growth.',
      score: 0.85,
      tags: ['technology', 'innovation', 'future'],
      extractedAt: Date.now()
    },
    {
      url: 'https://example.com/ai-breakthrough',
      title: 'AI Breakthrough Promises New Possibilities',
      summary: 'Latest artificial intelligence research reveals promising developments that could transform how we approach complex problems.',
      score: 0.78,
      tags: ['ai', 'research', 'breakthrough'],
      extractedAt: Date.now()
    },
    {
      url: 'https://example.com/sustainability-solutions',
      title: 'Sustainable Solutions for Modern Challenges',
      summary: 'New approaches to sustainability are emerging that balance environmental responsibility with economic viability.',
      score: 0.72,
      tags: ['sustainability', 'environment', 'solutions'],
      extractedAt: Date.now()
    }
  ];
}
