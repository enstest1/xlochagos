-- Sideways & Inbound Reply System Schema
-- Run this after monitoring-schema.sql
-- Creates tables for sideways replies (alts replying to comments) and inbound replies (alts responding to @mentions)

-- Table 1: sideways_opportunities (Monitor Flags)
-- Purpose: Opportunities flagged by monitor for sideways replies
CREATE TABLE IF NOT EXISTS sideways_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  root_tweet_id text NOT NULL,           -- Pelpa tweet ID
  root_tweet_text text,                  -- Root tweet text (stored for context)
  parent_tweet_id text NOT NULL,         -- Comment we might reply to
  parent_tweet_url text NOT NULL,        -- Full URL of the parent tweet (for replying)
  comment_text text NOT NULL,            -- Text of the comment
  commenter_handle text NOT NULL,        -- Who made the comment
  score integer NOT NULL,                 -- Quality score (from monitor)
  recommended_alt_handle text NOT NULL,  -- Which alt should reply (from monitor)
  detected_at timestamptz DEFAULT now(),
  processed boolean DEFAULT false,        -- Has reply service processed this?
  processed_at timestamptz,              -- When it was processed
  reply_tweet_id text,                   -- Our reply tweet ID (if posted)
  retry_count integer DEFAULT 0,         -- Number of retry attempts
  last_error text,                        -- Last error message (if failed)
  UNIQUE (parent_tweet_id)               -- CRITICAL: Only ONE opportunity per comment
);

-- Table 2: sideways_replies (Tracks Posted Replies)
-- Purpose: Track actual sideways replies that were posted
CREATE TABLE IF NOT EXISTS sideways_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  root_tweet_id text NOT NULL,           -- Pelpa tweet ID
  parent_tweet_id text NOT NULL,         -- Comment we replied to (can be user OR alt)
  alt_handle text NOT NULL,              -- Which alt replied
  reply_tweet_id text NOT NULL,          -- Our reply tweet ID
  score integer NOT NULL,                 -- Quality score of the comment
  created_at timestamptz DEFAULT now(),
  UNIQUE (parent_tweet_id, alt_handle)   -- CRITICAL: Only ONE alt per comment
);

-- Table 3: inbound_alt_replies
-- Purpose: Track when users @mention or reply to our alts
CREATE TABLE IF NOT EXISTS inbound_alt_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alt_handle text NOT NULL,              -- Which alt was mentioned
  source_tweet_id text NOT NULL,         -- Tweet that mentioned/replied to us
  source_user_handle text NOT NULL,       -- Who mentioned/replied to us
  source_tweet_text text NOT NULL,        -- Text of the tweet (stored at insert time)
  in_reply_to_tweet_id text,             -- Parent tweet ID (if it's a reply)
  replied boolean DEFAULT false,          -- Have we replied yet?
  reply_tweet_id text,                   -- Our reply tweet ID
  created_at timestamptz DEFAULT now(),
  UNIQUE (alt_handle, source_tweet_id)   -- Don't process same mention twice
);

-- Indexes for sideways_opportunities
CREATE INDEX IF NOT EXISTS idx_sideways_opp_root ON sideways_opportunities(root_tweet_id);
CREATE INDEX IF NOT EXISTS idx_sideways_opp_processed ON sideways_opportunities(processed, detected_at);
CREATE INDEX IF NOT EXISTS idx_sideways_opp_alt ON sideways_opportunities(recommended_alt_handle);

-- Indexes for sideways_replies
CREATE INDEX IF NOT EXISTS idx_sideways_root ON sideways_replies(root_tweet_id);
CREATE INDEX IF NOT EXISTS idx_sideways_parent ON sideways_replies(parent_tweet_id);
CREATE INDEX IF NOT EXISTS idx_sideways_alt ON sideways_replies(alt_handle);

-- Indexes for inbound_alt_replies
CREATE INDEX IF NOT EXISTS idx_inbound_alt ON inbound_alt_replies(alt_handle, replied);
CREATE INDEX IF NOT EXISTS idx_inbound_source ON inbound_alt_replies(source_tweet_id);

-- RLS Policies (if needed - using service role for now, but adding policies for future)
-- Service role has full access by default, but adding policies for authenticated users
DROP POLICY IF EXISTS "Service role full access" ON sideways_opportunities;
CREATE POLICY "Service role full access" ON sideways_opportunities FOR ALL USING (true);

DROP POLICY IF EXISTS "Authenticated users can view" ON sideways_opportunities;
CREATE POLICY "Authenticated users can view" ON sideways_opportunities FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Service role full access" ON sideways_replies;
CREATE POLICY "Service role full access" ON sideways_replies FOR ALL USING (true);

DROP POLICY IF EXISTS "Authenticated users can view" ON sideways_replies;
CREATE POLICY "Authenticated users can view" ON sideways_replies FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Service role full access" ON inbound_alt_replies;
CREATE POLICY "Service role full access" ON inbound_alt_replies FOR ALL USING (true);

DROP POLICY IF EXISTS "Authenticated users can view" ON inbound_alt_replies;
CREATE POLICY "Authenticated users can view" ON inbound_alt_replies FOR SELECT USING (auth.role() = 'authenticated');

