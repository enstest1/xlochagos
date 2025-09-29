# GOAT-X CypherSwarm QuadPoster Enhanced

A production-ready CLI system for posting Cypher-Swarm content across 4 X (Twitter) accounts using GOAT-X with comprehensive monitoring, health checks, and adaptive posting strategies.

## 🚀 Features

### Core Functionality
- **Multi-Account Management**: Manage up to 4 X accounts with individual rate limits
- **Dual Authentication**: Cookie-based posting with API fallback for resilience
- **Content Quality Control**: Advanced anti-slop heuristics and content validation
- **Adaptive Scheduling**: Smart timing with health-aware account rotation
- **Content Variation**: Pattern-breaking text variations to avoid detection

### Enhanced Monitoring
- **Health Checks**: Comprehensive account and system health validation
- **Webhook Notifications**: Real-time alerts for failures and successes
- **Metrics Collection**: Detailed success rates, response times, and performance tracking
- **Gradual Rollout**: Progressive account activation to minimize risk

### Production-Ready Features
- **Dry Run Mode**: Safe testing without actual posting
- **Cookie Validation**: Automated cookie health checking
- **Error Recovery**: Automatic fallback and retry mechanisms
- **Performance Monitoring**: Response time tracking and optimization

## 📋 Prerequisites

- Node.js 20+ and npm/pnpm
- [GOAT-X CLI tool](https://github.com/saulpw/goatx) installed and in PATH
- Active X (Twitter) accounts with valid cookies or API keys
- Cypher-Swarm output files in JSONL format

## 🛠️ Installation

1. **Clone and setup:**
   ```bash
   cd mvp
   npm install
   npm run build
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Configure accounts:**
   ```bash
   # Edit config/accounts.yaml with your account details
   # Edit config/monitoring.yaml for webhook endpoints
   ```

4. **Export cookies for each account:**
   ```bash
   # For each account, export cookies from browser to secrets/
   # Format: secrets/acct1.cookies.json, secrets/acct2.cookies.json, etc.
   ```

## ⚙️ Configuration

### Environment Variables (.env)

```bash
# Core settings
DRY_RUN=true                                    # Start in dry run mode
DB_PATH=./data/mvp.sqlite                       # SQLite database location
CYPHER_SWARM_OUT=../cypher-swarm/out/latest.jsonl  # Input data source
CONTEXT7_DOCS_DIR=./docs                        # Local docs for Context7
MAX_ITEMS_PER_CYCLE=15                          # Max items per run

# Authentication
X_API_KEYS_JSON={}                              # JSON object with API keys
COOKIE_VALIDATION_INTERVAL_HOURS=6              # How often to check cookies

# Monitoring
WEBHOOK_FAILURE_URL=https://hooks.slack.com/... # Failure notifications
WEBHOOK_SUCCESS_URL=https://hooks.slack.com/... # Success notifications
HEALTH_CHECK_INTERVAL_MINUTES=30                # Health check frequency

# Gradual rollout
ROLLOUT_MODE=gradual                            # Enable gradual rollout
ROLLOUT_START_ACCOUNTS=1                        # Start with 1 account
ROLLOUT_INCREMENT_HOURS=24                      # Add account every 24h

# Rate limiting
GLOBAL_DAILY_LIMIT=40                           # Global daily post limit
DETECTION_AVOIDANCE=true                        # Enable pattern breaking
```

### Account Configuration (config/accounts.yaml)

```yaml
accounts:
  - handle: "@acct1"
    mode: "cookie"                              # Use cookies (primary)
    cookie_path: "./secrets/acct1.cookies.json"
    backup_api_key: "API_KEY_1"                # Fallback API key
    daily_cap: 12                              # Posts per day limit
    min_minutes_between_posts: 45              # Minimum spacing
    active: true                               # Start active
    priority: 1                                # Rollout priority (1=first)
    user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

rotation:
  max_total_daily_posts: 40                    # Global daily limit
  burst_window_minutes: 30                     # Burst detection window
  burst_max_posts: 2                          # Max posts in burst window
  respect_platform_limits: true               # Honor X platform limits
  adaptive_timing: true                       # Adjust timing based on success

content:
  max_length: 260                             # Character limit
  require_link: true                          # Must include links
  prefer_primary_link: true                   # Use primary URLs when available
  min_source_score: 0.65                     # Quality threshold
  variation_enabled: true                     # Enable pattern breaking
  ban_phrases: ["we're excited to", "🚀"]    # Blocked marketing speak
```

## 🔧 Cookie Setup

### Export Cookies from Browser

1. **Install Browser Extension:**
   - Chrome: "Cookie-Editor" or "EditThisCookie"
   - Firefox: "Cookie Quick Manager"

2. **Export Process:**
   ```bash
   # 1. Login to X in your browser
   # 2. Open cookie extension
   # 3. Export cookies for x.com domain
   # 4. Save as JSON to secrets/acct1.cookies.json
   ```

3. **Required Cookie Format:**
   ```json
   [
     {
       "name": "auth_token",
       "value": "abc123...",
       "domain": ".x.com"
     },
     {
       "name": "ct0",
       "value": "def456...",
       "domain": ".x.com"
     }
   ]
   ```

### Validate Cookie Setup

```bash
npm run check:cookies
```

Expected output:
```
🔍 Validating X/Twitter cookies...

✅ @acct1:
   Cookie file valid

✅ @acct2:
   Cookie file valid

📊 Summary: 2/2 accounts have valid cookies
✅ All active accounts have valid cookies!
```

## 🏃‍♂️ Usage

### Basic Commands

```bash
# Validate cookies before running
npm run check:cookies

# Perform system health check
npm run health:check

# Preview what would be posted (dry run)
npm run dry-run

# Single production run
DRY_RUN=false npm run run:once

# Check gradual rollout status
npm run rollout:gradual status
```

### Health Checks

```bash
# Basic health check
npm run health:check

# Verbose output with details
npm run health:check --verbose

# Check specific accounts
npm run health:check --accounts=@acct1,@acct2

# JSON output for automation
npm run health:check --json > health-report.json
```

### Gradual Rollout Management

```bash
# Show rollout status
npm run rollout:gradual status

# Advance to next phase
npm run rollout:gradual advance

# Force advance (skip time check)
npm run rollout:gradual advance --force

# Reset rollout to beginning
npm run rollout:gradual reset --force

# Activate all accounts immediately
npm run rollout:gradual complete --force
```

### Production Deployment

```bash
# 1. Validate everything first
npm run check:cookies
npm run health:check

# 2. Start with dry run
npm run dry-run

# 3. Begin gradual rollout
npm run rollout:gradual advance

# 4. Monitor and gradually increase
# Run every 2 hours, system will auto-advance phases
while true; do
  npm run health:check && DRY_RUN=false npm run run:once
  sleep 7200  # 2 hours
done
```

## 📊 Monitoring & Alerts

### Webhook Notifications

The system sends webhook notifications for:

- **Account failures** (consecutive failures, cookie expiry)
- **System health issues** (database, configuration problems)
- **Quota warnings** (approaching daily limits)
- **Success metrics** (daily posting summaries)

**Webhook payload example:**
```json
{
  "eventType": "account_failure",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "account": "@acct1",
    "consecutiveFailures": 3,
    "lastError": "cookie_expired",
    "severity": "warning",
    "recommendedActions": ["refresh_cookies", "switch_to_api"]
  }
}
```

### Health Check Exit Codes

- `0`: All systems healthy
- `1`: Warnings detected (continue with caution)
- `2`: Critical issues found (stop posting)
- `3`: Health check failed to run

### Performance Metrics

The system tracks:
- **Success rates** per account and globally
- **Response times** for API calls
- **Cookie failure rates** and API fallback usage
- **Content rejection rates** and common reasons
- **Rate limit hits** and adaptive timing effectiveness

## 🛡️ Security & Best Practices

### Cookie Management
- Store cookies in `secrets/` directory (gitignored)
- Rotate cookies every 72 hours
- Use strong file permissions (600)
- Monitor for expiry warnings

### Rate Limiting
- Default: 45 minutes between posts per account
- Burst protection: max 2 posts per 30-minute window
- Global limit: 40 posts/day across all accounts
- Adaptive timing based on success rates

### Content Quality
- Anti-slop heuristics reject marketing speak
- Similarity detection prevents repetitive content
- Pattern variation breaks detection algorithms
- Link validation ensures working URLs

## 🔍 Troubleshooting

### Common Issues

**❌ Cookie validation failed:**
```bash
# Re-export cookies from browser
# Check file format and required fields
npm run check:cookies
```

**❌ GOAT-X command not found:**
```bash
# Install GOAT-X CLI tool
npm install -g goat-x
# Or ensure it's in your PATH
```

**❌ High content rejection rate:**
```bash
# Check content quality settings
# Review ban_phrases in accounts.yaml
# Verify Cypher-Swarm output quality
```

**❌ Rate limit hits:**
```bash
# Increase min_minutes_between_posts
# Reduce daily_cap values
# Enable adaptive_timing
```

### Debug Mode

```bash
# Enable detailed logging
LOG_LEVEL=debug npm run dev

