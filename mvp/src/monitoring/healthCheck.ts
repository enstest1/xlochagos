import { readFileSync, existsSync } from 'node:fs';
import { Account, HealthCheck, SystemHealth, CookieData } from '../types';
import { logHealthCheck, logError } from '../log';
import Database from 'better-sqlite3';

export class HealthCheckManager {
  constructor(private db: Database.Database) {}

  async performComprehensiveHealthCheck(accounts: Account[]): Promise<SystemHealth> {
    const results: Record<string, HealthCheck> = {};
    const recommendations: string[] = [];

    // Check each account
    for (const account of accounts) {
      if (!account.active) continue;

      const accountHealth = await this.checkAccountHealth(account);
      results[account.handle] = accountHealth;

      if (accountHealth.status === 'fail') {
        recommendations.push(`${account.handle}: ${accountHealth.recommendations?.join(', ') || 'Check configuration'}`);
      }
    }

    // System-wide checks
    const systemHealth = await this.checkSystemHealth(accounts);

    // Determine overall status
    const failedAccounts = Object.values(results).filter(r => r.status === 'fail').length;
    const warningAccounts = Object.values(results).filter(r => r.status === 'warn').length;
    const activeAccountCount = accounts.filter(a => a.active).length;

    let overall: 'healthy' | 'warning' | 'critical';
    if (failedAccounts > activeAccountCount / 2) {
      overall = 'critical';
    } else if (failedAccounts > 0 || warningAccounts > 0 || systemHealth.status !== 'pass') {
      overall = 'warning';
    } else {
      overall = 'healthy';
    }

    const healthReport: SystemHealth = {
      overall,
      accounts: results,
      system: systemHealth,
      recommendations
    };

    // Log the health check results
    logHealthCheck('comprehensive', overall, undefined, {
      accountsChecked: Object.keys(results).length,
      failedAccounts,
      warningAccounts
    });

    // Store health check results in database
    await this.storeHealthCheckResults(healthReport);

    return healthReport;
  }

