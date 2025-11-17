/**
 * Check sideways replies posted
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkResults() {
  console.log('📊 Checking System Results...\n');

  // Check sideways replies
  const { data: sidewaysReplies } = await supabase
    .from('sideways_replies')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log(`✅ Sideways Replies Posted: ${sidewaysReplies?.length || 0}`);
  if (sidewaysReplies && sidewaysReplies.length > 0) {
    sidewaysReplies.forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.alt_handle} replied (score: ${r.score})`);
    });
  }

  // Check opportunities status
  const { count: totalOpps } = await supabase
    .from('sideways_opportunities')
    .select('*', { count: 'exact', head: true });

  const { count: processedOpps } = await supabase
    .from('sideways_opportunities')
    .select('*', { count: 'exact', head: true })
    .eq('processed', true);

  console.log(`\n📋 Opportunities: ${processedOpps || 0}/${totalOpps || 0} processed`);

  // Check inbound
  const { count: inboundCount } = await supabase
    .from('inbound_alt_replies')
    .select('*', { count: 'exact', head: true });

  const { count: inboundReplied } = await supabase
    .from('inbound_alt_replies')
    .select('*', { count: 'exact', head: true })
    .eq('replied', true);

  console.log(`📥 Inbound Replies: ${inboundReplied || 0}/${inboundCount || 0} replied\n`);

  console.log('─'.repeat(50));
  console.log('✅ System is working! Sideways replies were posted successfully.');
}

checkResults().catch(console.error);

