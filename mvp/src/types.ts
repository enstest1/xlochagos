import { z } from 'zod';

// Core types (enhanced)
export const SourceItemSchema = z.object({
  url: z.string().url(),
  primaryUrl: z.string().url().optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
  score: z.number().min(0).max(1),
  tags: z.array(z.string()).optional(),
  extractedAt: z.number().optional()
});
export type SourceItem = z.infer<typeof SourceItemSchema>;

// RSS Feed Configuration
export const RssFeedSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  category: z.string(),
  weight: z.number().min(0).max(1),
  enabled: z.boolean()
});
export type RssFeed = z.infer<typeof RssFeedSchema>;

export const CypherSwarmConfigSchema = z.object({
  enabled: z.boolean(),
  content_posting: z.boolean(),
  monitoring_only: z.boolean(),
  test_mode: z.boolean(),
  rss_feeds: z.array(RssFeedSchema)
});
export type CypherSwarmConfig = z.infer<typeof CypherSwarmConfigSchema>;

export const DocSnippetSchema = z.object({
  sourcePath: z.string(),
  snippet: z.string().max(180),
  score: z.number().min(0).max(1),
  entities: z.array(z.string()).optional(),
  relevanceReason: z.string().optional()
});
export type DocSnippet = z.infer<typeof DocSnippetSchema>;

export const PostDraftSchema = z.object({
  text: z.string().max(280),
  sourceUrl: z.string().url(),
  contentHash: z.string(),
  variationSeed: z.number().optional(),
  confidence: z.number().min(0).max(1).optional()
});
export type PostDraft = z.infer<typeof PostDraftSchema>;

// Enhanced account configuration
export const AccountSchema = z.object({
  handle: z.string(),
  mode: z.enum(['cookie', 'api']),
  cookie_path: z.string().optional(),
  backup_api_key: z.string().optional(),
  daily_cap: z.number().positive(),
  min_minutes_between_posts: z.number().positive(),
  active: z.boolean(),
  priority: z.number().int().min(1).max(4),
  user_agent: z.string().optional(),
  last_health_check: z.number().optional(),
  consecutive_failures: z.number().default(0)
});
export type Account = z.infer<typeof AccountSchema>;

// Configuration schemas
export const RotationConfigSchema = z.object({
  max_total_daily_posts: z.number().positive(),
  burst_window_minutes: z.number().positive(),
  burst_max_posts: z.number().positive(),
  respect_platform_limits: z.boolean(),
  adaptive_timing: z.boolean()
});
export type RotationConfig = z.infer<typeof RotationConfigSchema>;

export const ContentConfigSchema = z.object({
  max_length: z.number().positive(),
  allow_links: z.boolean(),
  require_link: z.boolean(),
  prefer_primary_link: z.boolean(),
  blacklist_domains: z.array(z.string()),
  min_source_score: z.number().min(0).max(1),
  min_unique_words: z.number().positive(),
  ban_phrases: z.array(z.string()),
  require_claim: z.boolean(),
  variation_enabled: z.boolean(),
  max_similarity_threshold: z.number().min(0).max(1)
});
export type ContentConfig = z.infer<typeof ContentConfigSchema>;

export const AccountsConfigSchema = z.object({
  accounts: z.array(AccountSchema),
  rotation: RotationConfigSchema,
  content: ContentConfigSchema
});
export type AccountsConfig = z.infer<typeof AccountsConfigSchema>;

// Research Monitoring Configuration
export const ResearchMonitoringConfigSchema = z.object({
  enabled: z.boolean(),
  target_accounts: z.array(z.string()),
  max_posts_per_day: z.number().positive(),
  content_storage: z.boolean(),
  research_interval_minutes: z.number().positive(),
  content_freshness_hours: z.number().positive()
});
export type ResearchMonitoringConfig = z.infer<typeof ResearchMonitoringConfigSchema>;

