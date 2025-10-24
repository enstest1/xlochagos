#!/usr/bin/env node
/**
 * Local CLI for Twitter automation
 * Provides commands for login, posting, reading, and health checks
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { ACCOUNTS } from "./config/accountsNew";
import { loginAndSaveCookies } from "./auth/login";
import { postTweet, replyTo, like } from "./publish/playwright";
import { logOutboundIp, checkAllAccounts } from "./health/ipcheck";
import { twTimeline, twSearch } from "./ingest/twscrape";
import { PlaywrightAccountMonitor } from "./monitoring/playwrightAccountMonitor";
import Database from "better-sqlite3";

function getAccountByHandle(h: string) {
  const x = ACCOUNTS.find((a) => a.handle.toLowerCase() === h.toLowerCase());
  if (!x) throw new Error(`Unknown account ${h}. Available: ${ACCOUNTS.map(a => a.handle).join(", ")}`);
  return x;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  if (!cmd) {
    printUsage();
    return;
  }
  
  console.log(`[cli] Command: ${cmd}`);
  console.log(`[cli] Loaded ${ACCOUNTS.length} account(s): ${ACCOUNTS.map(a => a.handle).join(", ")}`);
  if (ACCOUNTS.length === 0) {
    console.warn(`[cli] ⚠️ No accounts configured. Check your .env.local file.`);
  }

  try {
    if (cmd === "ip") {
      await checkAllAccounts(ACCOUNTS);
      return;
    }

    if (cmd === "login") {
      const handle = rest[0];
      if (!handle) throw new Error("Usage: npm run cli login <@handle>");
      
      const a = getAccountByHandle(handle);
      if (!a.username || !a.password) {
        throw new Error(`Username/password not set for ${handle}. Check your .env.local file.`);
      }
      
      await loginAndSaveCookies({
        handle: a.handle,
        username: a.username!,
        password: a.password!,
        cookiePath: a.cookiePath,
        proxyUrl: a.proxyUrl,
      });
      return;
    }

    if (cmd === "post") {
      const handle = rest[0];
      const text = rest.slice(1).join(" ");
      if (!handle || !text) throw new Error("Usage: npm run cli post <@handle> <text>");
      
      const a = getAccountByHandle(handle);
      const dryRun = process.env.DRY_RUN === "true";
      await postTweet(a, text, dryRun);
      return;
    }

    if (cmd === "reply") {
      const handle = rest[0];
      const url = rest[1];
      const text = rest.slice(2).join(" ");
      if (!handle || !url || !text) {
        throw new Error("Usage: npm run cli reply <@handle> <tweet_url> <text>");
      }
      
      const a = getAccountByHandle(handle);
      const dryRun = process.env.DRY_RUN === "true";
      await replyTo(a, url, text, dryRun);
      return;
    }

    if (cmd === "like") {
      const handle = rest[0];
      const url = rest[1];
      if (!handle || !url) throw new Error("Usage: npm run cli like <@handle> <tweet_url>");
      
      const a = getAccountByHandle(handle);
      const dryRun = process.env.DRY_RUN === "true";
      await like(a, url, dryRun);
      return;
    }

    if (cmd === "timeline") {
      const target = rest[0];
      const out = rest[1] || "./persist/timeline.json";
      if (!target) throw new Error("Usage: npm run cli timeline <username> [output_file]");
      
      const tweets = await twTimeline(target, 50, out);
      console.log(`[cli] ✅ Fetched ${tweets.length} tweets from @${target}`);
      return;
    }

    if (cmd === "search") {
      const query = rest[0];
      const out = rest[1] || "./persist/search.json";
      if (!query) throw new Error("Usage: npm run cli search <query> [output_file]");
      
      const tweets = await twSearch(query, 50, out);
      console.log(`[cli] ✅ Found ${tweets.length} tweets matching query`);
      return;
    }

    if (cmd === "monitor") {
      const account = rest[0];
      if (!account) throw new Error("Usage: npm run cli monitor <@handle>");
      
      const a = getAccountByHandle(account);
      const dryRun = process.env.DRY_RUN === "true";
      
      // Initialize database
      const db = new Database('./data/mvp.sqlite');
      
      // Configure monitoring for @pelpa333 - only respond when he mentions specific accounts
      const monitoringConfig = {
        enabled: true,
        target_account: '@pelpa333',
        trigger_mentions: ['@bankrbot', '@trylimitless', '@wallchain_xyz'],
        actions: {
          comment: true,
          like: true,
          repost: false
        },
        comment_templates: [
          "Great insight on {mention}! 🚀",
          "This {mention} analysis is spot on 💡",
          "Thanks for sharing this {mention} update! 🙌",
          "Solid {mention} perspective! 🔥",
          "Love this {mention} breakdown! ✨",
          "This {mention} approach makes sense! 🎯",
          "Interesting {mention} take! 🤔",
          "Appreciate the {mention} insights! 💎"
        ],
        response_delay_minutes: [15, 30, 45],
        max_comments_per_day: 10,
        min_time_between_responses: 300000 // 5 minutes
      };
      
      // Create monitor instance
      const monitor = new PlaywrightAccountMonitor(db, monitoringConfig, {}, a);
      
      console.log(`[cli] Starting monitoring for ${monitoringConfig.target_account}...`);
      console.log(`[cli] Trigger mentions: ${monitoringConfig.trigger_mentions.join(', ')}`);
      console.log(`[cli] Actions: like=${monitoringConfig.actions.like}, comment=${monitoringConfig.actions.comment}`);
      console.log(`[cli] Dry run: ${dryRun}`);
      
      await monitor.monitorAndRespond(dryRun);
      
      const stats = monitor.getMonitoringStats();
      console.log(`[cli] ✅ Monitoring complete!`);
      console.log(`[cli] Stats: ${JSON.stringify(stats, null, 2)}`);
      
      db.close();
      return;
    }

    // XlochaGOS Multi-Agent System Commands
    if (cmd === "swarm") {
      const subCmd = rest[0];
      
      if (!subCmd) {
        console.error("[cli] Usage: npm run cli swarm <start|once|agent|queue|logs|review|dashboard|monitor|respond>");
        return;
      }
      
      if (subCmd === "start") {
        // Start continuous orchestrator
        const { XlochaGOSOrchestrator } = await import("./agents/orchestrator");
        const hubAccount = ACCOUNTS[0]; // Use first account as hub
        
        if (!hubAccount) {
          throw new Error("No hub account configured");
        }
        
        console.log(`[cli] Starting XlochaGOS orchestrator with hub: ${hubAccount.handle}`);
        const orchestrator = new XlochaGOSOrchestrator(hubAccount);
        await orchestrator.runContinuously(30); // 30-minute cycles
        return;
      }
      
      if (subCmd === "once") {
        // Run one cycle and exit
        const { XlochaGOSOrchestrator } = await import("./agents/orchestrator");
        const hubAccount = ACCOUNTS[0];
        
        if (!hubAccount) {
          throw new Error("No hub account configured");
        }
        
        console.log(`[cli] Running single XlochaGOS cycle with hub: ${hubAccount.handle}`);
        const orchestrator = new XlochaGOSOrchestrator(hubAccount);
        await orchestrator.runOnce();
        console.log(`[cli] ✅ Cycle complete`);
        return;
      }
      
      if (subCmd === "queue") {
        // View content queue with detailed output
        console.log("[cli] Fetching content queue...");
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        if (!supabaseUrl || !supabaseKey) {
          throw new Error("Supabase not configured");
        }
        
        // Fetch content queue
        const queueResponse = await fetch(
          `${supabaseUrl}/rest/v1/content_queue?order=created_at.desc&limit=20`,
          {
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
            },
          }
        );
        
        const queue = await queueResponse.json() as any[];
        
        // Fetch research data
        const researchResponse = await fetch(
          `${supabaseUrl}/rest/v1/research_data?order=created_at.desc&limit=10`,
          {
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
            },
          }
        );
        
        const research = await researchResponse.json() as any[];
        
        // Fetch raw intelligence
        const intelligenceResponse = await fetch(
          `${supabaseUrl}/rest/v1/raw_intelligence?order=created_at.desc&limit=15`,
          {
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
            },
          }
        );
        
        const intelligence = await intelligenceResponse.json() as any[];
        
        console.log(`\n🎯 XlochaGOS Dashboard - ${new Date().toLocaleString()}\n`);
        console.log(`${'='.repeat(80)}\n`);
        
        // Raw Intelligence Section
        console.log(`📡 RAW INTELLIGENCE (${intelligence.length} items):`);
        console.log(`${'-'.repeat(40)}`);
        intelligence.slice(0, 5).forEach((item: any, i: number) => {
          const source = item.source_account || 'RSS Feed';
          const type = item.source_type === 'twitter_scrape' ? '🐦' : '📰';
          console.log(`${type} ${i + 1}. ${source}`);
          console.log(`   ${item.raw_content.substring(0, 80)}...`);
          console.log(`   Processed: Researcher:${item.processed_by_researcher ? '✅' : '⏳'} Writer:${item.processed_by_writer ? '✅' : '⏳'}\n`);
        });
        
        // Research Section
        console.log(`🔬 RESEARCH DATA (${research.length} items):`);
        console.log(`${'-'.repeat(40)}`);
        research.slice(0, 3).forEach((item: any, i: number) => {
          console.log(`🔍 ${i + 1}. Topic: ${item.topic}`);
          console.log(`   Quality: ${item.quality_score}/1.0`);
          console.log(`   Insights: ${item.key_insights?.length || 0} key points`);
          console.log(`   Sources: ${item.sources?.length || 0} references`);
          console.log(`   Summary: ${item.summary?.substring(0, 60)}...\n`);
        });
        
        // Content Queue Section
        console.log(`📝 CONTENT QUEUE (${queue.length} items):`);
        console.log(`${'-'.repeat(40)}`);
        queue.forEach((item: any, i: number) => {
          const tier = item.metadata?.tier || 'auto';
          const emoji = tier === 'premium' ? '⭐' : '📝';
          const statusEmojiMap: Record<string, string> = {
            'pending_approval': '⏳',
            'pending_manual_review': '👁️',
            'approved': '✅',
            'assigned': '📤',
            'posted': '🚀',
            'rejected': '❌'
          };
          const statusEmoji = statusEmojiMap[item.status] || '❓';
          
          console.log(`${emoji} ${i + 1}. ${statusEmoji} ${item.status.toUpperCase()} | Score: ${item.quality_score}/1.0`);
          console.log(`   Content: ${item.content_text}`);
          console.log(`   Type: ${item.content_type} | Agent: ${item.created_by_agent}`);
          if (item.images) {
            const imageCount = Array.isArray(item.images) ? item.images.length : 1;
            console.log(`   Images: ${imageCount} generated`);
          }
          console.log(`   Created: ${new Date(item.created_at).toLocaleString()}`);
          console.log('');
        });
        
        return;
      }
      
      if (subCmd === "review") {
        // View premium posts needing manual review
        console.log("[cli] Fetching posts for manual review...");
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        if (!supabaseUrl || !supabaseKey) {
          throw new Error("Supabase not configured");
        }
        
        const response = await fetch(
          `${supabaseUrl}/rest/v1/content_queue?status=eq.pending_manual_review&order=quality_score.desc`,
          {
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
            },
          }
        );
        
        const queue = await response.json() as any[];
        
        console.log(`\n⭐ PREMIUM POSTS FOR MANUAL REVIEW (${queue.length} items):`);
        console.log(`${'='.repeat(80)}\n`);
        
        if (queue.length === 0) {
          console.log("🎉 No posts pending review! All premium content has been processed.\n");
          return;
        }
        
        queue.forEach((item: any, i: number) => {
          const qualityColor = item.quality_score > 0.9 ? '🟢' : item.quality_score > 0.7 ? '🟡' : '🔴';
          const imageStatus = item.images ? '🖼️ Generated' : '⏳ Pending';
          
          console.log(`${qualityColor} POST ${i + 1} | Score: ${item.quality_score}/1.0 | Type: ${item.content_type}`);
          console.log(`📅 Created: ${new Date(item.created_at).toLocaleString()}`);
          console.log(`🤖 Agent: ${item.created_by_agent}`);
          console.log(`📊 Status: ${item.status} | Images: ${imageStatus}`);
          console.log(`\n📝 CONTENT:`);
          console.log(`${'─'.repeat(70)}`);
          console.log(`${item.content_text}`);
          console.log(`${'─'.repeat(70)}`);
          
          if (item.images) {
            console.log(`\n🖼️ IMAGES:`);
            const images = Array.isArray(item.images) ? item.images : [item.images];
            images.forEach((img: string, imgIndex: number) => {
              console.log(`   ${imgIndex + 1}. ${img}`);
            });
          }
          
          console.log(`\n🔑 POST ID: ${item.id}`);
          console.log(`💡 To approve: Update status to 'approved' in Supabase`);
          console.log(`❌ To reject: Update status to 'rejected' in Supabase`);
          console.log(`\n${'='.repeat(80)}\n`);
        });
        
        console.log(`📋 SUMMARY:`);
        console.log(`   • ${queue.length} posts waiting for your review`);
        console.log(`   • Average quality score: ${(queue.reduce((sum, p) => sum + p.quality_score, 0) / queue.length).toFixed(2)}/1.0`);
        console.log(`   • Posts with images: ${queue.filter(p => p.images).length}/${queue.length}`);
        console.log(`\n🎯 Next steps:`);
        console.log(`   1. Review each post above`);
        console.log(`   2. Go to Supabase dashboard to approve/reject`);
        console.log(`   3. Run 'npm run cli -- swarm publish @pelpa333' to post approved content`);
        
        return;
      }
      
      if (subCmd === "dashboard") {
        console.log("[cli] Starting XlochaGOS Dashboard...");
        console.log("[cli] Dashboard will be available at: http://localhost:3001");
        console.log("[cli] Press Ctrl+C to stop the dashboard");
        
        // Import and start the dashboard server
        const { spawn } = require('child_process');
        const dashboardProcess = spawn('node', ['-r', 'ts-node/register', 'src/dashboard/server.ts'], {
          stdio: 'inherit',
          cwd: process.cwd()
        });
        
        dashboardProcess.on('error', (error: any) => {
          console.error(`[cli] Dashboard error:`, error);
        });
        
        dashboardProcess.on('close', (code: any) => {
          console.log(`[cli] Dashboard stopped with code ${code}`);
        });
        
        // Handle Ctrl+C
        process.on('SIGINT', () => {
          console.log('\n[cli] Stopping dashboard...');
          dashboardProcess.kill();
          process.exit(0);
        });
        
        return;
      }
      
      if (subCmd === "monitor") {
        console.log("[cli] 🔍 Starting @pelpa333 monitoring...");
        
        const { pelpa333Monitor } = await import("./services/pelpa333Monitor");
        const { targetAccountScraper } = await import("./services/targetAccountScraper");
        
        try {
          // Monitor @pelpa333 (this includes triggering response agent)
          await pelpa333Monitor.initialize();
          await pelpa333Monitor.monitorPelpa333();
          await pelpa333Monitor.cleanup();
          
          console.log(`[cli] ✅ Monitored @pelpa333: completed`);
          
          // Monitor target accounts
          await targetAccountScraper.initialize();
          const targetPosts = await targetAccountScraper.scrapeAllTargetAccounts();
          await targetAccountScraper.storeTargetAccountIntelligence(targetPosts);
          await targetAccountScraper.cleanup();
          
          console.log(`[cli] ✅ Monitored target accounts: ${targetPosts.length} posts`);
          
        } catch (error) {
          console.error(`[cli] ❌ Monitoring failed:`, error);
        }
        
        return;
      }
      
      if (subCmd === "respond") {
        console.log("[cli] 🎯 Processing @pelpa333 response queue...");
        
        const { responseAgent } = await import("./agents/responseAgent");
        
        try {
          await responseAgent.initialize();
          await responseAgent.runResponseCycle();
          await responseAgent.cleanup();
          
          console.log("[cli] ✅ Response processing complete");
        } catch (error) {
          console.error(`[cli] ❌ Response processing failed:`, error);
        }
        
        return;
      }
      
      console.error(`[cli] Unknown swarm command: ${subCmd}`);
      return;
    }

    if (cmd === "publish") {
      // Run spoke publisher for an account
      const handle = rest[0];
      if (!handle) throw new Error("Usage: npm run cli publish <@handle>");
      
      const account = getAccountByHandle(handle);
      const dryRun = process.env.DRY_RUN === "true";
      
      console.log(`[cli] Running publisher for ${account.handle} (dry run: ${dryRun})`);
      
      const { SpokePublisher } = await import("./publishers/spokePublisher");
      const publisher = new SpokePublisher(account, 'default', 5);
      await publisher.run(dryRun);
      
      console.log(`[cli] ✅ Publisher routine complete`);
      return;
    }

    console.error(`[cli] ❌ Unknown command: ${cmd}`);
    printUsage();
    process.exit(1);

  } catch (error: any) {
    console.error(`[cli] ❌ Error: ${error.message}`);
    process.exit(1);
  }
}

function printUsage() {
  console.log(`
Usage: npm run cli <command> [args...]

Basic Commands:
  ip                                  - Check outbound IPs for all accounts
  login <@handle>                     - Login and save cookies for an account
  post <@handle> <text>               - Post a tweet
  reply <@handle> <tweet_url> <text>  - Reply to a tweet
  like <@handle> <tweet_url>          - Like a tweet
  timeline <username> [output_file]   - Fetch user's timeline
  search <query> [output_file]        - Search tweets
  monitor <@handle>                   - Monitor @pelpa333 and auto-respond to crypto posts

XlochaGOS Multi-Agent System:
  swarm start                         - Start orchestrator (continuous 30-min cycles)
  swarm once                          - Run single cycle and exit
  swarm queue                         - View content queue status
  swarm review                        - View premium posts for manual review (⭐ for @pelpa333)
  swarm dashboard                     - Start web dashboard (http://localhost:3001)
  swarm monitor                       - Monitor @pelpa333 + target accounts for mentions
  swarm respond                       - Process auto-responses to @pelpa333 mentions
  publish <@handle>                   - Run publisher routine for spoke account

Examples:
  npm run cli ip
  npm run cli login @FIZZonAbstract
  npm run cli post @FIZZonAbstract "Hello world!"
  npm run cli swarm once              # Run full agent pipeline once
  npm run cli swarm start             # Run agents continuously
  npm run cli swarm queue             # View generated content
  npm run cli publish @Account2       # Post from queue as spoke account

Environment:
  DRY_RUN=true                        - Test mode (no actual posts)

XlochaGOS System:
  - 6 AI agents working together (Gatherer, Researcher, Writer, QC, Images, Learning)
  - Scrapes accounts + RSS feeds (Agent 1)
  - Researches topics with Perplexity (Agent 2)
  - Generates content variations (Agent 3)
  - Quality filtering (Agent 4)
  - Image generation with Gemini Imagen (Agent 6)
  - Learning from performance (Agent 5)
  - Hub account (@FIZZonAbstract) gathers intelligence
  - Spoke accounts pull from queue and post
  `);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

