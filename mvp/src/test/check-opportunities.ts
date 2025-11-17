/**
 * Check sideways opportunities in database
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkOpportunities() {
  console.log('📋 Checking sideways opportunities...\n');

  const { data, error } = await supabase
    .from('sideways_opportunities')
    .select('*')
    .eq('processed', false)
    .order('detected_at', { ascending: false });

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  console.log(`Found ${data?.length || 0} unprocessed opportunities:\n`);

  if (data && data.length > 0) {
    data.forEach((opp, i) => {
      console.log(`${i + 1}. ${opp.commenter_handle} → ${opp.recommended_alt_handle}`);
      console.log(`   Score: ${opp.score} | Comment: "${opp.comment_text.substring(0, 60)}..."`);
      console.log(`   Root: ${opp.root_tweet_id}\n`);
    });
  } else {
    console.log('ℹ️  No unprocessed opportunities found');
  }
}

checkOpportunities().catch(console.error);

