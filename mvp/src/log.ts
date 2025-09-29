import pino from 'pino';

const logLevel = process.env.LOG_LEVEL || 'info';
const isDev = process.env.NODE_ENV === 'development';

export const log = pino({
  level: logLevel,
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname'
      }
    }
  }),
  base: {
    service: 'goatx-quadposter',
    version: process.env.npm_package_version || '1.0.0'
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`
});

// Structured logging helpers for common scenarios
export const logPublishAttempt = (handle: string, method: string, dryRun: boolean) => {
  log.info({
    phase: 'publish_attempt',
    handle,
    method,
    dryRun
  }, `Attempting to publish via ${method} for ${handle}`);
};

export const logPublishSuccess = (handle: string, method: string, postId: string, url: string, responseTimeMs: number, dryRun: boolean) => {
  log.info({
    phase: 'publish_success',
    handle,
    postId,
    url,
    method,
    responseTimeMs,
    dryRun
  }, `Successfully published ${dryRun ? '(dry run)' : ''}`);
};

export const logPublishError = (handle: string, method: string, error: string, retryable: boolean, attempt?: number) => {
  log.error({
    phase: 'publish_error',
    handle,
    method,
    error,
    retryable,
    attempt
  }, `Publish failed for ${handle}`);
};

export const logHealthCheck = (checkType: string, status: string, account?: string, details?: any) => {
  log.info({
    phase: 'health_check',
    checkType,
    status,
    account,
    ...details
  }, `Health check: ${checkType} - ${status}${account ? ` for ${account}` : ''}`);
};

export const logMetric = (metric: string, value: number, account?: string, additional?: Record<string, any>) => {
  log.info({
    phase: 'metrics',
    metric,
    value,
    account,
    ...additional
  }, `Metric recorded: ${metric} = ${value}${account ? ` for ${account}` : ''}`);
};

export const logContentRejection = (reason: string, textPreview: string, score?: number) => {
  log.warn({
    phase: 'content_rejection',
    reason,
    textPreview: textPreview.substring(0, 100) + (textPreview.length > 100 ? '...' : ''),
    score
  }, `Content rejected: ${reason}`);
};

export const logScheduling = (action: string, handle: string, details?: Record<string, any>) => {
  log.info({
    phase: 'scheduling',
    action,
    handle,
    ...details
  }, `Scheduling: ${action} for ${handle}`);
};

export const logSystemEvent = (event: string, details?: Record<string, any>) => {
  log.info({
    phase: 'system_event',
    event,
    ...details
  }, `System event: ${event}`);
};

export const logRollout = (phase: number, activeAccounts: string[], action: string) => {
  log.info({
    phase: 'rollout',
    rolloutPhase: phase,
    activeAccounts,
    action
  }, `Rollout phase ${phase}: ${action}`);
};

export const logWebhook = (eventType: string, endpoint: string, success: boolean, attempt?: number, error?: string) => {
  const logLevel = success ? 'info' : 'warn';
  log[logLevel]({
    phase: 'webhook',
    eventType,
    endpoint: endpoint.replace(/\/\/.*@/, '//***@'), // Hide credentials
    success,
    attempt,
    error
  }, `Webhook ${success ? 'sent' : 'failed'}: ${eventType}`);
};

export const logContentVariation = (originalHash: string, variedHash: string, seed: number) => {
  log.debug({
    phase: 'content_variation',
    originalHash: originalHash.substring(0, 8),
    variedHash: variedHash.substring(0, 8),
    seed
  }, 'Applied content variation');
};

export const logCacheHit = (source: string, query: string, hitCount: number) => {
  log.debug({
    phase: 'cache_hit',
    source,
    query: query.substring(0, 50),
    hitCount
  }, `Cache hit for ${source}`);
};

export const logRateLimit = (handle: string, nextSlot: number, reason: string) => {
  const waitMinutes = Math.ceil((nextSlot - Date.now()) / (60 * 1000));
  log.info({
    phase: 'rate_limit',
    handle,
    nextSlot,
    waitMinutes,
    reason
  }, `Rate limited ${handle}: wait ${waitMinutes}m (${reason})`);
};

export const logFallback = (handle: string, fromMethod: string, toMethod: string, originalError: string) => {
  log.warn({
    phase: 'fallback',
    handle,
    fromMethod,
    toMethod,
    originalError
  }, `Falling back from ${fromMethod} to ${toMethod} for ${handle}`);
};

export const logConfigLoad = (configFile: string, valid: boolean, errors?: string[]) => {
  const logLevel = valid ? 'info' : 'error';
  log[logLevel]({
    phase: 'config_load',
    configFile,
    valid,
    errors
  }, `Configuration ${valid ? 'loaded' : 'failed'}: ${configFile}`);
};

export const logDatabaseOperation = (operation: string, table: string, rowsAffected?: number, duration?: number) => {
  log.debug({
    phase: 'database',
    operation,
    table,
    rowsAffected,
    duration
  }, `Database ${operation} on ${table}`);
};

export const logCypherSwarmIngestion = (itemCount: number, filteredCount: number, duration: number) => {
  log.info({
    phase: 'cypher_swarm_ingestion',
    totalItems: itemCount,
    filteredItems: filteredCount,
    filterRate: filteredCount / itemCount,
    duration
  }, `Ingested ${filteredCount}/${itemCount} items from Cypher-Swarm`);
};

export const logContext7Query = (query: string, resultCount: number, responseTime: number) => {
  log.debug({
    phase: 'context7_query',
    query: query.substring(0, 100),
    resultCount,
    responseTime
  }, `Context7 query returned ${resultCount} results`);
};

export const logSecurityEvent = (event: string, severity: 'low' | 'medium' | 'high', details: Record<string, any>) => {
  log.warn({
    phase: 'security',
    event,
    severity,
    ...details
  }, `Security event: ${event} (${severity})`);
};

export const logPerformance = (operation: string, duration: number, memory?: number) => {
  log.debug({
    phase: 'performance',
    operation,
    duration,
    memory
  }, `Performance: ${operation} took ${duration}ms`);
};

export const logQuotaWarning = (handle: string, used: number, limit: number, percentage: number) => {
  log.warn({
    phase: 'quota_warning',
    handle,
    used,
    limit,
    percentage
  }, `Quota warning for ${handle}: ${used}/${limit} (${percentage.toFixed(1)}%)`);
};

export const logSimilarityCheck = (textHash: string, similarityScore: number, threshold: number, blocked: boolean) => {
  log.debug({
    phase: 'similarity_check',
    textHash: textHash.substring(0, 8),
    similarityScore,
    threshold,
    blocked
  }, `Similarity check: ${blocked ? 'blocked' : 'passed'} (${similarityScore.toFixed(3)})`);
};

export const logAdaptiveTiming = (handle: string, baseDelay: number, adaptedDelay: number, factors: Record<string, number>) => {
  log.debug({
    phase: 'adaptive_timing',
    handle,
    baseDelay,
    adaptedDelay,
    factors
  }, `Adaptive timing for ${handle}: ${baseDelay}ms → ${adaptedDelay}ms`);
};

export const logError = (error: Error, context?: Record<string, any>) => {
  log.error({
    phase: 'error',
    error: error.message,
    stack: error.stack,
    name: error.name,
    ...context
  }, `Error: ${error.message}`);
};

export const logStartup = (config: Record<string, any>) => {
  log.info({
    phase: 'startup',
    ...config
  }, 'GOAT-X QuadPoster starting up');
};

export const logShutdown = (reason: string, stats?: Record<string, any>) => {
  log.info({
    phase: 'shutdown',
    reason,
    ...stats
  }, `Shutting down: ${reason}`);
};

// Create child loggers for specific modules
export const createModuleLogger = (module: string) => {
  return log.child({ module });
};

// Export the main logger as default
export default log;