import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';
import yaml from 'yaml';
import {
  EnvConfig,
  EnvConfigSchema,
  AccountsConfig,
  AccountsConfigSchema,
  MonitoringConfig,
  MonitoringConfigSchema,
  ConfigValidationError
} from './types';
import { logConfigLoad, logError } from './log';

// Load environment variables
config();

export function loadEnvConfig(): EnvConfig {
  try {
    const rawEnv = {
      DRY_RUN: process.env.DRY_RUN === 'true',
      DB_PATH: process.env.DB_PATH,
      CYPHER_SWARM_OUT: process.env.CYPHER_SWARM_OUT,
      CONTEXT7_DOCS_DIR: process.env.CONTEXT7_DOCS_DIR,
      CONTEXT7_TOPK: process.env.CONTEXT7_TOPK ? parseInt(process.env.CONTEXT7_TOPK) : undefined,
      MAX_ITEMS_PER_CYCLE: process.env.MAX_ITEMS_PER_CYCLE ? parseInt(process.env.MAX_ITEMS_PER_CYCLE) : undefined,
      UTM_QUERY: process.env.UTM_QUERY,
      X_API_KEYS_JSON: process.env.X_API_KEYS_JSON,
      COOKIE_VALIDATION_INTERVAL_HOURS: process.env.COOKIE_VALIDATION_INTERVAL_HOURS ? parseInt(process.env.COOKIE_VALIDATION_INTERVAL_HOURS) : undefined,
      WEBHOOK_FAILURE_URL: process.env.WEBHOOK_FAILURE_URL,
      WEBHOOK_SUCCESS_URL: process.env.WEBHOOK_SUCCESS_URL,
      HEALTH_CHECK_INTERVAL_MINUTES: process.env.HEALTH_CHECK_INTERVAL_MINUTES ? parseInt(process.env.HEALTH_CHECK_INTERVAL_MINUTES) : undefined,
      METRICS_RETENTION_DAYS: process.env.METRICS_RETENTION_DAYS ? parseInt(process.env.METRICS_RETENTION_DAYS) : undefined,
      ROLLOUT_MODE: process.env.ROLLOUT_MODE,
      ROLLOUT_START_ACCOUNTS: process.env.ROLLOUT_START_ACCOUNTS ? parseInt(process.env.ROLLOUT_START_ACCOUNTS) : undefined,
      ROLLOUT_INCREMENT_HOURS: process.env.ROLLOUT_INCREMENT_HOURS ? parseInt(process.env.ROLLOUT_INCREMENT_HOURS) : undefined,
      GLOBAL_DAILY_LIMIT: process.env.GLOBAL_DAILY_LIMIT ? parseInt(process.env.GLOBAL_DAILY_LIMIT) : undefined,
      PLATFORM_RESPECT_MODE: process.env.PLATFORM_RESPECT_MODE,
      DETECTION_AVOIDANCE: process.env.DETECTION_AVOIDANCE === 'true',
      LOG_LEVEL: process.env.LOG_LEVEL,
      NODE_ENV: process.env.NODE_ENV
    };

    const envConfig = EnvConfigSchema.parse(rawEnv);
    logConfigLoad('.env', true);
    return envConfig;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logConfigLoad('.env', false, [errorMessage]);
    throw new ConfigValidationError(`Environment configuration validation failed: ${errorMessage}`, 'env');
  }
}

export function loadAccountsConfig(configPath: string = './config/accounts.yaml'): AccountsConfig {
  try {
    if (!existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }

    const configYaml = readFileSync(configPath, 'utf8');
    const configData = yaml.parse(configYaml);

    const accountsConfig = AccountsConfigSchema.parse(configData);
    logConfigLoad(configPath, true);
    return accountsConfig;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logConfigLoad(configPath, false, [errorMessage]);
    throw new ConfigValidationError(`Accounts configuration validation failed: ${errorMessage}`, 'accounts');
  }
}

export function loadMonitoringConfig(configPath: string = './config/monitoring.yaml'): MonitoringConfig {
  try {
    if (!existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }

    const configYaml = readFileSync(configPath, 'utf8');
    const configData = yaml.parse(configYaml);

    // Process environment variable substitutions
    const processedConfig = processEnvSubstitutions(configData);

    const monitoringConfig = MonitoringConfigSchema.parse(processedConfig);
    logConfigLoad(configPath, true);
    return monitoringConfig;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logConfigLoad(configPath, false, [errorMessage]);
    throw new ConfigValidationError(`Monitoring configuration validation failed: ${errorMessage}`, 'monitoring');
  }
}

// Process environment variable substitutions like ${WEBHOOK_FAILURE_URL}
function processEnvSubstitutions(obj: any): any {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{([^}]+)\}/g, (match, envVar) => {
      return process.env[envVar] || '';
    });
  } else if (Array.isArray(obj)) {
    return obj.map(processEnvSubstitutions);
  } else if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = processEnvSubstitutions(value);
    }
    return result;
  }
  return obj;
}

export function loadAllConfigs(): {
  env: EnvConfig;
  accounts: AccountsConfig;
  monitoring: MonitoringConfig;
} {
  try {
    const env = loadEnvConfig();
    const accounts = loadAccountsConfig();
    const monitoring = loadMonitoringConfig();

    // Cross-validation
    validateConfigCompatibility(env, accounts, monitoring);

    return { env, accounts, monitoring };

  } catch (error) {
    logError(error as Error, { operation: 'load_all_configs' });
    throw error;
  }
}

