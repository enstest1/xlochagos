import { load } from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { log } from '../log';

export interface AccountConfig {
  handle: string;
  mode: string;
  cookie_path: string;
  backup_api_key: string;
  daily_cap: number;
  min_minutes_between_posts: number;
  active: boolean;
  priority: number;
  user_agent: string;
  proxy_url?: string;
}

export interface AccountsConfig {
  accounts: AccountConfig[];
  // ... other config sections
}

/**
 * Load account configuration with proxy URL resolution
 * Following the proxy.md pattern for environment variable substitution
 */
export function loadAccountsConfig(): AccountsConfig {
  try {
    const configPath = path.join(process.cwd(), 'config', 'accounts.yaml');
    const configContent = fs.readFileSync(configPath, 'utf8');
    
    // Parse YAML with environment variable substitution
    const rawConfig = load(configContent) as AccountsConfig;
    
    // Resolve proxy URLs from environment variables
    const processedAccounts = rawConfig.accounts.map(account => {
      if (account.proxy_url && account.proxy_url.startsWith('${') && account.proxy_url.endsWith('}')) {
        const envVarName = account.proxy_url.slice(2, -1); // Remove ${ and }
        const proxyUrl = process.env[envVarName];
        
        if (proxyUrl) {
          log.info({ handle: account.handle, envVar: envVarName }, 'Resolved proxy URL from environment variable');
          return { ...account, proxy_url: proxyUrl };
        } else {
          log.warn({ handle: account.handle, envVar: envVarName }, 'Proxy environment variable not found');
          const { proxy_url, ...accountWithoutProxy } = account;
          return accountWithoutProxy;
        }
      }
      
      return account;
    });
    
    return {
      ...rawConfig,
      accounts: processedAccounts
    };
  } catch (error) {
    log.error({ error: (error as Error).message }, 'Failed to load accounts configuration');
    throw error;
  }
}

/**
 * Get active accounts with proxy configuration
 */
export function getActiveAccounts(): AccountConfig[] {
  const config = loadAccountsConfig();
  return config.accounts.filter(account => account.active);
}

/**
 * Get account by handle
 */
export function getAccountByHandle(handle: string): AccountConfig | undefined {
  const config = loadAccountsConfig();
  return config.accounts.find(account => account.handle === handle);
}
