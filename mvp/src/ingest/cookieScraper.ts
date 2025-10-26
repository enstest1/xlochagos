/**
 * Cookie-based Twitter scraper
 * Uses existing authenticated cookies to fetch real @pelpa333 posts
 */

import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
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

export async function fetchUserTimeline(
  targetUsername: string,
  account: AccountCfg,
  limit = 20,
  out = "./persist/timeline.json"
): Promise<Tweet[]> {
  console.log(`[cookie-scraper] Fetching @${targetUsername} timeline using ${account.handle} cookies...`);
  
  const pythonPath = path.resolve(".venv/Scripts/python.exe");
  const scriptPath = path.resolve("py/scrape_with_cookies.py");
  const cookiesPath = path.resolve(account.cookiePath);
  
  await runPy(pythonPath, [
    scriptPath,
    targetUsername,
    cookiesPath,
    out,
    String(limit)
  ]);
  
  const data = await fs.readFile(out, "utf-8");
  const tweets = JSON.parse(data);
  console.log(`[cookie-scraper] ✅ Fetched ${tweets.length} tweets`);
  return tweets;
}

function runPy(pythonPath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(pythonPath, args, {
      stdio: "inherit",
    });

    p.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Cookie scraper exited with code ${code}`));
      }
    });

    p.on("error", (err) => {
      reject(new Error(`Failed to spawn cookie scraper: ${err.message}`));
    });
  });
}


