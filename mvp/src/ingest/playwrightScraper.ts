/**
 * Playwright-based Twitter scraper
 * Uses Playwright to navigate and scrape @pelpa333's timeline
 * More reliable than API calls since it mimics a real browser
 */

import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import type { AccountCfg } from "../config/accountsNew";

export type Tweet = {
  id: string;
  url: string;
  text: string;
  date: string;
  author: string;
  likes: number;
  retweets: number;
  replies: number;
};

async function loadCookies(ctx: any, cookiePath: string) {
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
    sameSite:
      cookie.sameSite === "no_restriction"
        ? "None"
        : cookie.sameSite === "lax"
        ? "Lax"
        : cookie.sameSite === "strict"
        ? "Strict"
        : "Lax",
  }));

  await ctx.addCookies(normalizedCookies);
  console.log(
    `[playwright-scraper] Loaded ${normalizedCookies.length} cookies`
  );
}

export async function fetchUserTimeline(
  targetUsername: string,
  account: AccountCfg,
  limit = 20
): Promise<Tweet[]> {
  console.log(
    `[playwright-scraper] Fetching @${targetUsername} timeline using ${account.handle} cookies...`
  );

  const launchOptions: any = { headless: true };
  if (account.proxyUrl) {
    launchOptions.proxy = { server: account.proxyUrl };
  }

  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({
    locale: "en-US",
    timezoneId: "America/Toronto",
  });

  const tweets: Tweet[] = [];

  try {
    await loadCookies(ctx, account.cookiePath);
    const page = await ctx.newPage();

    // Navigate to user's profile
    const profileUrl = `https://x.com/${targetUsername.replace("@", "")}`;
    console.log(`[playwright-scraper] Navigating to ${profileUrl}...`);
    await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 60000 });  // More patient for rate-limited pages

    // Click on Replies tab to get replies
    console.log(`[playwright-scraper] Clicking on Replies tab...`);
    try {
      await page.click('a[href*="/with_replies"]', { timeout: 5000 });
      await page.waitForTimeout(3000);
    } catch (err) {
      console.log(`[playwright-scraper] Could not find Replies tab, using main timeline`);
    }

    // Scroll to load more tweets (especially for recent replies)
    for (let i = 0; i < 10; i++) {
      await page.evaluate("window.scrollBy(0, 1000)");
      await page.waitForTimeout(2000);
    }

    // Extract tweets from the page - try multiple selectors
    const tweetSelectors = [
      'article[data-testid="tweet"]',
      '[data-testid="tweet"]',
      'article',
      '[role="article"]'
    ];
    
    let tweetElements: any[] = [];
    for (const selector of tweetSelectors) {
      const elements = await page.locator(selector).all();
      if (elements.length > tweetElements.length) {
        tweetElements = elements;
        console.log(`[playwright-scraper] Using selector "${selector}" - found ${elements.length} elements`);
      }
    }
    
    console.log(`[playwright-scraper] Final count: ${tweetElements.length} tweet elements`);

    for (const tweetEl of tweetElements.slice(0, limit)) {
      try {
        // Extract tweet text - try multiple selectors
        const textSelectors = [
          '[data-testid="tweetText"]',
          '[data-testid="tweet"] span',
          'span',
          'div[dir="auto"]'
        ];
        
        let text = "";
        for (const selector of textSelectors) {
          const textEl = await tweetEl.locator(selector).first();
          text = await textEl.textContent().catch(() => "");
          if (text && text.trim()) break;
        }

        // Extract tweet URL/ID from time element
        const timeEl = await tweetEl.locator("time").first();
        const timeParent = await timeEl.locator("..").first();
        const href = await timeParent.getAttribute("href").catch(() => "");
        
        if (!href) continue;

        const tweetId = href.split("/status/")[1]?.split("?")[0] || "";
        if (!tweetId) continue;

        // Extract timestamp
        const datetime = await timeEl.getAttribute("datetime").catch(() => "");

        // Extract engagement metrics
        const likesEl = await tweetEl
          .locator('[data-testid="like"]')
          .first()
          .locator("..")
          .first();
        const likesText =
          (await likesEl.getAttribute("aria-label").catch(() => "")) || "";
        const likes = parseInt(likesText.match(/\\d+/)?.[0] || "0");

        const retweetsEl = await tweetEl
          .locator('[data-testid="retweet"]')
          .first()
          .locator("..")
          .first();
        const retweetsText =
          (await retweetsEl.getAttribute("aria-label").catch(() => "")) || "";
        const retweets = parseInt(retweetsText.match(/\\d+/)?.[0] || "0");

        const repliesEl = await tweetEl
          .locator('[data-testid="reply"]')
          .first()
          .locator("..")
          .first();
        const repliesText =
          (await repliesEl.getAttribute("aria-label").catch(() => "")) || "";
        const replies = parseInt(repliesText.match(/\\d+/)?.[0] || "0");

        tweets.push({
          id: tweetId,
          url: `https://x.com${href}`,
          text: text || "",
          date: datetime || new Date().toISOString(),
          author: targetUsername.replace("@", ""),
          likes,
          retweets,
          replies,
        });
        
        console.log(`[playwright-scraper] Tweet ${tweetId}: "${text}"`);
      } catch (err) {
        console.log(`[playwright-scraper] Error parsing tweet: ${err}`);
        continue;
      }
    }

    console.log(`[playwright-scraper] ✅ Scraped ${tweets.length} tweets`);
  } catch (error: any) {
    console.error(
      `[playwright-scraper] ❌ Failed to scrape timeline: ${error.message}`
    );
    throw error;
  } finally {
    await ctx.close();
    await browser.close();
  }

  return tweets;
}

