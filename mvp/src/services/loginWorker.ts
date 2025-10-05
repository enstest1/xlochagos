import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { log } from '../log';
import { AccountConfig } from '../config/accounts';
import { CookieManager } from './cookieManager';
import { createProxyAgent } from '../net/proxyClient';

export interface LoginResult {
  success: boolean;
  cookies?: any[];
  error?: string;
}

export class LoginWorker {
  private cookieManager: CookieManager;
  private lastLoginAttempts: Map<string, number> = new Map();

  constructor() {
    this.cookieManager = new CookieManager();
  }

  /**
   * Login to X/Twitter and export cookies
   */
  async loginAndExportCookies(
    account: AccountConfig, 
    username: string, 
    password: string
  ): Promise<LoginResult> {
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;

    try {
      log.info({ 
        account: account.handle, 
        username,
        hasProxy: !!account.proxy_url 
      }, 'Starting automated login process');

      // Launch browser with proxy if configured
      const launchOptions: any = {
        headless: true,
        executablePath: '/usr/bin/chromium', // Use system Chromium
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      };

      console.log('Launching browser with executablePath:', launchOptions.executablePath);
      browser = await chromium.launch(launchOptions);

      // Create context options first
      const contextOptions: any = {
        userAgent: account.user_agent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        viewport: { width: 1280, height: 720 }
      };

      // Set up proxy if configured
      if (account.proxy_url) {
        const proxyUrl = new URL(account.proxy_url);
        contextOptions.proxy = {
          server: `${proxyUrl.protocol}//${proxyUrl.host}`,
          username: proxyUrl.username,
          password: proxyUrl.password
        };
      }

      // Test proxy connectivity first
      if (account.proxy_url) {
        console.log('Testing proxy connectivity before login...');
        const testContext = await browser.newContext(contextOptions);
        const testPage = await testContext.newPage();
        
        try {
          await testPage.goto('https://api.ipify.org?format=json', { timeout: 10000 });
          const ipResponse = await testPage.textContent('body');
          const ipData = JSON.parse(ipResponse || '{}');
          console.log('Proxy test successful - outbound IP:', ipData.ip);
          await testContext.close();
        } catch (proxyError) {
          console.log('Proxy test failed:', (proxyError as Error).message);
          await testContext.close();
          
          // Try without proxy as fallback
          console.log('Retrying login without proxy...');
          contextOptions.proxy = undefined;
        }
      }

      // Log connection type
      if (contextOptions.proxy) {
        log.info({ 
          account: account.handle, 
          proxyServer: new URL(account.proxy_url!).host 
        }, 'Using proxy for login');
      } else {
        log.info({ account: account.handle }, 'Using direct connection (no proxy)');
      }

      context = await browser.newContext(contextOptions);

      // Create page and navigate to X/Twitter
      const page = await context.newPage();
      
      log.info({ account: account.handle }, 'Navigating to X/Twitter login page');
      await page.goto('https://x.com/login', { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });

      // Wait for login form
      console.log('Waiting for login form...');
      await page.waitForSelector('input[name="text"]', { timeout: 10000 });
      console.log('Login form found, proceeding with username entry');

      // Fill username
      log.info({ account: account.handle }, 'Entering username');
      console.log('Filling username:', username);
      await page.fill('input[name="text"]', username);
      console.log('Clicking Next button');
      await page.click('text=Next');

      // Wait a moment for the page to process
      await page.waitForTimeout(2000);
      
      // Check what page we're on after clicking Next
      const currentUrl = page.url();
      console.log('Current URL after Next:', currentUrl);
      
      // Take a screenshot for debugging
      try {
        await page.screenshot({ path: '/tmp/login-debug.png' });
        console.log('Screenshot saved to /tmp/login-debug.png');
      } catch (screenshotError) {
        console.log('Could not save screenshot:', (screenshotError as Error).message);
      }
      
      // Check for common X/Twitter verification steps
      const hasCaptcha = await page.locator('[data-testid="captcha"]').count() > 0;
      const hasPhoneVerification = await page.locator('text=phone').count() > 0;
      const hasEmailVerification = await page.locator('text=email').count() > 0;
      const hasUnusualActivity = await page.locator('text=unusual activity').count() > 0;
      const hasCloudflare = await page.locator('text=Cloudflare').count() > 0;
      const hasIAmNotARobot = await page.locator('text=I am not a robot').count() > 0;
      const hasVerifyYouAreHuman = await page.locator('text=verify you are human').count() > 0;
      
      console.log('Page analysis:');
      console.log('- Has CAPTCHA:', hasCaptcha);
      console.log('- Has phone verification:', hasPhoneVerification);
      console.log('- Has email verification:', hasEmailVerification);
      console.log('- Has unusual activity message:', hasUnusualActivity);
      console.log('- Has Cloudflare challenge:', hasCloudflare);
      console.log('- Has "I am not a robot":', hasIAmNotARobot);
      console.log('- Has "verify you are human":', hasVerifyYouAreHuman);
      
      // Handle Cloudflare challenge
      if (hasCloudflare || hasIAmNotARobot || hasVerifyYouAreHuman) {
        console.log('Cloudflare challenge detected - waiting for manual intervention...');
        log.warn({ account: account.handle }, 'Cloudflare challenge detected - manual intervention required');
        
        // Wait for user to manually solve challenge (with timeout)
        try {
          console.log('Waiting for Cloudflare challenge to be solved (60 seconds timeout)...');
          await page.waitForSelector('input[name="password"]', { timeout: 60000 });
          console.log('Cloudflare challenge appears to be solved!');
        } catch (cloudflareError) {
          console.log('Cloudflare challenge not solved within timeout');
          throw new Error('Cloudflare challenge detected - manual intervention required. Please solve the challenge and try again.');
        }
      }
      
      // Wait for password field
      console.log('Waiting for password field...');
      try {
        await page.waitForSelector('input[name="password"]', { timeout: 10000 });
        console.log('Password field found');
      } catch (passwordError) {
        console.log('Password field not found. Page content:');
        const pageContent = await page.textContent('body');
        console.log('Page text:', pageContent?.substring(0, 500));
        throw passwordError;
      }

      // Fill password
      log.info({ account: account.handle }, 'Entering password');
      console.log('Filling password field');
      await page.fill('input[name="password"]', password);
      console.log('Clicking Log in button');
      await page.click('text=Log in');

      // Wait for successful login (redirect to home page)
      try {
        await page.waitForURL('https://x.com/home', { timeout: 30000 });
        log.info({ account: account.handle }, 'Login successful - redirected to home page');
      } catch (error) {
        // Check if we're on a different page (might be successful)
        const currentUrl = page.url();
        if (currentUrl.includes('x.com') && !currentUrl.includes('login')) {
          log.info({ 
            account: account.handle, 
            currentUrl 
          }, 'Login successful - on X/Twitter page');
        } else {
          throw new Error(`Login failed - still on login page: ${currentUrl}`);
        }
      }

      // Wait a bit for page to fully load
      await page.waitForTimeout(3000);

      // Extract cookies
      log.info({ account: account.handle }, 'Extracting cookies');
      const cookies = await context.cookies();
      
      console.log('=== COOKIE EXTRACTION DEBUG ===');
      console.log('Total cookies found:', cookies.length);
      console.log('All cookies:', JSON.stringify(cookies, null, 2));
      
      // Filter for X/Twitter cookies
      const relevantCookies = cookies.filter(cookie => 
        cookie.domain.includes('x.com') || 
        cookie.domain.includes('twitter.com')
      );

      console.log('Relevant cookies (x.com/twitter.com):', relevantCookies.length);
      console.log('Relevant cookies details:', JSON.stringify(relevantCookies, null, 2));
      
      // Check for specific auth cookies
      const authTokenCookie = relevantCookies.find(cookie => cookie.name === 'auth_token');
      const ct0Cookie = relevantCookies.find(cookie => cookie.name === 'ct0');
      
      console.log('auth_token cookie found:', !!authTokenCookie);
      console.log('ct0 cookie found:', !!ct0Cookie);
      if (authTokenCookie) console.log('auth_token value length:', authTokenCookie.value?.length);
      if (ct0Cookie) console.log('ct0 value length:', ct0Cookie.value?.length);
      console.log('=== END COOKIE DEBUG ===');

      log.info({ 
        account: account.handle, 
        totalCookies: cookies.length,
        relevantCookies: relevantCookies.length,
        hasAuthToken: !!authTokenCookie,
        hasCt0: !!ct0Cookie
      }, 'Cookies extracted');

      // Save cookies
      console.log('=== COOKIE SAVING DEBUG ===');
      console.log('Attempting to save cookies for account:', account.handle);
      console.log('Cookies to save:', relevantCookies.length);
      
      const saveSuccess = await this.cookieManager.saveCookies(account, relevantCookies);
      
      console.log('Cookie save result:', saveSuccess);
      console.log('=== END SAVE DEBUG ===');
      
      if (!saveSuccess) {
        throw new Error('Failed to save cookies');
      }

      log.info({ account: account.handle }, 'Login and cookie export completed successfully');

      return {
        success: true,
        cookies: relevantCookies
      };

    } catch (error) {
      log.error({ 
        account: account.handle, 
        error: (error as Error).message,
        errorType: (error as Error).constructor.name,
        stack: (error as Error).stack?.split('\n').slice(0, 5).join('\n')
      }, 'Login failed - detailed error');

      console.log('=== LOGIN ERROR DETAILS ===');
      console.log('Account:', account.handle);
      console.log('Error message:', (error as Error).message);
      console.log('Error type:', (error as Error).constructor.name);
      console.log('Stack trace:', (error as Error).stack);
      console.log('=== END ERROR DETAILS ===');

      return {
        success: false,
        error: (error as Error).message
      };

    } finally {
      // Clean up
      if (context) {
        await context.close();
      }
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Verify login by checking if we can access protected pages
   */
  async verifyLogin(account: AccountConfig): Promise<boolean> {
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;

    try {
      // Load existing cookies
      const cookies = this.cookieManager.loadCookies(account);
      if (!cookies || cookies.length === 0) {
        log.warn({ account: account.handle }, 'No cookies found for verification');
        return false;
      }

      browser = await chromium.launch({ 
        headless: true,
        executablePath: '/usr/bin/chromium' // Use system Chromium
      });
      
      const contextOptions: any = {
        userAgent: account.user_agent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };

      if (account.proxy_url) {
        const proxyUrl = new URL(account.proxy_url);
        contextOptions.proxy = {
          server: `${proxyUrl.protocol}//${proxyUrl.host}`,
          username: proxyUrl.username,
          password: proxyUrl.password
        };
      }

      context = await browser.newContext(contextOptions);
      
      // Add cookies to context
      await context.addCookies(cookies);
      
      const page = await context.newPage();
      
      // Try to access home page
      await page.goto('https://x.com/home', { waitUntil: 'networkidle' });
      
      // Check if we're logged in by looking for profile elements
      const isLoggedIn = await page.locator('[data-testid="SideNav_AccountSwitcher_Button"]').count() > 0;
      
      log.info({ 
        account: account.handle, 
        isLoggedIn 
      }, 'Login verification completed');

      return isLoggedIn;

    } catch (error) {
      log.error({ 
        account: account.handle, 
        error: (error as Error).message 
      }, 'Login verification failed');

      return false;

    } finally {
      if (context) await context.close();
      if (browser) await browser.close();
    }
  }

  /**
   * Refresh cookies for an account
   */
  async refreshCookies(account: AccountConfig): Promise<LoginResult> {
    // Check persistent cooldown using environment variable (survives container restarts)
    const cooldownKey = `${account.handle.replace('@', '').toUpperCase()}_LAST_LOGIN`;
    const lastAttemptStr = process.env[cooldownKey];
    const now = Date.now();
    
    // Check for manual override to force login
    const forceLogin = process.env[`${account.handle.replace('@', '').toUpperCase()}_FORCE_LOGIN`];
    
    if (lastAttemptStr && !forceLogin) {
      const lastAttempt = parseInt(lastAttemptStr, 10);
      const timeSinceLastAttempt = now - lastAttempt;
      const cooldownPeriod = 15 * 60 * 1000; // 15 minutes cooldown (increased from 5)
      
      if (timeSinceLastAttempt < cooldownPeriod) {
        const remainingTime = Math.ceil((cooldownPeriod - timeSinceLastAttempt) / 1000);
        log.warn({ 
          account: account.handle, 
          remainingCooldown: remainingTime,
          lastAttempt: new Date(lastAttempt).toISOString()
        }, 'Login attempt too soon - skipping to avoid account flagging');
        
        return {
          success: false,
          error: `Login cooldown active - wait ${remainingTime} seconds (until ${new Date(lastAttempt + cooldownPeriod).toISOString()})`
        };
      }
    } else if (forceLogin) {
      log.info({ account: account.handle }, 'Force login override detected - proceeding despite cooldown');
    }
    
    log.info({ account: account.handle }, 'Starting cookie refresh process - cooldown check passed');

    // Get credentials from environment variables
    const usernameEnvVar = `${account.handle.replace('@', '').toUpperCase()}_USERNAME`;
    const passwordEnvVar = `${account.handle.replace('@', '').toUpperCase()}_PASSWORD`;
    
    // Log all environment variables for debugging
    const allEnvVars = Object.keys(process.env).sort();
    const envVarCount = allEnvVars.length;
    
    console.log('=== ENVIRONMENT VARIABLES DEBUG ===');
    console.log('Account:', account.handle);
    console.log('Total env vars:', envVarCount);
    console.log('All env vars:', allEnvVars.join(', '));
    console.log('Looking for:', usernameEnvVar, passwordEnvVar);
    console.log('Direct access test:');
    console.log('  process.env.APLEP333_USERNAME:', process.env.APLEP333_USERNAME);
    console.log('  process.env.APLEP333_PASSWORD:', process.env.APLEP333_PASSWORD ? '[REDACTED]' : 'UNDEFINED');
    console.log('  process.env.APLEP333_COOKIES:', process.env.APLEP333_COOKIES ? '[REDACTED]' : 'UNDEFINED');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('RAILWAY_ENVIRONMENT:', process.env.RAILWAY_ENVIRONMENT);
    console.log('=== END DEBUG ===');
    
    log.info({ 
      account: account.handle,
      allEnvVars,
      envVarCount,
      nodeEnv: process.env.NODE_ENV,
      railwayEnv: process.env.RAILWAY_ENVIRONMENT
    }, 'All environment variables available');

    let username = process.env[usernameEnvVar];
    let password = process.env[passwordEnvVar];

    // TEMPORARY HARDCODED FALLBACK FOR TESTING
    if (!username || !password) {
      if (account.handle === '@aplep333') {
        console.log('=== USING HARDCODED CREDENTIALS FOR TESTING ===');
        username = 'aplep333';
        password = 'Floatsfloats1!';
        console.log('Using hardcoded credentials for @aplep333');
        log.info({ account: account.handle }, 'Using hardcoded credentials for testing - REPLACE WITH ACTUAL PASSWORD');
      }
    }

    // Debug logging for environment variables
    const aplepEnvVars = allEnvVars.filter(key => key.includes('APLEP333') || key.includes('aplep333'));
    
    // Show the exact values we're looking for
    log.info({ 
      account: account.handle, 
      usernameEnvVar, 
      passwordEnvVar,
      usernameValue: username || 'NOT_FOUND',
      passwordValue: password ? '[REDACTED]' : 'NOT_FOUND',
      hasUsername: !!username,
      hasPassword: !!password,
      aplepEnvVars,
      totalEnvVars: allEnvVars.length,
      allEnvVarsContainingAPLEP: allEnvVars.filter(key => key.includes('APLEP'))
    }, 'Checking credentials environment variables');

    if (!username || !password) {
      // Show all environment variables that contain APLEP333 or USERNAME or PASSWORD
      const relevantEnvVars = Object.keys(process.env).filter(key => 
        key.includes('APLEP333') || key.includes('USERNAME') || key.includes('PASSWORD')
      );
      
      const error = `Missing credentials for ${account.handle}. Set ${usernameEnvVar} and ${passwordEnvVar} environment variables. Found these relevant env vars: ${relevantEnvVars.join(', ')}`;
      log.error({ 
        account: account.handle, 
        usernameEnvVar, 
        passwordEnvVar,
        relevantEnvVars,
        hasUsername: !!username,
        hasPassword: !!password
      }, error);
      
      return {
        success: false,
        error
      };
    }

    // Perform login and export cookies
    const result = await this.loginAndExportCookies(account, username, password);
    
    // Only record the attempt if login was successful
    if (result.success) {
      process.env[cooldownKey] = now.toString();
      console.log(`Successfully recorded login attempt for ${account.handle} at ${new Date(now).toISOString()}`);
    } else {
      console.log(`Login failed for ${account.handle} - not recording attempt`);
    }
    
    return result;
  }

  /**
   * Test proxy connectivity
   */
  async testProxyConnectivity(account: AccountConfig): Promise<boolean> {
    let browser: Browser | null = null;

    try {
      if (!account.proxy_url) {
        log.info({ account: account.handle }, 'No proxy configured, skipping proxy test');
        return true;
      }

      const proxyUrl = new URL(account.proxy_url);
      
      browser = await chromium.launch({ 
        headless: true,
        executablePath: '/usr/bin/chromium' // Use system Chromium
      });
      
      const context = await browser.newContext({
        proxy: {
          server: `${proxyUrl.protocol}//${proxyUrl.host}`,
          username: proxyUrl.username,
          password: proxyUrl.password
        }
      });

      const page = await context.newPage();
      
      // Test by checking our IP
      await page.goto('https://api.ipify.org?format=json');
      const ipResponse = await page.textContent('body');
      const ipData = JSON.parse(ipResponse || '{}');
      
      log.info({ 
        account: account.handle, 
        proxyIp: ipData.ip,
        proxyServer: proxyUrl.host 
      }, 'Proxy connectivity test completed');

      return true;

    } catch (error) {
      log.error({ 
        account: account.handle, 
        error: (error as Error).message 
      }, 'Proxy connectivity test failed');

      return false;

    } finally {
      if (browser) await browser.close();
    }
  }
}