// Health and monitoring types
export const HealthCheckResultSchema = z.object({
  timestamp: z.number(),
  checkType: z.enum(['cookie', 'system', 'rate_limit', 'content']),
  account: z.string().optional(),
  status: z.enum(['pass', 'fail', 'warn']),
  details: z.record(z.any()),
  responseTimeMs: z.number().optional(),
  recommendations: z.array(z.string()).optional()
});
export type HealthCheck = z.infer<typeof HealthCheckResultSchema>;

export const WebhookConfigSchema = z.object({
  failure_endpoint: z.string().optional(),
  success_endpoint: z.string().optional(),
  batch_size: z.number().positive().default(5),
  retry_attempts: z.number().positive().default(3),
  timeout_seconds: z.number().positive().default(10)
});
export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;

export const MonitoringConfigSchema = z.object({
  webhooks: WebhookConfigSchema,
  health_checks: z.object({
    cookie_validation_hours: z.number().positive(),
    system_health_minutes: z.number().positive(),
    performance_thresholds: z.object({
      max_response_time_ms: z.number().positive(),
      min_success_rate: z.number().min(0).max(1),
      max_error_rate: z.number().min(0).max(1)
    })
  }),
  alerts: z.object({
    consecutive_failures_threshold: z.number().positive(),
    daily_quota_warning_percent: z.number().min(0).max(100),
    cookie_expiry_warning_hours: z.number().positive(),
    rate_limit_hit_alert: z.boolean()
  }),
  metrics: z.object({
    retention_days: z.number().positive(),
    export_format: z.string(),
    include_performance_data: z.boolean()
  })
});
export type MonitoringConfig = z.infer<typeof MonitoringConfigSchema>;

// Publisher interfaces with fallback support
export interface IPublisher {
  publish(draft: PostDraft): Promise<PublishResult>;
  healthCheck(): Promise<HealthCheck>;
  getLastError(): Error | null;
}

export const PublishResultSchema = z.object({
  id: z.string(),
  url: z.string(),
  method: z.enum(['cookie', 'api']),
  responseTimeMs: z.number(),
  success: z.boolean(),
  error: z.string().optional(),
  retryable: z.boolean().default(false)
});
export type PublishResult = z.infer<typeof PublishResultSchema>;

// Monitoring and metrics
export const MetricsSnapshotSchema = z.object({
  date: z.string(),
  account: z.string(),
  postsAttempted: z.number().default(0),
  postsSuccessful: z.number().default(0),
  postsFailed: z.number().default(0),
  avgResponseTimeMs: z.number().optional(),
  cookieFailures: z.number().default(0),
  apiFallbacks: z.number().default(0),
  rateLimitHits: z.number().default(0),
  successRate: z.number().min(0).max(1).optional()
});
export type Metrics = z.infer<typeof MetricsSnapshotSchema>;

// Environment configuration
export const EnvConfigSchema = z.object({
  DRY_RUN: z.boolean().default(true),
  DB_PATH: z.string().default('./data/mvp.sqlite'),
  CYPHER_SWARM_OUT: z.string().default('../cypher-swarm/out/latest.jsonl'),
  CONTEXT7_DOCS_DIR: z.string().default('./docs'),
  CONTEXT7_TOPK: z.number().positive().default(8),
  MAX_ITEMS_PER_CYCLE: z.number().positive().default(15),
  UTM_QUERY: z.string().optional(),
  X_API_KEYS_JSON: z.string().default('{}'),
  COOKIE_VALIDATION_INTERVAL_HOURS: z.number().positive().default(6),
  WEBHOOK_FAILURE_URL: z.string().optional(),
  WEBHOOK_SUCCESS_URL: z.string().optional(),
  HEALTH_CHECK_INTERVAL_MINUTES: z.number().positive().default(30),
  METRICS_RETENTION_DAYS: z.number().positive().default(30),
  ROLLOUT_MODE: z.enum(['all', 'gradual']).default('gradual'),
  ROLLOUT_START_ACCOUNTS: z.number().positive().default(1),
  ROLLOUT_INCREMENT_HOURS: z.number().positive().default(24),
  GLOBAL_DAILY_LIMIT: z.number().positive().default(40),
  PLATFORM_RESPECT_MODE: z.enum(['strict', 'moderate', 'aggressive']).default('strict'),
  DETECTION_AVOIDANCE: z.boolean().default(true),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production')
});
export type EnvConfig = z.infer<typeof EnvConfigSchema>;

