#!/usr/bin/env node
// Proxy integration ready - Railway deployment

import { loadEnvConfig } from './config';
import { openDb, migrate } from './db';
import { log } from './log';
import { HealthCheckManager } from './monitoring/healthCheck';
import { HealthServer } from './services/healthServer';
import { AccountMonitor } from './monitoring/accountMonitor';
import { ResearchMonitor } from './monitoring/researchMonitor';
import { GoatXPublisher } from './publishers/goatx';
import { ContentVariationEngine } from './content/variation';
import { ContentHeuristics } from './content/heuristics';
import { Account, PostDraft, SourceItem } from './types';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs';
import path from 'path';
// Conditional import for hot reload (only needed in dev mode)
let hotReloadManager: any = null;
import { sessionManager } from './services/sessionManager';
import { readCypherSwarmItems } from './sources/cypherSwarm';
import { getActiveAccounts, AccountConfig } from './config/accounts';
import { getOutboundIp } from './net/proxyClient';
import { CookieManager } from './services/cookieManager';
import { LoginWorker } from './services/loginWorker';
import { MCPBridge } from './services/mcpBridge';

// Set Supabase environment variables for AI memory service
process.env.SUPABASE_URL = 'https://eapuldmifefqxvfzopba.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhcHVsZG1pZmVmcXh2ZnpvcGJhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTA5NTE0OCwiZXhwIjoyMDc0NjcxMTQ4fQ.0HvC2Uoatt5v1J8jxlNppWanXUoe9Ey6RCo9r4hiQ_w';

// Mock data for testing since we don't have Cypher-Swarm yet
const MOCK_SOURCE_ITEMS: SourceItem[] = [
  {
    url: 'https://example.com/article1',
    title: 'Sample Article 1',
    summary: 'This is a test article about technology trends and innovations.',
    score: 0.85,
    tags: ['tech', 'innovation'],
    extractedAt: Date.now()
  },
  {
    url: 'https://example.com/article2', 
    title: 'Sample Article 2',
    summary: 'Another test article discussing AI developments and future implications.',
    score: 0.78,
    tags: ['ai', 'future'],
    extractedAt: Date.now()
  }
];

async function loadAccounts(): Promise<Account[]> {
  const configPath = './config/accounts.yaml';
  if (!fs.existsSync(configPath)) {
    throw new Error(`Accounts config not found: ${configPath}`);
  }
  
  const yaml = await import('yaml');
  const configFile = fs.readFileSync(configPath, 'utf8');
  const config = yaml.parse(configFile);
  
  return config.accounts.filter((account: Account) => account.active);
}

function composePost(item: SourceItem): PostDraft {
  // Simple post composition for testing
  const text = `${item.title}\n\n${item.summary}\n\n${item.url}`;
  
  return {
    text: text.length > 260 ? text.substring(0, 257) + '...' : text,
    sourceUrl: item.url,
    contentHash: Buffer.from(text).toString('base64').slice(0, 16), // Simple hash
    confidence: item.score
  };
}

