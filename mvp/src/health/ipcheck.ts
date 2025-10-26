/**
 * IP health check module
 * Verifies outbound IP for each account to ensure proxy is working
 */

import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import type { AccountCfg } from "../config/accountsNew";

export async function logOutboundIp(acct: AccountCfg): Promise<string | null> {
  try {
    const config: any = {
      timeout: 8000,
    };

    if (acct.proxyUrl) {
      const agent = new HttpsProxyAgent(acct.proxyUrl);
      config.httpAgent = agent;
      config.httpsAgent = agent;
    }

    const response = await axios.get("https://api.ipify.org?format=json", config);
    const ip = response.data.ip;
    
    console.log(`[ip] ${acct.handle} -> ${ip}${acct.proxyUrl ? ' (via proxy)' : ' (direct)'}`);
    return ip;
  } catch (error: any) {
    console.warn(`[ip] ${acct.handle} ip-check failed: ${error.message}`);
    return null;
  }
}

export async function checkAllAccounts(accounts: AccountCfg[]): Promise<void> {
  console.log(`[ip] Checking outbound IPs for ${accounts.length} account(s)...`);
  
  for (const acct of accounts) {
    await logOutboundIp(acct);
  }
}