// Content quality and heuristics
export const HeuristicResultSchema = z.object({
  passed: z.boolean(),
  reasons: z.array(z.string()),
  score: z.number().min(0).max(1)
});
export type HeuristicResult = z.infer<typeof HeuristicResultSchema>;

// Scheduling and queue management
export const SchedulingTaskSchema = z.object({
  account: AccountSchema,
  draft: PostDraftSchema,
  priority: z.number(),
  estimatedPostTime: z.number()
});
export type SchedulingTask = z.infer<typeof SchedulingTaskSchema>;

// Error types
export class ConfigValidationError extends Error {
  constructor(message: string, public field: string) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

export class PublishError extends Error {
  constructor(
    message: string,
    public account: string,
    public retryable: boolean = false,
    public method?: string
  ) {
    super(message);
    this.name = 'PublishError';
  }
}

export class HealthCheckError extends Error {
  constructor(
    message: string,
    public checkType: string,
    public account?: string
  ) {
    super(message);
    this.name = 'HealthCheckError';
  }
}

// Utility types
export interface CookieData {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expires?: number;
}

export interface SystemHealth {
  overall: 'healthy' | 'warning' | 'critical';
  accounts: Record<string, HealthCheck>;
  system: HealthCheck;
  recommendations: string[];
}

export interface ContentSimilarity {
  textHash: string;
  similarityScore: number;
  existingPosts: string[];
}

// API response types
export interface GoatXResponse {
  id: string;
  url: string;
  success?: boolean;
  error?: string;
}

export interface Context7QueryResponse {
  results: DocSnippet[];
  total: number;
  queryTime: number;
}

// Rollout management
export const RolloutStateSchema = z.object({
  startedAt: z.number(),
  currentPhase: z.number(),
  activeAccounts: z.array(z.string()),
  nextPhaseAt: z.number()
});
export type RolloutState = z.infer<typeof RolloutStateSchema>;

// Webhook payload types
export const WebhookPayloadSchema = z.object({
  eventType: z.string(),
  timestamp: z.string(),
  data: z.record(z.any())
});
export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

// Database row types (for better type safety with SQL results)
export interface PostRow {
  id: number;
  account: string;
  text: string;
  url: string | null;
  source_url: string;
  created_at: number;
  status: string;
  retry_count: number;
  error_reason: string | null;
  response_time_ms: number | null;
  method_used: string | null;
}

export interface SourceRow {
  hash: string;
  url: string;
  title: string | null;
  score: number;
  seen_at: number;
  used: number;
  last_used_at: number | null;
  usage_count: number;
}

export interface CapRow {
  date: string;
  account: string;
  count: number;
}

export interface HealthCheckRow {
  id: number;
  timestamp: number;
  check_type: string;
  account: string | null;
  status: string;
  details: string | null;
  response_time_ms: number | null;
}

export interface MetricsRow {
  id: number;
  date: string;
  account: string;
  posts_attempted: number;
  posts_successful: number;
  posts_failed: number;
  avg_response_time_ms: number | null;
  cookie_failures: number;
  api_fallbacks: number;
  rate_limit_hits: number;
}

export interface ContentPatternRow {
  id: number;
  text_hash: string;
  week_year: string;
  account: string;
  created_at: number;
  similarity_score: number | null;
}

// AI Agent Personality Types
export const AgentPersonalitySchema = z.object({
  bio: z.array(z.string()),
  lore: z.array(z.string()),
  topics: z.array(z.string()),
  adjectives: z.array(z.string()),
  style: z.object({
    all: z.array(z.string()),
    chat: z.array(z.string()),
    post: z.array(z.string())
  }),
  comment_templates: z.array(z.string())
});
export type AgentPersonality = z.infer<typeof AgentPersonalitySchema>;

export const PersonalitiesConfigSchema = z.record(z.string(), AgentPersonalitySchema);
export type PersonalitiesConfig = z.infer<typeof PersonalitiesConfigSchema>;