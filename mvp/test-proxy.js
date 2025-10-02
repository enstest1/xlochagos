#!/usr/bin/env node

/**
 * Test script to verify proxy integration
 * Run with: node test-proxy.js
 */

const { getOutboundIp, createProxyAgent } = require('./dist/net/proxyClient');

async function testProxyIntegration() {
  console.log('🔍 Testing Proxy Integration...\n');
  
  // Test 1: Direct connection (no proxy)
  console.log('1. Testing direct connection (no proxy)...');
  try {
    const directIp = await getOutboundIp({ handle: '@aplep333', proxyUrl: undefined });
    console.log(`   Direct IP: ${directIp || 'Failed to get IP'}`);
  } catch (error) {
    console.log(`   Direct connection failed: ${error.message}`);
  }
  
  // Test 2: Proxy connection (if configured)
  const proxyUrl = process.env.APLEP333_PROXY_URL;
  if (proxyUrl) {
    console.log('\n2. Testing proxy connection...');
    console.log(`   Proxy URL: ${proxyUrl.replace(/\/\/.*@/, '//***:***@')}`); // Hide credentials
    try {
      const proxyIp = await getOutboundIp({ handle: '@aplep333', proxyUrl });
      console.log(`   Proxy IP: ${proxyIp || 'Failed to get IP'}`);
      
      if (proxyIp) {
        console.log('   ✅ Proxy connection successful!');
      } else {
        console.log('   ❌ Proxy connection failed');
      }
    } catch (error) {
      console.log(`   Proxy connection failed: ${error.message}`);
    }
  } else {
    console.log('\n2. No proxy configured (APLEP333_PROXY_URL not set)');
    console.log('   To test with proxy, set APLEP333_PROXY_URL environment variable');
    console.log('   Example: APLEP333_PROXY_URL=http://user:pass@proxy.example.com:8080');
  }
  
  // Test 3: Proxy agent creation
  console.log('\n3. Testing proxy agent creation...');
  try {
    const agent = createProxyAgent({ handle: '@aplep333', proxyUrl });
    if (agent) {
      console.log('   ✅ Proxy agent created successfully');
    } else {
      console.log('   ℹ️  No proxy agent created (no proxy configured)');
    }
  } catch (error) {
    console.log(`   Proxy agent creation failed: ${error.message}`);
  }
  
  console.log('\n🎯 Proxy Integration Test Complete!');
  console.log('\nNext steps:');
  console.log('1. Set APLEP333_PROXY_URL environment variable with your proxy credentials');
  console.log('2. Run the main bot to test full integration');
  console.log('3. Check logs for "Outbound IP verified" messages');
}

// Run the test
testProxyIntegration().catch(console.error);
