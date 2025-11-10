# ✅ Deploy XlochaGOS Schema to Supabase

**Status**: ⏸️ Ready for manual deployment  
**File**: `supabase/schema-enhanced.sql`  
**Project**: `eapuldmifefqxvfzopba`

## Quick Deploy Instructions

1. Go to your Supabase SQL Editor:
   https://supabase.com/dashboard/project/eapuldmifefqxvfzopba/editor

2. Click "New Query"

3. Copy and paste the ENTIRE contents of `supabase/schema-enhanced.sql`

4. Click "Run" (or press Ctrl+Enter)

5. Wait for completion (should take 5-10 seconds)

6. Verify tables were created by checking the Table Editor

## Expected Tables After Deployment:

- ✅ `raw_intelligence` - Agent 1 output
- ✅ `research_data` - Agent 2 output  
- ✅ `content_queue` - Agent 3, 4, 6 pipeline
- ✅ `image_generation_logs` - Agent 6 tracking
- ✅ `agent_execution_logs` - Orchestrator logs
- ✅ `publisher_assignments` - Publisher tracking
- ✅ `account_roles` - Hub vs Spoke config

## Verify Deployment

Run this after deploying:

```bash
cd mvp
node -e "
const supabase = require('@supabase/supabase-js').createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
(async () => {
  const tables = ['raw_intelligence', 'research_data', 'content_queue', 'image_generation_logs', 'agent_execution_logs', 'publisher_assignments', 'account_roles'];
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    console.log(error ? '❌' : '✅', table);
  }
  process.exit(0);
})();
"
```

## Troubleshooting

If you get errors about "already exists":
- This is OK! It means the table is already there
- The schema uses `IF NOT EXISTS` to prevent conflicts

If you get permission errors:
- Make sure you're using the SERVICE_ROLE_KEY (not anon key)
- Check that RLS policies allow service role access

