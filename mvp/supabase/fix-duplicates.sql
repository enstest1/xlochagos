-- Step 1: Find duplicate post_ids in response_queue
-- Run this first to see what duplicates exist
SELECT 
    post_id, 
    COUNT(*) as duplicate_count,
    array_agg(id ORDER BY created_at DESC) as ids,
    array_agg(status ORDER BY created_at DESC) as statuses,
    array_agg(created_at ORDER BY created_at DESC) as created_dates
FROM response_queue
GROUP BY post_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- Step 2: Delete duplicates, keeping the most recent one for each post_id
-- This keeps the newest entry and deletes older duplicates
DELETE FROM response_queue
WHERE id IN (
    SELECT id
    FROM (
        SELECT 
            id,
            ROW_NUMBER() OVER (
                PARTITION BY post_id 
                ORDER BY created_at DESC
            ) as rn
        FROM response_queue
    ) t
    WHERE rn > 1  -- Keep only the first (newest) row, delete the rest
);

-- Step 3: Verify no duplicates remain
SELECT 
    post_id, 
    COUNT(*) as count
FROM response_queue
GROUP BY post_id
HAVING COUNT(*) > 1;
-- Should return 0 rows

-- Step 4: Now create the unique index (should work now)
CREATE UNIQUE INDEX IF NOT EXISTS idx_response_queue_post_id_unique 
ON response_queue(post_id);

-- Step 5: Check for duplicates in raw_intelligence (source_url)
SELECT 
    source_url, 
    COUNT(*) as duplicate_count
FROM raw_intelligence
WHERE source_url IS NOT NULL
GROUP BY source_url
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 10;

-- Step 6: Delete duplicates in raw_intelligence, keeping the most recent
DELETE FROM raw_intelligence
WHERE id IN (
    SELECT id
    FROM (
        SELECT 
            id,
            ROW_NUMBER() OVER (
                PARTITION BY source_url 
                ORDER BY extracted_at DESC
            ) as rn
        FROM raw_intelligence
        WHERE source_url IS NOT NULL
    ) t
    WHERE rn > 1
);

-- Step 7: Create unique index on raw_intelligence
CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_intelligence_source_url_unique 
ON raw_intelligence(source_url) 
WHERE source_url IS NOT NULL;

-- Step 8: Clean up sample data (if it exists)
DELETE FROM response_queue 
WHERE post_id IN ('sample_1', 'sample_2');

