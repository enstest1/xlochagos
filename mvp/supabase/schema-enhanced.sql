-- XlochaGOS Enhanced Database Schema
-- Multi-Agent System for Twitter Automation
-- This schema supports 6 specialized agents working together

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- AGENT 1 OUTPUT: Raw Intelligence
-- ============================================================
CREATE TABLE IF NOT EXISTS raw_intelligence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Source information
  source_type TEXT NOT NULL CHECK (source_type IN ('twitter_scrape', 'rss_feed', 'trending_topic')),
  source_account TEXT,
  source_url TEXT,
  
  -- Content
  raw_content TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Processing status (which agents have processed this)
  processed_by_researcher BOOLEAN DEFAULT FALSE,
  processed_by_writer BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raw_intelligence_source_type ON raw_intelligence(source_type);
CREATE INDEX IF NOT EXISTS idx_raw_intelligence_source_account ON raw_intelligence(source_account);
CREATE INDEX IF NOT EXISTS idx_raw_intelligence_processed_researcher ON raw_intelligence(processed_by_researcher);
CREATE INDEX IF NOT EXISTS idx_raw_intelligence_processed_writer ON raw_intelligence(processed_by_writer);
CREATE INDEX IF NOT EXISTS idx_raw_intelligence_extracted_at ON raw_intelligence(extracted_at DESC);

-- ============================================================
-- AGENT 2 OUTPUT: Research Data
-- ============================================================
CREATE TABLE IF NOT EXISTS research_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Research query
  topic TEXT NOT NULL,
  query TEXT NOT NULL,
  triggered_by_intelligence_ids UUID[],
  
  -- Research results
  research_results JSONB NOT NULL,
  key_insights TEXT[],
  sources TEXT[],
  summary TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  used_in_content BOOLEAN DEFAULT FALSE,
  quality_score DECIMAL(3,2)
);

CREATE INDEX IF NOT EXISTS idx_research_data_topic ON research_data(topic);
CREATE INDEX IF NOT EXISTS idx_research_data_used ON research_data(used_in_content);
CREATE INDEX IF NOT EXISTS idx_research_data_created_at ON research_data(created_at DESC);

