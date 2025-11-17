# Database Migration Instructions

## Quick Migration Steps

### Option 1: Supabase Dashboard (Recommended)

1. **Go to Supabase Dashboard:**
   - Navigate to: https://supabase.com/dashboard/project/eapuldmifefqxvfzopba
   - Or go to your project dashboard

2. **Open SQL Editor:**
   - Click on "SQL Editor" in the left sidebar
   - Click "New query"

3. **Copy Migration SQL:**
   - Open file: `mvp/supabase/sideways-inbound-schema.sql`
   - Copy ALL contents (Ctrl+A, Ctrl+C)

4. **Paste and Run:**
   - Paste into SQL Editor
   - Click "Run" or press Ctrl+Enter

5. **Verify Success:**
   - You should see "Success. No rows returned"
   - Check tables exist:
     ```sql
     SELECT COUNT(*) FROM sideways_opportunities;
     SELECT COUNT(*) FROM sideways_replies;
     SELECT COUNT(*) FROM inbound_alt_replies;
     ```
   - All should return `0` (tables exist but empty)

### Option 2: Supabase CLI (If you have it installed)

```bash
# If you have Supabase CLI installed
supabase db push --file mvp/supabase/sideways-inbound-schema.sql
```

---

## What Gets Created

✅ **3 New Tables:**
- `sideways_opportunities` - Flags opportunities for sideways replies
- `sideways_replies` - Tracks posted sideways replies  
- `inbound_alt_replies` - Tracks inbound mentions/replies

✅ **6 Indexes** - For query performance

✅ **RLS Policies** - For security (service role + authenticated users)

---

## Safety

- ✅ **No data loss** - Only adds new tables
- ✅ **Idempotent** - Safe to run multiple times (uses `IF NOT EXISTS`)
- ✅ **No changes to existing tables** - Your `response_queue`, `raw_intelligence`, etc. remain untouched

---

## After Migration

Once migration is complete, you can test:

```bash
# Test database connection
npm run cli swarm monitor

# Check for opportunities
npm run cli swarm sideways
```

