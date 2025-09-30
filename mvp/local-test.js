#!/usr/bin/env node

/**
 * Local Test Script for X-Lochagos AI Bot
 * Cookie-only authentication for lowkey trial run
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 Starting X-Lochagos AI Bot - Local Trial Run');
console.log('📋 Cookie-only authentication (lowkey mode)');
console.log('');

// Check if cookie file exists
const cookiePath = path.join(__dirname, 'secrets', 'aplep333.cookies.json');
if (!fs.existsSync(cookiePath)) {
  console.error('❌ Cookie file not found:', cookiePath);
  console.log('📝 Please ensure your cookie file is in the correct location');
  process.exit(1);
}

console.log('✅ Cookie file found:', cookiePath);
console.log('');

// Set environment for local testing
const env = {
  ...process.env,
  NODE_ENV: 'development',
  DRY_RUN: 'false',  // Set to 'true' for testing without posting
  LOG_LEVEL: 'info'
};

// Start the bot in daemon mode
console.log('🤖 Starting bot in daemon mode...');
console.log('📊 Monitoring: @pelpa333');
console.log('🎯 Research targets: @trylimitless, @bankrbot, @wallchain_xyz');
console.log('📈 Daily limits: 5 likes, 2 comments, 2 posts');
console.log('');

const botProcess = spawn('node', ['dist/index.js', '--daemon'], {
  cwd: __dirname,
  env: env,
  stdio: 'inherit'
});

botProcess.on('close', (code) => {
  console.log(`\n🤖 Bot process exited with code ${code}`);
  if (code === 0) {
    console.log('✅ Bot stopped gracefully');
  } else {
    console.log('❌ Bot exited with error');
  }
});

botProcess.on('error', (err) => {
  console.error('❌ Failed to start bot:', err);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping bot...');
  botProcess.kill('SIGINT');
});

console.log('💡 Press Ctrl+C to stop the bot');
console.log('📝 Check logs above for bot activity');
console.log('');
