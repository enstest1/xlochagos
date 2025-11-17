/**
 * Playwright-based publishing module
 * Posts, replies, and likes using real browser with cookies
 * Supports posting tweets with images
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import type { AccountCfg } from "../config/accountsNew";

async function loadCookies(ctx: BrowserContext, cookiePath: string) {
  const txt = await fs.readFile(cookiePath, "utf-8");
  const cookies = JSON.parse(txt);
  
  // Normalize cookies for Playwright
  const normalizedCookies = cookies.map((cookie: any) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.expirationDate ? cookie.expirationDate : undefined,
    httpOnly: cookie.httpOnly || false,
    secure: cookie.secure || false,
    sameSite: cookie.sameSite === "no_restriction" ? "None" : 
              cookie.sameSite === "lax" ? "Lax" :
              cookie.sameSite === "strict" ? "Strict" : "Lax"
  }));
  
  await ctx.addCookies(normalizedCookies);
  console.log(`[publish] Loaded ${normalizedCookies.length} cookies from ${cookiePath}`);
}

export async function postTweet(acct: AccountCfg, text: string, dryRun = false) {
  console.log(`[publish] ${dryRun ? '[DRY RUN] ' : ''}Posting tweet for ${acct.handle}...`);
  console.log(`[publish] Content: ${text.substring(0, 100)}...`);

  if (dryRun) {
    console.log(`[publish] ✅ Dry run complete - no actual post made`);
    return;
  }

  const launchOptions: any = { headless: false };
  if (acct.proxyUrl) {
    launchOptions.proxy = { server: acct.proxyUrl };
  }
  const browser = await chromium.launch(launchOptions);

  const ctx = await browser.newContext({
    locale: "en-US",
    timezoneId: "America/Toronto",
  });

  try {
    await loadCookies(ctx, acct.cookiePath);
    const page = await ctx.newPage();

    // Navigate to compose page
    await page.goto("https://x.com/compose/tweet", { waitUntil: "networkidle", timeout: 30000 });

    // Fill tweet text and activate the textarea
    await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });
    
    // Click in the textarea first to activate it
    await page.click('[data-testid="tweetTextarea_0"]');
    await page.waitForTimeout(1000);
    
    // Type the text (instead of fill to trigger events)
    await page.fill('[data-testid="tweetTextarea_0"]', '');
    await page.type('[data-testid="tweetTextarea_0"]', text);
    await page.waitForTimeout(2000);

    console.log(`[publish] Looking for Post button...`);
    
    // Try to find and click the Post button (even if disabled)
    try {
      // Wait for any Post button to appear
      await page.waitForSelector('[data-testid="tweetButtonInline"]', { timeout: 5000 });
      
      // Try to click it - Playwright will handle if it's disabled
      await page.click('[data-testid="tweetButtonInline"]', { force: true });
      console.log(`[publish] Clicked Post button`);
      
    } catch (error) {
      console.log(`[publish] Post button not found or clickable, trying alternative...`);
      
      // Alternative: look for any button with "Post" text
      const postButton = await page.locator('button:has-text("Post")').first();
      if (await postButton.isVisible()) {
        await postButton.click({ force: true });
        console.log(`[publish] Clicked alternative Post button`);
      } else {
        throw new Error("Could not find Post button");
      }
    }
    
    await page.waitForTimeout(3000);

    console.log(`[publish] ✅ Tweet posted successfully!`);
  } catch (error: any) {
    console.error(`[publish] ❌ Failed to post tweet: ${error.message}`);
    throw error;
  } finally {
    await ctx.close();
    await browser.close();
  }
}

export async function replyTo(acct: AccountCfg, tweetUrl: string, text: string, dryRun = false): Promise<string | null> {
  console.log(`[publish] ${dryRun ? '[DRY RUN] ' : ''}Replying to ${tweetUrl} as ${acct.handle}...`);
  console.log(`[publish] Reply: ${text.substring(0, 100)}...`);

  if (dryRun) {
    console.log(`[publish] ✅ Dry run complete - no actual reply made`);
    return null;
  }

  const launchOptions: any = { headless: false };
  if (acct.proxyUrl) {
    launchOptions.proxy = { server: acct.proxyUrl };
  }
  const browser = await chromium.launch(launchOptions);

  const ctx = await browser.newContext({
    locale: "en-US",
    timezoneId: "America/Toronto",
  });

  try {
    await loadCookies(ctx, acct.cookiePath);
    const page = await ctx.newPage();

    // Navigate to tweet (works for both root and nested comments)
    await page.goto(tweetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });

    // Click reply button (reuse existing pattern, but ensure we click the right one)
    // For nested comments, the first reply button should be for the specific tweet
    const replyButton = page.locator('[data-testid="reply"]').first();
    await replyButton.click();

    // Wait for reply modal
    await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Type reply (enhanced from existing - use more reliable method)
    const textarea = page.locator('[aria-label="Post text"]').first();
    await textarea.click({ force: true });
    await textarea.press('Control+a');
    await textarea.press('Delete');
    await textarea.type(text, { delay: 20 });
    
    // Trigger events (enhanced)
    await textarea.dispatchEvent('input');
    await textarea.dispatchEvent('change');
    await textarea.dispatchEvent('keyup');
    await page.waitForTimeout(2000);

    // Submit (enhanced - use keyboard shortcut for reliability)
    await textarea.press('Control+Enter', { delay: 20 });
    await page.waitForTimeout(3000);

    // Extract reply URL from DOM (NEW - return value)
    try {
      await page.waitForSelector('[data-testid="tweet"]', { timeout: 5000 });
      
      // Find the newly posted reply tweet (first tweet element)
      const replyTweet = page.locator('[data-testid="tweet"]').first();
      const timeElement = replyTweet.locator('time').first();
      const timeParent = await timeElement.locator('..').first();
      const href = await timeParent.getAttribute('href');
      
      if (href) {
        // Extract tweet ID from href (e.g., "/pelpa333/status/1234567890")
        const tweetId = href.split('/status/')[1]?.split('?')[0];
        if (tweetId) {
          // Build full URL
          const username = href.split('/')[1];
          const replyUrl = `https://x.com/${username}/status/${tweetId}`;
          console.log(`[publish] ✅ Reply posted successfully! URL: ${replyUrl}`);
          return replyUrl;
        }
      }
    } catch (error) {
      console.warn('[publish] ⚠️ Could not extract reply tweet ID from DOM, falling back to page URL');
    }

    // Fallback to page URL
    const replyUrl = page.url();
    console.log(`[publish] ✅ Reply posted successfully! URL: ${replyUrl}`);
    return replyUrl;

  } catch (error: any) {
    console.error(`[publish] ❌ Failed to post reply: ${error.message}`);
    return null;
  } finally {
    await ctx.close();
    await browser.close();
  }
}

export async function like(acct: AccountCfg, tweetUrl: string, dryRun = false) {
  console.log(`[publish] ${dryRun ? '[DRY RUN] ' : ''}Liking ${tweetUrl} as ${acct.handle}...`);

  if (dryRun) {
    console.log(`[publish] ✅ Dry run complete - no actual like made`);
    return;
  }

  const launchOptions: any = { headless: false };
  if (acct.proxyUrl) {
    launchOptions.proxy = { server: acct.proxyUrl };
  }
  const browser = await chromium.launch(launchOptions);

  const ctx = await browser.newContext({
    locale: "en-US",
    timezoneId: "America/Toronto",
  });

  try {
    await loadCookies(ctx, acct.cookiePath);
    const page = await ctx.newPage();

    // Navigate to tweet
    await page.goto(tweetUrl, { waitUntil: "networkidle", timeout: 30000 });

    // Click Like button (try multiple selectors)
    try {
      await page.waitForSelector('[data-testid="like"]', { timeout: 5000 });
      await page.click('[data-testid="like"]');
    } catch {
      // Alternative selector for like button
      await page.click('[aria-label*="Like"]', { force: true });
    }
    await page.waitForTimeout(2000);

    console.log(`[publish] ✅ Tweet liked successfully!`);
  } catch (error: any) {
    console.error(`[publish] ❌ Failed to like tweet: ${error.message}`);
    throw error;
  } finally {
    await ctx.close();
    await browser.close();
  }
}

/**
 * Post a tweet with an image
 */
