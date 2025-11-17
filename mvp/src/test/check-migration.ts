/**
 * Check if database migration has been applied
 * Run with: npx ts-node src/test/check-migration.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkMigration() {
  console.log('🔍 Checking database migration status...\n');

  const tables = [
    'sideways_opportunities',
    'sideways_replies',
    'inbound_alt_replies'
  ];

  let allExist = true;

  for (const tableName of tables) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('id')
        .limit(1);

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist') || error.message?.includes('schema cache')) {
          console.log(`❌ ${tableName} - Table does NOT exist`);
          allExist = false;
        } else {
          console.log(`⚠️  ${tableName} - Error: ${error.message}`);
          allExist = false;
        }
      } else {
        console.log(`✅ ${tableName} - Table exists`);
      }
    } catch (error: any) {
      console.log(`❌ ${tableName} - Error: ${error.message}`);
      allExist = false;
    }
  }

  console.log('\n' + '─'.repeat(50));
  
  if (allExist) {
    console.log('✅ Migration Status: COMPLETE');
    console.log('💡 All tables exist - ready to test!');
  } else {
    console.log('❌ Migration Status: INCOMPLETE');
    console.log('💡 Please apply migration: mvp/supabase/sideways-inbound-schema.sql');
    console.log('   Go to Supabase Dashboard → SQL Editor → Run the migration file');
  }
}

checkMigration().catch(console.error);

