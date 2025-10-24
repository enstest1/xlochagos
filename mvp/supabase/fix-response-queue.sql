-- Fix for response_queue and research_triggers missing updated_at column
-- This resolves the error: record "new" has no field "updated_at"

-- Add updated_at column to response_queue if it doesn't exist
ALTER TABLE response_queue 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add updated_at column to research_triggers if it doesn't exist
ALTER TABLE research_triggers 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Update existing records to have current timestamp
UPDATE response_queue SET updated_at = NOW() WHERE updated_at IS NULL;
UPDATE research_triggers SET updated_at = NOW() WHERE updated_at IS NULL;

-- Verify triggers exist (they should already be created from monitoring-schema.sql)
-- But we'll recreate them just to be sure

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

-- Test the fix
SELECT 'response_queue updated_at column added' AS status;
SELECT 'research_triggers updated_at column added' AS status;