  async checkAccountHealth(account: Account): Promise<HealthCheck> {
    const startTime = Date.now();
    const checks = {
      cookieValid: false,
      quotaAvailable: false,
      recentActivity: false,
      errorRate: 0,
      consecutiveFailures: 0
    };

    const recommendations: string[] = [];

    try {
      // Cookie validation for cookie-based accounts
      if (account.mode === 'cookie' && account.cookie_path) {
        const cookieValidation = await this.validateCookieFile(account.cookie_path);
        checks.cookieValid = cookieValidation.valid;

        if (!cookieValidation.valid) {
          recommendations.push(...cookieValidation.issues);
        }

        // Check cookie age
        if (cookieValidation.valid && existsSync(account.cookie_path)) {
          const stats = require('fs').statSync(account.cookie_path);
          const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);

          if (ageHours > 72) {
            recommendations.push(`Cookies are ${Math.round(ageHours)} hours old - consider refreshing`);
          }
        }
      } else if (account.mode === 'api') {
        checks.cookieValid = true; // API mode doesn't need cookies

        // Validate API key if available
        if (!account.backup_api_key) {
          recommendations.push('No API key configured for fallback');
        }
      }

      // Check daily quota
      const today = new Date().toISOString().split('T')[0];
      const usedToday = this.db.prepare(`
        SELECT COALESCE(count, 0) as used
        FROM caps
        WHERE date = ? AND account = ?
      `).get(today, account.handle) as {used: number} | undefined;

      const used = usedToday?.used || 0;
      checks.quotaAvailable = used < account.daily_cap;

      if (used >= account.daily_cap) {
        recommendations.push('Daily quota exhausted');
      } else if (used >= account.daily_cap * 0.9) {
        recommendations.push('Approaching daily quota limit');
      }

      // Check recent activity and error rates
      const recentPosts = this.db.prepare(`
        SELECT status, COUNT(*) as count
        FROM posts
        WHERE account = ? AND created_at > ?
        GROUP BY status
      `).all(account.handle, Date.now() - 24 * 60 * 60 * 1000) as Array<{status: string; count: number}>;

      const totalRecent = recentPosts.reduce((sum, p) => sum + p.count, 0);
      const errors = recentPosts.find(p => p.status === 'error')?.count || 0;

      checks.errorRate = totalRecent > 0 ? errors / totalRecent : 0;
      checks.recentActivity = totalRecent > 0;

      if (checks.errorRate > 0.2) {
        recommendations.push(`High error rate: ${(checks.errorRate * 100).toFixed(1)}%`);
      }

      // Check consecutive failures
      const consecutiveFailures = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM posts
        WHERE account = ? AND status = 'error'
        AND id > COALESCE((
          SELECT id FROM posts
          WHERE account = ? AND status = 'posted'
          ORDER BY id DESC LIMIT 1
        ), 0)
      `).get(account.handle, account.handle) as {count: number};

      checks.consecutiveFailures = consecutiveFailures.count;

      if (checks.consecutiveFailures >= 3) {
        recommendations.push(`${checks.consecutiveFailures} consecutive failures`);
      }

      // Check last successful post timing
      const lastSuccess = this.db.prepare(`
        SELECT created_at
        FROM posts
        WHERE account = ? AND status = 'posted'
        ORDER BY created_at DESC
        LIMIT 1
      `).get(account.handle) as {created_at: number} | undefined;

      if (lastSuccess) {
        const hoursSinceLastPost = (Date.now() - lastSuccess.created_at) / (1000 * 60 * 60);
        if (hoursSinceLastPost > 48) {
          recommendations.push(`No successful posts in ${Math.round(hoursSinceLastPost)} hours`);
        }
      }

      // Determine status
      let status: 'pass' | 'warn' | 'fail';
      if (!checks.cookieValid || checks.errorRate > 0.5 || checks.consecutiveFailures >= 5) {
        status = 'fail';
      } else if (!checks.quotaAvailable || checks.errorRate > 0.2 || checks.consecutiveFailures >= 3 || recommendations.length > 0) {
        status = 'warn';
      } else {
        status = 'pass';
      }

      const healthCheck: HealthCheck = {
        timestamp: Date.now(),
        checkType: 'cookie',
        account: account.handle,
        status,
        details: {
          ...checks,
          recommendations: recommendations.length > 0 ? recommendations : undefined,
          dailyQuotaUsed: used,
          dailyQuotaLimit: account.daily_cap,
          quotaUtilization: used / account.daily_cap
        },
        responseTimeMs: Date.now() - startTime
      };

      logHealthCheck('account', status, account.handle, {
        quotaUsed: used,
        errorRate: checks.errorRate,
        consecutiveFailures: checks.consecutiveFailures
      });

      return healthCheck;

    } catch (error) {
      logError(error as Error, { account: account.handle, checkType: 'account_health' });

      return {
        timestamp: Date.now(),
        checkType: 'cookie',
        account: account.handle,
        status: 'fail',
        details: {
          error: (error as Error).message,
          recommendations: ['Check account configuration and permissions']
        },
        responseTimeMs: Date.now() - startTime
      };
    }
  }

  private async checkSystemHealth(accounts: Account[]): Promise<HealthCheck> {
    const startTime = Date.now();
    const checks = {
      dbConnected: false,
      configValid: false,
      diskSpace: 0,
      activeAccounts: 0,
      memoryUsage: 0
    };

    try {
      // Database connectivity
      this.db.prepare('SELECT 1').get();
      checks.dbConnected = true;

      // Configuration validation
      checks.configValid = accounts.length > 0 && accounts.some(a => a.active);
      checks.activeAccounts = accounts.filter(a => a.active).length;

      // Memory usage (basic check)
      const memUsage = process.memoryUsage();
      checks.memoryUsage = memUsage.heapUsed / 1024 / 1024; // MB

      // Disk space check (simplified - check if we can write to data directory)
      try {
        const testPath = './data/health-check-test';
        require('fs').writeFileSync(testPath, 'test');
        require('fs').unlinkSync(testPath);
        checks.diskSpace = 100; // Assume OK if we can write
      } catch {
        checks.diskSpace = 0;
      }

      const issues: string[] = [];

      if (!checks.dbConnected) {
        issues.push('Database connection failed');
      }
      if (!checks.configValid) {
        issues.push('Invalid configuration');
      }
      if (checks.activeAccounts === 0) {
        issues.push('No active accounts configured');
      }
      if (checks.memoryUsage > 512) {
        issues.push(`High memory usage: ${checks.memoryUsage.toFixed(1)}MB`);
      }
      if (checks.diskSpace === 0) {
        issues.push('Disk space or write permission issues');
      }

      const status = issues.length === 0 ? 'pass' : (issues.length > 2 ? 'fail' : 'warn');

      logHealthCheck('system', status, undefined, {
        memoryUsage: checks.memoryUsage,
        activeAccounts: checks.activeAccounts
      });

      return {
        timestamp: Date.now(),
        checkType: 'system',
        status,
        details: {
          ...checks,
          issues: issues.length > 0 ? issues : undefined
        },
        responseTimeMs: Date.now() - startTime
      };

    } catch (error) {
      logError(error as Error, { checkType: 'system_health' });

      return {
        timestamp: Date.now(),
        checkType: 'system',
        status: 'fail',
        details: {
          error: (error as Error).message,
          checks
        },
        responseTimeMs: Date.now() - startTime
      };
    }
  }

  private async validateCookieFile(cookiePath: string): Promise<{
    valid: boolean;
    issues: string[];
    cookies?: Map<string, string>;
  }> {
    const issues: string[] = [];

    try {
      if (!existsSync(cookiePath)) {
        return {
          valid: false,
          issues: ['Cookie file does not exist']
        };
      }

      const cookieJson = readFileSync(cookiePath, 'utf8');
      const cookieData = JSON.parse(cookieJson);
      const cookieMap = this.extractCookieMap(cookieData);

      // Check required cookies
      const requiredCookies = ['auth_token', 'ct0'];
      const missing = requiredCookies.filter(name => {
        const value = cookieMap.get(name);
        return !value || value.length === 0;
      });

      if (missing.length > 0) {
        issues.push(`Missing required cookies: ${missing.join(', ')}`);
      }

      // Validate auth_token format
      const authToken = cookieMap.get('auth_token');
      if (authToken) {
        if (authToken.length < 40) {
          issues.push('auth_token appears too short (likely invalid)');
        }
        if (!authToken.match(/^[a-fA-F0-9]+$/)) {
          issues.push('auth_token format looks suspicious (should be hexadecimal)');
        }
      }

      // Check ct0 format
      const ct0 = cookieMap.get('ct0');
      if (ct0 && ct0.length < 32) {
        issues.push('ct0 token appears too short (minimum 32 characters)');
      }

      // Check for domain information
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
        issues.push('Cookies should be from .twitter.com or .x.com domain');
      }

      return {
        valid: issues.length === 0,
        issues,
        cookies: cookieMap
      };

    } catch (error) {
      return {
        valid: false,
        issues: [`Failed to parse cookie file: ${(error as Error).message}`]
      };
    }
  }

  private extractCookieMap(cookieData: any): Map<string, string> {
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

  private async storeHealthCheckResults(healthReport: SystemHealth): Promise<void> {
    try {
      const insertHealthCheck = this.db.prepare(`
        INSERT INTO health_checks (timestamp, check_type, account, status, details, response_time_ms)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      // Store system health check
      insertHealthCheck.run(
        Date.now(),
        'system',
        null,
        healthReport.system.status,
        JSON.stringify(healthReport.system.details),
        healthReport.system.responseTimeMs || 0
      );

      // Store individual account health checks
      for (const [handle, accountHealth] of Object.entries(healthReport.accounts)) {
        insertHealthCheck.run(
          accountHealth.timestamp,
          accountHealth.checkType,
          handle,
          accountHealth.status,
          JSON.stringify(accountHealth.details),
          accountHealth.responseTimeMs || 0
        );
      }

    } catch (error) {
      logError(error as Error, { operation: 'store_health_check' });
    }
  }

  async getHealthHistory(account?: string, hours: number = 24): Promise<HealthCheck[]> {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);

    let query = `
      SELECT timestamp, check_type, account, status, details, response_time_ms
      FROM health_checks
      WHERE timestamp > ?
    `;

    const params: any[] = [cutoff];

    if (account) {
      query += ' AND account = ?';
      params.push(account);
    }

    query += ' ORDER BY timestamp DESC';

    const rows = this.db.prepare(query).all(...params) as Array<{
      timestamp: number;
      check_type: string;
      account: string | null;
      status: string;
      details: string | null;
      response_time_ms: number | null;
    }>;

    return rows.map(row => ({
      timestamp: row.timestamp,
      checkType: row.check_type as any,
      account: row.account || undefined,
      status: row.status as any,
      details: row.details ? JSON.parse(row.details) : {},
      responseTimeMs: row.response_time_ms || undefined
    }));
  }

  async cleanupOldHealthChecks(retentionHours: number = 168): Promise<void> { // 7 days default
    const cutoff = Date.now() - (retentionHours * 60 * 60 * 1000);

    const result = this.db.prepare(`
      DELETE FROM health_checks WHERE timestamp < ?
    `).run(cutoff);

    if (result.changes > 0) {
      logHealthCheck('cleanup', 'pass', undefined, {
        deletedRecords: result.changes,
        retentionHours
      });
    }
  }
}