/**
 * Account configuration loader for local-first architecture
 * Loads account details from environment variables
 */

import dotenv from "dotenv";
import path from "path";

// Load environment variables at module init
const envPath = path.resolve(process.cwd(), ".env.local");
dotenv.config({ path: envPath });

export type AccountCfg = {
  handle: string;
  cookiePath: string;
  proxyUrl?: string | undefined;
  username?: string | undefined;
  password?: string | undefined;
};

function load(n: number): AccountCfg | null {
  const g = (k: string) => process.env[k];
  const h = g(`ACCT${n}_HANDLE`);
  if (!h) return null;
  return {
    handle: h,
    cookiePath: g(`ACCT${n}_COOKIE_PATH`)!,
    proxyUrl: g(`ACCT${n}_PROXY_URL`) || undefined,
    username: g(`ACCT${n}_USERNAME`) || undefined,
    password: g(`ACCT${n}_PASSWORD`) || undefined,
  };
}

export const ACCOUNTS = [1, 2, 3, 4].map(load).filter(Boolean) as AccountCfg[];

