/**
 * Playwright-based login module
 * Performs one-time login and saves cookies for future use
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

type Opts = {
  handle: string;
  username: string;
  password: string;
  cookiePath: string;
  proxyUrl?: string | undefined;
};

export async function loginAndSaveCookies(o: Opts) {
  console.log(`[auth] Starting login for ${o.handle}...`);

  const launchOptions: any = {
    headless: false, // Use visible browser for debugging
  };
  
  if (o.proxyUrl) {
    launchOptions.proxy = { server: o.proxyUrl };
  }

  const browser = await chromium.launch(launchOptions);

  const ctx = await browser.newContext({
    locale: "en-US",
    timezoneId: "America/Toronto",
  });

  const page = await ctx.newPage();

  try {
    // Navigate to X login page
    console.log(`[auth] Navigating to login page...`);
    await page.goto("https://x.com/i/flow/login", { waitUntil: "networkidle", timeout: 60000 });

    console.log(`[auth] ===============================================`);
    console.log(`[auth] 🔐 INTERACTIVE LOGIN MODE`);
    console.log(`[auth] ===============================================`);
    console.log(`[auth] Please complete the login in the browser window:`);
    console.log(`[auth] 1. Enter username: ${o.username}`);
    console.log(`[auth] 2. Enter password: [hidden]`);
    console.log(`[auth] 3. Complete any verification (phone/email/captcha)`);
    console.log(`[auth] 4. Wait until you see the X home feed`);
    console.log(`[auth] `);
    console.log(`[auth] The script will automatically detect when you're logged in...`);
    console.log(`[auth] ===============================================`);

    // Wait for successful login (URL will change to /home)
    await page.waitForURL(/x\.com\/home/i, { timeout: 300000 }); // 5 minutes timeout

    // Save cookies
    const cookies = await ctx.cookies();
    await fs.mkdir(path.dirname(o.cookiePath), { recursive: true });
    await fs.writeFile(o.cookiePath, JSON.stringify(cookies, null, 2), "utf-8");
    console.log(`[auth] ✅ Login successful! Cookies saved to ${o.cookiePath}`);
    console.log(`[auth] Found ${cookies.length} cookies`);

  } catch (error: any) {
    console.error(`[auth] ❌ Login failed: ${error.message}`);
    // Take screenshot for debugging
    await page.screenshot({ path: `persist/logs/login-error-${Date.now()}.png` });
    throw error;
  } finally {
    await ctx.close();
    await browser.close();
  }
}

