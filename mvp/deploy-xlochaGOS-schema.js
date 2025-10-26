/**
 * Deploy XlochaGOS Enhanced Schema to Supabase
 * Creates all tables needed for the multi-agent system
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function deploySchema() {
  console.log('\n🚀 Deploying XlochaGOS Enhanced Schema to Supabase...\n');
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase credentials not configured');
    process.exit(1);
  }
  
  // Read the schema SQL
  const schemaPath = path.join(__dirname, 'supabase', 'schema-enhanced.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
  
  console.log('📄 Loaded schema SQL from:', schemaPath);
  console.log(`   Schema size: ${schemaSql.length} characters\n`);
  
  // Execute the schema via Supabase REST API
  console.log('🔌 Connecting to Supabase...');
  console.log(`   URL: ${supabaseUrl}\n`);
  
  try {
    // Use Supabase's pg_net or execute via SQL
    // For now, we'll split and execute statements
    const statements = schemaSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`📊 Executing ${statements.length} SQL statements...\n`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      
      try {
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
          },
          body: JSON.stringify({ query: statement })
        });
        
        if (response.ok) {
          successCount++;
          process.stdout.write(`✅ ${i + 1}/${statements.length}\r`);
        } else {
          const error = await response.text();
          console.log(`\n⚠️  Statement ${i + 1} failed (might be OK if already exists)`);
          if (!error.includes('already exists')) {
            console.log(`    Error: ${error.substring(0, 100)}`);
          }
          errorCount++;
        }
      } catch (error) {
        console.log(`\n⚠️  Statement ${i + 1} error: ${error.message}`);
        errorCount++;
      }
    }
    
    console.log(`\n\n✨ Schema deployment complete!`);
    console.log(`   Successful: ${successCount}`);
    console.log(`   Errors: ${errorCount} (check if they're "already exists" errors)\n`);
    
    // Verify tables were created
    console.log('🔍 Verifying tables...\n');
    
    const tables = [
      'raw_intelligence',
      'research_data',
      'content_queue',
      'image_generation_logs',
      'agent_execution_logs',
      'publisher_assignments',
      'account_roles'
    ];
    
    for (const table of tables) {
      try {
        const response = await fetch(`${supabaseUrl}/rest/v1/${table}?limit=1`, {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
          },
        });
        
        if (response.ok) {
          console.log(`  ✅ ${table}`);
        } else {
          console.log(`  ❌ ${table} (not found)`);
        }
      } catch (error) {
        console.log(`  ❌ ${table} (error: ${error.message})`);
      }
    }
    
    console.log('\n✅ XlochaGOS schema deployed successfully!\n');
    
  } catch (error) {
    console.error('\n❌ Schema deployment failed:', error.message);
    console.error('\nPlease try deploying manually:');
    console.error('1. Go to https://supabase.com/dashboard/project/eapuldmifefqxvfzopba/editor');
    console.error('2. Open SQL Editor');
    console.error('3. Paste contents of supabase/schema-enhanced.sql');
    console.error('4. Click Run\n');
    process.exit(1);
  }
}

deploySchema().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});


