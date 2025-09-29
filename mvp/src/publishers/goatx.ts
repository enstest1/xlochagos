import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Account, PostDraft, PublishResult, HealthCheck, IPublisher, PublishError } from '../types';
import { logPublishAttempt, logPublishSuccess, logPublishError, logFallback, logError } from '../log';

export class GoatXPublisher implements IPublisher {
  private lastError: Error | null = null;
  private consecutiveFailures = 0;

  constructor(
    private account: Account,
    private opts: { dryRun: boolean; timeout?: number }
  ) {}

  async publish(draft: PostDraft): Promise<PublishResult> {
    const startTime = Date.now();

    logPublishAttempt(this.account.handle, 'cookie', this.opts.dryRun);

    if (this.opts.dryRun) {
      logPublishSuccess(
        this.account.handle,
        'cookie',
        'dry_run',
        '',
        Date.now() - startTime,
        true
      );

      return {
        id: 'dry_run',
        url: '',
        method: 'cookie',
        responseTimeMs: Date.now() - startTime,
        success: true,
        retryable: false
      };
    }

    try {
      // Validate cookies before attempting
      const cookieValidation = await this.validateCookies();
      if (!cookieValidation.success) {
        throw new PublishError(
          `Cookie validation failed: ${cookieValidation.error}`,
          this.account.handle,
          false,
          'cookie'
        );
      }

      const cookieJson = readFileSync(this.account.cookie_path!, 'utf8');
      const timeout = this.opts.timeout || 30000;

      // Enhanced GOAT-X command with user agent
      const args = [
        'post',
        '--cookie-stdin',
        '--text', draft.text,
        '--user-agent', this.account.user_agent || 'Mozilla/5.0 (compatible; PostBot/1.0)',
        '--timeout', timeout.toString()
      ];

      const result = await this.executeGoatX(args, cookieJson, timeout);

      this.consecutiveFailures = 0;
      this.lastError = null;

      logPublishSuccess(
        this.account.handle,
        'cookie',
        result.id || '',
        result.url || '',
        Date.now() - startTime,
        false
      );

      return {
        id: result.id || '',
        url: result.url || '',
        method: 'cookie',
        responseTimeMs: Date.now() - startTime,
        success: true,
        retryable: false
      };

    } catch (error) {
      this.consecutiveFailures++;
      this.lastError = error as Error;

      logPublishError(
        this.account.handle,
        'cookie',
        (error as Error).message,
        this.isRetryableError(error as Error)
      );

      return {
        id: '',
        url: '',
        method: 'cookie',
        responseTimeMs: Date.now() - startTime,
        success: false,
        error: (error as Error).message,
        retryable: this.isRetryableError(error as Error)
      };
    }
  }

