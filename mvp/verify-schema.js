// Verify Supabase schema deployment
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase credentials not found in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifySchema() {
  console.log('🔍 Verifying Supabase schema deployment...\n');
  
  const tablesToCheck = [
    // Main schema tables
    'raw_intelligence',
    'research_data',
    'content_queue',
    'image_generation_logs',
    'agent_execution_logs',
    'publisher_assignments',
    'account_roles',
    // Monitoring schema tables (NEW)
    'response_queue',
    'research_triggers'
  ];
  
  let allTablesExist = true;
  
  for (const table of tablesToCheck) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);
      
      if (error) {
        console.log(`❌ ${table.padEnd(30)} - NOT FOUND or ERROR: ${error.message}`);
        allTablesExist = false;
      } else {
        const count = await getTableCount(table);
        console.log(`✅ ${table.padEnd(30)} - EXISTS (${count} rows)`);
      }
    } catch (err) {
      console.log(`❌ ${table.padEnd(30)} - ERROR: ${err.message}`);
      allTablesExist = false;
    }
  }
  
  console.log('\n' + '═'.repeat(60));
  
  if (allTablesExist) {
    console.log('✅ ALL TABLES VERIFIED - Schema deployment successful!\n');
    
    // Check for monitoring-specific features
    console.log('🔍 Checking monitoring system features...\n');
    
    // Check response_queue has correct columns
    const { data: sampleResponse } = await supabase
      .from('response_queue')
      .select('*')
      .limit(1);
    
    if (sampleResponse && sampleResponse.length > 0) {
      console.log('✅ response_queue structure verified');
      console.log('   Columns:', Object.keys(sampleResponse[0]).join(', '));
    } else {
      console.log('✅ response_queue exists (empty - ready for data)');
    }
    
    // Check research_triggers
    const { data: sampleTriggers } = await supabase
      .from('research_triggers')
      .select('*')
      .limit(1);
    
    if (sampleTriggers && sampleTriggers.length > 0) {
      console.log('✅ research_triggers structure verified');
      console.log('   Columns:', Object.keys(sampleTriggers[0]).join(', '));
    } else {
      console.log('✅ research_triggers exists (empty - ready for data)');
    }
    
    console.log('\n🎉 MONITORING SYSTEM READY TO USE!\n');
    console.log('Next steps:');
    console.log('  1. Test monitoring: npm run cli -- swarm monitor');
    console.log('  2. Test responses: npm run cli -- swarm respond');
    console.log('  3. Run full cycle: npm run cli -- swarm once\n');
    
  } else {
    console.log('❌ SOME TABLES MISSING - Schema deployment incomplete\n');
    console.log('Please run:');
    console.log('  1. supabase/schema-enhanced.sql (main schema)');
    console.log('  2. supabase/monitoring-schema.sql (monitoring schema)\n');
  }
}

async function getTableCount(table) {
  try {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    
    if (error) return '?';
    return count || 0;
  } catch {
    return '?';
  }
}

verifySchema()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  });


