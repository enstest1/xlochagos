#!/usr/bin/env ts-node
/**
 * Script to check response_queue table in Supabase
 * Run with: npx ts-node check-response-queue.ts
 */

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkResponseQueue() {
  console.log('🔍 Checking response_queue table...\n');

  // Check the specific problematic post
  const postId = '1987773000234709379';
  
  console.log(`📋 Checking post_id: ${postId}\n`);
  
  const { data, error } = await supabase
    .from('response_queue')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('⚠️ No rows found for this post_id');
    return;
  }

  console.log(`✅ Found ${data.length} row(s) for this post:\n`);
  
  data.forEach((row: any, index: number) => {
    console.log(`--- Row ${index + 1} ---`);
    console.log(`ID: ${row.id}`);
    console.log(`Post ID: ${row.post_id}`);
    console.log(`Status: ${row.status}`);
    console.log(`Created: ${row.created_at}`);
    console.log(`Processed: ${row.processed_at || 'Not processed'}`);
    console.log(`Response URL: ${row.response_url || 'None'}`);
    console.log(`\nGenerated Response Field:`);
    console.log(`  Type: ${typeof row.generated_response}`);
    console.log(`  Is Null: ${row.generated_response === null}`);
    console.log(`  Is Empty: ${row.generated_response === ''}`);
    console.log(`  Length: ${row.generated_response ? row.generated_response.length : 0}`);
    
    if (row.generated_response) {
      console.log(`  Preview (first 500 chars):`);
      console.log(`  ${row.generated_response.substring(0, 500)}`);
      
      // Try to parse as JSON
      try {
        const parsed = JSON.parse(row.generated_response);
        console.log(`  ✅ Valid JSON`);
        console.log(`  Parsed keys: ${Object.keys(parsed).join(', ')}`);
        Object.keys(parsed).forEach((key: string) => {
          const entry = parsed[key];
          console.log(`    - ${key}: ${entry.response ? entry.response.substring(0, 100) : 'No response'} (${entry.timestamp || 'No timestamp'})`);
        });
      } catch (e) {
        console.log(`  ⚠️ Not valid JSON (might be legacy string format)`);
      }
    } else {
      console.log(`  ⚠️ Field is null or empty`);
    }
    console.log('\n');
  });

  // Check all recent posts to see patterns
  console.log('\n📊 Checking recent posts for patterns...\n');
  
  const { data: recentData, error: recentError } = await supabase
    .from('response_queue')
    .select('post_id, status, generated_response')
    .order('created_at', { ascending: false })
    .limit(20);

  if (recentError) {
    console.error('❌ Error:', recentError);
    return;
  }

  console.log(`Found ${recentData?.length || 0} recent posts:\n`);
  
  recentData?.forEach((row: any) => {
    const hasResponse = row.generated_response && row.generated_response.length > 0;
    const isJson = hasResponse && row.generated_response.startsWith('{');
    const isString = hasResponse && !isJson;
    
    console.log(`Post ${row.post_id}: Status=${row.status}, HasResponse=${hasResponse}, Format=${isJson ? 'JSON' : isString ? 'STRING' : 'NULL'}`);
  });
}

checkResponseQueue().catch(console.error);





