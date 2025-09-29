-- CypherSwarm AI Agent Memory System Schema
-- This creates the tables needed for AI agent memory, learning, and cross-account intelligence

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Agent Memory Table
-- Stores all types of memories: interactions, engagements, preferences, behaviors, learning outcomes
CREATE TABLE IF NOT EXISTS agent_memory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('interaction', 'engagement', 'preference', 'behavior', 'learning')),
    data JSONB NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    relevance_score DECIMAL(3,2) DEFAULT 0.5 CHECK (relevance_score >= 0 AND relevance_score <= 1),
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Content Performance Table
-- Tracks how well different types of content perform
CREATE TABLE IF NOT EXISTS content_performance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    content_type TEXT NOT NULL,
    topic TEXT NOT NULL,
    performance_score DECIMAL(3,2) NOT NULL CHECK (performance_score >= 0 AND performance_score <= 1),
    engagement_metrics JSONB NOT NULL DEFAULT '{}',
    audience_response TEXT CHECK (audience_response IN ('positive', 'neutral', 'negative')),
    posted_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Learning Patterns Table
-- Stores discovered patterns and insights from agent behavior
CREATE TABLE IF NOT EXISTS learning_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account TEXT NOT NULL,
    pattern_type TEXT NOT NULL,
    pattern_data JSONB NOT NULL,
    confidence_score DECIMAL(3,2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
    discovery_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_validated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    validation_count INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cross-Account Intelligence Table
-- Stores insights that can be shared across accounts
CREATE TABLE IF NOT EXISTS cross_account_intelligence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_account TEXT NOT NULL,
    target_accounts TEXT[] NOT NULL DEFAULT '{}',
    intelligence_type TEXT NOT NULL,
    intelligence_data JSONB NOT NULL,
    sharing_level TEXT DEFAULT 'private' CHECK (sharing_level IN ('private', 'limited', 'public')),
    effectiveness_score DECIMAL(3,2) DEFAULT 0.5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Agent Personalities Table
-- Stores evolving personality traits for each account
CREATE TABLE IF NOT EXISTS agent_personalities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account TEXT UNIQUE NOT NULL,
    personality_traits JSONB NOT NULL DEFAULT '{}',
    content_preferences JSONB NOT NULL DEFAULT '{}',
    posting_patterns JSONB NOT NULL DEFAULT '{}',
    learning_preferences JSONB NOT NULL DEFAULT '{}',
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_memory_account ON agent_memory(account);
CREATE INDEX IF NOT EXISTS idx_agent_memory_type ON agent_memory(type);
CREATE INDEX IF NOT EXISTS idx_agent_memory_timestamp ON agent_memory(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memory_relevance ON agent_memory(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memory_tags ON agent_memory USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_agent_memory_data ON agent_memory USING GIN(data);

CREATE INDEX IF NOT EXISTS idx_content_performance_account ON content_performance(account);
CREATE INDEX IF NOT EXISTS idx_content_performance_type ON content_performance(content_type);
CREATE INDEX IF NOT EXISTS idx_content_performance_score ON content_performance(performance_score DESC);
CREATE INDEX IF NOT EXISTS idx_content_performance_posted_at ON content_performance(posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_learning_patterns_account ON learning_patterns(account);
CREATE INDEX IF NOT EXISTS idx_learning_patterns_type ON learning_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_learning_patterns_confidence ON learning_patterns(confidence_score DESC);

CREATE INDEX IF NOT EXISTS idx_cross_account_source ON cross_account_intelligence(source_account);
CREATE INDEX IF NOT EXISTS idx_cross_account_targets ON cross_account_intelligence USING GIN(target_accounts);
CREATE INDEX IF NOT EXISTS idx_cross_account_type ON cross_account_intelligence(intelligence_type);

-- Row Level Security (RLS) policies
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE cross_account_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_personalities ENABLE ROW LEVEL SECURITY;

-- Create policies for service role access (for the application)
CREATE POLICY "Service role can manage all data" ON agent_memory FOR ALL USING (true);
CREATE POLICY "Service role can manage all data" ON content_performance FOR ALL USING (true);
CREATE POLICY "Service role can manage all data" ON learning_patterns FOR ALL USING (true);
CREATE POLICY "Service role can manage all data" ON cross_account_intelligence FOR ALL USING (true);
CREATE POLICY "Service role can manage all data" ON agent_personalities FOR ALL USING (true);

-- Functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for automatic timestamp updates
CREATE TRIGGER update_agent_memory_updated_at BEFORE UPDATE ON agent_memory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agent_personalities_updated_at BEFORE UPDATE ON agent_personalities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up old data (run periodically)
CREATE OR REPLACE FUNCTION cleanup_old_memory_data()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete memories older than 2 years
    DELETE FROM agent_memory WHERE timestamp < NOW() - INTERVAL '2 years';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Delete expired cross-account intelligence
    DELETE FROM cross_account_intelligence WHERE expires_at < NOW();
    
    -- Delete old content performance data (keep 1 year)
    DELETE FROM content_performance WHERE posted_at < NOW() - INTERVAL '1 year';
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Views for common queries
CREATE OR REPLACE VIEW recent_memories AS
SELECT 
    account,
    type,
    data,
    timestamp,
    relevance_score,
    tags
FROM agent_memory 
WHERE timestamp > NOW() - INTERVAL '30 days'
ORDER BY relevance_score DESC, timestamp DESC;

CREATE OR REPLACE VIEW top_performing_content AS
SELECT 
    account,
    content_type,
    topic,
    AVG(performance_score) as avg_performance,
    COUNT(*) as post_count,
    MAX(posted_at) as last_posted
FROM content_performance 
WHERE posted_at > NOW() - INTERVAL '30 days'
GROUP BY account, content_type, topic
HAVING COUNT(*) >= 3
ORDER BY avg_performance DESC;

CREATE OR REPLACE VIEW agent_insights AS
SELECT 
    p.account,
    p.personality_traits,
    p.content_preferences,
    p.posting_patterns,
    COUNT(DISTINCT m.id) as memory_count,
    MAX(m.timestamp) as last_activity,
    AVG(m.relevance_score) as avg_memory_quality
FROM agent_personalities p
LEFT JOIN agent_memory m ON p.account = m.account
GROUP BY p.account, p.personality_traits, p.content_preferences, p.posting_patterns;