async function testCypherSwarmContentGeneration(): Promise<void> {
  // SAFETY: This function ONLY generates and logs content - NO POSTING
  log.info('🧪 Testing CypherSwarm content generation (NO POSTING)');
  
  try {
    // Load real RSS feeds
    const items = await readCypherSwarmItems('./nonexistent.jsonl'); // Force RSS loading
    
    log.info({ itemCount: items.length }, 'Loaded content items from RSS feeds');
    
    if (items.length === 0) {
      log.warn('No content items loaded from RSS feeds');
      return;
    }

    // Test content composition with variation engine
    const variationEngine = new ContentVariationEngine();
    const heuristics = new ContentHeuristics({
      max_length: 260,
      allow_links: true,
      require_link: true,
      prefer_primary_link: true,
      blacklist_domains: [],
      min_source_score: 0.65,
      min_unique_words: 8,
      ban_phrases: ["we're excited to", "🚀"],
      require_claim: true,
      variation_enabled: true,
      max_similarity_threshold: 0.8
    });

    // Process top 5 items
    const topItems = items.slice(0, 5);
    
    for (const item of topItems) {
      log.info({ 
        title: item.title, 
        score: item.score, 
        category: item.tags?.[0],
        url: item.url 
      }, 'Processing content item');

      // Create post draft
      const draft = composePost(item);
      
      // Apply heuristics
      const heuristicResult = heuristics.evaluateContent(draft.text);
      
      if (heuristicResult.passed) {
        log.info({ 
          score: heuristicResult.score,
          reasons: heuristicResult.reasons 
        }, 'Content passed heuristics');

        // Apply variation
        const variedDraft = variationEngine.addContentVariation(draft);
        
        log.info({
          original: draft.text.substring(0, 100) + '...',
          varied: variedDraft.text.substring(0, 100) + '...',
          confidence: draft.confidence
        }, 'Generated content variation');

        // SAFETY: Log what WOULD be posted (but don't actually post)
        log.info({
          wouldPost: true,
          text: variedDraft.text,
          sourceUrl: variedDraft.sourceUrl,
          confidence: variedDraft.confidence
        }, '🚨 WOULD POST (but safety controls prevent it)');

      } else {
        log.warn({ 
          score: heuristicResult.score,
          reasons: heuristicResult.reasons,
          text: draft.text.substring(0, 100) + '...'
        }, 'Content rejected by heuristics');
      }
    }

    log.info('✅ CypherSwarm content generation test completed successfully');

  } catch (error) {
    log.error({ error: (error as Error).message }, 'Failed to test CypherSwarm content generation');
  }
}

