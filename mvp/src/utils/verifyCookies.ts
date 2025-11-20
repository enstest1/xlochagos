import { chromium, Browser, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Verify cookies are working by attempting to access Twitter/X
 * Returns true if cookies are valid, false otherwise
 */
export async function verifyCookies(cookiePath: string): Promise<{ valid: boolean; message: string }> {
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    // Check if cookie file exists
    const fullPath = path.isAbsolute(cookiePath) 
      ? cookiePath 
      : path.join(process.cwd(), cookiePath);
    
    if (!fs.existsSync(fullPath)) {
      return { valid: false, message: `Cookie file not found: ${fullPath}` };
    }

    // Load cookies
    const cookies = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    if (!Array.isArray(cookies) || cookies.length === 0) {
      return { valid: false, message: 'Cookie file is empty or invalid' };
    }

    console.log(`📋 Found ${cookies.length} cookies in file`);

    // Launch browser
    browser = await chromium.launch({ 
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    page = await browser.newPage();

    // Set realistic headers
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    // Add cookies
    const validCookies = cookies.map((cookie: any) => ({
      ...cookie,
      sameSite: cookie.sameSite === 'no_restriction' ? 'None' : 
               cookie.sameSite === 'lax' ? 'Lax' : 
               cookie.sameSite === 'strict' ? 'Strict' : 'Lax'
    }));
    
    await page.context().addCookies(validCookies);
    console.log('✅ Cookies loaded into browser');

    // Try to access Twitter home page
    console.log('🔍 Testing cookie validity by accessing x.com/home...');
    await page.goto('https://x.com/home', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Wait a moment for page to load
    await page.waitForTimeout(3000);

    // Check for various indicators
    const currentUrl = page.url();
    const hasCloudflare = await page.locator('text=Cloudflare').count() > 0;
    const hasVerifyHuman = await page.locator('text=Verify you are human').count() > 0;
    const hasLogin = await page.locator('text=Sign in').count() > 0;
    const hasTweets = await page.locator('[data-testid="tweet"]').count() > 0;
    const pageTitle = await page.title();

    console.log(`📍 Current URL: ${currentUrl}`);
    console.log(`📄 Page title: ${pageTitle}`);
    console.log(`🔍 Has Cloudflare check: ${hasCloudflare}`);
    console.log(`🔍 Has verify human: ${hasVerifyHuman}`);
    console.log(`🔍 Has login page: ${hasLogin}`);
    console.log(`🔍 Has tweets: ${hasTweets}`);

    // Determine validity
    if (hasCloudflare || hasVerifyHuman) {
      return { 
        valid: false, 
        message: 'Cookies triggered Cloudflare security check - may need refresh' 
      };
    }

    if (hasLogin || currentUrl.includes('/i/flow/login')) {
      return { 
        valid: false, 
        message: 'Cookies appear expired - redirected to login page' 
      };
    }

    if (hasTweets || currentUrl.includes('/home')) {
      return { 
        valid: true, 
        message: 'Cookies are valid - successfully accessed Twitter home feed' 
      };
    }

    return { 
      valid: false, 
      message: `Unknown page state - URL: ${currentUrl}, Title: ${pageTitle}` 
    };

  } catch (error) {
    return { 
      valid: false, 
      message: `Error verifying cookies: ${error instanceof Error ? error.message : String(error)}` 
    };
  } finally {
    // Keep browser open for 5 seconds so user can see result
    if (page) {
      console.log('⏸️  Keeping browser open for 5 seconds so you can see the result...');
      await page.waitForTimeout(5000);
    }
    if (page) await page.close();
    if (browser) await browser.close();
  }
}