export async function postTweetWithImage(
  acct: AccountCfg,
  text: string,
  imagePath: string,
  dryRun = false
) {
  console.log(`[publish] ${dryRun ? '[DRY RUN] ' : ''}Posting tweet with image for ${acct.handle}...`);
  console.log(`[publish] Content: ${text.substring(0, 100)}...`);
  console.log(`[publish] Image: ${imagePath}`);

  if (dryRun) {
    console.log(`[publish] ✅ Dry run complete - no actual post made`);
    return;
  }

  // Verify image exists
  if (!fsSync.existsSync(imagePath)) {
    throw new Error(`Image not found: ${imagePath}`);
  }

  const launchOptions: any = { headless: false };
  if (acct.proxyUrl) {
    launchOptions.proxy = { server: acct.proxyUrl };
  }
  const browser = await chromium.launch(launchOptions);

  const ctx = await browser.newContext({
    locale: "en-US",
    timezoneId: "America/Toronto",
  });

  try {
    await loadCookies(ctx, acct.cookiePath);
    const page = await ctx.newPage();

    // Navigate to compose page
    await page.goto("https://x.com/compose/tweet", {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    // Wait for compose interface
    await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });

    // Upload image FIRST (before typing text)
    console.log(`[publish] Uploading image...`);
    const fileInput = await page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(imagePath);
    await page.waitForTimeout(3000); // Wait for image upload

    // Now fill tweet text
    console.log(`[publish] Typing tweet text...`);
    await page.click('[data-testid="tweetTextarea_0"]');
    await page.waitForTimeout(1000);
    await page.fill('[data-testid="tweetTextarea_0"]', '');
    await page.type('[data-testid="tweetTextarea_0"]', text);
    await page.waitForTimeout(2000);

    console.log(`[publish] Looking for Post button...`);

    // Click Post button
    try {
      await page.waitForSelector('[data-testid="tweetButtonInline"]', { timeout: 5000 });
      await page.click('[data-testid="tweetButtonInline"]', { force: true });
      console.log(`[publish] Clicked Post button`);
    } catch (error) {
      console.log(`[publish] Post button not found, trying alternative...`);
      const postButton = await page.locator('button:has-text("Post")').first();
      if (await postButton.isVisible()) {
        await postButton.click({ force: true });
        console.log(`[publish] Clicked alternative Post button`);
      } else {
        throw new Error("Could not find Post button");
      }
    }

    await page.waitForTimeout(3000);

    console.log(`[publish] ✅ Tweet with image posted successfully!`);
  } catch (error: any) {
    console.error(`[publish] ❌ Failed to post tweet with image: ${error.message}`);
    throw error;
  } finally {
    await ctx.close();
    await browser.close();
  }
}

/**
 * Helper to convert alt handle + cookie path to AccountCfg format
 * For use with existing replyTo() function
 */
export function createAccountCfg(handle: string, cookiePath: string, proxyUrl?: string): AccountCfg {
  return {
    handle,
    cookiePath,
    proxyUrl,
    // Other fields can be optional/defaults
    username: undefined,
    password: undefined,
  };
}

/**
 * Wrapper for alt accounts to use replyTo()
 * Converts alt handle/cookiePath to AccountCfg format
 */
export async function replyFromAlt(
  altHandle: string,
  cookiePath: string,
  parentTweetUrl: string,
  replyText: string
): Promise<string | null> {
  const accountCfg = createAccountCfg(altHandle, cookiePath);
  return replyTo(accountCfg, parentTweetUrl, replyText, false);
}