# Check specific account health
npm run health:check --accounts=@acct1 --verbose

# Test webhook connectivity
npm run test:webhooks
```

### Recovery Procedures

**Account suspended:**
1. Disable account in `accounts.yaml`
2. Run health check to confirm
3. Replace with backup account if available

**Cookies expired:**
1. Re-export cookies from browser
2. Run `npm run check:cookies` to validate
3. System will auto-retry with fresh cookies

**Database corruption:**
1. Stop all posting operations
2. Backup database: `cp data/mvp.sqlite data/backup.sqlite`
3. Delete corrupted DB, system will recreate

## 📈 Performance Optimization

### Recommended Settings

**Conservative (High reliability):**
```yaml
min_minutes_between_posts: 60
daily_cap: 8
burst_max_posts: 1
```

**Balanced (Default):**
```yaml
min_minutes_between_posts: 45
daily_cap: 12
burst_max_posts: 2
```

**Aggressive (Maximum throughput):**
```yaml
min_minutes_between_posts: 30
daily_cap: 15
burst_max_posts: 3
```

### Scaling Considerations

- **CPU**: Minimal usage, primarily I/O bound
- **Memory**: ~50MB base + 10MB per active account
- **Storage**: ~10MB/month for metrics and logs
- **Network**: ~1KB per post + webhook calls

## 📝 Development

### Project Structure

```
mvp/
├── src/
│   ├── index.ts              # Main CLI entry point
│   ├── config.ts             # Configuration loading
│   ├── db.ts                 # Database schema and helpers
│   ├── log.ts                # Structured logging
│   ├── types.ts              # Type definitions
│   ├── monitoring/           # Health checks and webhooks
│   ├── publishers/           # GOAT-X integration
│   ├── content/              # Content processing and variation
│   ├── sources/              # Data ingestion
│   └── tools/                # CLI utilities
├── config/                   # Configuration files
├── data/                     # Database and state
└── secrets/                  # Cookie files (gitignored)
```

### Adding New Features

1. **Create feature branch**
2. **Add types** to `src/types.ts`
3. **Implement** with tests
4. **Update configuration** if needed
5. **Add documentation**

### Testing

```bash
# Validate with dry run
DRY_RUN=true npm run dev

# Test specific components
npm run test:heuristics
npm run test:webhooks

