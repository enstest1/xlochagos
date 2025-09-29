import Database from 'better-sqlite3';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

export interface DbConfig {
  path: string;
}

export function openDb(dbPath: string): Database.Database {
  // Ensure the directory exists
  const dir = join(dbPath, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = 1000');
  db.pragma('temp_store = memory');

  return db;
}

export function migrate(db: Database.Database): void {
  // Core tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts(
      id INTEGER PRIMARY KEY,
      account TEXT NOT NULL,
      text TEXT NOT NULL,
      url TEXT, -- post URL returned by publisher
      source_url TEXT NOT NULL,
      created_at INTEGER NOT NULL, -- epoch ms
      status TEXT NOT NULL, -- "dry", "posted", "error", "retry"
      retry_count INTEGER DEFAULT 0,
      error_reason TEXT,
      response_time_ms INTEGER,
      method_used TEXT -- "cookie" or "api"
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sources(
      hash TEXT PRIMARY KEY, -- stable hash of url
      url TEXT NOT NULL,
      title TEXT,
      score REAL NOT NULL,
      seen_at INTEGER NOT NULL,
      used INTEGER DEFAULT 0,
      last_used_at INTEGER,
      usage_count INTEGER DEFAULT 0
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS caps(
      date TEXT NOT NULL, -- YYYY-MM-DD
      account TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(date, account)
    );
  `);

  // Enhanced monitoring tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS health_checks(
      id INTEGER PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      check_type TEXT NOT NULL, -- "cookie", "system", "rate_limit"
      account TEXT,
      status TEXT NOT NULL, -- "pass", "fail", "warn"
      details TEXT, -- JSON with specifics
      response_time_ms INTEGER
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS metrics(
      id INTEGER PRIMARY KEY,
      date TEXT NOT NULL, -- YYYY-MM-DD
      account TEXT NOT NULL,
      posts_attempted INTEGER DEFAULT 0,
      posts_successful INTEGER DEFAULT 0,
      posts_failed INTEGER DEFAULT 0,
      avg_response_time_ms REAL,
      cookie_failures INTEGER DEFAULT 0,
      api_fallbacks INTEGER DEFAULT 0,
      rate_limit_hits INTEGER DEFAULT 0
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS content_patterns(
      id INTEGER PRIMARY KEY,
      text_hash TEXT NOT NULL,
      week_year TEXT NOT NULL, -- "2024-W52"
      account TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      similarity_score REAL
    );
  `);

  // Enhanced indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_posts_account_date ON posts(account, created_at);
    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
    CREATE INDEX IF NOT EXISTS idx_posts_source_url ON posts(source_url);
    CREATE INDEX IF NOT EXISTS idx_health_checks_timestamp ON health_checks(timestamp);
    CREATE INDEX IF NOT EXISTS idx_health_checks_account ON health_checks(account, timestamp);
    CREATE INDEX IF NOT EXISTS idx_metrics_date ON metrics(date);
    CREATE INDEX IF NOT EXISTS idx_metrics_account_date ON metrics(account, date);
    CREATE INDEX IF NOT EXISTS idx_content_patterns_hash ON content_patterns(text_hash);
    CREATE INDEX IF NOT EXISTS idx_content_patterns_week ON content_patterns(week_year);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_used_source ON sources(url) WHERE used=1;
    CREATE INDEX IF NOT EXISTS idx_sources_score ON sources(score);
    CREATE INDEX IF NOT EXISTS idx_caps_date ON caps(date);
  `);
}

// Database helper functions
export const dbHelpers: Record<string, any> = {
  // Posts
  insertPost: (db: Database.Database) => db.prepare(`
    INSERT INTO posts (account, text, url, source_url, created_at, status, retry_count, error_reason, response_time_ms, method_used)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),

  updatePostStatus: (db: Database.Database) => db.prepare(`
    UPDATE posts SET status = ?, error_reason = ?, url = ?, response_time_ms = ?, method_used = ?
    WHERE id = ?
  `),

  getPostsByAccount: (db: Database.Database) => db.prepare(`
    SELECT * FROM posts WHERE account = ? ORDER BY created_at DESC LIMIT ?
  `),

  // Sources
  insertSource: (db: Database.Database) => db.prepare(`
    INSERT OR REPLACE INTO sources (hash, url, title, score, seen_at, used, last_used_at, usage_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),

  markSourceUsed: (db: Database.Database) => db.prepare(`
    UPDATE sources SET used = 1, last_used_at = ?, usage_count = usage_count + 1
    WHERE url = ?
  `),

  getUnusedSources: (db: Database.Database) => db.prepare(`
    SELECT * FROM sources WHERE used = 0 AND score >= ? ORDER BY score DESC LIMIT ?
  `),

  // Caps
  incrementCap: (db: Database.Database) => db.prepare(`
    INSERT INTO caps (date, account, count) VALUES (?, ?, 1)
    ON CONFLICT(date, account) DO UPDATE SET count = count + 1
  `),

  getCap: (db: Database.Database) => db.prepare(`
    SELECT COALESCE(count, 0) as count FROM caps WHERE date = ? AND account = ?
  `),

  // Health checks
  insertHealthCheck: (db: Database.Database) => db.prepare(`
    INSERT INTO health_checks (timestamp, check_type, account, status, details, response_time_ms)
    VALUES (?, ?, ?, ?, ?, ?)
  `),

  getRecentHealthChecks: (db: Database.Database) => db.prepare(`
    SELECT * FROM health_checks WHERE account = ? AND timestamp > ? ORDER BY timestamp DESC LIMIT ?
  `),

  // Metrics
  insertMetrics: (db: Database.Database) => db.prepare(`
    INSERT OR REPLACE INTO metrics (date, account, posts_attempted, posts_successful, posts_failed, avg_response_time_ms, cookie_failures, api_fallbacks, rate_limit_hits)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),

  getMetricsByDateRange: (db: Database.Database) => db.prepare(`
    SELECT * FROM metrics WHERE date BETWEEN ? AND ? ORDER BY date DESC
  `),

  // Content patterns
  insertContentPattern: (db: Database.Database) => db.prepare(`
    INSERT INTO content_patterns (text_hash, week_year, account, created_at, similarity_score)
    VALUES (?, ?, ?, ?, ?)
  `),

  getRecentPatterns: (db: Database.Database) => db.prepare(`
    SELECT * FROM content_patterns WHERE week_year = ? ORDER BY created_at DESC
  `),

  // Cleanup old data
  cleanupOldData: (db: Database.Database, retentionDays: number) => {
    const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

    db.prepare('DELETE FROM health_checks WHERE timestamp < ?').run(cutoff);
    db.prepare('DELETE FROM content_patterns WHERE created_at < ?').run(cutoff);

    // Keep metrics but summarize old data
    const oldDate = new Date(Date.now() - (retentionDays * 24 * 60 * 60 * 1000))
      .toISOString().split('T')[0];
    db.prepare('DELETE FROM metrics WHERE date < ?').run(oldDate);
  }
};

export function getWeekYear(date: Date = new Date()): string {
  const year = date.getFullYear();
  const start = new Date(year, 0, 1);
  const days = Math.floor((date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + start.getDay() + 1) / 7);
  return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
}