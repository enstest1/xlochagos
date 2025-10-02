import { ProxyAgent } from "undici";
import { log } from '../log';

export interface ProxyConfig {
  proxyUrl?: string;
  handle: string;
}

/**
 * Create a proxy-aware HTTP client for account-specific requests
 * Following the proxy.md strategy for per-account static residential/ISP proxies
 */
export function createProxyAgent(account: ProxyConfig) {
  if (!account.proxyUrl) {
    log.info({ handle: account.handle }, 'No proxy configured - using direct connection');
    return undefined;
  }

  try {
    const agent = new ProxyAgent(account.proxyUrl);
    log.info({ handle: account.handle, proxyUrl: account.proxyUrl }, 'Created proxy agent for account');
    return agent;
  } catch (error) {
    log.error({ 
      handle: account.handle, 
      proxyUrl: account.proxyUrl,
      error: (error as Error).message 
    }, 'Failed to create proxy agent');
    return undefined;
  }
}

/**
 * Get the outbound IP for an account to verify proxy usage
 * Following the proxy.md health check pattern
 */
export async function getOutboundIp(account: ProxyConfig): Promise<string | null> {
  try {
    const { request } = await import('undici');
    const dispatcher = createProxyAgent(account);
    
    const requestOptions: any = { headersTimeout: 8000 };
    if (dispatcher) {
      requestOptions.dispatcher = dispatcher;
    }
    
    const { body } = await request("https://api.ipify.org?format=json", requestOptions);
    
    const result = await body.json() as { ip: string };
    log.info({ handle: account.handle, ip: result.ip }, 'Outbound IP check completed');
    return result.ip;
  } catch (error) {
    log.warn({ 
      handle: account.handle, 
      error: (error as Error).message 
    }, 'Failed to get outbound IP');
    return null;
  }
}

/**
 * Set proxy environment variables for GOAT-X CLI usage
 * Following the proxy.md pattern for CLI tools
 */
export function setProxyEnv(account: ProxyConfig): Record<string, string> {
  const env: Record<string, string> = {};
  
  // Copy existing environment variables, filtering out undefined values
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  
  if (account.proxyUrl) {
    env.HTTP_PROXY = account.proxyUrl;
    env.HTTPS_PROXY = account.proxyUrl;
    log.info({ handle: account.handle }, 'Set proxy environment variables for CLI tools');
  }
  
  return env;
}
