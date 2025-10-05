import { log } from '../log';
import fs from 'fs';
import path from 'path';
import { XApiService } from './xApiService';
import { AccountConfig } from '../config/accounts';

export interface CookieHealthStatus {
  isValid: boolean;
  isExpired: boolean;
  needsRefresh: boolean;
  lastChecked: number;
  error?: string;
}

export class CookieManager {
  private cookieDir: string;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly HEALTH_CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

  constructor() {
    this.cookieDir = path.join(process.cwd(), 'secrets');
    this.ensureCookieDir();
  }

  private ensureCookieDir(): void {
    try {
      if (!fs.existsSync(this.cookieDir)) {
        fs.mkdirSync(this.cookieDir, { recursive: true });
        log.info({ cookieDir: this.cookieDir }, 'Created cookie directory');
      }
    } catch (error) {
      log.error({ 
        cookieDir: this.cookieDir, 
        error: (error as Error).message 
      }, 'Failed to create cookie directory');
    }
  }

  /**
   * Check if cookies are valid and not expired
   */
  async checkCookieHealth(account: AccountConfig): Promise<CookieHealthStatus> {
    const cookiePath = this.getCookiePath(account);
    
    try {
      // Check if cookie file exists
      if (!fs.existsSync(cookiePath)) {
        return {
          isValid: false,
          isExpired: false,
          needsRefresh: true,
          lastChecked: Date.now(),
          error: 'Cookie file does not exist'
        };
      }

      // Load and parse cookies
      const cookieData = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
      
      // Check for required cookies
      const authTokenCookie = cookieData.find((cookie: any) => cookie.name === 'auth_token');
      const ct0Cookie = cookieData.find((cookie: any) => cookie.name === 'ct0');

      if (!authTokenCookie || !ct0Cookie) {
        return {
          isValid: false,
          isExpired: false,
          needsRefresh: true,
          lastChecked: Date.now(),
          error: 'Missing required cookies (auth_token or ct0)'
        };
      }

      // Check if cookies are expired
      const now = Math.floor(Date.now() / 1000);
      const authExpired = authTokenCookie.expires && authTokenCookie.expires < now;
      const ct0Expired = ct0Cookie.expires && ct0Cookie.expires < now;

      if (authExpired || ct0Expired) {
        return {
          isValid: false,
          isExpired: true,
          needsRefresh: true,
          lastChecked: Date.now(),
          error: 'Cookies have expired'
        };
      }

      // Test cookies with actual X API call
      const testResult = await this.testCookieAuthentication(account, cookieData);
      
      if (!testResult.success) {
        return {
          isValid: false,
          isExpired: false,
          needsRefresh: true,
          lastChecked: Date.now(),
          error: testResult.error || 'Authentication test failed'
        };
      }

      return {
        isValid: true,
        isExpired: false,
        needsRefresh: false,
        lastChecked: Date.now()
      };

    } catch (error) {
      log.error({ 
        account: account.handle, 
        cookiePath, 
        error: (error as Error).message 
      }, 'Failed to check cookie health');

      return {
        isValid: false,
        isExpired: false,
        needsRefresh: true,
        lastChecked: Date.now(),
        error: (error as Error).message
      };
    }
  }

  /**
   * Test cookies by making a real X API call
   */
  private async testCookieAuthentication(account: AccountConfig, cookieData: any[]): Promise<{ success: boolean; error?: string }> {
    try {
      const xApiService = new XApiService();
      const username = account.handle.replace('@', '');
      
      // Create a temporary scraper with these cookies
      const { Scraper } = await import('goat-x');
      const scraper = new Scraper();
      
      // Set authentication data manually
      const authTokenCookie = cookieData.find((cookie: any) => cookie.name === 'auth_token');
      const ct0Cookie = cookieData.find((cookie: any) => cookie.name === 'ct0');
      
      if (authTokenCookie && ct0Cookie) {
        (scraper as any).auth = {
          token: authTokenCookie.value,
          ct0: ct0Cookie.value,
          cookies: cookieData
        };
      }

      // Test with a simple API call
      await scraper.getUserTweets(username, 1);
      
      log.info({ account: account.handle }, 'Cookie authentication test successful');
      return { success: true };

    } catch (error) {
      log.warn({ 
        account: account.handle, 
        error: (error as Error).message 
      }, 'Cookie authentication test failed');
      
      return { 
        success: false, 
        error: (error as Error).message 
      };
    }
  }

