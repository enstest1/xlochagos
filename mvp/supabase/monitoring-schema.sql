-- Enhanced schema for @pelpa333 monitoring and auto-response system
-- Run this after the main schema-enhanced.sql

-- Response queue for @pelpa333 mentions
CREATE TABLE IF NOT EXISTS response_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id TEXT NOT NULL,
  post_url TEXT NOT NULL,
  post_text TEXT NOT NULL,
  target_mentions TEXT[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_response' CHECK (status IN ('pending_response', 'generating_response', 'response_ready', 'posted', 'failed')),
  generated_response TEXT,
  response_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Research triggers from target accounts
CREATE TABLE IF NOT EXISTS research_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'target_accounts',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Enhanced raw_intelligence with new source types
ALTER TABLE raw_intelligence 
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'rss_feed' 
CHECK (source_type IN ('rss_feed', 'twitter_scrape', 'pelpa333_timeline', 'target_account', 'trending_topic'));

-- Update existing records to have source_type
UPDATE raw_intelligence 
SET source_type = 'rss_feed' 
WHERE source_type IS NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_response_queue_status ON response_queue(status);
CREATE INDEX IF NOT EXISTS idx_response_queue_created_at ON response_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_response_queue_target_mentions ON response_queue USING GIN(target_mentions);

CREATE INDEX IF NOT EXISTS idx_research_triggers_status ON research_triggers(status);
CREATE INDEX IF NOT EXISTS idx_research_triggers_priority ON research_triggers(priority);
CREATE INDEX IF NOT EXISTS idx_research_triggers_created_at ON research_triggers(created_at);

CREATE INDEX IF NOT EXISTS idx_raw_intelligence_source_type ON raw_intelligence(source_type);

-- RLS Policies for new tables

-- Response queue policies
DROP POLICY IF EXISTS "Service role full access" ON response_queue;
CREATE POLICY "Service role full access" ON response_queue FOR ALL USING (true);

DROP POLICY IF EXISTS "Authenticated users can view" ON response_queue;
CREATE POLICY "Authenticated users can view" ON response_queue FOR SELECT USING (auth.role() = 'authenticated');

-- Research triggers policies  
DROP POLICY IF EXISTS "Service role full access" ON research_triggers;
CREATE POLICY "Service role full access" ON research_triggers FOR ALL USING (true);

DROP POLICY IF EXISTS "Authenticated users can view" ON research_triggers;
CREATE POLICY "Authenticated users can view" ON research_triggers FOR SELECT USING (auth.role() = 'authenticated');

-- Update raw_intelligence policies to include new source types
DROP POLICY IF EXISTS "Service role full access" ON raw_intelligence;
CREATE POLICY "Service role full access" ON raw_intelligence FOR ALL USING (true);

DROP POLICY IF EXISTS "Authenticated users can view" ON raw_intelligence;
CREATE POLICY "Authenticated users can view" ON raw_intelligence FOR SELECT USING (auth.role() = 'authenticated');

-- Triggers for updated_at timestamps
DROP TRIGGER IF EXISTS update_response_queue_updated_at ON response_queue;
CREATE TRIGGER update_response_queue_updated_at
  BEFORE UPDATE ON response_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_research_triggers_updated_at ON research_triggers;
CREATE TRIGGER update_research_triggers_updated_at
  BEFORE UPDATE ON research_triggers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Sample data for testing (optional)
INSERT INTO response_queue (post_id, post_url, post_text, target_mentions, status) VALUES
('sample_1', 'https://x.com/pelpa333/status/sample1', 'Check out @trylimitless for AI trading insights!', ARRAY['@trylimitless'], 'pending_response'),
('sample_2', 'https://x.com/pelpa333/status/sample2', 'Great update from @wallchain_xyz on DeFi protocols', ARRAY['@wallchain_xyz'], 'pending_response')
ON CONFLICT DO NOTHING;

INSERT INTO research_triggers (topic, source, priority, status) VALUES
('AI trading bot performance', 'target_accounts', 'high', 'pending'),
('DeFi yield farming strategies', 'target_accounts', 'medium', 'pending'),
('Banking integration with crypto', 'target_accounts', 'high', 'pending')
ON CONFLICT DO NOTHING;

-- Comments
COMMENT ON TABLE response_queue IS 'Queue for auto-responses to @pelpa333 mentions of target accounts';
COMMENT ON TABLE research_triggers IS 'Research topics triggered by target account content';
COMMENT ON COLUMN raw_intelligence.source_type IS 'Type of intelligence source: rss_feed, twitter_scrape, pelpa333_timeline, target_account, trending_topic';