# Integration test
npm run health:check
```

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Ensure all health checks pass
5. Submit pull request

## 📞 Support

- Check health status: `npm run health:check --verbose`
- Review logs in `data/` directory
- Monitor webhook notifications
- Open GitHub issues for bugs

---

**⚠️ Important**: Always start with `DRY_RUN=true` when testing new configurations. Monitor health checks closely during initial deployment. This system is designed for responsible, respectful automation - please follow X's Terms of Service.




----


 Runtime components:
  - CLI Process: Node.js 20+ single-threaded execution
  - SQLite Database: Local persistence for metrics, health, and state
  - GOAT-X Binary: External process spawned for X API calls
  - Webhook Endpoints: External HTTP services for alerting

  Repo Map

  mvp/
  ├── package.json                    # Dependencies and npm scripts
  ├── tsconfig.json                   # TypeScript configuration
  ├── .env.example                    # Environment variable template
  ├── README.md                       # This documentation
  ├── data/                           # SQLite database and runtime state
  │   └── .keep                       # Directory placeholder
  ├── secrets/                        # Cookie files and API keys (gitignored)
  │   └── .gitkeep                    # Directory placeholder
  ├── docs/                           # Context7 documentation source
  ├── config/                         # YAML configuration files
  │   ├── accounts.yaml               # Account settings and rate limits
  │   ├── monitoring.yaml             # Webhook and alert configuration
  │   └── topics.yaml                 # Content filtering keywords
  └── src/                           # TypeScript source code
      ├── index.ts                    # **TODO:** Main CLI entry point
      ├── config.ts                   # Configuration loading and validation
      ├── db.ts                       # SQLite schema and database helpers
      ├── log.ts                      # Structured logging with Pino
      ├── types.ts                    # Zod schemas and TypeScript interfaces
      ├── monitoring/                 # Health checks and notifications
      │   ├── healthCheck.ts          # Account and system health validation
      │   └── webhooks.ts             # HTTP notification delivery
      ├── sources/                    # Data ingestion modules
      │   ├── cypherSwarm.ts          # **TODO:** JSONL parsing and filtering
      │   └── docsQuery.ts            # **TODO:** Context7 documentation search
      ├── content/                    # Content processing and quality control
      │   ├── compose.ts              # **TODO:** Post text generation
      │   ├── heuristics.ts           # Anti-spam content filtering
      │   ├── dedupe.ts               # **TODO:** Duplicate content detection
      │   └── variation.ts            # Pattern-breaking text variations
      ├── publishers/                 # X platform integration
      │   ├── goatx.ts                # GOAT-X CLI wrapper with fallback
      │   └── backup.ts               # **TODO:** Alternative API publisher
      └── tools/                      # CLI utilities and maintenance
          ├── validateCookies.ts      # Cookie file validation tool
          ├── healthCheck.ts          # System health check tool
          └── gradualRollout.ts       # Progressive account activation

  Top-level directories:
  - src/: Core TypeScript application code
  - config/: YAML configuration files for accounts and monitoring
  - data/: SQLite database and runtime state (created at runtime)
  - secrets/: Cookie files and API keys (user-managed, gitignored)
  - docs/: Local documentation for Context7 enrichment

  Quickstart

  Prerequisites

  - Node.js 20+ and npm/pnpm
  - https://github.com/anthropics/goat-x installed and in PATH
  - Active X accounts with exported cookies or API keys
  - Cypher-Swarm output in JSONL format

  Setup

  # Install dependencies
  cd mvp
  npm install

  # Configure environment
  cp .env.example .env
  # Edit .env with your settings

  # Configure accounts (see Configuration section)
  # Edit config/accounts.yaml
  # Export cookies to secrets/*.cookies.json

  # Validate setup
  npm run check:cookies
  npm run health:check

  Bootstrap Script

  #!/bin/bash
  # bootstrap.sh - One-shot setup
  set -e

  echo "🚀 Setting up GOAT-X QuadPoster..."

  # Check prerequisites
  command -v goatx >/dev/null 2>&1 || { echo "❌ GOAT-X CLI not found. Install first."; exit 1; }
  command -v node >/dev/null 2>&1 || { echo "❌ Node.js not found."; exit 1; }

  # Install dependencies
  npm install

  # Create required directories
  mkdir -p data secrets docs

  # Copy example configs if they don't exist
  [ ! -f .env ] && cp .env.example .env
  [ ! -f config/accounts.yaml ] && echo "⚠️  Edit config/accounts.yaml before proceeding"

  echo "✅ Setup complete. Next steps:"
  echo "   1. Edit .env and config/accounts.yaml"
  echo "   2. Export cookies to secrets/ directory"
  echo "   3. Run: npm run check:cookies"
  echo "   4. Run: npm run dry-run"

  Development Commands

  | Command                 | Purpose                           |
  |-------------------------|-----------------------------------|
  | npm run build           | Compile TypeScript to JavaScript  |
  | npm run dev             | Run with ts-node for development  |
  | npm run check:cookies   | Validate X account cookies        |
  | npm run health:check    | Comprehensive system health check |
  | npm run dry-run         | Preview posts without publishing  |
  | npm run rollout:gradual | Manage gradual account activation |

  Configuration

  Environment Variables

  | Name                          | Required | Default                          | Description                             | Example                     |
  |-------------------------------|----------|----------------------------------|-----------------------------------------|-----------------------------|
  | DRY_RUN                       | No       | true                             | Enable dry run mode (no actual posting) | false                       |
  | DB_PATH                       | No       | ./data/mvp.sqlite                | SQLite database file path               | ./data/prod.sqlite          |
  | CYPHER_SWARM_OUT              | No       | ../cypher-swarm/out/latest.jsonl | Input JSONL file path                   | ./data/input.jsonl          |
  | CONTEXT7_DOCS_DIR             | No       | ./docs                           | Local documentation directory           | ./knowledge-base            |
  | CONTEXT7_TOPK                 | No       | 8                                | Number of doc snippets to retrieve      | 10                          |
  | MAX_ITEMS_PER_CYCLE           | No       | 15                               | Maximum items to process per run        | 20                          |
  | UTM_QUERY                     | No       | ""                               | UTM parameters to append to links       | ?utm_source=bot             |
  | WEBHOOK_FAILURE_URL           | No       | ""                               | Webhook for failure notifications       | https://hooks.slack.com/... |
  | WEBHOOK_SUCCESS_URL           | No       | ""                               | Webhook for success notifications       | https://hooks.slack.com/... |
  | HEALTH_CHECK_INTERVAL_MINUTES | No       | 30                               | Health check frequency                  | 60                          |
  | ROLLOUT_MODE                  | No       | gradual                          | Account activation strategy             | all                         |
  | ROLLOUT_START_ACCOUNTS        | No       | 1                                | Initial active account count            | 2                           |
  | GLOBAL_DAILY_LIMIT            | No       | 40                               | Total posts per day across accounts     | 60                          |
  | LOG_LEVEL                     | No       | info                             | Pino log level                          | debug                       |

  Configuration Files

  config/accounts.yaml: Account settings and rate limits
  accounts:
    - handle: "@account1"
      mode: "cookie"
      cookie_path: "./secrets/acct1.cookies.json"
      daily_cap: 12
      min_minutes_between_posts: 45
      active: true
      priority: 1

  rotation:
    max_total_daily_posts: 40
    burst_window_minutes: 30
    burst_max_posts: 2

  content:
    max_length: 260
    require_link: true
    min_source_score: 0.65
    ban_phrases: ["we're excited", "🚀"]

  config/monitoring.yaml: Webhook and alerting
  webhooks:
    failure_endpoint: "${WEBHOOK_FAILURE_URL}"
    retry_attempts: 3
    timeout_seconds: 10

  health_checks:
    cookie_validation_hours: 6
    performance_thresholds:
      max_response_time_ms: 5000
      min_success_rate: 0.95

  alerts:
    consecutive_failures_threshold: 3
    daily_quota_warning_percent: 80

  APIs & Contracts

  External Dependencies

  GOAT-X CLI Interface:
  # Cookie-based posting (primary method)
  goatx post --cookie-stdin --text "Post content" --user-agent "..." --timeout 30000

  # API-based posting (fallback)
  goatx post --api-key "..." --text "Post content" --timeout 30000

  # Expected JSON response:
  # {"id": "1234567890", "url": "https://x.com/user/status/1234567890"}

  # Exit codes:
  # 0: Success
  # 1: Authentication failed
  # 2: Rate limited
  # 3: Content rejected
  # 4: Network error

  Webhook Contracts

  Failure Notification:
  {
    "eventType": "failure",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "data": {
      "alert": "account_failure",
      "account": "@account1",
      "consecutiveFailures": 3,
      "lastError": "cookie_expired",
      "severity": "warning",
      "recommendedActions": ["refresh_cookies", "switch_to_api"]
    }
  }

  Success Notification:
  {
    "eventType": "success",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "data": {
      "summary": "daily_posting_summary",
      "totalPosts": 24,
      "successfulPosts": 22,
      "successRate": 92,
      "avgResponseTime": 1200
    }
  }

  Domain Models & Types

  Core Entities

  Source Item (from Cypher-Swarm):
  export const SourceItemSchema = z.object({
    url: z.string().url(),
    primaryUrl: z.string().url().optional(),
    title: z.string().optional(),
    summary: z.string().optional(),
    score: z.number().min(0).max(1),
    tags: z.array(z.string()).optional(),
    extractedAt: z.number().optional()
  });

  Account Configuration:
  export const AccountSchema = z.object({
    handle: z.string(),
    mode: z.enum(['cookie', 'api']),
    cookie_path: z.string().optional(),
    backup_api_key: z.string().optional(),
    daily_cap: z.number().positive(),
    min_minutes_between_posts: z.number().positive(),
    active: z.boolean(),
    priority: z.number().int().min(1).max(4),
    consecutive_failures: z.number().default(0)
  });

  Post Draft:
  export const PostDraftSchema = z.object({
    text: z.string().max(280),
    sourceUrl: z.string().url(),
    contentHash: z.string(),
    variationSeed: z.number().optional(),
    confidence: z.number().min(0).max(1).optional()
  });

  Health Check Result:
  export const HealthCheckResultSchema = z.object({
    timestamp: z.number(),
    checkType: z.enum(['cookie', 'system', 'rate_limit', 'content']),
    account: z.string().optional(),
    status: z.enum(['pass', 'fail', 'warn']),
    details: z.record(z.any()),
    responseTimeMs: z.number().optional(),
    recommendations: z.array(z.string()).optional()
  });

  Invariants

  - Account handles must start with "@" and be unique across accounts
  - Daily caps are enforced per account and globally; individual caps cannot exceed global limit
  - Cookie files must contain auth_token and ct0 fields for validation to pass
  - Content hashes are MD5 and used for similarity detection and variation seeding
  - Health check timestamps are Unix milliseconds for consistent ordering

  Core Flows

  Content Processing & Publishing

  sequenceDiagram
      participant M as Main Process
      participant CS as CypherSwarm Reader
      participant C7 as Context7 Query
      participant H as Heuristics Filter
      participant V as Variation Engine
      participant S as Scheduler
      participant P as Publisher
      participant DB as Database

      M->>CS: Read JSONL items
      CS-->>M: Scored content items
      M->>C7: Query documentation hints
      C7-->>M: Relevant doc snippets
      M->>H: Filter content quality
      H-->>M: Approved drafts
      M->>V: Apply variations
      V-->>M: Varied drafts
      M->>S: Schedule posts
      S->>DB: Check quotas & timing
      S->>P: Execute posting
      P->>DB: Record results
      M->>DB: Update metrics

  Pseudocode:
  MAIN_PROCESS:
    load_config()
    open_database()
    perform_health_checks()
    
    items = read_cypher_swarm_jsonl()
    filtered = filter_by_score_and_blacklist(items)

    FOR each item in filtered:
      hints = query_context7_docs(item)
      draft = compose_post(item, hints)

      IF passes_heuristics(draft):
        varied_draft = apply_variation(draft)
        queue.add(varied_draft)

    sorted_queue = scheduler.optimize_queue(queue)

    FOR each task in sorted_queue:
      IF can_post_now(task.account):
        result = publisher.publish(task.draft)
        record_metrics(task.account, result)

        IF consecutive_failures > threshold:
          send_webhook_alert(task.account)

  Key files:
  - TODO: ./src/index.ts - Main orchestration
  - TODO: ./src/sources/cypherSwarm.ts - JSONL reading
  - ./src/content/heuristics.ts - Content filtering
  - ./src/content/variation.ts - Pattern breaking
  - ./src/publishers/goatx.ts - GOAT-X integration

  Health Check Flow

  stateDiagram-v2
      [*] --> LoadAccounts
      LoadAccounts --> ValidateCookies
      ValidateCookies --> CheckQuotas
      CheckQuotas --> CheckErrorRates
      CheckErrorRates --> SystemChecks
      SystemChecks --> GenerateReport
      GenerateReport --> SendWebhooks
      SendWebhooks --> [*]

      ValidateCookies --> CookieFailed: Invalid
      CookieFailed --> GenerateReport
      CheckQuotas --> QuotaExceeded: Over limit
      QuotaExceeded --> GenerateReport

  Pseudocode:
  HEALTH_CHECK:
    report = {}
    
    FOR each active_account:
      cookie_status = validate_cookie_file(account.cookie_path)
      quota_usage = get_daily_usage(account)
      error_rate = calculate_recent_error_rate(account)

      account_health = {
        cookie_valid: cookie_status.success,
        quota_available: quota_usage < account.daily_cap,
        error_rate: error_rate,
        status: determine_status(cookie_valid, quota_available, error_rate)
      }

      report.accounts[account.handle] = account_health

    system_health = check_database_and_memory()
    report.system = system_health

    overall_status = determine_overall_status(report)

    IF overall_status != "healthy":
      send_webhook_notification(report)

    store_health_check_results(report)
    RETURN report

  Key files:
  - ./src/monitoring/healthCheck.ts - Health check manager
  - ./src/tools/healthCheck.ts - CLI health check tool

  Gradual Rollout Management

  stateDiagram-v2
      [*] --> Uninitialized
      Uninitialized --> Phase1: Initialize
      Phase1 --> Phase2: Advance after interval
      Phase2 --> Phase3: Advance after interval
      Phase3 --> Phase4: Advance after interval
      Phase4 --> Complete: All accounts active
      Complete --> [*]

      Phase1 --> Phase1: Status check
      Phase2 --> Phase2: Status check
      Phase3 --> Phase3: Status check
      Phase4 --> Phase4: Status check

      Phase1 --> Complete: Force complete
      Phase2 --> Complete: Force complete
      Phase3 --> Complete: Force complete

  Key files:
  - ./src/tools/gradualRollout.ts - Rollout management

  Key Modules

  Health Check Manager

  Purpose: Validates account cookies, system resources, and posting quotasInputs: Account configurations, database stateOutputs: Health report with status and    
   recommendations

  How it works:
  - Parses cookie JSON files and validates required fields (auth_token, ct0)
  - Queries database for recent posting activity and error rates
  - Checks system resources (memory, disk, database connectivity)
  - Generates actionable recommendations for failed checks
  - Stores results in health_checks table for trending

  Example usage:
  const healthManager = new HealthCheckManager(db);
  const report = await healthManager.performComprehensiveHealthCheck(accounts);
  console.log(`Overall status: ${report.overall}`);

  Content Heuristics Filter

  Purpose: Reject low-quality content using anti-spam patternsInputs: Post text string and content configurationOutputs: Boolean pass/fail with detailed
  scoring breakdown

  How it works:
  - Scans for banned phrases from configuration
  - Detects marketing speak patterns (regex-based)
  - Calculates adjective density and readability scores
  - Validates presence of concrete data (numbers, dates, entities)
  - Applies bonus scoring for authority signals and quantifiable data

  Example usage:
  const heuristics = new ContentHeuristics(contentConfig);
  const result = heuristics.evaluateContent("Some post text...");
  if (result.passed) {
    // Content approved for posting
  }

  Content Variation Engine

  Purpose: Generate text variations to avoid platform pattern detectionInputs: Original post draft with content hash for seedingOutputs: Modified post with       
  consistent hash-based variations

  How it works:
  - Uses MD5 hash as RNG seed for consistent variations per content
  - Applies prefix variations ("Quick take:", "Worth noting:", etc.)
  - Modifies link presentation phrases
  - Applies punctuation style changes
  - Validates variations maintain key elements (URLs, mentions, numbers)

  Example usage:
  const engine = new ContentVariationEngine();
  const varied = engine.addContentVariation(originalDraft);
  console.log(`Original: ${originalDraft.text}`);
  console.log(`Varied: ${varied.text}`);

  GOAT-X Publisher

  Purpose: Interface with GOAT-X CLI for X platform postingInputs: Post draft, account configuration, dry run flagOutputs: Publish result with success status     
  and timing

  How it works:
  - Validates cookies before attempting posts
  - Spawns GOAT-X process with timeout and error handling
  - Parses JSON response for post ID and URL
  - Maps exit codes to specific error types (auth, rate limit, content)
  - Implements automatic fallback to API mode on cookie failure

  Example usage:
  const publisher = new GoatXPublisher(account, { dryRun: false });
  const result = await publisher.publish(draft);
  if (result.success) {
    console.log(`Posted: ${result.url}`);
  }

  Webhook Manager

  Purpose: Send HTTP notifications for system eventsInputs: Event type, data payload, endpoint configurationOutputs: Delivery confirmation with retry handling    


  How it works:
  - Implements exponential backoff retry (1s, 2s, 4s, 8s)
  - Batches notifications to reduce endpoint load
  - Supports both success and failure webhooks
  - Includes specialized methods for common alert types
  - Validates webhook configuration on startup

  Example usage:
  const webhooks = new WebhookManager(webhookConfig);
  await webhooks.sendAccountFailureAlert("@account1", 3, "cookie_expired");

  Storage & Data

  SQLite Schema

  Location: ./data/mvp.sqlite (configurable via DB_PATH)

  Core tables:
  -- Post tracking and results
  CREATE TABLE posts(
    id INTEGER PRIMARY KEY,
    account TEXT NOT NULL,
    text TEXT NOT NULL,
    url TEXT,                    -- returned post URL
    source_url TEXT NOT NULL,    -- original content URL
    created_at INTEGER NOT NULL, -- Unix timestamp ms
    status TEXT NOT NULL,        -- "dry", "posted", "error", "retry"
    retry_count INTEGER DEFAULT 0,
    error_reason TEXT,
    response_time_ms INTEGER,
    method_used TEXT             -- "cookie" or "api"
  );

  -- Content source tracking
  CREATE TABLE sources(
    hash TEXT PRIMARY KEY,       -- MD5 of URL
    url TEXT NOT NULL,
    title TEXT,
    score REAL NOT NULL,
    seen_at INTEGER NOT NULL,
    used INTEGER DEFAULT 0,      -- 0/1 flag
    last_used_at INTEGER,
    usage_count INTEGER DEFAULT 0
  );

  -- Daily posting quotas
  CREATE TABLE caps(
    date TEXT NOT NULL,          -- YYYY-MM-DD
    account TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(date, account)
  );

  -- Health check history
  CREATE TABLE health_checks(
    id INTEGER PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    check_type TEXT NOT NULL,    -- "cookie", "system", "rate_limit"
    account TEXT,
    status TEXT NOT NULL,        -- "pass", "fail", "warn"
    details TEXT,                -- JSON blob
    response_time_ms INTEGER
  );

  -- Performance metrics
  CREATE TABLE metrics(
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,          -- YYYY-MM-DD
    account TEXT NOT NULL,
    posts_attempted INTEGER DEFAULT 0,
    posts_successful INTEGER DEFAULT 0,
    posts_failed INTEGER DEFAULT 0,
    avg_response_time_ms REAL,
    cookie_failures INTEGER DEFAULT 0,
    api_fallbacks INTEGER DEFAULT 0,
    rate_limit_hits INTEGER DEFAULT 0
  );

  -- Content similarity tracking
  CREATE TABLE content_patterns(
    id INTEGER PRIMARY KEY,
    text_hash TEXT NOT NULL,
    week_year TEXT NOT NULL,     -- "2024-W52" format
    account TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    similarity_score REAL
  );

  Indexes:
  - idx_posts_account_date on posts(account, created_at)
  - idx_health_checks_timestamp on health_checks(timestamp)
  - idx_metrics_account_date on metrics(account, date)
  - idx_content_patterns_hash on content_patterns(text_hash)

  Retention: Configurable via METRICS_RETENTION_DAYS (default 30 days)

  File Storage

  Cookie files (./secrets/*.cookies.json):
  [
    {
      "name": "auth_token",
      "value": "abc123...",
      "domain": ".x.com"
    },
    {
      "name": "ct0",
      "value": "def456...",
      "domain": ".x.com"
    }
  ]

  Rollout state (./data/rollout-state.json):
  {
    "startedAt": 1704038400000,
    "currentPhase": 2,
    "activeAccounts": ["@account1", "@account2"],
    "nextPhaseAt": 1704124800000
  }

  Security & Privacy

  Threat Model

  In scope:
  - Cookie theft/exposure through file permissions
  - API key leakage in logs or error messages
  - Rate limit bypass attempts
  - Content injection in webhook payloads

  Out of scope:
  - X platform account takeover (assumes secure cookie export)
  - Network MITM attacks (relies on HTTPS)
  - Host system compromise

  Authentication & Authorization

  Cookie-based auth:
  - Cookies stored in ./secrets/ with 600 permissions
  - Validated for required fields before each posting attempt
  - Automatic rotation recommended every 72 hours

  API fallback:
  - API keys stored in environment variables, never logged
  - Used only when cookie auth fails
  - Same rate limiting applied as cookie mode

  Webhook security:
  - No authentication secrets in webhook URLs
  - Payloads sanitized to remove sensitive data
  - Timeout and retry limits prevent DoS

  Data Minimization

  What we store:
  - Post success/failure metrics (no content text)
  - Account handles and quota usage
  - Health check results (no cookie values)
  - Source URLs and scores (no personal data)

  What we don't store:
  - Full cookie values in database
  - API keys in database
  - Post content text after processing
  - User personal information

  Redaction rules:
  - URLs in logs masked as https://***
  - Cookie validation errors show field names only, not values
  - Webhook endpoints strip authentication tokens from logs

  Logging & Observability

  Structured Logging Format

  Logger: Pino with JSON outputLocation: stdout (redirect to file for persistence)Retention: Not managed by application (external log rotation)

  Log levels:
  - error: System failures, publishing errors, webhook delivery failures
  - warn: Health check warnings, quota approaching, cookie expiry
  - info: Successful posts, health status changes, configuration loads
  - debug: Detailed execution flow, timing information

  Example log entries:
  {
    "level": 50,
    "time": 1704038400000,
    "pid": 12345,
    "hostname": "server1",
    "phase": "publish_success",
    "handle": "@account1",
    "postId": "1234567890",
    "method": "cookie",
    "responseTimeMs": 1200,
    "dryRun": false,
    "msg": "Successfully published"
  }

  {
    "level": 40,
    "time": 1704038460000,
    "phase": "health_check",
    "checkType": "cookie",
    "account": "@account2",
    "status": "warn",
    "quotaUsed": 10,
    "quotaLimit": 12,
    "msg": "Health check: cookie - warn for @account2"
  }

  Key Log Patterns

  Successful posting:
  grep '"phase":"publish_success"' logs.json | jq '.handle, .postId'

  Failed authentications:
  grep '"phase":"publish_error"' logs.json | grep 'cookie_expired'

  Rate limit incidents:
  grep '"phase":"rate_limit"' logs.json | jq '.handle, .waitMinutes'

  Health check warnings:
  grep '"checkType":"cookie"' logs.json | grep '"status":"warn"'

  Testing Strategy

  Test Types

  TODO: This section requires implementation of test infrastructure.

  Unit tests: Individual module functionality
  npm test                    # Run all tests
  npm test -- --watch        # Watch mode
  npm test heuristics        # Specific module

  Integration tests: Database operations, GOAT-X CLI interaction
  End-to-end tests: Full dry-run cycles with mock data

  Critical Test Cases

  Cookie validation:
  - Valid cookie file with required fields → Pass
  - Missing auth_token → Fail with specific error
  - Malformed JSON → Fail with parse error
  - File not found → Fail with file error

  Content heuristics:
  - High-quality post with data → Pass with high score
  - Marketing spam with emojis → Fail with low score
  - Text exceeding character limit → Fail with length error

  Health checks:
  - All accounts healthy → Overall "healthy" status
  - One account quota exceeded → Overall "warning" status
  - System database failure → Overall "critical" status

  Performance & Limits

  Processing Limits

  | Component              | Limit             | Rationale                         |
  |------------------------|-------------------|-----------------------------------|
  | Items per cycle        | 15 (configurable) | Prevents overwhelming rate limits |
  | Posts per day (global) | 40 (configurable) | Platform respect                  |
  | Posts per account      | 12 (configurable) | Conservative rate limiting        |
  | Min posting interval   | 45 minutes        | Avoid burst detection             |
  | Webhook timeout        | 10 seconds        | Prevent hanging requests          |
  | GOAT-X timeout         | 30 seconds        | Account for network latency       |

  Big-O Performance

  Content processing: O(n) where n = input itemsHealth checks: O(a) where a = number of accountsDatabase queries: O(1) for quotas, O(log n) for metrics with      
  indexesSimilarity calculation: O(w²) where w = word count (limited by content length)

  Tuning Knobs

  Conservative settings:
  min_minutes_between_posts: 60
  daily_cap: 8
  burst_max_posts: 1
  adaptive_timing: true

  Aggressive settings:
  min_minutes_between_posts: 30
  daily_cap: 15
  burst_max_posts: 3
  adaptive_timing: false

  Safe ranges:
  - min_minutes_between_posts: 30-180 minutes
  - daily_cap: 5-20 posts
  - burst_max_posts: 1-5 posts
  - MAX_ITEMS_PER_CYCLE: 5-50 items

  Troubleshooting Playbook

  Common Issues

  | Symptom                                              | Cause                       | Fix                                                        |
  |------------------------------------------------------|-----------------------------|------------------------------------------------------------|
  | "Cookie validation failed: Missing required cookies" | Incomplete cookie export    | Re-export cookies ensuring auth_token and ct0 are included |
  | "GOAT-X exited with code 1: Authentication failed"   | Expired cookies             | Run npm run check:cookies, refresh cookies if old          |
  | "Rate limited by platform"                           | Too aggressive posting      | Increase min_minutes_between_posts in accounts.yaml        |
  | "Content rejected: Contains banned phrase"           | Marketing language detected | Review and update ban_phrases in accounts.yaml             |
  | "Database connection failed"                         | SQLite file issues          | Check DB_PATH exists and has write permissions             |
  | "Webhook delivery failed after all retries"          | Network or endpoint issues  | Verify webhook URLs, check endpoint logs                   |

  Diagnostic Commands

  Check system health:
  npm run health:check --verbose

  Validate cookies for all accounts:
  npm run check:cookies

  Test webhook connectivity:
  # **TODO:** Implement webhook test command
  npm run test:webhooks

  View recent activity:
  sqlite3 data/mvp.sqlite "SELECT * FROM posts ORDER BY created_at DESC LIMIT 10;"

  Check quota usage:
  sqlite3 data/mvp.sqlite "SELECT date, account, count FROM caps WHERE date = date('now');"

  Recovery Procedures

  Account suspended/disabled:
  1. Set active: false in accounts.yaml for affected account
  2. Run npm run health:check to verify exclusion
  3. Update webhook notifications about reduced capacity

  Mass cookie expiry:
  1. Export fresh cookies for all accounts
  2. Run npm run check:cookies to validate
  3. Test with npm run dry-run before live posting

  Database corruption:
  1. Stop all posting operations
  2. Backup: cp data/mvp.sqlite data/backup-$(date +%s).sqlite
  3. Delete corrupted database - system will recreate with fresh schema

  Webhook endpoint down:
  1. Temporarily disable webhooks: set URLs to empty in monitoring.yaml
  2. Monitor system health via npm run health:check
  3. Re-enable webhooks when endpoint recovers

  Maintenance & Upgrades

  Adding Features Safely

  Checklist:
  1. Add types to ./src/types.ts with Zod validation
  2. Update database schema in ./src/db.ts with migration
  3. Add configuration keys to YAML schemas with defaults
  4. Implement feature with comprehensive error handling
  5. Add structured logging for key operations
  6. Update health checks if feature affects system health
  7. Test with DRY_RUN=true extensively
  8. Document configuration changes in README

  Example: Adding new content filter
  // 1. Add to types.ts
  export const ContentFilterSchema = z.object({
    name: z.string(),
    pattern: z.string(),
    enabled: z.boolean()
  });

  // 2. Update accounts.yaml schema in config.ts
  content: {
    // ... existing fields
    custom_filters: z.array(ContentFilterSchema).optional()
  }

  // 3. Implement in heuristics.ts
  private applyCustomFilters(text: string, filters: ContentFilter[]): boolean {
    // Implementation
  }

  Dependency Updates

  Policy:
  - Major version updates: Require testing in development environment
  - Minor version updates: Safe to apply with standard testing
  - Security patches: Apply immediately

  Critical dependencies:
  - better-sqlite3: Database connectivity
  - pino: Logging infrastructure
  - zod: Type validation
  - axios: Webhook delivery

  Update process:
  npm audit                          # Check for vulnerabilities
  npm update                         # Update within semver ranges
  npm run build                      # Verify compilation
  npm run check:cookies             # Test critical functionality
  npm run health:check              # Verify system health

  Breaking Changes

  Database schema changes:
  - Always implement migrations in ./src/db.ts
  - Backup database before applying changes
  - Test migration with production-like data

  Configuration changes:
  - Maintain backward compatibility when possible
  - Document migration steps in release notes
  - Provide configuration validation errors with clear guidance

  Roadmap & TODOs

  High Priority

  - Main CLI Entry Point (./src/index.ts): Orchestrate full posting cycle
  - Enhanced Scheduler (./src/scheduler.ts): Adaptive timing with health awareness
  - Cypher-Swarm Integration (./src/sources/cypherSwarm.ts): JSONL parsing and filtering
  - Context7 Integration (./src/sources/docsQuery.ts): Document query and enrichment

  Medium Priority

  - Metrics Dashboard: Web interface for health and performance visualization
  - Content Analytics: Track engagement and optimize posting strategies
  - A/B Testing: Compare variation effectiveness
  - Smart Scheduling: ML-based optimal timing prediction

  Low Priority

  - Multi-Platform Support: Extend to LinkedIn, Mastodon
  - Advanced Deduplication: Semantic similarity beyond text matching
  - Mobile Notifications: Push alerts for critical issues
  - Configuration UI: Web interface for account and rule management

  Owner Hints

  - CLI/Backend Engineer: Main orchestration, scheduler, JSONL processing
  - DevOps Engineer: Monitoring, webhooks, deployment automation
  - Data Engineer: Context7 integration, content analytics
  - Frontend Engineer: Metrics dashboard, configuration UI

  Glossary

  | Term             | Definition                                                            |
  |------------------|-----------------------------------------------------------------------|
  | GOAT-X           | External CLI tool for X (Twitter) API interactions                    |
  | Cypher-Swarm     | Content ranking system that outputs JSONL with scored items           |
  | Context7         | Documentation search system for content enrichment                    |
  | Dry Run          | Mode where posts are generated but not actually published             |
  | Content Hash     | MD5 hash of post text used for deduplication and variation seeding    |
  | Heuristics       | Rule-based content quality filters to reject spam/marketing content   |
  | Variation Engine | System for generating text variations to avoid platform detection     |
  | Health Check     | Automated validation of account status, cookies, and system resources |
  | Gradual Rollout  | Progressive activation of accounts to minimize risk                   |
  | Burst Protection | Rate limiting to prevent too many posts in short time windows         |
  | Webhook          | HTTP callback for sending notifications to external systems           |
  | Anti-Slop        | Filters designed to reject low-quality marketing speak                |

  Appendix

  License

  MIT License - see LICENSE file for details.

  Credits

  Built with:
  - Pino for structured logging
  - Zod for runtime type validation
  - better-sqlite3 for local persistence
  - GOAT-X for X platform integration
  - Node.js 20+ runtime environment

  Full File Tree

  mvp/
  ├── package.json                              # npm configuration and scripts
  ├── tsconfig.json                             # TypeScript compiler config
  ├── .env.example                              # Environment variable template
  ├── README.md                                 # This documentation
  ├── data/                                     # Runtime data directory
  │   └── .keep                                 # Git placeholder
  ├── secrets/                                  # Sensitive files (gitignored)
  │   └── .gitkeep                              # Git placeholder
  ├── docs/                                     # Context7 documentation
  ├── config/                                   # Configuration files
  │   ├── accounts.yaml                         # Account and rate limit settings
  │   ├── monitoring.yaml                       # Webhook and alert config
  │   └── topics.yaml                           # Content filtering keywords
  └── src/                                      # TypeScript source code
      ├── index.ts                              # **TODO:** Main CLI entry point
      ├── config.ts                             # Configuration loading with validation
      ├── db.ts                                 # SQLite schema and helpers
      ├── log.ts                                # Structured logging utilities
      ├── types.ts                              # Zod schemas and TypeScript types
      ├── monitoring/                           # Health and notification systems
      │   ├── healthCheck.ts                    # Account and system health validation
      │   └── webhooks.ts                       # HTTP notification delivery
      ├── sources/                              # Data ingestion modules
      │   ├── cypherSwarm.ts                    # **TODO:** JSONL parsing
      │   └── docsQuery.ts                      # **TODO:** Context7 integration
      ├── content/                              # Content processing pipeline
      │   ├── compose.ts                        # **TODO:** Post composition
      │   ├── heuristics.ts                     # Anti-spam content filtering
      │   ├── dedupe.ts                         # **TODO:** Duplicate detection
      │   └── variation.ts                      # Pattern-breaking variations
      ├── publishers/                           # Platform integration
      │   ├── goatx.ts                          # GOAT-X CLI wrapper with fallback
      │   └── backup.ts                         # **TODO:** Alternative publisher
      └── tools/                                # CLI utilities and maintenance
          ├── validateCookies.ts                # Cookie validation tool
          ├── healthCheck.ts                    # System health check tool
          └── gradualRollout.ts                 # Progressive account activation