-- ============================================================
-- AGENT 3 + 4 + 6 OUTPUT: Content Queue
-- ============================================================
CREATE TABLE IF NOT EXISTS content_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Source tracking
  source_intelligence_ids UUID[],
  source_research_ids UUID[],
  source_rss_items JSONB,
  
  -- Content (text)
  content_text TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('original', 'commentary', 'research', 'news')),
  topic_tags TEXT[],
  
  -- Images (Agent 6 adds these)
  images JSONB,
  image_prompt TEXT,
  image_generation_status TEXT DEFAULT 'pending' CHECK (image_generation_status IN ('pending', 'generating', 'completed', 'failed', 'not_needed')),
  
  -- Quality scores (Agent 4 sets these)
  quality_score DECIMAL(3,2) NOT NULL,
  confidence_score DECIMAL(3,2),
  variation_number INTEGER,
  
  -- Agent tracking
  created_by_agent TEXT DEFAULT 'content_writer',
  approved_by_agent TEXT,
  image_by_agent TEXT,
  
  -- Publishing status
  status TEXT DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'pending_manual_review', 'approved', 'assigned', 'posted', 'failed', 'rejected')),
  assigned_to_account TEXT,
  assigned_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  post_url TEXT,
  
  -- Performance (Agent 5 fills these)
  engagement_metrics JSONB,
  performance_score DECIMAL(3,2),
  analyzed_at TIMESTAMPTZ,
  
  -- Metadata (for tier, llm_generated, etc.)
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_queue_status ON content_queue(status);
CREATE INDEX IF NOT EXISTS idx_content_queue_assigned_to ON content_queue(assigned_to_account);
CREATE INDEX IF NOT EXISTS idx_content_queue_created_at ON content_queue(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_queue_quality_score ON content_queue(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_content_queue_image_status ON content_queue(image_generation_status);
CREATE INDEX IF NOT EXISTS idx_content_queue_content_type ON content_queue(content_type);

-- ============================================================
-- AGENT 6 LOGS: Image Generation
-- ============================================================
CREATE TABLE IF NOT EXISTS image_generation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_id UUID REFERENCES content_queue(id) ON DELETE CASCADE,
  
  -- Generation details
  prompt TEXT NOT NULL,
  model TEXT DEFAULT 'imagen-4.0-generate-001',
  config JSONB DEFAULT '{}',
  
  -- Results
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
  image_urls TEXT[],
  error_message TEXT,
  
  -- Cost tracking
  api_cost DECIMAL(10,4),
  generation_time_ms INTEGER,
  
  -- Timestamp
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_image_gen_content_id ON image_generation_logs(content_id);
CREATE INDEX IF NOT EXISTS idx_image_gen_status ON image_generation_logs(status);
CREATE INDEX IF NOT EXISTS idx_image_gen_timestamp ON image_generation_logs(generated_at DESC);

-- ============================================================
-- ORCHESTRATOR LOGS: Agent Execution Tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_execution_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_name TEXT NOT NULL CHECK (agent_name IN ('gatherer', 'researcher', 'writer', 'controller', 'image_generator', 'learner')),
  cycle_id UUID NOT NULL,
  
  -- Execution details
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'partial')),
  
  -- Results
  items_processed INTEGER DEFAULT 0,
  items_created INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,
  
  -- Error tracking
  error_message TEXT,
  error_stack TEXT,
  
  -- Metadata
  data JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_agent_exec_agent_name ON agent_execution_logs(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_exec_cycle_id ON agent_execution_logs(cycle_id);
CREATE INDEX IF NOT EXISTS idx_agent_exec_started_at ON agent_execution_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_exec_status ON agent_execution_logs(status);

-- ============================================================
-- PUBLISHER ACCOUNT TRACKING
-- ============================================================
CREATE TABLE IF NOT EXISTS publisher_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Account info
  publisher_account TEXT NOT NULL,
  content_id UUID REFERENCES content_queue(id) ON DELETE CASCADE,
  
  -- Assignment
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  scheduled_post_time TIMESTAMPTZ,
  
  -- Completion
  posted_at TIMESTAMPTZ,
  post_url TEXT,
  post_success BOOLEAN,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_publisher_assignments_account ON publisher_assignments(publisher_account);
CREATE INDEX IF NOT EXISTS idx_publisher_assignments_content ON publisher_assignments(content_id);
CREATE INDEX IF NOT EXISTS idx_publisher_assignments_scheduled ON publisher_assignments(scheduled_post_time);

-- ============================================================
-- ACCOUNT ROLES: Hub vs Spoke Configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS account_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_handle TEXT NOT NULL UNIQUE,
  
  -- Role
  role TEXT NOT NULL CHECK (role IN ('intelligence_hub', 'content_publisher', 'booster')),
  
  -- Capabilities
  can_scrape BOOLEAN DEFAULT FALSE,
  can_research BOOLEAN DEFAULT FALSE,
  can_generate_content BOOLEAN DEFAULT FALSE,
  can_post BOOLEAN DEFAULT TRUE,
  can_boost BOOLEAN DEFAULT TRUE,
  
  -- Limits
  daily_post_limit INTEGER DEFAULT 5,
  daily_boost_limit INTEGER DEFAULT 10,
  min_hours_between_posts DECIMAL(4,2) DEFAULT 2.0,
  
  -- Personality
  personality_type TEXT,
  personality_config JSONB DEFAULT '{}',
  
  -- Status
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ENHANCE EXISTING TABLES
-- ============================================================

-- Add columns to learning_patterns if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='learning_patterns' AND column_name='source_content_ids') THEN
    ALTER TABLE learning_patterns ADD COLUMN source_content_ids UUID[];
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='learning_patterns' AND column_name='success_rate') THEN
    ALTER TABLE learning_patterns ADD COLUMN success_rate DECIMAL(3,2);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='learning_patterns' AND column_name='recommendation') THEN
    ALTER TABLE learning_patterns ADD COLUMN recommendation TEXT;
  END IF;
END $$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE raw_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_generation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE publisher_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_roles ENABLE ROW LEVEL SECURITY;

-- Service role can manage all data
-- Drop existing policies first to avoid conflicts
DROP POLICY IF EXISTS "Service role full access" ON raw_intelligence;
DROP POLICY IF EXISTS "Service role full access" ON research_data;
DROP POLICY IF EXISTS "Service role full access" ON content_queue;
DROP POLICY IF EXISTS "Service role full access" ON image_generation_logs;
DROP POLICY IF EXISTS "Service role full access" ON agent_execution_logs;
DROP POLICY IF EXISTS "Service role full access" ON publisher_assignments;
DROP POLICY IF EXISTS "Service role full access" ON account_roles;

