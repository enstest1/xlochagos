#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'yaml';
import { Account } from '../types';
import { createModuleLogger } from '../log';

const log = createModuleLogger('cookie-validator');

interface CookieValidationResult {
  handle: string;
  cookiePath: string;
  status: 'valid' | 'invalid' | 'missing' | 'error';
  issues: string[];
  recommendations: string[];
}

function extractCookieMap(cookieData: any): Map<string, string> {
  const map = new Map<string, string>();

  if (Array.isArray(cookieData)) {
    for (const cookie of cookieData) {
      if (typeof cookie === 'string') {
        // Parse "name=value; domain=..." format
        const parts = cookie.split(';');
        const [nameValue] = parts;
        if (nameValue) {
          const [name, value] = nameValue.split('=');
          if (name && value) {
            map.set(name.trim(), value.trim());
          }
        }
      } else if (cookie && typeof cookie === 'object' && cookie.name) {
        // Parse {name: "auth_token", value: "abc123", domain: ".x.com"} format
        map.set(cookie.name, cookie.value || '');
      }
    }
  }

  return map;
}

function validateCookieFile(account: Account): CookieValidationResult {
  const result: CookieValidationResult = {
    handle: account.handle,
    cookiePath: account.cookie_path || '',
    status: 'valid',
    issues: [],
    recommendations: []
  };

  // Check if file exists
  if (!account.cookie_path) {
    result.status = 'missing';
    result.issues.push('No cookie path configured');
    result.recommendations.push('Set cookie_path in accounts.yaml');
    return result;
  }

  if (!existsSync(account.cookie_path)) {
    result.status = 'missing';
    result.issues.push('Cookie file does not exist');
    result.recommendations.push(`Create cookie file at ${account.cookie_path}`);
    return result;
  }

  try {
    // Parse cookie file
    const cookieJson = readFileSync(account.cookie_path, 'utf8');
    const cookieData = JSON.parse(cookieJson);
    const cookieMap = extractCookieMap(cookieData);

    // Check required cookies
    const requiredCookies = ['auth_token', 'ct0'];
    const optionalCookies = ['twid'];

    const missingRequired = requiredCookies.filter(name => {
      const value = cookieMap.get(name);
      return !value || value.length === 0;
    });

    if (missingRequired.length > 0) {
      result.status = 'invalid';
      result.issues.push(`Missing required cookies: ${missingRequired.join(', ')}`);
      result.recommendations.push('Export fresh cookies from browser while logged in');
    }

    // Check optional cookies
    const missingOptional = optionalCookies.filter(name => !cookieMap.get(name));
    if (missingOptional.length > 0) {
      result.recommendations.push(`Consider adding optional cookies: ${missingOptional.join(', ')}`);
    }

    // Validate auth_token format (basic check)
    const authToken = cookieMap.get('auth_token');
    if (authToken) {
      if (authToken.length < 40) {
        result.status = 'invalid';
        result.issues.push('auth_token appears too short (likely invalid)');
        result.recommendations.push('Ensure you copied the full auth_token value');
      }

      if (!authToken.match(/^[a-fA-F0-9]+$/)) {
        result.issues.push('auth_token format looks suspicious (should be hexadecimal)');
      }
    }

    // Check ct0 format
    const ct0 = cookieMap.get('ct0');
    if (ct0 && ct0.length < 32) {
      result.issues.push('ct0 token appears too short (minimum 32 characters)');
    }

    // Check domain information if available
    let hasValidDomain = false;
    if (Array.isArray(cookieData)) {
      for (const cookie of cookieData) {
        if (typeof cookie === 'object' && cookie.domain) {
          if (cookie.domain.includes('twitter.com') || cookie.domain.includes('x.com')) {
            hasValidDomain = true;
            break;
          }
        }
      }
    }

    if (!hasValidDomain) {
      result.recommendations.push('Ensure cookies are from .twitter.com or .x.com domain');
    }

    // Check file age (warn if very old)
    const stats = require('fs').statSync(account.cookie_path);
    const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
    if (ageHours > 72) {
      result.recommendations.push(`Cookie file is ${Math.round(ageHours)} hours old - consider refreshing`);
    }

  } catch (error) {
    result.status = 'error';
    result.issues.push(`Failed to parse cookie file: ${(error as Error).message}`);
    result.recommendations.push('Ensure cookie file contains valid JSON');
  }

  return result;
}

async function main() {
  console.log('🔍 Validating X/Twitter cookies...\n');

  // Load accounts configuration
  const configPath = join(process.cwd(), 'config', 'accounts.yaml');
  if (!existsSync(configPath)) {
    console.error('❌ accounts.yaml not found');
    process.exit(1);
  }

  const configYaml = readFileSync(configPath, 'utf8');
  const config = yaml.parse(configYaml);
  const accounts = config.accounts as Account[];

  let allValid = true;
  const results: CookieValidationResult[] = [];

  // Validate each account
  for (const account of accounts) {
    if (account.mode === 'api') {
      console.log(`⚡ ${account.handle}: Using API mode (skipping cookie validation)`);
      continue;
    }

    if (!account.active) {
      console.log(`⏸️  ${account.handle}: Inactive (skipping validation)`);
      continue;
    }

    const result = validateCookieFile(account);
    results.push(result);

    // Display results
    const statusIcon = {
      valid: '✅',
      invalid: '❌',
      missing: '❌',
      error: '❌'
    }[result.status];

    console.log(`${statusIcon} ${result.handle}:`);

    if (result.status === 'valid') {
      console.log(`   Cookie file valid`);
    } else {
      allValid = false;
      for (const issue of result.issues) {
        console.log(`   Issue: ${issue}`);
      }
    }

    if (result.recommendations.length > 0) {
      for (const rec of result.recommendations) {
        console.log(`   💡 ${rec}`);
      }
    }

    console.log();
  }

  // Summary
  const validCount = results.filter(r => r.status === 'valid').length;
  const totalCount = results.length;

  console.log(`📊 Summary: ${validCount}/${totalCount} accounts have valid cookies`);

  if (!allValid) {
    console.log('\n❌ Some accounts have cookie issues. Please fix them before running the poster.');
    process.exit(1);
  } else {
    console.log('\n✅ All active accounts have valid cookies!');
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Validation failed:', error.message);
    process.exit(1);
  });
}

export { validateCookieFile, main as validateCookies };