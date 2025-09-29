#!/usr/bin/env node
import { configLoader } from '../config';
import { openDb, migrate } from '../db';
import { HealthCheckManager } from '../monitoring/healthCheck';
import { createModuleLogger } from '../log';

const log = createModuleLogger('health-check-tool');

interface HealthCheckOptions {
  verbose?: boolean;
  accounts?: string[];
  format?: 'text' | 'json';
}

async function performHealthCheck(options: HealthCheckOptions = {}) {
  try {
    // Load configuration
    const { env, accounts: accountsConfig } = configLoader.loadAll();

    // Open database
    const db = openDb(env.DB_PATH);
    migrate(db);

    // Create health check manager
    const healthManager = new HealthCheckManager(db);

    // Filter accounts if specified
    let accountsToCheck = accountsConfig.accounts;
    if (options.accounts && options.accounts.length > 0) {
      accountsToCheck = accountsConfig.accounts.filter(a =>
        options.accounts!.includes(a.handle)
      );
    }

    // Perform comprehensive health check
    const healthReport = await healthManager.performComprehensiveHealthCheck(accountsToCheck);

    // Output results
    if (options.format === 'json') {
      console.log(JSON.stringify(healthReport, null, 2));
    } else {
      displayHealthReport(healthReport, options.verbose || false);
    }

    // Exit with appropriate code
    const exitCode = healthReport.overall === 'critical' ? 2 :
                    healthReport.overall === 'warning' ? 1 : 0;

    db.close();
    process.exit(exitCode);

  } catch (error) {
    console.error('Health check failed:', (error as Error).message);
    process.exit(3);
  }
}

function displayHealthReport(healthReport: any, verbose: boolean) {
  const iconMap = {
    healthy: '✅',
    warning: '⚠️',
    critical: '❌'
  };
  const overallIcon = iconMap[healthReport.overall as keyof typeof iconMap] || '❓';

  console.log(`${overallIcon} Overall System Health: ${healthReport.overall.toUpperCase()}\n`);

  // System health
  console.log('🖥️  System Health:');
  const systemStatus = healthReport.system.status;
  const systemIcon = systemStatus === 'pass' ? '✅' : systemStatus === 'warn' ? '⚠️' : '❌';
  console.log(`   ${systemIcon} Status: ${systemStatus}`);

  if (verbose && healthReport.system.details) {
    console.log(`   Database: ${healthReport.system.details.dbConnected ? '✅' : '❌'}`);
    console.log(`   Configuration: ${healthReport.system.details.configValid ? '✅' : '❌'}`);
    console.log(`   Active Accounts: ${healthReport.system.details.activeAccounts}`);
    if (healthReport.system.details.memoryUsage) {
      console.log(`   Memory Usage: ${healthReport.system.details.memoryUsage.toFixed(1)}MB`);
    }
  }

  console.log();

  // Account health
  console.log('👤 Account Health:');
  for (const [handle, accountHealth] of Object.entries(healthReport.accounts)) {
    const account = accountHealth as any;
    const statusIcon = account.status === 'pass' ? '✅' : account.status === 'warn' ? '⚠️' : '❌';
    console.log(`   ${statusIcon} ${handle}: ${account.status}`);

    if (verbose && account.details) {
      if (account.details.quotaUtilization !== undefined) {
        const quotaPercent = (account.details.quotaUtilization * 100).toFixed(1);
        console.log(`      Quota: ${account.details.dailyQuotaUsed}/${account.details.dailyQuotaLimit} (${quotaPercent}%)`);
      }

      if (account.details.errorRate !== undefined) {
        console.log(`      Error Rate: ${(account.details.errorRate * 100).toFixed(1)}%`);
      }

      if (account.details.consecutiveFailures > 0) {
        console.log(`      Consecutive Failures: ${account.details.consecutiveFailures}`);
      }

      if (account.details.cookieValidation && !account.details.cookieValidation.success) {
        console.log(`      Cookie Issue: ${account.details.cookieValidation.error}`);
      }
    }

    if (account.details.recommendations && account.details.recommendations.length > 0) {
      for (const rec of account.details.recommendations) {
        console.log(`      💡 ${rec}`);
      }
    }
  }

  // Recommendations
  if (healthReport.recommendations && healthReport.recommendations.length > 0) {
    console.log('\n📋 Recommendations:');
    for (const recommendation of healthReport.recommendations) {
      console.log(`   • ${recommendation}`);
    }
  }

  // Health score summary
  console.log('\n📊 Health Summary:');
  const totalAccounts = Object.keys(healthReport.accounts).length;
  const healthyAccounts = Object.values(healthReport.accounts as any[]).filter(a => a.status === 'pass').length;
  const warningAccounts = Object.values(healthReport.accounts as any[]).filter(a => a.status === 'warn').length;
  const failedAccounts = Object.values(healthReport.accounts as any[]).filter(a => a.status === 'fail').length;

  console.log(`   Healthy: ${healthyAccounts}/${totalAccounts}`);
  if (warningAccounts > 0) {
    console.log(`   Warnings: ${warningAccounts}/${totalAccounts}`);
  }
  if (failedAccounts > 0) {
    console.log(`   Failed: ${failedAccounts}/${totalAccounts}`);
  }

  // Next steps
  console.log('\n🔄 Exit Codes:');
  console.log('   0: All systems healthy');
  console.log('   1: Warnings detected');
  console.log('   2: Critical issues found');
  console.log('   3: Health check failed to run');
}

async function main() {
  const args = process.argv.slice(2);
  const options: HealthCheckOptions = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    format: args.includes('--json') ? 'json' : 'text'
  };

  // Parse account filter
  const accountFlag = args.find(arg => arg.startsWith('--accounts='));
  if (accountFlag) {
    const accountValue = accountFlag.split('=')[1];
    if (accountValue) {
      options.accounts = accountValue.split(',');
    }
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Health Check Tool

Usage: npm run health:check [options]

Options:
  --verbose, -v          Show detailed information
  --json                 Output in JSON format
  --accounts=@acc1,@acc2 Check specific accounts only
  --help, -h             Show this help message

Exit Codes:
  0  All systems healthy
  1  Warnings detected
  2  Critical issues found
  3  Health check failed to run

Examples:
  npm run health:check
  npm run health:check --verbose
  npm run health:check --accounts=@acct1,@acct2
  npm run health:check --json > health-report.json
`);
    process.exit(0);
  }

  await performHealthCheck(options);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Health check tool failed:', error.message);
    process.exit(3);
  });
}

export { performHealthCheck, main as healthCheckTool };