function validateConfigCompatibility(
  env: EnvConfig,
  accounts: AccountsConfig,
  monitoring: MonitoringConfig
): void {
  const issues: string[] = [];

  // Check that active accounts exist
  const activeAccounts = accounts.accounts.filter(a => a.active);
  if (activeAccounts.length === 0) {
    issues.push('No active accounts configured');
  }

  // Validate rollout configuration
  if (env.ROLLOUT_MODE === 'gradual') {
    if (env.ROLLOUT_START_ACCOUNTS > activeAccounts.length) {
      issues.push('ROLLOUT_START_ACCOUNTS exceeds number of active accounts');
    }
  }

  // Check daily limits consistency
  const totalAccountCaps = accounts.accounts
    .filter(a => a.active)
    .reduce((sum, a) => sum + a.daily_cap, 0);

  if (env.GLOBAL_DAILY_LIMIT > totalAccountCaps) {
    issues.push('GLOBAL_DAILY_LIMIT exceeds sum of individual account caps');
  }

  // Validate webhook URLs if configured
  if (monitoring.webhooks.failure_endpoint) {
    if (!isValidUrl(monitoring.webhooks.failure_endpoint)) {
      issues.push('Invalid failure webhook URL');
    }
  }

  if (monitoring.webhooks.success_endpoint) {
    if (!isValidUrl(monitoring.webhooks.success_endpoint)) {
      issues.push('Invalid success webhook URL');
    }
  }

  // Check file paths
  if (!existsSync(env.CONTEXT7_DOCS_DIR)) {
    issues.push(`CONTEXT7_DOCS_DIR does not exist: ${env.CONTEXT7_DOCS_DIR}`);
  }

  // Validate cookie paths for active accounts
  for (const account of activeAccounts) {
    if (account.mode === 'cookie' && account.cookie_path) {
      if (!existsSync(account.cookie_path)) {
        issues.push(`Cookie file not found for ${account.handle}: ${account.cookie_path}`);
      }
    }
  }

  if (issues.length > 0) {
    throw new ConfigValidationError(
      `Configuration compatibility issues: ${issues.join(', ')}`,
      'compatibility'
    );
  }
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return url.startsWith('http://') || url.startsWith('https://');
  } catch {
    return false;
  }
}

// Configuration validation helpers
export function validateAccountConfiguration(accounts: AccountsConfig): {
  valid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const account of accounts.accounts) {
    // Check handle format
    if (!account.handle.startsWith('@')) {
      warnings.push(`Account handle should start with @: ${account.handle}`);
    }

    // Check daily cap reasonableness
    if (account.daily_cap > 20) {
      warnings.push(`High daily cap for ${account.handle}: ${account.daily_cap}`);
    }

    // Check posting interval
    if (account.min_minutes_between_posts < 30) {
      warnings.push(`Very short posting interval for ${account.handle}: ${account.min_minutes_between_posts}m`);
    }

    // Check mode-specific requirements
    if (account.mode === 'cookie') {
      if (!account.cookie_path) {
        errors.push(`Cookie mode account ${account.handle} missing cookie_path`);
      }
    } else if (account.mode === 'api') {
      if (!account.backup_api_key) {
        errors.push(`API mode account ${account.handle} missing backup_api_key`);
      }
    }

    // Check priority values
    if (account.priority < 1 || account.priority > 4) {
      warnings.push(`Invalid priority for ${account.handle}: ${account.priority} (should be 1-4)`);
    }
  }

  // Check for duplicate handles
  const handles = accounts.accounts.map(a => a.handle);
  const duplicates = handles.filter((h, i) => handles.indexOf(h) !== i);
  if (duplicates.length > 0) {
    errors.push(`Duplicate account handles: ${[...new Set(duplicates)].join(', ')}`);
  }

  // Check for duplicate priorities among active accounts
  const activeAccounts = accounts.accounts.filter(a => a.active);
  const priorities = activeAccounts.map(a => a.priority);
  const duplicatePriorities = priorities.filter((p, i) => priorities.indexOf(p) !== i);
  if (duplicatePriorities.length > 0) {
    warnings.push(`Duplicate priorities among active accounts: ${[...new Set(duplicatePriorities)].join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors
  };
}

export function getConfigSummary(
  env: EnvConfig,
  accounts: AccountsConfig,
  monitoring: MonitoringConfig
): Record<string, any> {
  const activeAccounts = accounts.accounts.filter(a => a.active);

  return {
    environment: {
      dryRun: env.DRY_RUN,
      logLevel: env.LOG_LEVEL,
      nodeEnv: env.NODE_ENV,
      rolloutMode: env.ROLLOUT_MODE
    },
    accounts: {
      total: accounts.accounts.length,
      active: activeAccounts.length,
      totalDailyCap: activeAccounts.reduce((sum, a) => sum + a.daily_cap, 0),
      globalLimit: env.GLOBAL_DAILY_LIMIT
    },
    content: {
      maxLength: accounts.content.max_length,
      requireLink: accounts.content.require_link,
      variationEnabled: accounts.content.variation_enabled,
      minSourceScore: accounts.content.min_source_score
    },
    monitoring: {
      webhooksConfigured: !!(monitoring.webhooks.failure_endpoint || monitoring.webhooks.success_endpoint),
      healthCheckInterval: monitoring.health_checks.system_health_minutes,
      metricsRetention: monitoring.metrics.retention_days
    },
    paths: {
      database: env.DB_PATH,
      cypherSwarmOut: env.CYPHER_SWARM_OUT,
      context7Docs: env.CONTEXT7_DOCS_DIR
    }
  };
}

// Export configuration loading functions
export const configLoader = {
  loadEnv: loadEnvConfig,
  loadAccounts: loadAccountsConfig,
  loadMonitoring: loadMonitoringConfig,
  loadAll: loadAllConfigs,
  validate: validateAccountConfiguration,
  getSummary: getConfigSummary
};