async function main() {
  const args = await yargs(hideBin(process.argv))
    .option('once', {
      type: 'boolean',
      default: false,
      description: 'Run once and exit'
    })
    .option('daemon', {
      type: 'boolean',
      default: false,
      description: 'Run continuously as daemon (avoids repeated logins)'
    })
    .option('verbose', {
      type: 'boolean', 
      default: false,
      description: 'Verbose output'
    })
    .option('hot-reload', {
      type: 'boolean',
      default: false,
      description: 'Enable hot reload for development (watches files and rebuilds automatically)'
    })
    .option('test-cypherswarm', {
      type: 'boolean',
      default: false,
      description: 'Test CypherSwarm content generation (NO POSTING)'
    })
    .option('test-ai-memory', {
      type: 'boolean',
      default: false,
      description: 'Test AI memory system (store and retrieve memories)'
    })
    .help()
    .argv;

  try {
    // Load configuration
    const envConfig = loadEnvConfig();
    log.info({ dryRun: envConfig.DRY_RUN }, 'Starting GOAT-X QuadPoster');

    // Handle CypherSwarm testing
    if (args['test-cypherswarm']) {
      log.info('🧪 CypherSwarm test mode enabled - NO POSTING');
      await testCypherSwarmContentGeneration();
      return;
    }

    // Handle AI memory testing
    if (args['test-ai-memory']) {
      log.info('🧠 AI Memory test mode enabled');
      await testAIMemorySystem();
      return;
    }

    // Clean up expired sessions on startup
    sessionManager.cleanupExpiredSessions();
    const activeSessions = sessionManager.getAllActiveSessions();
    if (activeSessions.length > 0) {
      log.info({ activeSessions }, 'Found active sessions - no login needed');
    }

    // Start hot reload if enabled
    if (args['hot-reload']) {
      log.info('Hot reload mode enabled');
      try {
        const { hotReloadManager: hrManager } = await import('./dev/hotReload');
        hotReloadManager = hrManager;
        hotReloadManager.start();
      } catch (error) {
        log.error({ error: (error as Error).message }, 'Failed to load hot reload manager');
      }
    }

    // Initialize database
    const db = openDb(envConfig.DB_PATH);
    migrate(db);

    // Load accounts
    const accounts = await loadAccounts();
    if (accounts.length === 0) {
      throw new Error('No active accounts found');
    }

    // Initialize components
    const healthManager = new HealthCheckManager(db);
    
    // Start health check server for Fly.io
    const healthServer = new HealthServer();
    healthServer.start();
    
    // Load monitoring configuration
    const configPath = './config/accounts.yaml';
    const yaml = await import('yaml');
    const configFile = fs.readFileSync(configPath, 'utf8');
    const config = yaml.parse(configFile);
    
    const monitoringConfig = config.monitoring || {
      enabled: true,
      target_account: "@Branch",
      actions: { comment: true, like: true, repost: false },
      comment_templates: ["Great insight! 💡", "This resonates 💯"],
      response_delay_minutes: [5, 15, 30],
      max_comments_per_day: 10,
      min_time_between_responses: 60
    };
    
    // Load personalities from config
    const personalities = config.personalities || {};
    log.info({ personalityCount: Object.keys(personalities).length }, 'Loaded agent personalities');
    
    const accountMonitor = new AccountMonitor(db, monitoringConfig, personalities);
    
    // Initialize research monitor for content generation
    const researchConfig = config.research_monitoring || {
      enabled: false,
      target_accounts: ['@trylimitless', '@bankrbot', '@wallchain_xyz'],
      max_posts_per_day: 2,
      content_storage: true,
      research_interval_minutes: 30,
      content_freshness_hours: 24
    };
    
    const researchMonitor = new ResearchMonitor(researchConfig);
    log.info({ 
      enabled: researchConfig.enabled,
      targetAccounts: researchConfig.target_accounts,
      maxPosts: researchConfig.max_posts_per_day
    }, 'Initialized research monitor');

    // Initialize cookie management system
    const cookieManager = new CookieManager();
    const loginWorker = new LoginWorker();
    
    // Initialize MCP Bridge if enabled
    let mcpBridge: MCPBridge | null = null;
    if (process.env.BROWSER_BACKEND === 'mcp') {
      const bridgePort = parseInt(process.env.MCP_HTTP_BASE?.split(':').pop() || '4500');
      const bridgeToken = process.env.MCP_BRIDGE_TOKEN || 'change_me';
      
      mcpBridge = new MCPBridge(bridgePort, bridgeToken);
      await mcpBridge.start();
      
      log.info({ 
        port: bridgePort,
        backend: 'mcp'
      }, 'MCP Bridge initialized');
    }

    // Start cookie health checks (convert to AccountConfig format)
    const accountConfigs: AccountConfig[] = accounts.map(account => ({
      handle: account.handle,
      mode: account.mode,
      cookie_path: account.cookie_path || '',
      backup_api_key: account.backup_api_key || '',
      daily_cap: account.daily_cap,
      min_minutes_between_posts: account.min_minutes_between_posts,
      active: account.active,
      priority: account.priority,
      user_agent: account.user_agent || '',
      proxy_url: (account as any).proxy_url || undefined
    }));
    
    cookieManager.startHealthChecks(accountConfigs);
    
    log.info({
      cookieHealthChecks: true,
      loginWorker: true,
      mcpBridge: !!mcpBridge
    }, 'Cookie management system initialized');

    // Initialize X API service with login credentials and proxy configuration
    // For now, we'll use the first account's credentials
    const firstAccount = accounts[0];
    if (firstAccount) {
      log.info({ account: firstAccount.handle }, 'Initializing X API with cookie-based authentication and proxy support');
      
      // Cookie-only authentication - no password needed
      const xUsername = firstAccount.handle.replace('@', ''); // Remove @ from handle
      
      // Get proxy configuration for this account
      const accountConfig = getActiveAccounts().find(acc => acc.handle === firstAccount.handle);
      const proxyUrl = accountConfig?.proxy_url;
      
      log.info({ 
        username: xUsername, 
        accountHandle: firstAccount.handle,
        hasAccountConfig: !!accountConfig,
        proxyUrl: proxyUrl,
        envVar: process.env.APLEP333_PROXY_URL ? 'SET' : 'NOT_SET'
      }, 'Debug proxy configuration');
      
      if (proxyUrl) {
        log.info({ username: xUsername, proxyUrl }, 'Using proxy configuration for authentication');
        
        // Log outbound IP to verify proxy usage
        const outboundIp = await getOutboundIp({ handle: firstAccount.handle, proxyUrl });
        if (outboundIp) {
          log.info({ username: xUsername, outboundIp }, 'Proxy outbound IP verified');
        }
      } else {
        log.info({ username: xUsername }, 'No proxy configured - using direct connection');
      }
      
      const apiInitialized = await accountMonitor.initializeXApi(xUsername, proxyUrl);
      
      // If API initialization failed, try immediate cookie refresh
      if (!apiInitialized && !envConfig.DRY_RUN) {
        log.warn('X API initialization failed - attempting immediate cookie refresh');
        
        const accountConfig = getActiveAccounts().find(acc => acc.handle === firstAccount.handle);
        if (accountConfig) {
          log.info({ handle: accountConfig.handle }, 'Triggering immediate cookie refresh');
          const refreshResult = await loginWorker.refreshCookies(accountConfig);
          
          if (refreshResult.success) {
            log.info('Cookie refresh successful - retrying X API initialization');
            const retryInitialized = await accountMonitor.initializeXApi(xUsername, proxyUrl);
            
            if (retryInitialized) {
              log.info('X API initialization successful after cookie refresh');
            } else {
              log.error('X API initialization still failed after cookie refresh. Switching to dry run mode.');
              envConfig.DRY_RUN = true;
            }
          } else {
            log.error({ error: refreshResult.error }, 'Cookie refresh failed. Switching to dry run mode.');
            envConfig.DRY_RUN = true;
          }
        } else {
          log.error('Account config not found for cookie refresh. Switching to dry run mode.');
          envConfig.DRY_RUN = true;
        }
      }
      
      // Initialize research monitor with same credentials and proxy
      if (researchConfig.enabled) {
        const researchApiInitialized = await researchMonitor.initializeXApi(xUsername, proxyUrl);
        if (!researchApiInitialized) {
          log.warn('Failed to initialize research monitor X API');
        }
      }
    }

    // Perform health check
    log.info('Performing health check...');
    const healthReport = await healthManager.performComprehensiveHealthCheck(accounts);
    
    if (healthReport.overall === 'critical') {
      log.error({ healthReport }, 'Critical health issues found');
      process.exit(2);
    }

    if (healthReport.overall === 'warning') {
      log.warn({ healthReport }, 'Health warnings detected');
    }

    // Start monitoring @Branch and responding with comments/likes
    log.info({ 
      target: monitoringConfig.target_account,
      activeAccounts: accounts.length,
      dryRun: envConfig.DRY_RUN 
    }, 'Starting account monitoring');

    await accountMonitor.monitorAndRespond(accounts, envConfig.DRY_RUN);

    // Show monitoring statistics
    const stats = accountMonitor.getMonitoringStats();
    log.info({ 
      stats,
      dryRun: envConfig.DRY_RUN 
    }, 'Monitoring cycle complete');

    log.info({ dryRun: envConfig.DRY_RUN }, 'Processing complete');

    if (args.once) {
      log.info('Single run complete, exiting');
      process.exit(0);
    }
    
    if (args.daemon) {
      log.info('Running in daemon mode - will check for new posts every 5 minutes');
      
      // Run every 5 minutes to avoid bot detection
      setInterval(async () => {
        try {
          log.info('Daemon: Checking for new posts...');
          await accountMonitor.monitorAndRespond(accounts, envConfig.DRY_RUN);
          
          // Run research monitoring if enabled
          if (researchConfig.enabled && researchMonitor.shouldRunResearchCheck()) {
            log.info('Daemon: Collecting research content...');
            const researchItems = await researchMonitor.collectResearchContent();
            
            if (researchItems.length > 0) {
              log.info({ 
                researchItems: researchItems.length,
                topItem: researchItems[0]?.title?.substring(0, 50) + '...'
              }, 'Research content collected for content generation');
            }
          }
        } catch (error) {
          log.error({ error: (error as Error).message }, 'Daemon: Error in monitoring cycle');
        }
      }, 5 * 60 * 1000); // 5 minutes
      
      // Keep the process alive
      process.on('SIGINT', () => {
        log.info('Daemon: Received SIGINT, shutting down gracefully');
        
        // Cleanup
        if (args['hot-reload'] && hotReloadManager) {
          hotReloadManager.stop();
        }
        
        // Cleanup cookie management
        cookieManager.cleanup();
        if (mcpBridge) {
          mcpBridge.stop();
        }
        
        process.exit(0);
      });
      
      log.info('Daemon: Started successfully. Press Ctrl+C to stop.');
    }

  } catch (error) {
    log.error({ error: (error as Error).message }, 'Fatal error');
    process.exit(1);
  }
}