  private async executeGoatX(args: string[], cookieJson: string, timeout: number): Promise<{id: string; url: string}> {
    return new Promise((resolve, reject) => {
      const process = spawn('goatx', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout
      });

      let stdout = '';
      let stderr = '';

      process.stdin.write(cookieJson);
      process.stdin.end();

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout.trim());
            resolve({
              id: String(result.id || ''),
              url: String(result.url || '')
            });
          } catch (parseError) {
            reject(new PublishError(
              `Invalid JSON response: ${stdout}`,
              this.account.handle,
              false,
              'cookie'
            ));
          }
        } else {
          // Map GOAT-X exit codes to specific errors
          let errorMessage = stderr || stdout || `GOAT-X exited with code ${code}`;
          let retryable = false;

          switch (code) {
            case 1:
              errorMessage = 'Authentication failed - cookies may be expired';
              retryable = false;
              break;
            case 2:
              errorMessage = 'Rate limited by platform';
              retryable = true;
              break;
            case 3:
              errorMessage = 'Content rejected by platform';
              retryable = false;
              break;
            case 4:
              errorMessage = 'Network error';
              retryable = true;
              break;
            default:
              errorMessage = `Unknown error (code ${code}): ${errorMessage}`;
              retryable = true;
          }

          reject(new PublishError(errorMessage, this.account.handle, retryable, 'cookie'));
        }
      });

      process.on('error', (error) => {
        reject(new PublishError(
          `Process error: ${error.message}`,
          this.account.handle,
          true,
          'cookie'
        ));
      });
    });
  }

  private async validateCookies(): Promise<{success: boolean; error?: string}> {
    try {
      if (!this.account.cookie_path) {
        return {success: false, error: 'No cookie path configured'};
      }

      const cookieJson = readFileSync(this.account.cookie_path, 'utf8');
      const cookies = JSON.parse(cookieJson);
      const cookieMap = this.extractCookieMap(cookies);

      const required = ['auth_token', 'ct0'];
      const missing = required.filter(key => !cookieMap.has(key) || !cookieMap.get(key));

      if (missing.length > 0) {
        return {success: false, error: `Missing required cookies: ${missing.join(', ')}`};
      }

      // Additional validation checks
      const authToken = cookieMap.get('auth_token');
      if (authToken && authToken.length < 40) {
        return {success: false, error: 'auth_token appears invalid (too short)'};
      }

      const ct0 = cookieMap.get('ct0');
      if (ct0 && ct0.length < 32) {
        return {success: false, error: 'ct0 token appears too short'};
      }

      return {success: true};
    } catch (error) {
      return {success: false, error: `Cookie validation error: ${(error as Error).message}`};
    }
  }

  private extractCookieMap(cookies: any): Map<string, string> {
    const map = new Map<string, string>();

    if (Array.isArray(cookies)) {
      for (const cookie of cookies) {
        if (typeof cookie === 'string') {
          // Parse "name=value; domain=..." format
          const [nameValue] = cookie.split(';');
          if (nameValue) {
            const [name, value] = nameValue.split('=');
            if (name && value) {
              map.set(name.trim(), value.trim());
            }
          }
        } else if (cookie && typeof cookie === 'object' && cookie.name) {
          // Parse {name: "auth_token", value: "abc123"} format
          map.set(cookie.name, cookie.value || '');
        }
      }
    }

    return map;
  }

  private isRetryableError(error: Error): boolean {
    const retryableMessages = [
      'timeout',
      'network',
      'connection',
      'temporary',
      'rate limit',
      'server error',
      'service unavailable'
    ];

    const errorMessage = error.message.toLowerCase();
    return retryableMessages.some(msg => errorMessage.includes(msg));
  }

  async healthCheck(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      const cookieValidation = await this.validateCookies();

      return {
        timestamp: Date.now(),
        checkType: 'cookie',
        account: this.account.handle,
        status: cookieValidation.success ? 'pass' : 'fail',
        details: {
          cookieValidation,
          consecutiveFailures: this.consecutiveFailures,
          lastError: this.lastError?.message,
          mode: this.account.mode,
          hasBackupApiKey: !!this.account.backup_api_key
        },
        responseTimeMs: Date.now() - startTime
      };
    } catch (error) {
      return {
        timestamp: Date.now(),
        checkType: 'cookie',
        account: this.account.handle,
        status: 'fail',
        details: {
          error: (error as Error).message,
          consecutiveFailures: this.consecutiveFailures
        },
        responseTimeMs: Date.now() - startTime
      };
    }
  }

  getLastError(): Error | null {
    return this.lastError;
  }

  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  resetFailureCount(): void {
    this.consecutiveFailures = 0;
    this.lastError = null;
  }
}

// Backup API publisher for fallback scenarios
export class BackupApiPublisher implements IPublisher {
  private lastError: Error | null = null;

  constructor(
    private account: Account,
    private opts: { dryRun: boolean; timeout?: number }
  ) {}

  async publish(draft: PostDraft): Promise<PublishResult> {
    const startTime = Date.now();

    logPublishAttempt(this.account.handle, 'api', this.opts.dryRun);

    if (this.opts.dryRun) {
      logPublishSuccess(
        this.account.handle,
        'api',
        'dry_run_api',
        '',
        Date.now() - startTime,
        true
      );

      return {
        id: 'dry_run_api',
        url: '',
        method: 'api',
        responseTimeMs: Date.now() - startTime,
        success: true,
        retryable: false
      };
    }

    try {
      if (!this.account.backup_api_key) {
        throw new PublishError(
          'No API key configured for fallback',
          this.account.handle,
          false,
          'api'
        );
      }

      const timeout = this.opts.timeout || 30000;

      // Use GOAT-X with API key fallback
      const args = [
        'post',
        '--api-key', this.account.backup_api_key,
        '--text', draft.text,
        '--timeout', timeout.toString()
      ];

      const result = await this.executeGoatXApi(args, timeout);

      this.lastError = null;

      logPublishSuccess(
        this.account.handle,
        'api',
        result.id || '',
        result.url || '',
        Date.now() - startTime,
        false
      );

      return {
        id: result.id || '',
        url: result.url || '',
        method: 'api',
        responseTimeMs: Date.now() - startTime,
        success: true,
        retryable: false
      };

    } catch (error) {
      this.lastError = error as Error;

      logPublishError(
        this.account.handle,
        'api',
        (error as Error).message,
        this.isRetryableError(error as Error)
      );

      return {
        id: '',
        url: '',
        method: 'api',
        responseTimeMs: Date.now() - startTime,
        success: false,
        error: (error as Error).message,
        retryable: this.isRetryableError(error as Error)
      };
    }
  }