-- Create policies
CREATE POLICY "Service role full access" ON raw_intelligence FOR ALL USING (true);
CREATE POLICY "Service role full access" ON research_data FOR ALL USING (true);
CREATE POLICY "Service role full access" ON content_queue FOR ALL USING (true);
CREATE POLICY "Service role full access" ON image_generation_logs FOR ALL USING (true);
CREATE POLICY "Service role full access" ON agent_execution_logs FOR ALL USING (true);
CREATE POLICY "Service role full access" ON publisher_assignments FOR ALL USING (true);
CREATE POLICY "Service role full access" ON account_roles FOR ALL USING (true);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Function to get next content for a publisher
CREATE OR REPLACE FUNCTION get_next_content_for_publisher(p_account TEXT)
RETURNS TABLE (
  content_id UUID,
  content_text TEXT,
  images JSONB,
  topic_tags TEXT[],
  quality_score DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    id,
    content_text,
    images,
    topic_tags,
    quality_score
  FROM content_queue
  WHERE status = 'approved'
    AND image_generation_status IN ('completed', 'not_needed')
    AND assigned_to_account IS NULL
  ORDER BY quality_score DESC, created_at ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to mark content as assigned
CREATE OR REPLACE FUNCTION assign_content_to_publisher(p_content_id UUID, p_account TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE content_queue
  SET 
    status = 'assigned',
    assigned_to_account = p_account,
    assigned_at = NOW()
  WHERE id = p_content_id
    AND status = 'approved'
    AND assigned_to_account IS NULL;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to get unprocessed intelligence for researcher
CREATE OR REPLACE FUNCTION get_unprocessed_intelligence_for_researcher(p_limit INTEGER)
RETURNS SETOF raw_intelligence AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM raw_intelligence
  WHERE processed_by_researcher = FALSE
  ORDER BY extracted_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get unprocessed intelligence for writer
CREATE OR REPLACE FUNCTION get_unprocessed_intelligence_for_writer(p_limit INTEGER)
RETURNS SETOF raw_intelligence AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM raw_intelligence
  WHERE processed_by_writer = FALSE
    AND processed_by_researcher = TRUE
  ORDER BY extracted_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- VIEWS FOR AGENT DASHBOARDS
-- ============================================================

-- Agent performance summary
CREATE OR REPLACE VIEW agent_performance_summary AS
SELECT 
  agent_name,
  COUNT(*) as total_runs,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_runs,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_runs,
  AVG(duration_ms) as avg_duration_ms,
  MAX(started_at) as last_run_at
FROM agent_execution_logs
WHERE started_at > NOW() - INTERVAL '7 days'
GROUP BY agent_name;

-- Content queue summary
CREATE OR REPLACE VIEW content_queue_summary AS
SELECT 
  status,
  COUNT(*) as count,
  AVG(quality_score) as avg_quality,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM content_queue
GROUP BY status;

-- Publisher performance
CREATE OR REPLACE VIEW publisher_performance AS
SELECT 
  assigned_to_account,
  COUNT(*) as total_posts,
  SUM(CASE WHEN status = 'posted' THEN 1 ELSE 0 END) as successful_posts,
  AVG(performance_score) as avg_performance,
  MAX(posted_at) as last_post_at
FROM content_queue
WHERE assigned_to_account IS NOT NULL
GROUP BY assigned_to_account;

-- Daily intelligence gathering stats
CREATE OR REPLACE VIEW daily_intelligence_stats AS
SELECT 
  DATE(extracted_at) as date,
  source_type,
  COUNT(*) as items_collected,
  SUM(CASE WHEN processed_by_writer = TRUE THEN 1 ELSE 0 END) as items_used
FROM raw_intelligence
WHERE extracted_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(extracted_at), source_type
ORDER BY date DESC;

-- ============================================================
-- AUTOMATIC TIMESTAMP UPDATES
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing triggers first to avoid conflicts
DROP TRIGGER IF EXISTS update_content_queue_updated_at ON content_queue;
DROP TRIGGER IF EXISTS update_account_roles_updated_at ON account_roles;

-- Create triggers
CREATE TRIGGER update_content_queue_updated_at 
  BEFORE UPDATE ON content_queue 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_account_roles_updated_at 
  BEFORE UPDATE ON account_roles 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- CLEANUP FUNCTIONS
-- ============================================================

-- Clean up old raw intelligence (after 30 days if processed)
CREATE OR REPLACE FUNCTION cleanup_old_intelligence()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM raw_intelligence 
    WHERE extracted_at < NOW() - INTERVAL '30 days'
      AND processed_by_writer = TRUE;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Clean up failed/rejected content (after 7 days)
CREATE OR REPLACE FUNCTION cleanup_failed_content()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM content_queue 
    WHERE status IN ('rejected', 'failed')
      AND created_at < NOW() - INTERVAL '7 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- INITIAL DATA: Set up account roles
-- ============================================================
INSERT INTO account_roles (account_handle, role, can_scrape, can_research, can_generate_content, can_post, can_boost, personality_type, daily_post_limit)
VALUES 
  ('@FIZZonAbstract', 'intelligence_hub', TRUE, TRUE, TRUE, FALSE, TRUE, 'intelligence_gatherer', 0)
ON CONFLICT (account_handle) DO UPDATE SET
  role = EXCLUDED.role,
  can_scrape = EXCLUDED.can_scrape,
  can_research = EXCLUDED.can_research,
  can_generate_content = EXCLUDED.can_generate_content;

-- ============================================================
-- DONE
-- ============================================================
-- Schema deployment complete!
-- All tables, indexes, functions, and views created.

