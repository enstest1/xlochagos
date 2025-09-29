# Supabase Memory System Setup Guide

## 🧠 AI Agent Memory Integration

This guide will help you set up Supabase for the AI agent memory system that enables:
- Cross-account learning and intelligence sharing
- Advanced pattern recognition and behavioral analysis
- Semantic search and content recommendations
- Real-time memory synchronization between agents

## 📋 Prerequisites

1. **Supabase Account**: Sign up at [supabase.com](https://supabase.com) (free tier available)
2. **Project Created**: Create a new Supabase project

## 🚀 Setup Steps

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Choose your organization
4. Enter project details:
   - **Name**: `cypherswarm-ai-memory`
   - **Database Password**: Generate a strong password (save this!)
   - **Region**: Choose closest to your location
5. Click "Create new project"
6. Wait for project to be ready (2-3 minutes)

### Step 2: Get API Keys

1. In your Supabase dashboard, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (starts with `https://`)
   - **anon public** key (starts with `eyJ`)
   - **service_role** key (starts with `eyJ`) - **Keep this secret!**

### Step 3: Create Database Schema

1. In Supabase dashboard, go to **SQL Editor**
2. Create a new query
3. Copy and paste the contents of `supabase/schema.sql`
4. Click "Run" to execute the schema creation

### Step 4: Configure Environment Variables

Add these to your `.env` file:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_MEMORY_ENABLED=true
```

**⚠️ Important**: 
- Replace the example keys with your actual keys
- Never commit the service role key to version control
- The service role key has full database access

### Step 5: Test Connection

Run the health check to verify everything is working:

```bash
npm run dev -- --test-memory
```

## 🗄️ Database Schema Overview

### Tables Created:

1. **`agent_memory`** - Core memory storage for all agent interactions
2. **`content_performance`** - Tracks content performance metrics
3. **`learning_patterns`** - Stores discovered behavioral patterns
4. **`cross_account_intelligence`** - Shared insights between accounts
5. **`agent_personalities`** - Evolving personality traits per account

### Key Features:

- **Row Level Security (RLS)** - Secure multi-tenant data access
- **JSONB Storage** - Flexible data structures for complex memories
- **Automatic Timestamps** - Tracks creation and update times
- **Performance Indexes** - Optimized for fast queries
- **Data Cleanup** - Automatic removal of old data

## 🔧 Memory System Features

### What Gets Stored:

1. **Interaction Memories**
   - Likes, comments, reposts, follows
   - Success/failure rates
   - Response times and engagement metrics

2. **Engagement Patterns**
   - Content type performance
   - Optimal posting times
   - Audience response patterns

3. **Content Preferences**
   - Successful topics and themes
   - Preferred content styles
   - High-performing patterns

4. **Behavioral Data**
   - Posting frequency patterns
   - Response timing preferences
   - Account-specific behaviors

5. **Learning Outcomes**
   - What worked vs. what didn't
   - Performance improvements over time
   - Cross-account insights

### Memory Duration:

- **Short-term** (30 days): Recent interactions, immediate learning
- **Medium-term** (6 months): Pattern recognition, behavioral trends
- **Long-term** (2+ years): Deep learning, personality development
- **Semantic search**: Vector embeddings for instant relevance

## 🚀 Usage Examples

### Store an Interaction:
```typescript
await memoryService.storeInteraction('@aplep333', {
  post_id: '1234567890',
  action: 'comment',
  target_account: '@pelpa333',
  success: true,
  engagement_received: 5,
  response_time_ms: 1200
});
```

### Get Relevant Memories:
```typescript
const memories = await memoryService.getRelevantMemories(
  '@aplep333', 
  'defi content', 
  'engagement',
  10
);
```

### Get Optimal Posting Times:
```typescript
const optimalTimes = await memoryService.getOptimalTiming('@aplep333');
// Returns: [{ hour: 14, performance: 0.85 }, { hour: 9, performance: 0.78 }]
```

### Get Content Preferences:
```typescript
const preferences = await memoryService.getContentPreferences('@aplep333');
// Returns: { topics: ['defi', 'ethereum'], content_styles: ['analytical', 'informative'] }
```

## 🔒 Security & Privacy

### Data Protection:
- **Row Level Security** - Each account can only access its own data
- **Encrypted Storage** - All data encrypted at rest
- **Secure API Keys** - Service role key never exposed to client
- **Data Retention** - Automatic cleanup of old data

### Privacy Controls:
- **Account Isolation** - Memories are account-specific by default
- **Cross-Account Sharing** - Opt-in only, with privacy controls
- **Data Minimization** - Only necessary data is stored
- **Audit Trail** - All access is logged

## 📊 Monitoring & Analytics

### Built-in Views:
- **`recent_memories`** - Last 30 days of memories
- **`top_performing_content`** - Best performing content types
- **`agent_insights`** - Personality and preference summaries

### Health Monitoring:
```typescript
const health = await memoryService.healthCheck();
// Returns: { status: 'healthy' | 'unhealthy', details: {...} }
```

## 🛠️ Maintenance

### Data Cleanup:
The system automatically cleans up old data, but you can also run manual cleanup:

```sql
SELECT cleanup_old_memory_data();
```

### Performance Monitoring:
Monitor query performance in the Supabase dashboard under **Reports** → **Database**

### Backup:
Supabase automatically handles backups, but you can also export data:
```sql
-- Export agent memories
COPY agent_memory TO '/tmp/agent_memory_backup.csv' WITH CSV HEADER;
```

## 🚨 Troubleshooting

### Common Issues:

1. **Connection Failed**
   - Check SUPABASE_URL and keys are correct
   - Verify project is not paused (free tier limitation)

2. **Permission Denied**
   - Ensure service role key is used (not anon key)
   - Check RLS policies are set up correctly

3. **Schema Errors**
   - Re-run the schema.sql file
   - Check for existing conflicting tables

### Debug Mode:
Enable debug logging to see detailed memory operations:
```bash
LOG_LEVEL=debug npm run dev
```

## 🎯 Next Steps

Once Supabase is set up:

1. **Test the connection** with `npm run dev -- --test-memory`
2. **Enable memory storage** by setting `SUPABASE_MEMORY_ENABLED=true`
3. **Start building AI personalities** for each account
4. **Enable cross-account learning** between agents
5. **Add semantic search** with vector embeddings

The memory system will start learning immediately and improve over time as agents interact with content and users!