  /**
   * Save cookies to file
   */
  async saveCookies(account: AccountConfig, cookieData: any[]): Promise<boolean> {
    try {
      const cookiePath = this.getCookiePath(account);
      
      // Ensure cookie data is valid
      const authTokenCookie = cookieData.find((cookie: any) => cookie.name === 'auth_token');
      const ct0Cookie = cookieData.find((cookie: any) => cookie.name === 'ct0');

      if (!authTokenCookie || !ct0Cookie) {
        log.error({ account: account.handle }, 'Invalid cookie data - missing auth_token or ct0');
        return false;
      }

      // Save to file
      fs.writeFileSync(cookiePath, JSON.stringify(cookieData, null, 2));
      
      // Also update environment variable for Railway
      const envVarName = `${account.handle.replace('@', '').toUpperCase()}_COOKIES`;
      process.env[envVarName] = JSON.stringify(cookieData);
      
      console.log('=== ENVIRONMENT VARIABLE UPDATE ===');
      console.log('Updated environment variable:', envVarName);
      console.log('Cookie count in env var:', cookieData.length);
      console.log('=== END ENV VAR UPDATE ===');
      
      log.info({ 
        account: account.handle, 
        cookiePath,
        cookieCount: cookieData.length,
        envVarUpdated: envVarName
      }, 'Cookies saved successfully to file and environment variable');

      return true;

    } catch (error) {
      log.error({ 
        account: account.handle, 
        error: (error as Error).message 
      }, 'Failed to save cookies');

      return false;
    }
  }

  /**
   * Load cookies from file
   */
  loadCookies(account: AccountConfig): any[] | null {
    try {
      const cookiePath = this.getCookiePath(account);
      
      if (!fs.existsSync(cookiePath)) {
        log.warn({ account: account.handle, cookiePath }, 'Cookie file does not exist');
        return null;
      }

      const cookieData = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
      
      log.info({ 
        account: account.handle, 
        cookieCount: cookieData.length 
      }, 'Cookies loaded from file');

      return cookieData;

    } catch (error) {
      log.error({ 
        account: account.handle, 
        error: (error as Error).message 
      }, 'Failed to load cookies from file');

      return null;
    }
  }

  /**
   * Start periodic cookie health checks
   */
  startHealthChecks(accounts: AccountConfig[]): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    log.info({ 
      intervalHours: this.HEALTH_CHECK_INTERVAL / (60 * 60 * 1000),
      accountCount: accounts.length 
    }, 'Starting cookie health checks');

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks(accounts);
    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Stop health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      log.info('Stopped cookie health checks');
    }
  }

  /**
   * Perform health checks on all accounts
   */
  private async performHealthChecks(accounts: AccountConfig[]): Promise<void> {
    log.info({ accountCount: accounts.length }, 'Performing cookie health checks');

    for (const account of accounts) {
      try {
        const healthStatus = await this.checkCookieHealth(account);
        
        if (healthStatus.needsRefresh) {
          log.warn({ 
            account: account.handle, 
            reason: healthStatus.error 
          }, 'Cookie refresh needed - triggering login worker');
          
          // Trigger cookie refresh (this will be implemented with the login worker)
          await this.triggerCookieRefresh(account);
        } else {
          log.info({ account: account.handle }, 'Cookie health check passed');
        }

      } catch (error) {
        log.error({ 
          account: account.handle, 
          error: (error as Error).message 
        }, 'Health check failed for account');
      }
    }
  }

  /**
   * Trigger cookie refresh for an account
   */
  private async triggerCookieRefresh(account: AccountConfig): Promise<void> {
    // This will be implemented with the login worker
    log.info({ account: account.handle }, 'Cookie refresh triggered (login worker not yet implemented)');
  }

  /**
   * Get cookie file path for an account
   */
  private getCookiePath(account: AccountConfig): string {
    const filename = `${account.handle.replace('@', '')}.cookies.json`;
    return path.join(this.cookieDir, filename);
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.stopHealthChecks();
  }
}
