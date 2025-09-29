import axios from 'axios';
import { WebhookPayload, WebhookConfig } from '../types';
import { logWebhook, logError } from '../log';

export class WebhookManager {
  constructor(private config: WebhookConfig) {}

  async sendFailureNotification(data: Record<string, any>): Promise<void> {
    if (!this.config.failure_endpoint) return;

    const payload: WebhookPayload = {
      eventType: 'failure',
      timestamp: new Date().toISOString(),
      data
    };

    await this.sendWebhook(this.config.failure_endpoint, payload);
  }

  async sendSuccessNotification(data: Record<string, any>): Promise<void> {
    if (!this.config.success_endpoint) return;

    const payload: WebhookPayload = {
      eventType: 'success',
      timestamp: new Date().toISOString(),
      data
    };

    await this.sendWebhook(this.config.success_endpoint, payload);
  }

  async sendCustomNotification(eventType: string, data: Record<string, any>, endpoint?: string): Promise<void> {
    const targetEndpoint = endpoint || this.config.failure_endpoint;
    if (!targetEndpoint) return;

    const payload: WebhookPayload = {
      eventType,
      timestamp: new Date().toISOString(),
      data
    };

    await this.sendWebhook(targetEndpoint, payload);
  }

  private async sendWebhook(url: string, payload: WebhookPayload): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retry_attempts; attempt++) {
      try {
        const response = await axios.post(url, payload, {
          timeout: this.config.timeout_seconds * 1000,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'GoatX-Quadposter/1.0',
            'X-Event-Type': payload.eventType,
            'X-Timestamp': payload.timestamp
          }
        });

        logWebhook(payload.eventType, url, true, attempt);
        return; // Success, exit retry loop

      } catch (error) {
        lastError = error as Error;

        logWebhook(
          payload.eventType,
          url,
          false,
          attempt,
          (error as Error).message
        );

        if (attempt < this.config.retry_attempts) {
          // Exponential backoff: 1s, 2s, 4s, 8s
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    logError(lastError!, {
      operation: 'webhook_delivery_failed',
      url: url.replace(/\/\/.*@/, '//***@'),
      eventType: payload.eventType,
      totalAttempts: this.config.retry_attempts
    });
  }

  // Batch webhook sender for efficiency
  async sendBatchNotifications(notifications: Array<{
    eventType: string;
    data: Record<string, any>;
    endpoint?: string;
  }>): Promise<void> {
    const batches = this.chunkArray(notifications, this.config.batch_size);

    for (const batch of batches) {
      const promises = batch.map(notification =>
        this.sendCustomNotification(
          notification.eventType,
          notification.data,
          notification.endpoint
        ).catch(error => {
          // Log individual failures but don't stop the batch
          logError(error, {
            operation: 'batch_webhook_item_failed',
            eventType: notification.eventType
          });
        })
      );

      await Promise.all(promises);

      // Small delay between batches to avoid overwhelming the endpoint
      if (batches.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // Specialized notification methods for common scenarios
  async sendAccountFailureAlert(account: string, consecutiveFailures: number, lastError: string): Promise<void> {
    await this.sendFailureNotification({
      alert: 'account_failure',
      account,
      consecutiveFailures,
      lastError,
      severity: consecutiveFailures >= 5 ? 'critical' : 'warning',
      recommendedActions: [
        'Check account cookies/API keys',
        'Verify account is not suspended',
        'Review rate limiting settings'
      ]
    });
  }

  async sendQuotaWarning(account: string, used: number, limit: number): Promise<void> {
    const percentage = (used / limit) * 100;

    await this.sendFailureNotification({
      alert: 'quota_warning',
      account,
      quotaUsed: used,
      quotaLimit: limit,
      percentage: Math.round(percentage),
      severity: percentage >= 95 ? 'critical' : 'warning',
      message: `Account ${account} has used ${used}/${limit} daily posts (${percentage.toFixed(1)}%)`
    });
  }

  async sendHealthCheckFailure(checkType: string, account: string | undefined, details: Record<string, any>): Promise<void> {
    await this.sendFailureNotification({
      alert: 'health_check_failure',
      checkType,
      account,
      details,
      severity: 'warning',
      timestamp: new Date().toISOString()
    });
  }

  async sendRateLimitAlert(account: string, cooldownMinutes: number): Promise<void> {
    await this.sendFailureNotification({
      alert: 'rate_limit_hit',
      account,
      cooldownMinutes,
      severity: 'info',
      message: `Account ${account} hit rate limit, cooling down for ${cooldownMinutes} minutes`
    });
  }

  async sendSystemHealthAlert(overall: string, failedAccounts: string[], systemIssues: string[]): Promise<void> {
    const severity = overall === 'critical' ? 'critical' : 'warning';

    await this.sendFailureNotification({
      alert: 'system_health',
      overall,
      failedAccounts,
      systemIssues,
      severity,
      message: `System health status: ${overall}`,
      affectedAccountsCount: failedAccounts.length
    });
  }

  async sendContentQualityAlert(rejectedCount: number, totalCount: number, commonReasons: string[]): Promise<void> {
    const rejectionRate = (rejectedCount / totalCount) * 100;

    if (rejectionRate > 50) { // Only alert if rejection rate is high
      await this.sendFailureNotification({
        alert: 'high_content_rejection',
        rejectedCount,
        totalCount,
        rejectionRate: Math.round(rejectionRate),
        commonReasons,
        severity: rejectionRate > 80 ? 'critical' : 'warning',
        message: `High content rejection rate: ${rejectedCount}/${totalCount} (${rejectionRate.toFixed(1)}%)`
      });
    }
  }

  async sendSuccessMetrics(
    totalPosts: number,
    successfulPosts: number,
    avgResponseTime: number,
    accountBreakdown: Record<string, { successful: number; failed: number }>
  ): Promise<void> {
    const successRate = (successfulPosts / totalPosts) * 100;

    await this.sendSuccessNotification({
      summary: 'daily_posting_summary',
      totalPosts,
      successfulPosts,
      successRate: Math.round(successRate),
      avgResponseTime: Math.round(avgResponseTime),
      accountBreakdown,
      timestamp: new Date().toISOString()
    });
  }

  async sendCookieExpiryWarning(account: string, hoursUntilExpiry: number): Promise<void> {
    await this.sendFailureNotification({
      alert: 'cookie_expiry_warning',
      account,
      hoursUntilExpiry,
      severity: hoursUntilExpiry <= 24 ? 'warning' : 'info',
      message: `Cookies for ${account} will expire in approximately ${hoursUntilExpiry} hours`,
      recommendedActions: [
        'Refresh browser cookies',
        'Export new cookie file',
        'Update cookie configuration'
      ]
    });
  }

  async sendPerformanceAlert(metric: string, value: number, threshold: number, account?: string): Promise<void> {
    await this.sendFailureNotification({
      alert: 'performance_threshold_exceeded',
      metric,
      value,
      threshold,
      account,
      severity: 'warning',
      message: `Performance alert: ${metric} = ${value} (threshold: ${threshold})`
    });
  }

  // Test webhook connectivity
  async testWebhookConnectivity(): Promise<{
    success: boolean;
    failure: boolean;
    errors: string[];
  }> {
    const results = {
      success: false,
      failure: false,
      errors: [] as string[]
    };

    // Test success endpoint
    if (this.config.success_endpoint) {
      try {
        await this.sendSuccessNotification({
          test: true,
          message: 'Webhook connectivity test',
          timestamp: new Date().toISOString()
        });
        results.success = true;
      } catch (error) {
        results.errors.push(`Success webhook failed: ${(error as Error).message}`);
      }
    }

    // Test failure endpoint
    if (this.config.failure_endpoint) {
      try {
        await this.sendFailureNotification({
          test: true,
          message: 'Webhook connectivity test',
          severity: 'info',
          timestamp: new Date().toISOString()
        });
        results.failure = true;
      } catch (error) {
        results.errors.push(`Failure webhook failed: ${(error as Error).message}`);
      }
    }

    return results;
  }

  // Validate webhook configuration
  validateConfiguration(): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    if (!this.config.failure_endpoint && !this.config.success_endpoint) {
      issues.push('No webhook endpoints configured');
    }

    if (this.config.retry_attempts < 1 || this.config.retry_attempts > 10) {
      issues.push('retry_attempts should be between 1 and 10');
    }

    if (this.config.timeout_seconds < 1 || this.config.timeout_seconds > 60) {
      issues.push('timeout_seconds should be between 1 and 60');
    }

    if (this.config.batch_size < 1 || this.config.batch_size > 50) {
      issues.push('batch_size should be between 1 and 50');
    }

    // Validate URL formats
    const urlPattern = /^https?:\/\/.+/;

    if (this.config.success_endpoint && !urlPattern.test(this.config.success_endpoint)) {
      issues.push('success_endpoint must be a valid HTTP/HTTPS URL');
    }

    if (this.config.failure_endpoint && !urlPattern.test(this.config.failure_endpoint)) {
      issues.push('failure_endpoint must be a valid HTTP/HTTPS URL');
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}

// Helper function to create webhook manager from environment variables
export function createWebhookManager(config: WebhookConfig): WebhookManager {
  return new WebhookManager(config);
}

// Webhook payload builder for common scenarios
export class WebhookPayloadBuilder {
  static accountFailure(account: string, error: string, consecutiveFailures: number) {
    return {
      eventType: 'account_failure',
      data: {
        account,
        error,
        consecutiveFailures,
        severity: consecutiveFailures >= 5 ? 'critical' : 'warning',
        timestamp: new Date().toISOString()
      }
    };
  }

  static systemHealth(overall: string, details: Record<string, any>) {
    return {
      eventType: 'system_health',
      data: {
        overall,
        details,
        severity: overall === 'critical' ? 'critical' : 'warning',
        timestamp: new Date().toISOString()
      }
    };
  }

  static dailySummary(stats: Record<string, any>) {
    return {
      eventType: 'daily_summary',
      data: {
        ...stats,
        timestamp: new Date().toISOString()
      }
    };
  }

  static quotaAlert(account: string, used: number, limit: number) {
    const percentage = (used / limit) * 100;
    return {
      eventType: 'quota_alert',
      data: {
        account,
        used,
        limit,
        percentage: Math.round(percentage),
        severity: percentage >= 95 ? 'critical' : 'warning',
        timestamp: new Date().toISOString()
      }
    };
  }
}