/**
 * Agent 1: Intelligence Gatherer
 * Collects raw data from Twitter accounts, RSS feeds, @pelpa333 monitoring, and target accounts
 */

import { log } from '../log';
import { fetchUserTimeline } from '../ingest/playwrightScraper';
import { loadRssFeeds } from '../sources/cypherSwarm';
import { AccountCfg } from '../config/accountsNew';
import { pelpa333Monitor } from '../services/pelpa333Monitor';
import { targetAccountScraper } from '../services/targetAccountScraper';
import fs from 'fs';
import yaml from 'yaml';

interface TargetAccount {
  handle: string;
  category: string;
  weight: number;
  scrape_replies: boolean;
  scrape_limit: number;
  enabled: boolean;
}

interface RawIntelligence {
  source_type: 'twitter_scrape' | 'rss_feed' | 'trending_topic' | 'pelpa333_timeline' | 'target_account';
  source_account?: string | undefined;
  source_url: string;
  raw_content: string;
  title?: string | undefined;
  summary?: string | undefined;
  metadata: any;
  extracted_at: string;
}

export class IntelligenceGathererAgent {
  private hubAccount: AccountCfg | null = null;
  private targetAccounts: TargetAccount[] = [];
  
  constructor(hubAccount: AccountCfg) {
    this.hubAccount = hubAccount;
    this.loadTargetAccounts();
  }
  
  private loadTargetAccounts() {
    try {
      const configPath = './config/target-accounts.yaml';
      const configFile = fs.readFileSync(configPath, 'utf8');
      const config = yaml.parse(configFile);
      
      this.targetAccounts = (config.target_accounts || []).filter((a: TargetAccount) => a.enabled);
      
      log.info({ 
        accountCount: this.targetAccounts.length 
      }, '[Agent 1] Loaded target accounts');
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Agent 1] Failed to load target accounts');
      this.targetAccounts = [];
    }
  }
  
  /**
   * Main agent execution
   */
  /**
   * Monitor @pelpa333 timeline for mentions
   */
  async monitorPelpa333(): Promise<void> {
    try {
      log.info('[Agent 1] Starting @pelpa333 monitoring...');
      
      await pelpa333Monitor.initialize();
      await pelpa333Monitor.monitorPelpa333();
      await pelpa333Monitor.cleanup();
      
      log.info('[Agent 1] @pelpa333 monitoring complete');
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Agent 1] @pelpa333 monitoring failed');
    }
  }

  /**
   * Monitor target accounts for intelligence gathering
   */
  async monitorTargetAccounts(): Promise<void> {
    try {
      log.info('[Agent 1] Starting target account monitoring...');
      
      await targetAccountScraper.initialize();
      await targetAccountScraper.monitorTargetAccounts();
      await targetAccountScraper.cleanup();
      
      log.info('[Agent 1] Target account monitoring complete');
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Agent 1] Target account monitoring failed');
    }
  }

  async run(): Promise<{ items_processed: number; items_created: number; items_failed: number }> {
    log.info('[Agent 1] Starting intelligence gathering...');
    
    const intelligence: RawIntelligence[] = [];
    let failedCount = 0;
    
    try {
      // 1. Monitor @pelpa333 for mentions (Priority 1)
      log.info('[Agent 1] Monitoring @pelpa333 for target mentions...');
      await this.monitorPelpa333();
      
      // 2. Monitor target accounts for intelligence (Priority 2)
      log.info('[Agent 1] Monitoring target accounts...');
      await this.monitorTargetAccounts();
      
      // 3. Scrape configured Twitter accounts (85% source)
      log.info({ accounts: this.targetAccounts.length }, '[Agent 1] Scraping configured Twitter accounts...');
      
      for (const targetAccount of this.targetAccounts) {
        try {
          const tweets = await fetchUserTimeline(
            targetAccount.handle.replace('@', ''),
            this.hubAccount!,
            targetAccount.scrape_limit
          );
          
          for (const tweet of tweets) {
            intelligence.push({
              source_type: 'twitter_scrape',
              source_account: targetAccount.handle,
              source_url: tweet.url,
              raw_content: tweet.text,
              title: `Tweet by ${tweet.author}`,
              summary: tweet.text.substring(0, 200),
              metadata: {
                author: tweet.author,
                likes: tweet.likes,
                retweets: tweet.retweets,
                replies: tweet.replies,
                date: tweet.date,
                category: targetAccount.category,
                weight: targetAccount.weight
              },
              extracted_at: new Date().toISOString()
            });
          }
          
          log.info({ 
            account: targetAccount.handle,
            tweets: tweets.length 
          }, '[Agent 1] Scraped account');
          
          // Human-like delay between scrapes
          const delay = Math.random() * 10000 + 5000; // 5-15 seconds
          await new Promise(resolve => setTimeout(resolve, delay));
          
        } catch (error) {
          log.error({ 
            account: targetAccount.handle,
            error: (error as Error).message 
          }, '[Agent 1] Failed to scrape account');
          failedCount++;
        }
      }
      
      // 2. Load RSS feeds (15% source)
      log.info('[Agent 1] Loading RSS feeds...');
      
      try {
        const rssItems = await loadRssFeeds();
        
        for (const item of rssItems) {
          intelligence.push({
            source_type: 'rss_feed',
            source_url: item.url,
            raw_content: `${item.title}\n\n${item.summary}`,
            title: item.title,
            summary: item.summary,
            metadata: {
              score: item.score,
              tags: item.tags,
              extractedAt: item.extractedAt
            },
            extracted_at: new Date().toISOString()
          });
        }
        
        log.info({ items: rssItems.length }, '[Agent 1] Loaded RSS items');
      } catch (error) {
        log.error({ error: (error as Error).message }, '[Agent 1] Failed to load RSS');
        failedCount++;
      }
      
      // 3. Store in Supabase
      log.info({ total: intelligence.length }, '[Agent 1] Storing raw intelligence...');
      
      let storedCount = 0;
      for (const item of intelligence) {
        try {
          await this.storeRawIntelligence(item);
          storedCount++;
        } catch (error) {
          log.error({ error: (error as Error).message }, '[Agent 1] Failed to store intelligence');
          failedCount++;
        }
      }
      
      log.info({
        total: intelligence.length,
        stored: storedCount,
        failed: failedCount
      }, '[Agent 1] Intelligence gathering complete');
      
      return {
        items_processed: intelligence.length,
        items_created: storedCount,
        items_failed: failedCount
      };
      
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Agent 1] Critical error');
      throw error;
    }
  }
  
  /**
   * Store raw intelligence in Supabase
   */
  private async storeRawIntelligence(item: RawIntelligence): Promise<void> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase not configured');
    }
    
    const response = await fetch(`${supabaseUrl}/rest/v1/raw_intelligence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(item)
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to store: ${response.status} - ${error}`);
    }
  }
}

