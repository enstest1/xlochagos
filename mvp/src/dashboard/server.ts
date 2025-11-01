import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3001;

// Determine the correct public path
// When running with ts-node, __dirname points to src/dashboard
// When running compiled, __dirname points to dist/dashboard
const publicPath = fs.existsSync(path.join(__dirname, 'public')) 
  ? path.join(__dirname, 'public')
  : path.join(__dirname, '../../src/dashboard/public');

console.log(`📁 Serving static files from: ${publicPath}`);

// Middleware
app.use(express.json());

// Disable caching for static files during development
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.use(express.static(publicPath));

// Serve generated images from mvp/assets/generated
// Handle both running from mvp/ directory and root directory
let assetsPath: string;
if (fs.existsSync(path.join(process.cwd(), 'assets'))) {
  // Running from mvp/ directory
  assetsPath = path.join(process.cwd(), 'assets');
} else if (fs.existsSync(path.join(process.cwd(), 'mvp', 'assets'))) {
  // Running from root directory
  assetsPath = path.join(process.cwd(), 'mvp', 'assets');
} else {
  // Fallback: try mvp/assets relative to __dirname
  assetsPath = path.join(__dirname, '../../assets');
}
console.log(`🖼️  Serving images from: ${assetsPath}`);
app.use('/assets', express.static(assetsPath));

// Debug endpoint to check file path
app.get('/api/debug', (req, res) => {
  res.json({
    __dirname,
    publicPath,
    indexPath: path.join(publicPath, 'index.html'),
    indexExists: fs.existsSync(path.join(publicPath, 'index.html')),
    cwd: process.cwd()
  });
});

// Endpoint to guess image path by content ID (fallback when DB images missing)
app.get('/api/find-image/:id', (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Missing id' });
    }

    const generatedDir = path.join(assetsPath, 'generated');
    if (!fs.existsSync(generatedDir)) {
      return res.status(404).json({ error: 'Generated directory not found' });
    }

    const files = fs.readdirSync(generatedDir);
    const match = files.find(f => f.toLowerCase().startsWith(id.toLowerCase() + '-') && f.toLowerCase().endsWith('.png'));

    if (!match) {
      return res.status(404).json({ error: 'No image found for id' });
    }

    return res.json({ webPath: `/assets/generated/${match}` });
  } catch (error) {
    console.error('find-image error', error);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// API endpoint to fetch all data
app.get('/api/dashboard', async (req, res) => {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase not configured");
    }

    // Fetch all data in parallel
    const [intelligenceRes, researchRes, queueRes, imagesRes, logsRes] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/raw_intelligence?order=created_at.desc&limit=50`, {
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey }
      }),
      fetch(`${supabaseUrl}/rest/v1/research_data?order=created_at.desc&limit=20`, {
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey }
      }),
      fetch(`${supabaseUrl}/rest/v1/content_queue?order=created_at.desc&limit=50`, {
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey }
      }),
      fetch(`${supabaseUrl}/rest/v1/image_generation_logs?order=created_at.desc&limit=30`, {
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey }
      }),
      fetch(`${supabaseUrl}/rest/v1/agent_execution_logs?order=created_at.desc&limit=20`, {
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey }
      })
    ]);

    const [intelligence, research, queue, images, logs] = await Promise.all([
      intelligenceRes.json(),
      researchRes.json(),
      queueRes.json(),
      imagesRes.json(),
      logsRes.json()
    ]) as [any[], any[], any[], any[], any[]];

    // Calculate stats
    const stats = {
      totalIntelligence: intelligence.length,
      totalResearch: research.length,
      totalPosts: queue.length,
      pendingReview: queue.filter((p: any) => p.status === 'pending_manual_review').length,
      approved: queue.filter((p: any) => p.status === 'approved').length,
      posted: queue.filter((p: any) => p.status === 'posted').length,
      totalImages: images.length,
      avgQualityScore: queue.length > 0 ? (queue.reduce((sum: number, p: any) => sum + p.quality_score, 0) / queue.length).toFixed(2) : 0
    };

    res.json({
      intelligence,
      research,
      queue,
      images,
      logs,
      stats,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Dashboard API error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Debug endpoint to check image data structure
app.get('/api/debug-images', async (req, res) => {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const response = await fetch(
      `${supabaseUrl}/rest/v1/content_queue?status=eq.pending_manual_review&order=created_at.desc&limit=3`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
      }
    );

    if (!response.ok) {
      return res.status(500).json({ error: 'Failed to fetch posts' });
    }

    const posts = await response.json() as any[];
    
    // Debug information
    const debugInfo = posts.map(post => ({
      id: post.id,
      has_images_field: !!post.images,
      images_type: typeof post.images,
      images_value: post.images,
      images_is_array: Array.isArray(post.images),
      images_is_object: post.images && typeof post.images === 'object',
      images_keys: post.images ? Object.keys(post.images) : [],
      images_dot_images: post.images?.images,
      images_dot_images_type: typeof post.images?.images,
      images_dot_images_is_array: Array.isArray(post.images?.images),
      first_image_path: post.images?.images?.[0]?.local_path || 'N/A',
      content_preview: post.content_text?.substring(0, 50) + '...'
    }));

    res.json({
      total_posts: posts.length,
      posts_with_images_field: posts.filter(p => !!p.images).length,
      debug_info: debugInfo,
      assets_path: assetsPath,
      assets_exists: fs.existsSync(assetsPath),
      generated_path: path.join(assetsPath, 'generated'),
      generated_exists: fs.existsSync(path.join(assetsPath, 'generated'))
    });
  } catch (error) {
    console.error('Debug images error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
  // Ensure all code paths return
  return;
});

// API endpoint to update post status (for new UI)
app.post('/api/update-post-status', async (req, res) => {
  try {
    const { postId, status } = req.body;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase not configured");
    }

    if (!postId || !status) {
      return res.status(400).json({ error: 'postId and status are required' });
    }
    
    const response = await fetch(
      `${supabaseUrl}/rest/v1/content_queue?id=eq.${postId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ 
          status: status,
          updated_at: new Date().toISOString()
        })
      }
    );

    if (response.ok) {
      return res.json({ success: true, message: `Post status updated to ${status}` });
    } else {
      const errorText = await response.text();
      throw new Error(`Failed to update post: ${errorText}`);
    }

  } catch (error) {
    console.error('Post status update error:', error);
    return res.status(500).json({ error: 'Failed to update post status' });
  }
});

// API endpoint to approve/reject posts (legacy)
app.post('/api/posts/:id/:action', async (req, res) => {
  try {
    const { id, action } = req.params;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase not configured");
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    
    const response = await fetch(
      `${supabaseUrl}/rest/v1/content_queue?id=eq.${id}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ status: newStatus })
      }
    );

    if (response.ok) {
      res.json({ success: true, message: `Post ${action}d successfully` });
    } else {
      throw new Error('Failed to update post');
    }

  } catch (error) {
    console.error('Post update error:', error);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

const server = app.listen(PORT, () => {
  console.log(`🎯 XlochaGOS Dashboard running at http://localhost:${PORT}`);
  console.log(`📊 View your data at: http://localhost:${PORT}`);
  console.log(`🔄 Server is running... Press Ctrl+C to stop`);
});

// Keep the process alive
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down dashboard server...');
  server.close(() => {
    console.log('✅ Dashboard server stopped');
    process.exit(0);
  });
});

// Handle server errors
server.on('error', (error: any) => {
  console.error('❌ Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Try a different port.`);
  }
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
