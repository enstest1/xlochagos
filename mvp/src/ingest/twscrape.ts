/**
 * TypeScript wrapper for twscrape Python reader
 * Provides convenient API for reading Twitter timelines and searching
 */

import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";

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

export async function twTimeline(
  handle: string,
  limit = 50,
  out = "./persist/timeline.json"
): Promise<Tweet[]> {
  console.log(`[twscrape] Fetching timeline for @${handle}...`);
  await runPy(["timeline", handle, String(limit), out]);
  const data = await fs.readFile(out, "utf-8");
  return JSON.parse(data);
}

export async function twSearch(
  query: string,
  limit = 50,
  out = "./persist/search.json"
): Promise<Tweet[]> {
  console.log(`[twscrape] Searching for: ${query}...`);
  await runPy(["search", query, String(limit), out]);
  const data = await fs.readFile(out, "utf-8");
  return JSON.parse(data);
}

function runPy(args: string[]): Promise<void> {
  const file = path.resolve("py/reader.py");
  const pythonPath = path.resolve(".venv/Scripts/python.exe");
  
  return new Promise((resolve, reject) => {
    const p = spawn(pythonPath, [file, ...args], {
      stdio: "inherit",
      env: {
        ...process.env,
        TWSCRAPE_DB: process.env.TWSCRAPE_DB || "./persist/twscrape.db",
      },
    });

    p.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`twscrape exited with code ${code}`));
      }
    });

    p.on("error", (err) => {
      reject(new Error(`Failed to spawn twscrape: ${err.message}`));
    });
  });
}