/**
 * Test AI Memory System
 * Tests storing and retrieving memories from Supabase
 */
async function testAIMemorySystem(): Promise<void> {
  const { aiMemoryService } = await import('./services/aiMemoryService');
  
  log.info('🧠 Testing AI Memory System...');
  
  try {
    // Test 1: Store a test memory
    log.info('📝 Test 1: Storing test memory...');
    const memoryId = await aiMemoryService.storeMemory({
      account: '@aplep333',
      type: 'engagement',
      data: {
        action: 'test_like',
        post_id: 'test_post_123',
        post_author: '@test_user',
        triggered_mention: '@trylimitless',
        post_text: 'This is a test post for AI memory system',
        success: true,
        timestamp: new Date().toISOString()
      },
      relevance_score: 0.9,
      tags: ['test', 'like', 'engagement', '@trylimitless']
    });
    
    if (memoryId) {
      log.info({ memoryId }, '✅ Successfully stored test memory');
    } else {
      log.warn('⚠️ Failed to store test memory (Supabase may not be configured)');
    }
    
    // Test 2: Retrieve memories
    log.info('🔍 Test 2: Retrieving memories for @aplep333...');
    const memories = await aiMemoryService.getMemories('@aplep333', { limit: 5 });
    log.info({ count: memories.length }, '✅ Retrieved memories');
    
    if (memories.length > 0) {
      log.info({ 
        sample: memories[0] 
      }, '📋 Sample memory retrieved');
    }
    
    // Test 3: Analyze engagement patterns
    log.info('📊 Test 3: Analyzing engagement patterns...');
    const patterns = await aiMemoryService.analyzeEngagementPatterns('@aplep333');
    log.info({ patterns }, '✅ Engagement analysis complete');
    
    // Test 4: Store content performance
    log.info('📈 Test 4: Storing content performance...');
    const performanceId = await aiMemoryService.storeContentPerformance({
      account: '@aplep333',
      content_hash: 'test_hash_123',
      content_type: 'engagement_post',
      topic: 'crypto',
      performance_score: 0.85,
      engagement_metrics: {
        likes: 10,
        comments: 3,
        shares: 1
      },
      audience_response: 'positive',
      posted_at: new Date()
    });
    
    if (performanceId) {
      log.info({ performanceId }, '✅ Successfully stored content performance');
    }
    
    // Test 5: Get top performing content
    log.info('🏆 Test 5: Getting top performing content...');
    const topContent = await aiMemoryService.getTopPerformingContent('@aplep333', 3);
    log.info({ count: topContent.length }, '✅ Retrieved top performing content');
    
    log.info('🎉 AI Memory System test completed successfully!');
    
  } catch (error) {
    log.error({ error: (error as Error).message }, '❌ AI Memory System test failed');
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
