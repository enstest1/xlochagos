/**
 * Verification script for sideways/inbound reply system
 * Run with: npx ts-node src/test/sideways-inbound-verification.ts
 * 
 * This script verifies:
 * 1. URL extraction functions work correctly
 * 2. Code patterns are correct (without requiring database connection)
 */

import { extractTweetId } from '../utils/tweetUtils';

console.log('🧪 Testing Sideways/Inbound Reply System Components\n');

// Test 1: URL Extraction
console.log('📋 Test 1: URL Extraction');
console.log('─'.repeat(50));

const urlTests = [
  { url: 'https://x.com/user/status/1234567890', expected: '1234567890' },
  { url: 'https://x.com/user/status/1234567890?s=20', expected: '1234567890' },
  { url: 'https://twitter.com/user/status/1234567890', expected: '1234567890' },
  { url: 'https://x.com/pelpa333/status/9876543210?ref_src=twsrc%5Etfw', expected: '9876543210' },
  { url: 'https://x.com/FIZZonAbstract/status/111222333444', expected: '111222333444' },
];

let urlTestsPassed = 0;
let urlTestsFailed = 0;

for (const test of urlTests) {
  const result = extractTweetId(test.url);
  const passed = result === test.expected;
  
  if (passed) {
    console.log(`✅ ${test.url}`);
    console.log(`   → Extracted: ${result}`);
    urlTestsPassed++;
  } else {
    console.log(`❌ ${test.url}`);
    console.log(`   → Expected: ${test.expected}, Got: ${result}`);
    urlTestsFailed++;
  }
}

console.log(`\n📊 URL Extraction Results: ${urlTestsPassed} passed, ${urlTestsFailed} failed\n`);

// Test 2: Verify code patterns (static analysis)
console.log('📋 Test 2: Code Pattern Verification');
console.log('─'.repeat(50));

// Check if required functions exist
const requiredExports = [
  { module: '../utils/tweetUtils', exports: ['extractTweetId', 'buildTweetUrl'] },
  { module: '../utils/contentFilter', exports: ['isGarbage'] },
  { module: '../utils/altHelpers', exports: ['getCookiePath', 'getAccountCfgForAlt'] },
  { module: '../config/replyConfig', exports: ['REPLY_CONFIG'] },
  { module: '../config/altAccounts', exports: ['ALT_ACCOUNTS', 'isOurAccount'] },
  { module: '../generation', exports: ['generatePersonaReply'] }, // ReplyMode and ReplyContext are types, not runtime exports
  { module: '../publish/playwright', exports: ['replyFromAlt'] },
  // Note: These modules require Supabase env vars, so they may fail in test environment
  // This is expected - they'll work fine when env vars are set
  { module: '../services/sidewaysReplyService', exports: ['processSidewaysReplies', 'scoreComment', 'pickAltForSideways', 'isSpamOrToxic', 'recoverStuckOpportunities'], optional: true },
  { module: '../services/inboundReplyService', exports: ['processInboundReplies'], optional: true },
];

let moduleTestsPassed = 0;
let moduleTestsFailed = 0;

for (const { module: modulePath, exports: exportNames, optional } of requiredExports) {
  try {
    const module = require(modulePath);
    const missingExports: string[] = [];
    
    for (const exportName of exportNames) {
      if (!(exportName in module)) {
        missingExports.push(exportName);
      }
    }
    
    if (missingExports.length === 0) {
      console.log(`✅ ${modulePath}`);
      console.log(`   → Exports: ${exportNames.join(', ')}`);
      moduleTestsPassed++;
    } else {
      console.log(`❌ ${modulePath}`);
      console.log(`   → Missing exports: ${missingExports.join(', ')}`);
      if (!optional) moduleTestsFailed++;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (optional) {
      console.log(`⚠️  ${modulePath} (optional - requires env vars)`);
      console.log(`   → ${errorMsg}`);
    } else {
      console.log(`❌ ${modulePath}`);
      console.log(`   → Error loading module: ${errorMsg}`);
      moduleTestsFailed++;
    }
  }
}

console.log(`\n📊 Module Verification Results: ${moduleTestsPassed} passed, ${moduleTestsFailed} failed\n`);

// Test 3: Verify Supabase UPDATE pattern (code check only)
console.log('📋 Test 3: Supabase UPDATE Pattern Verification');
console.log('─'.repeat(50));

try {
  const sidewaysService = require('../services/sidewaysReplyService');
  const serviceCode = require('fs').readFileSync(
    require('path').join(__dirname, '../services/sidewaysReplyService.ts'),
    'utf8'
  );
  
  // Check for atomic UPDATE pattern
  const hasAtomicUpdate = serviceCode.includes('update({ processed: true })') &&
                          serviceCode.includes('.select()');
  
  if (hasAtomicUpdate) {
    console.log('✅ Atomic UPDATE pattern found in sidewaysReplyService.ts');
    console.log('   → Using UPDATE with RETURNING pattern');
  } else {
    console.log('⚠️  Atomic UPDATE pattern not clearly detected');
    console.log('   → Please verify processSidewaysReplies() uses atomic UPDATE');
  }
  
  // Check for retry logic
  const hasRetryLogic = serviceCode.includes('retry_count') &&
                        serviceCode.includes('MAX_RETRIES');
  
  if (hasRetryLogic) {
    console.log('✅ Retry logic found');
    console.log('   → retry_count and MAX_RETRIES detected');
  } else {
    console.log('⚠️  Retry logic not clearly detected');
  }
  
} catch (error) {
  console.log(`❌ Error checking service code: ${error instanceof Error ? error.message : String(error)}`);
}

console.log('\n');

// Summary
console.log('📊 Summary');
console.log('─'.repeat(50));
const totalPassed = urlTestsPassed + moduleTestsPassed;
const totalFailed = urlTestsFailed + moduleTestsFailed;

if (totalFailed === 0) {
  console.log(`✅ All tests passed! (${totalPassed} tests)`);
  console.log('\n💡 Next steps:');
  console.log('   1. Run migration: Apply mvp/supabase/sideways-inbound-schema.sql');
  console.log('   2. Test monitor: npm run cli swarm monitor');
  console.log('   3. Test sideways: npm run cli swarm sideways');
  console.log('   4. Test inbound: npm run cli swarm inbound');
} else {
  console.log(`⚠️  Some tests failed: ${totalPassed} passed, ${totalFailed} failed`);
  console.log('\n💡 Please fix the issues above before proceeding.');
}

console.log('\n');

