/**
 * Shared helper functions for alt account operations
 */
import { createAccountCfg } from '../publish/playwright';
import type { AccountCfg } from '../config/accountsNew';

const COOKIE_PATH_BASE = './secrets';

/**
 * Get cookie path for an alt handle
 */
export function getCookiePath(altHandle: string): string {
  const safe = altHandle.replace('@', '');
  return `${COOKIE_PATH_BASE}/${safe}.cookies.json`;
}

/**
 * Create AccountCfg for an alt handle
 * Wrapper around createAccountCfg() from publish/playwright
 */
export function getAccountCfgForAlt(altHandle: string, proxyUrl?: string): AccountCfg {
  return createAccountCfg(altHandle, getCookiePath(altHandle), proxyUrl);
}

