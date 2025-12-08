import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import yaml from 'yaml';

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

// CORS support for React dev server - MUST be before other middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

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
      fetch(`${supabaseUrl}/rest/v1/content_queue?select=*&order=created_at.desc&limit=50`, {
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey }
      }),
      fetch(`${supabaseUrl}/rest/v1/image_generation_logs?order=created_at.desc&limit=30`, {
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey }
      }),
      fetch(`${supabaseUrl}/rest/v1/agent_execution_logs?order=created_at.desc&limit=20`, {
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey }
      })
    ]);

    // Check responses
    if (!queueRes.ok) {
      console.error('Failed to fetch queue:', queueRes.status, await queueRes.text());
    }

    const [intelligence, research, queue, images, logs] = await Promise.all([
      intelligenceRes.json(),
      researchRes.json(),
      queueRes.json(),
      imagesRes.json(),
      logsRes.json()
    ]) as [any[], any[], any[], any[], any[]];

    // Debug logging
    console.log('[API] Dashboard data fetched:', {
      queueCount: queue.length,
      queueStatuses: [...new Set(queue.map((p: any) => p.status))],
      queueWithMetadata: queue.filter((p: any) => p.metadata).length,
      sampleQueueItem: queue[0] ? {
        id: queue[0].id,
        status: queue[0].status,
        hasMetadata: !!queue[0].metadata,
        metadataType: typeof queue[0].metadata,
        agent: queue[0].created_by_agent
      } : null
    });

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

    // Fetch accounts from config files
    const accounts: any[] = [];
    
    try {
      // Get system accounts (from accounts.yaml)
      const configDir = fs.existsSync(path.join(process.cwd(), 'config'))
        ? path.join(process.cwd(), 'config')
        : path.join(process.cwd(), 'mvp', 'config');
      
      console.log(`[API] Looking for config files in: ${configDir}`);
      console.log(`[API] process.cwd() = ${process.cwd()}`);
      console.log(`[API] Config dir exists: ${fs.existsSync(configDir)}`);
      
      const accountsPath = path.join(configDir, 'accounts.yaml');
      console.log(`[API] Checking for accounts.yaml at: ${accountsPath}`);
      console.log(`[API] accounts.yaml exists: ${fs.existsSync(accountsPath)}`);
      
      if (fs.existsSync(accountsPath)) {
        const accountsFile = fs.readFileSync(accountsPath, 'utf8');
        const accountsConfig = yaml.parse(accountsFile);
        
        console.log(`[API] Parsed accounts.yaml, has accounts: ${!!accountsConfig.accounts}, count: ${accountsConfig.accounts?.length || 0}`);
        console.log(`[API] Has research_monitoring: ${!!accountsConfig.research_monitoring}`);
        console.log(`[API] Has research_monitoring.target_accounts: ${!!accountsConfig.research_monitoring?.target_accounts}, count: ${accountsConfig.research_monitoring?.target_accounts?.length || 0}`);
        
        // Add system accounts
        if (accountsConfig.accounts) {
          accountsConfig.accounts.forEach((acc: any, idx: number) => {
            if (acc.active) {
              accounts.push({
                id: `sys${idx + 1}`,
                handle: acc.handle,
                type: 'system',
                status: acc.active ? 'active' : 'paused',
                last_active: 'Just now',
                stat_metric: `PRIORITY_${acc.priority || idx + 1}`
              });
            }
          });
        }
        
        // Add intelligence gathering accounts (from intelligence_gathering.target_accounts)
        if (accountsConfig.intelligence_gathering?.target_accounts) {
          accountsConfig.intelligence_gathering.target_accounts.forEach((handle: string, idx: number) => {
            accounts.push({
              id: `intel${idx + 1}`,
              handle: handle,
              type: 'intelligence',
              status: 'active',
              last_active: '5m ago',
              stat_metric: 'INTEL_PRIME'
            });
          });
          console.log(`[API] Loaded ${accountsConfig.intelligence_gathering.target_accounts.length} intelligence gathering accounts from intelligence_gathering.target_accounts`);
        } else {
          console.warn(`[API] No intelligence_gathering.target_accounts found in accounts.yaml`);
        }
        
        // Add premium source accounts (from research_monitoring.target_accounts)
        // PREMIUM_SOURCES includes @bankrbot, @trylimitless, @wallchain_xyz
        if (accountsConfig.research_monitoring?.target_accounts) {
          accountsConfig.research_monitoring.target_accounts.forEach((handle: string, idx: number) => {
            accounts.push({
              id: `src${idx + 1}`,
              handle: handle,
              type: 'source',
              status: 'active',
              last_active: '5m ago',
              stat_metric: 'SIGNAL_PRIME'
            });
          });
          console.log(`[API] Loaded ${accountsConfig.research_monitoring.target_accounts.length} premium source accounts from research_monitoring.target_accounts`);
        } else {
          console.warn(`[API] No research_monitoring.target_accounts found in accounts.yaml`);
        }
      } else {
        console.error(`[API] accounts.yaml not found at: ${accountsPath}`);
      }
      
      // Get target accounts (from target-accounts.yaml)
      // Include ALL accounts, even those with posts_to_generate: 0
      const targetAccountsPath = path.join(configDir, 'target-accounts.yaml');
      console.log(`[API] Checking for target-accounts.yaml at: ${targetAccountsPath}`);
      console.log(`[API] target-accounts.yaml exists: ${fs.existsSync(targetAccountsPath)}`);
      
      if (fs.existsSync(targetAccountsPath)) {
        const targetAccountsFile = fs.readFileSync(targetAccountsPath, 'utf8');
        const targetAccountsConfig = yaml.parse(targetAccountsFile);
        
        console.log(`[API] Parsed target-accounts.yaml, has target_accounts: ${!!targetAccountsConfig.target_accounts}, count: ${targetAccountsConfig.target_accounts?.length || 0}`);
        
        if (targetAccountsConfig.target_accounts) {
          targetAccountsConfig.target_accounts.forEach((acc: any, idx: number) => {
            // Include all accounts regardless of enabled status
            accounts.push({
              id: `t${idx + 1}`,
              handle: acc.handle,
              type: 'target',
              status: acc.enabled !== false ? 'active' : 'paused',
              last_active: '1h ago',
              stat_metric: acc.posts_to_generate > 0 ? 'ACTIVE_GEN' : 'MONITOR_ONLY',
              posts_to_generate: acc.posts_to_generate ?? 0,
              enabled: acc.enabled !== false
            });
          });
          console.log(`[API] Loaded ${targetAccountsConfig.target_accounts.length} target accounts from target-accounts.yaml`);
        }
      } else {
        console.warn(`[API] target-accounts.yaml not found at: ${targetAccountsPath}`);
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
    }

    // Debug logging for accounts
    console.log(`[API] Total accounts loaded: ${accounts.length}`, {
      system: accounts.filter((a: any) => a.type === 'system').length,
      source: accounts.filter((a: any) => a.type === 'source').length,
      target: accounts.filter((a: any) => a.type === 'target').length
    });

    // Get response triggers from monitoring.trigger_mentions
    let responseTriggers: string[] = [];
    try {
      const accountsPath = path.join(
        fs.existsSync(path.join(process.cwd(), 'config'))
          ? path.join(process.cwd(), 'config')
          : path.join(process.cwd(), 'mvp', 'config'),
        'accounts.yaml'
      );
      if (fs.existsSync(accountsPath)) {
        const accountsFile = fs.readFileSync(accountsPath, 'utf8');
        const accountsConfig = yaml.parse(accountsFile);
        responseTriggers = accountsConfig.monitoring?.trigger_mentions || [];
        console.log(`[API] Loaded ${responseTriggers.length} response triggers:`, responseTriggers);
      } else {
        console.warn(`[API] accounts.yaml not found at: ${accountsPath}`);
      }
    } catch (error) {
      console.error('Error loading response triggers:', error);
    }

    // Get hunting VIPs from hunter.yaml (if exists)
    let huntingVips: string[] = [];
    try {
      const configDir = fs.existsSync(path.join(process.cwd(), 'config'))
        ? path.join(process.cwd(), 'config')
        : path.join(process.cwd(), 'mvp', 'config');
      const hunterPath = path.join(configDir, 'hunter.yaml');
      if (fs.existsSync(hunterPath)) {
        const hunterFile = fs.readFileSync(hunterPath, 'utf8');
        const hunterConfig = yaml.parse(hunterFile);
        huntingVips = hunterConfig.vip_handles || [];
        console.log(`[API] Loaded ${huntingVips.length} hunting VIPs:`, huntingVips);
      } else {
        console.log(`[API] hunter.yaml not found at: ${hunterPath} - hunting VIPs will be empty`);
      }
    } catch (error) {
      console.error('Error loading hunting VIPs:', error);
    }

    res.json({
      intelligence,
      research,
      queue,
      images,
      logs,
      stats,
      accounts,
      responseTriggers,
      huntingVips,
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

// API endpoint to fetch accounts
app.get('/api/accounts', async (req, res) => {
  try {
    const accounts: any[] = [];
    
    // Get system accounts (from accounts.yaml)
    const configDir = fs.existsSync(path.join(process.cwd(), 'config'))
      ? path.join(process.cwd(), 'config')
      : path.join(process.cwd(), 'mvp', 'config');
    
    console.log(`[API GET /api/accounts] Looking for config files in: ${configDir}`);
    console.log(`[API GET /api/accounts] process.cwd() = ${process.cwd()}`);
    
    const accountsPath = path.join(configDir, 'accounts.yaml');
    console.log(`[API GET /api/accounts] Checking for accounts.yaml at: ${accountsPath}`);
    console.log(`[API GET /api/accounts] accounts.yaml exists: ${fs.existsSync(accountsPath)}`);
    
    if (fs.existsSync(accountsPath)) {
      const accountsFile = fs.readFileSync(accountsPath, 'utf8');
      const accountsConfig = yaml.parse(accountsFile);
      
      console.log(`[API GET /api/accounts] Parsed accounts.yaml, has accounts: ${!!accountsConfig.accounts}, count: ${accountsConfig.accounts?.length || 0}`);
      console.log(`[API GET /api/accounts] Has research_monitoring.target_accounts: ${!!accountsConfig.research_monitoring?.target_accounts}, count: ${accountsConfig.research_monitoring?.target_accounts?.length || 0}`);
      
      // Add system accounts
      if (accountsConfig.accounts) {
        accountsConfig.accounts.forEach((acc: any, idx: number) => {
          if (acc.active) {
            accounts.push({
              id: `sys${idx + 1}`,
              handle: acc.handle,
              type: 'system',
              status: acc.active ? 'active' : 'paused',
              last_active: 'Just now',
              stat_metric: `PRIORITY_${acc.priority || idx + 1}`
            });
          }
        });
        console.log(`[API GET /api/accounts] Added ${accounts.filter(a => a.type === 'system').length} system accounts`);
      }
      
      // Add intelligence gathering accounts (from intelligence_gathering.target_accounts)
      if (accountsConfig.intelligence_gathering?.target_accounts) {
        accountsConfig.intelligence_gathering.target_accounts.forEach((handle: string, idx: number) => {
          accounts.push({
            id: `intel${idx + 1}`,
            handle: handle,
            type: 'intelligence',
            status: 'active',
            last_active: '5m ago',
            stat_metric: 'INTEL_PRIME'
          });
        });
        console.log(`[API GET /api/accounts] Added ${accountsConfig.intelligence_gathering.target_accounts.length} intelligence gathering accounts`);
      }
      
      // Add premium source accounts (from research_monitoring.target_accounts)
      // PREMIUM_SOURCES includes @bankrbot, @trylimitless, @wallchain_xyz
      if (accountsConfig.research_monitoring?.target_accounts) {
        accountsConfig.research_monitoring.target_accounts.forEach((handle: string, idx: number) => {
          accounts.push({
            id: `src${idx + 1}`,
            handle: handle,
            type: 'source',
            status: 'active',
            last_active: '5m ago',
            stat_metric: 'SIGNAL_PRIME'
          });
        });
        console.log(`[API GET /api/accounts] Added ${accountsConfig.research_monitoring.target_accounts.length} premium source accounts`);
      }
    } else {
      console.error(`[API GET /api/accounts] accounts.yaml not found at: ${accountsPath}`);
    }
    
    // Get target accounts (from target-accounts.yaml)
    // Include ALL accounts, even those with posts_to_generate: 0
    const targetAccountsPath = path.join(configDir, 'target-accounts.yaml');
    console.log(`[API GET /api/accounts] Checking for target-accounts.yaml at: ${targetAccountsPath}`);
    console.log(`[API GET /api/accounts] target-accounts.yaml exists: ${fs.existsSync(targetAccountsPath)}`);
    
    if (fs.existsSync(targetAccountsPath)) {
      const targetAccountsFile = fs.readFileSync(targetAccountsPath, 'utf8');
      const targetAccountsConfig = yaml.parse(targetAccountsFile);
      
      console.log(`[API GET /api/accounts] Parsed target-accounts.yaml, has target_accounts: ${!!targetAccountsConfig.target_accounts}, count: ${targetAccountsConfig.target_accounts?.length || 0}`);
      
      if (targetAccountsConfig.target_accounts) {
        targetAccountsConfig.target_accounts.forEach((acc: any, idx: number) => {
          // Include all accounts regardless of enabled status
          accounts.push({
            id: `t${idx + 1}`,
            handle: acc.handle,
            type: 'target',
            status: acc.enabled !== false ? 'active' : 'paused',
            last_active: '1h ago',
            stat_metric: acc.posts_to_generate > 0 ? 'ACTIVE_GEN' : 'MONITOR_ONLY'
          });
        });
        console.log(`[API GET /api/accounts] Added ${targetAccountsConfig.target_accounts.length} target accounts`);
      }
    } else {
      console.warn(`[API GET /api/accounts] target-accounts.yaml not found at: ${targetAccountsPath}`);
    }
    
    console.log(`[API GET /api/accounts] Returning ${accounts.length} total accounts`);
    return res.json(accounts);
  } catch (error) {
    console.error('Fetch accounts error:', error);
    return res.status(500).json({ error: `Failed to fetch accounts: ${error instanceof Error ? error.message : 'Unknown error'}` });
  }
});

// API endpoint to add accounts
app.post('/api/accounts', async (req, res) => {
  try {
    const { handle, type } = req.body;
    
    if (!handle || !type) {
      return res.status(400).json({ error: 'handle and type are required' });
    }

    if (type !== 'source' && type !== 'target' && type !== 'intelligence') {
      return res.status(400).json({ error: 'type must be "source", "target", or "intelligence"' });
    }

    // Normalize handle (ensure it starts with @)
    const normalizedHandle = handle.trim().startsWith('@') ? handle.trim() : `@${handle.trim()}`;

    // Determine config file path
    const configDir = fs.existsSync(path.join(process.cwd(), 'config'))
      ? path.join(process.cwd(), 'config')
      : path.join(process.cwd(), 'mvp', 'config');
    
    if (type === 'target') {
      // Add to target-accounts.yaml
      const configPath = path.join(configDir, 'target-accounts.yaml');
      
      if (!fs.existsSync(configPath)) {
        return res.status(404).json({ error: 'target-accounts.yaml not found' });
      }

      const configFile = fs.readFileSync(configPath, 'utf8');
      const config = yaml.parse(configFile);

      // Check if account already exists
      const existingAccounts = config.target_accounts || [];
      if (existingAccounts.some((acc: any) => acc.handle?.toLowerCase() === normalizedHandle.toLowerCase())) {
        return res.status(400).json({ error: `Account ${normalizedHandle} already exists` });
      }

      // Add new account with default values
      const newAccount = {
        handle: normalizedHandle,
        category: 'airdrop_farming',
        niche: 'airdrop_farming',
        weight: 1.0,
        scrape_replies: true,
        scrape_limit: 30,
        enabled: true,
        note: `Added via dashboard`,
        url: `https://x.com/${normalizedHandle.replace('@', '')}`,
        posts_to_generate: 3
      };

      config.target_accounts = [...existingAccounts, newAccount];

      // Write back to file
      const yamlString = yaml.stringify(config, { 
        indent: 2,
        lineWidth: 0,
        defaultStringType: 'QUOTE_DOUBLE'
      });
      fs.writeFileSync(configPath, yamlString, 'utf8');

      console.log(`✅ Added target account: ${normalizedHandle}`);
      return res.json({ success: true, message: `Successfully added target account ${normalizedHandle}` });

    } else if (type === 'intelligence') {
      // For intelligence gathering accounts, add to intelligence_gathering.target_accounts in accounts.yaml
      const configPath = path.join(configDir, 'accounts.yaml');
      
      if (!fs.existsSync(configPath)) {
        return res.status(404).json({ error: 'accounts.yaml not found' });
      }

      const configFile = fs.readFileSync(configPath, 'utf8');
      const config = yaml.parse(configFile);

      // Initialize intelligence_gathering if it doesn't exist
      if (!config.intelligence_gathering) {
        config.intelligence_gathering = { enabled: false, target_accounts: [] };
      }

      // Check if account already exists
      const targetAccounts = config.intelligence_gathering.target_accounts || [];
      if (targetAccounts.includes(normalizedHandle)) {
        return res.status(400).json({ error: `Intelligence account ${normalizedHandle} already exists` });
      }

      // Add to intelligence_gathering target_accounts
      config.intelligence_gathering.target_accounts = [...targetAccounts, normalizedHandle];

      // Write back to file
      const yamlString = yaml.stringify(config, { 
        indent: 2,
        lineWidth: 0,
        defaultStringType: 'QUOTE_DOUBLE'
      });
      fs.writeFileSync(configPath, yamlString, 'utf8');

      console.log(`✅ Added intelligence gathering account: ${normalizedHandle}`);
      return res.json({ success: true, message: `Successfully added intelligence gathering account ${normalizedHandle}` });

    } else {
      // For source accounts, we'll add to research_monitoring.target_accounts in accounts.yaml
      const configPath = path.join(configDir, 'accounts.yaml');
      
      if (!fs.existsSync(configPath)) {
        return res.status(404).json({ error: 'accounts.yaml not found' });
      }

      const configFile = fs.readFileSync(configPath, 'utf8');
      const config = yaml.parse(configFile);

      // Initialize research_monitoring if it doesn't exist
      if (!config.research_monitoring) {
        config.research_monitoring = { enabled: false, target_accounts: [] };
      }

      // Check if account already exists in research_monitoring
      const targetAccounts = config.research_monitoring.target_accounts || [];
      if (targetAccounts.includes(normalizedHandle)) {
        return res.status(400).json({ error: `Research account ${normalizedHandle} already exists` });
      }

      // Add to research_monitoring target_accounts
      config.research_monitoring.target_accounts = [...targetAccounts, normalizedHandle];

      // Write back to file
      const yamlString = yaml.stringify(config, { 
        indent: 2,
        lineWidth: 0,
        defaultStringType: 'QUOTE_DOUBLE'
      });
      fs.writeFileSync(configPath, yamlString, 'utf8');

      console.log(`✅ Added research account: ${normalizedHandle}`);
      return res.json({ success: true, message: `Successfully added research account ${normalizedHandle}` });
    }

  } catch (error) {
    console.error('Add account error:', error);
    return res.status(500).json({ error: `Failed to add account: ${error instanceof Error ? error.message : 'Unknown error'}` });
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
