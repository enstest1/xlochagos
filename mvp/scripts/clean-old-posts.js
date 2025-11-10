/**
 * Clean up old posts from content_queue, keeping only the most recent premium post
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function cleanOldPosts() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase credentials not configured');
    process.exit(1);
  }

  try {
    // Fetch the most recent premium post
    const latestResponse = await fetch(
      `${supabaseUrl}/rest/v1/content_queue?created_by_agent=eq.standalone_premium_generator&order=created_at.desc&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
      }
    );

    const latestPosts = await latestResponse.json();
    
    if (latestPosts.length === 0) {
      console.log('ℹ️  No premium posts found to keep');
      return;
    }

    const latestPost = latestPosts[0];
    console.log(`✅ Found latest premium post: ${latestPost.id}`);
    console.log(`   Created: ${latestPost.created_at}`);
    console.log(`   Content: ${latestPost.content_text.substring(0, 100)}...`);
    console.log(`   Image: ${latestPost.images ? 'Yes' : 'No'}`);

    // Delete all posts except the latest one
    const deleteResponse = await fetch(
      `${supabaseUrl}/rest/v1/content_queue?id=neq.${latestPost.id}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Prefer': 'return=minimal'
        },
      }
    );

    if (deleteResponse.ok) {
      console.log('✅ Deleted all old posts');
      console.log(`✅ Kept latest post: ${latestPost.id}`);
    } else {
      console.error('❌ Failed to delete old posts');
      console.error(await deleteResponse.text());
    }

  } catch (error) {
    console.error('❌ Error cleaning up posts:', error);
    process.exit(1);
  }
}

cleanOldPosts();

