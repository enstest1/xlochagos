#!/usr/bin/env node

/**
 * Test script to verify cookie validity
 * Run with: node test-cookies.js
 */

const fs = require('fs');
const path = require('path');

async function testCookies() {
  console.log('🍪 Testing Cookie Validity...\n');
  
  try {
    // Try to load cookies from environment variable
    const cookieDataEnv = process.env.APLEP333_COOKIES;
    
    if (cookieDataEnv) {
      console.log('✅ Found cookies in environment variable');
      const cookieData = JSON.parse(cookieDataEnv);
      
      // Check for required cookies
      const authTokenCookie = cookieData.find(cookie => cookie.name === 'auth_token');
      const ct0Cookie = cookieData.find(cookie => cookie.name === 'ct0');
      
      console.log(`📊 Total cookies: ${cookieData.length}`);
      console.log(`🔑 Auth token found: ${!!authTokenCookie}`);
      console.log(`🔒 CT0 found: ${!!ct0Cookie}`);
      
      if (authTokenCookie) {
        console.log(`🔑 Auth token value: ${authTokenCookie.value.substring(0, 20)}...`);
        console.log(`🔑 Auth token domain: ${authTokenCookie.domain}`);
        console.log(`🔑 Auth token expires: ${authTokenCookie.expires}`);
      }
      
      if (ct0Cookie) {
        console.log(`🔒 CT0 value: ${ct0Cookie.value.substring(0, 20)}...`);
        console.log(`🔒 CT0 domain: ${ct0Cookie.domain}`);
        console.log(`🔒 CT0 expires: ${ct0Cookie.expires}`);
      }
      
      // Check if cookies are expired
      const now = new Date().getTime() / 1000;
      const authExpired = authTokenCookie && authTokenCookie.expires && authTokenCookie.expires < now;
      const ct0Expired = ct0Cookie && ct0Cookie.expires && ct0Cookie.expires < now;
      
      console.log(`⏰ Auth token expired: ${authExpired}`);
      console.log(`⏰ CT0 expired: ${ct0Expired}`);
      
      if (authExpired || ct0Expired) {
        console.log('\n❌ ISSUE: Cookies are expired!');
        console.log('💡 Solution: Export fresh cookies from your browser');
      } else {
        console.log('\n✅ Cookies appear to be valid (not expired)');
        console.log('💡 Issue might be with X/Twitter blocking the proxy IP');
      }
      
    } else {
      console.log('❌ No cookies found in APLEP333_COOKIES environment variable');
    }
    
  } catch (error) {
    console.log(`❌ Error testing cookies: ${error.message}`);
  }
  
  console.log('\n🎯 Next Steps:');
  console.log('1. If cookies are expired: Export fresh cookies from browser');
  console.log('2. If cookies are valid: Try IPRoyal residential proxies');
  console.log('3. Consider switching to official Twitter API');
}

testCookies().catch(console.error);