  private async executeGoatXApi(args: string[], timeout: number): Promise<{id: string; url: string}> {
    return new Promise((resolve, reject) => {
      const process = spawn('goatx', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout.trim());
            resolve({
              id: String(result.id || ''),
              url: String(result.url || '')
            });
          } catch (parseError) {
            reject(new PublishError(
              `Invalid JSON response: ${stdout}`,
              this.account.handle,
              false,
              'api'
            ));
          }
        } else {
          const errorMessage = stderr || stdout || `GOAT-X API exited with code ${code}`;
          reject(new PublishError(errorMessage, this.account.handle, code === 2, 'api'));
        }
      });

      process.on('error', (error) => {
        reject(new PublishError(
          `API process error: ${error.message}`,
          this.account.handle,
          true,
          'api'
        ));
      });
    });
  }

  private isRetryableError(error: Error): boolean {
    const retryableMessages = [
      'timeout',
      'network',
      'connection',
      'temporary',
      'rate limit',
      'server error',
      'service unavailable'
    ];

    const errorMessage = error.message.toLowerCase();
    return retryableMessages.some(msg => errorMessage.includes(msg));
  }

  async healthCheck(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      const hasApiKey = !!this.account.backup_api_key;

      return {
        timestamp: Date.now(),
        checkType: 'system',
        account: this.account.handle,
        status: hasApiKey ? 'pass' : 'fail',
        details: {
          hasApiKey,
          lastError: this.lastError?.message,
          mode: 'api'
        },
        responseTimeMs: Date.now() - startTime
      };
    } catch (error) {
      return {
        timestamp: Date.now(),
        checkType: 'system',
        account: this.account.handle,
        status: 'fail',
        details: {
          error: (error as Error).message
        },
        responseTimeMs: Date.now() - startTime
      };
    }
  }

  getLastError(): Error | null {
    return this.lastError;
  }
}

// Publisher factory
export function createPublisher(account: Account, opts: { dryRun: boolean; timeout?: number }): IPublisher {
  if (account.mode === 'cookie') {
    return new GoatXPublisher(account, opts);
  } else {
    return new BackupApiPublisher(account, opts);
  }
}

export function createBackupPublisher(account: Account, opts: { dryRun: boolean; timeout?: number }): IPublisher {
  return new BackupApiPublisher(account, opts);
}

// Publisher with automatic fallback
export class ResilientPublisher implements IPublisher {
  private primaryPublisher: IPublisher;
  private backupPublisher: IPublisher;

  constructor(
    private account: Account,
    private opts: { dryRun: boolean; timeout?: number }
  ) {
    this.primaryPublisher = createPublisher(account, opts);
    this.backupPublisher = createBackupPublisher(account, opts);
  }

  async publish(draft: PostDraft): Promise<PublishResult> {
    // Try primary method first
    const primaryResult = await this.primaryPublisher.publish(draft);

    if (primaryResult.success) {
      return primaryResult;
    }

    // If primary failed and we have a backup API key, try fallback
    if (this.account.backup_api_key && primaryResult.retryable) {
      logFallback(
        this.account.handle,
        this.account.mode,
        'api',
        primaryResult.error || 'Unknown error'
      );

      const backupResult = await this.backupPublisher.publish(draft);

      // If backup succeeded, update the method and return
      if (backupResult.success) {
        return {
          ...backupResult,
          method: 'api'
        };
      }
    }

    // Both methods failed, return the primary error
    return primaryResult;
  }

  async healthCheck(): Promise<HealthCheck> {
    const primaryHealth = await this.primaryPublisher.healthCheck();

    // If primary is healthy, return its status
    if (primaryHealth.status === 'pass') {
      return primaryHealth;
    }

    // If primary failed, check backup if available
    if (this.account.backup_api_key) {
      const backupHealth = await this.backupPublisher.healthCheck();

      return {
        ...primaryHealth,
        details: {
          ...primaryHealth.details,
          backupHealth: backupHealth.status,
          backupDetails: backupHealth.details
        }
      };
    }

    return primaryHealth;
  }

  getLastError(): Error | null {
    return this.primaryPublisher.getLastError() || this.backupPublisher.getLastError();
  }
}