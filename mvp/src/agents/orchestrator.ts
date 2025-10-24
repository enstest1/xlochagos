/**
 * XlochaGOS Orchestrator
 * Coordinates all agents in proper sequence
 */

import { log } from '../log';
import { IntelligenceGathererAgent } from './intelligenceGatherer';
import { ResearchAgent } from './researchAgent';
import { ContentWriterAgent } from './contentWriter';
import { QualityControllerAgent } from './qualityController';
import { ImageGeneratorAgent } from './imageGeneratorAgent';
import { LearningAgent } from './learningAgent';
import { ResponseAgent } from './responseAgent';
import { AccountCfg } from '../config/accountsNew';
import crypto from 'crypto';

export class XlochaGOSOrchestrator {
  private agents: {
    gatherer?: IntelligenceGathererAgent;
    researcher?: ResearchAgent;
    writer?: ContentWriterAgent;
    controller?: QualityControllerAgent;
    imageGenerator?: ImageGeneratorAgent;
    learner?: LearningAgent;
    responder?: ResponseAgent;
  } = {};
  
  private hubAccount: AccountCfg;
  private lastLearningRun: number = 0;
  
  constructor(hubAccount: AccountCfg) {
    this.hubAccount = hubAccount;
    this.initializeAgents();
  }
  
  private initializeAgents() {
    log.info('[Orchestrator] Initializing XlochaGOS agents...');
    
    try {
      this.agents.gatherer = new IntelligenceGathererAgent(this.hubAccount);
      this.agents.researcher = new ResearchAgent();
      this.agents.writer = new ContentWriterAgent();
      this.agents.controller = new QualityControllerAgent();
      this.agents.imageGenerator = new ImageGeneratorAgent();
      this.agents.learner = new LearningAgent();
      this.agents.responder = new ResponseAgent();
      
      log.info('[Orchestrator] All agents initialized successfully');
    } catch (error) {
      log.error({ error: (error as Error).message }, '[Orchestrator] Failed to initialize agents');
      throw error;
    }
  }
  
  /**
   * Run a single cycle of all agents
   */
  async runCycle(): Promise<void> {
    const cycleId = crypto.randomUUID();
    
    log.info({ 
      cycleId,
      hubAccount: this.hubAccount.handle
    }, '[Orchestrator] Starting XlochaGOS cycle');
    
    const cycleStart = Date.now();
    
    try {
      // Sequential execution of agents
      await this.runAgent('gatherer', cycleId);      // Agent 1: Scrape + RSS + @pelpa333 + Target accounts
      await this.runAgent('researcher', cycleId);    // Agent 2: Research
      await this.runAgent('writer', cycleId);        // Agent 3: Write
      await this.runAgent('controller', cycleId);    // Agent 4: QC
      await this.runAgent('imageGenerator', cycleId);// Agent 6: Images
      await this.runAgent('responder', cycleId);     // Agent 7: Auto-response to @pelpa333 mentions
      
      // Agent 5 runs on different schedule (daily)
      if (this.shouldRunLearning()) {
        await this.runAgent('learner', cycleId);
        this.lastLearningRun = Date.now();
      }
      
      const cycleDuration = Date.now() - cycleStart;
      
      log.info({ 
        cycleId,
        durationMs: cycleDuration,
        durationMinutes: (cycleDuration / 1000 / 60).toFixed(2)
      }, '[Orchestrator] Cycle complete');
      
    } catch (error) {
      log.error({ 
        cycleId,
        error: (error as Error).message 
      }, '[Orchestrator] Cycle failed');
      throw error;
    }
  }
  
  /**
   * Run a single agent with logging
   */
  private async runAgent(
    agentName: 'gatherer' | 'researcher' | 'writer' | 'controller' | 'imageGenerator' | 'learner' | 'responder',
    cycleId: string
  ): Promise<void> {
    const startTime = Date.now();
    
    log.info({ 
      agent: agentName,
      cycleId 
    }, '[Orchestrator] Starting agent');
    
    try {
      const agent = this.agents[agentName];
      
      if (!agent) {
        throw new Error(`Agent ${agentName} not initialized`);
      }
      
      // Run the agent (Response Agent has different method)
      let result;
      if (agentName === 'responder') {
        await (agent as any).runResponseCycle();
        result = { items_processed: 0, items_created: 0, items_failed: 0 };
      } else {
        result = await (agent as any).run();
      }
      
      const duration = Date.now() - startTime;
      
      // Log execution to Supabase
      await this.logAgentExecution({
        agent_name: agentName,
        cycle_id: cycleId,
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: duration,
        status: 'success',
        items_processed: result.items_processed,
        items_created: result.items_created,
        items_failed: result.items_failed,
        data: result
      });
      
      log.info({ 
        agent: agentName,
        cycleId,
        durationMs: duration,
        result
      }, '[Orchestrator] Agent completed');
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      log.error({ 
        agent: agentName,
        cycleId,
        error: (error as Error).message
      }, '[Orchestrator] Agent failed');
      
      // Log failure to Supabase
      await this.logAgentExecution({
        agent_name: agentName,
        cycle_id: cycleId,
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: duration,
        status: 'failed',
        error_message: (error as Error).message,
        error_stack: (error as Error).stack
      });
      
      throw error;
    }
  }
  
  /**
   * Check if learning agent should run
   */
  private shouldRunLearning(): boolean {
    const dayInMs = 24 * 60 * 60 * 1000;
    return (Date.now() - this.lastLearningRun) >= dayInMs;
  }
  
  /**
   * Log agent execution to Supabase
   */
  private async logAgentExecution(data: any): Promise<void> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return;
    }
    
    try {
      await fetch(`${supabaseUrl}/rest/v1/agent_execution_logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(data)
      });
    } catch (error) {
      log.warn({ error: (error as Error).message }, '[Orchestrator] Failed to log execution');
    }
  }
  
  /**
   * Run continuously with interval
   */
  async runContinuously(intervalMinutes: number = 30): Promise<void> {
    log.info({ 
      intervalMinutes,
      hubAccount: this.hubAccount.handle
    }, '[Orchestrator] Starting continuous operation');
    
    while (true) {
      try {
        await this.runCycle();
      } catch (error) {
        log.error({ 
          error: (error as Error).message 
        }, '[Orchestrator] Cycle failed, continuing...');
      }
      
      // Wait before next cycle
      const waitMs = intervalMinutes * 60 * 1000;
      log.info({ 
        waitMinutes: intervalMinutes 
      }, '[Orchestrator] Sleeping until next cycle...');
      
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
  
  /**
   * Run once and exit
   */
  async runOnce(): Promise<void> {
    log.info('[Orchestrator] Running single cycle...');
    await this.runCycle();
    log.info('[Orchestrator] Single cycle complete');
  }
}

