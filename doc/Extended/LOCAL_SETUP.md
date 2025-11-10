# 🏠 Local Setup Guide - X-Lochagos AI Bot

## Quick Trial Run Setup

### Prerequisites
- Node.js 20+ installed
- Your cookie file in `mvp/secrets/aplep333.cookies.json`

### Step 1: Clone Repository
```bash
git clone https://github.com/enstest1/xlochagos.git
cd xlochagos
```

### Step 2: Install Dependencies
```bash
cd mvp
npm install
```

### Step 3: Build Project
```bash
npm run build
```

### Step 4: Run Local Test
```bash
node local-test.js
```

## What It Does (Lowkey Mode)

✅ **Cookie-only authentication** - No passwords stored
✅ **Monitors @pelpa333** for mentions of target accounts
✅ **Researches** @trylimitless, @bankrbot, @wallchain_xyz
✅ **Daily limits**: 5 likes, 2 comments, 2 posts
✅ **Uses your home IP** - Not flagged as bot traffic

## Expected Behavior

**If working correctly:**
```
✅ Found existing cookie file, loading...
✅ Successfully loaded cookies from file
✅ Cookie-based authentication verified
✅ X API service initialized successfully
✅ Daemon: Started successfully
```

**If still blocked:**
```
❌ Cookie authentication failed - no fallback available
```

## Safety Features

- **Low activity** - Max 9 interactions per day
- **Cookie-only** - No password exposure
- **Home IP** - Residential address, not flagged
- **Gradual rollout** - Only one account active

## Monitoring

- **Logs show** all bot activity
- **Health checks** monitor system status
- **Dry run mode** available for testing

## Stopping the Bot

Press `Ctrl+C` to stop gracefully.

## Troubleshooting

**If cookie authentication fails:**
- Your home IP might still be blocked
- Try the Twitter API approach instead

**If bot crashes:**
- Check logs for error messages
- Ensure cookie file is valid and recent
