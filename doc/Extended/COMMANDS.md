# XlochaGOS Commands Reference

## 🎯 **Core XlochaGOS Commands**

### **📋 Content Management:**
```bash
# View all generated content in queue
npm run cli -- swarm queue

# Review premium posts for @pelpa333 (manual approval)
npm run cli -- swarm review

# Publish approved posts to @FIZZonAbstract
npm run cli -- publish @FIZZonAbstract
```

### **🤖 Agent Operations:**
```bash
# Run single cycle (test run)
npm run cli -- swarm once

# Run continuously every 30 minutes
npm run cli -- swarm start

# Monitor @pelpa333 + target accounts for mentions
npm run cli -- swarm monitor

# Process auto-responses to @pelpa333 mentions
npm run cli -- swarm respond
```

### **🖥️ Dashboard:**
```bash
# Start web dashboard
npm run cli -- swarm dashboard
# Then visit: http://localhost:3002
```

### **🔍 Individual Account Operations:**
```bash
# Check IP addresses for all accounts
npm run cli -- ip

# Login to specific account (save cookies)
npm run cli -- login @FIZZonAbstract

# Post tweet manually
npm run cli -- post @FIZZonAbstract "Your tweet text here"

# Reply to specific tweet
npm run cli -- reply @FIZZonAbstract https://x.com/username/status/123 "Your reply"

# Like a specific tweet
npm run cli -- like @FIZZonAbstract https://x.com/username/status/123

# Fetch user timeline
npm run cli -- timeline pelpa333

# Search tweets
npm run cli -- search "crypto discovery"
```

## 🚫 **Deprecated Commands (DON'T USE):**
```bash
❌ npm run cli -- monitor @FIZZonAbstract  # OLD system
❌ npm run cli -- swarm status             # Doesn't exist
❌ npm run cli -- --help                   # Wrong syntax
```

## 📊 **System Status Commands:**
```bash
# View help
npm run cli -- (no arguments)

# Check if XlochaGOS is running
npm run cli -- swarm once

# View generated content
npm run cli -- swarm queue
```

## 🎯 **Typical Workflow:**
1. **Start system**: `npm run cli -- swarm start`
2. **Check content**: `npm run cli -- swarm queue`
3. **Review premium posts**: `npm run cli -- swarm review`
4. **Publish approved**: `npm run cli -- publish @FIZZonAbstract`
5. **Monitor dashboard**: `npm run cli -- swarm dashboard`

## ⚙️ **Environment Variables:**
```bash
# Test mode (no actual posts)
DRY_RUN=true npm run cli -- swarm once

# Custom dashboard port
DASHBOARD_PORT=3002 npm run cli -- swarm dashboard
```

## 🔧 **Troubleshooting:**
```bash
# If commands not working, check current directory
pwd  # Should show: /path/to/x_leaderboard/mvp

# If npm issues, reinstall dependencies
npm install

# If TypeScript errors, rebuild
npm run build
```
