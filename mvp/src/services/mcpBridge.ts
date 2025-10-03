import express, { Request, Response, NextFunction } from 'express';
import { log } from '../log';
import { AccountConfig } from '../config/accounts';
import { LoginWorker } from './loginWorker';

export interface MCPRequest {
  ctx: {
    accountHandle: string;
    proxyUrl?: string;
    cookiePath: string;
    timeoutMs?: number;
  };
  opts: any;
}

export interface MCPResponse {
  success: boolean;
  data?: any;
  error?: string | undefined;
  meta?: {
    accountHandle: string;
    timestamp: number;
  };
}

export class MCPBridge {
  private app: express.Application;
  private loginWorker: LoginWorker;
  private port: number;
  private token: string;

  constructor(port: number = 4500, token: string = 'change_me') {
    this.port = port;
    this.token = token;
    this.loginWorker = new LoginWorker();
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json({ limit: '10mb' }));
    
    // Authentication middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;
      const expectedToken = `Bearer ${this.token}`;
      
      if (authHeader !== expectedToken) {
        log.warn({ 
          ip: req.ip, 
          path: req.path,
          authHeader: authHeader ? 'Present' : 'Missing'
        }, 'Unauthorized MCP bridge request');
        
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }
      
      return next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        success: true,
        data: {
          service: 'MCP Bridge',
          timestamp: Date.now(),
          uptime: process.uptime()
        }
      });
    });

    // Navigate to URL
    this.app.post('/mcp/browser/navigate', async (req: Request, res: Response) => {
      try {
        const result = await this.handleNavigate(req.body);
        res.json(result);
      } catch (error) {
        log.error({ error: (error as Error).message }, 'Navigate request failed');
        res.status(500).json({
          success: false,
          error: (error as Error).message
        });
      }
    });

    // Extract content from page
    this.app.post('/mcp/browser/extract', async (req: Request, res: Response) => {
      try {
        const result = await this.handleExtract(req.body);
        res.json(result);
      } catch (error) {
        log.error({ error: (error as Error).message }, 'Extract request failed');
        res.status(500).json({
          success: false,
          error: (error as Error).message
        });
      }
    });

    // Refresh cookies for account
    this.app.post('/mcp/browser/refresh-cookies', async (req: Request, res: Response) => {
      try {
        const result = await this.handleRefreshCookies(req.body);
        res.json(result);
      } catch (error) {
        log.error({ error: (error as Error).message }, 'Cookie refresh request failed');
        res.status(500).json({
          success: false,
          error: (error as Error).message
        });
      }
    });

    // Test proxy connectivity
    this.app.post('/mcp/browser/test-proxy', async (req: Request, res: Response) => {
      try {
        const result = await this.handleTestProxy(req.body);
        res.json(result);
      } catch (error) {
        log.error({ error: (error as Error).message }, 'Proxy test request failed');
        res.status(500).json({
          success: false,
          error: (error as Error).message
        });
      }
    });
  }

  private async handleNavigate(request: MCPRequest): Promise<MCPResponse> {
    const { ctx, opts } = request;
    
    log.info({ 
      account: ctx.accountHandle, 
      url: opts.url 
    }, 'MCP navigate request');

    try {
      const { chromium } = await import('playwright');
      
      // Create browser context with proxy and cookies
      const browser = await chromium.launch({ headless: true });
      const contextOptions: any = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };

      if (ctx.proxyUrl) {
        const proxyUrl = new URL(ctx.proxyUrl);
        contextOptions.proxy = {
          server: `${proxyUrl.protocol}//${proxyUrl.host}`,
          username: proxyUrl.username,
          password: proxyUrl.password
        };
      }

      const context = await browser.newContext(contextOptions);
      
      // Load cookies if available
      try {
        const fs = await import('fs');
        if (fs.existsSync(ctx.cookiePath)) {
          const cookieData = JSON.parse(fs.readFileSync(ctx.cookiePath, 'utf8'));
          await context.addCookies(cookieData);
          log.info({ account: ctx.accountHandle }, 'Loaded cookies for navigation');
        }
      } catch (cookieError) {
        log.warn({ 
          account: ctx.accountHandle, 
          error: (cookieError as Error).message 
        }, 'Failed to load cookies for navigation');
      }

      const page = await context.newPage();
      
      // Navigate to URL
      await page.goto(opts.url, { 
        waitUntil: opts.waitFor || 'networkidle',
        timeout: ctx.timeoutMs || 30000
      });

      const title = await page.title();
      const url = page.url();

      await context.close();
      await browser.close();

      return {
        success: true,
        data: {
          url,
          title,
          timestamp: Date.now()
        },
        meta: {
          accountHandle: ctx.accountHandle,
          timestamp: Date.now()
        }
      };

    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        meta: {
          accountHandle: ctx.accountHandle,
          timestamp: Date.now()
        }
      };
    }
  }

  private async handleExtract(request: MCPRequest): Promise<MCPResponse> {
    const { ctx, opts } = request;
    
    log.info({ 
      account: ctx.accountHandle, 
      url: opts.url,
      extractType: opts.type 
    }, 'MCP extract request');

    try {
      const { chromium } = await import('playwright');
      
      const browser = await chromium.launch({ headless: true });
      const contextOptions: any = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };

      if (ctx.proxyUrl) {
        const proxyUrl = new URL(ctx.proxyUrl);
        contextOptions.proxy = {
          server: `${proxyUrl.protocol}//${proxyUrl.host}`,
          username: proxyUrl.username,
          password: proxyUrl.password
        };
      }

      const context = await browser.newContext(contextOptions);
      
      // Load cookies
      try {
        const fs = await import('fs');
        if (fs.existsSync(ctx.cookiePath)) {
          const cookieData = JSON.parse(fs.readFileSync(ctx.cookiePath, 'utf8'));
          await context.addCookies(cookieData);
        }
      } catch (cookieError) {
        log.warn({ account: ctx.accountHandle }, 'Failed to load cookies for extraction');
      }

      const page = await context.newPage();
      await page.goto(opts.url, { waitUntil: 'networkidle' });

      const result: any = {
        url: page.url(),
        title: await page.title(),
        timestamp: Date.now()
      };

      // Extract based on type
      if (opts.type === 'readability' || opts.type === 'text') {
        // Extract readable text content
        result.text = await page.evaluate(() => {
          // Simple text extraction - can be enhanced with readability libraries
          const body = (globalThis as any).document.body;
          const walker = (globalThis as any).document.createTreeWalker(
            body,
            (globalThis as any).NodeFilter.SHOW_TEXT,
            null,
            false
          );
          
          let text = '';
          let node;
          while (node = walker.nextNode()) {
            const textContent = (node as any).textContent?.trim();
            if (textContent && textContent.length > 10) {
              text += textContent + '\n';
            }
          }
          
          return text;
        });
      }

      if (opts.type === 'screenshot') {
        // Take screenshot
        const screenshot = await page.screenshot({ 
          type: 'png',
          fullPage: opts.fullPage || false 
        });
        result.screenshotB64 = screenshot.toString('base64');
      }

      if (opts.type === 'html') {
        result.html = await page.content();
      }

      await context.close();
      await browser.close();

      return {
        success: true,
        data: result,
        meta: {
          accountHandle: ctx.accountHandle,
          timestamp: Date.now()
        }
      };

    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        meta: {
          accountHandle: ctx.accountHandle,
          timestamp: Date.now()
        }
      };
    }
  }

  private async handleRefreshCookies(request: { accountHandle: string }): Promise<MCPResponse> {
    const { accountHandle } = request;
    
    log.info({ account: accountHandle }, 'MCP cookie refresh request');

    try {
      // Create a mock account config for the login worker
      const accountConfig: AccountConfig = {
        handle: accountHandle,
        mode: 'cookie',
        cookie_path: `/secrets/${accountHandle.replace('@', '')}.cookies.json`,
        backup_api_key: '',
        daily_cap: 10,
        min_minutes_between_posts: 60,
        active: true,
        priority: 1,
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        proxy_url: process.env.RESIDENTIAL_PROXY || process.env.PROXY_URL || undefined
      };

      const result = await this.loginWorker.refreshCookies(accountConfig);

      return {
        success: result.success,
        data: result.success ? { message: 'Cookies refreshed successfully' } : null,
        error: result.error,
        meta: {
          accountHandle,
          timestamp: Date.now()
        }
      };

    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        meta: {
          accountHandle,
          timestamp: Date.now()
        }
      };
    }
  }

  private async handleTestProxy(request: { accountHandle: string; proxyUrl?: string }): Promise<MCPResponse> {
    const { accountHandle, proxyUrl } = request;
    
    log.info({ account: accountHandle, proxyUrl }, 'MCP proxy test request');

    try {
      const accountConfig: AccountConfig = {
        handle: accountHandle,
        mode: 'cookie',
        cookie_path: `/secrets/${accountHandle.replace('@', '')}.cookies.json`,
        backup_api_key: '',
        daily_cap: 10,
        min_minutes_between_posts: 60,
        active: true,
        priority: 1,
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        proxy_url: proxyUrl || undefined
      };

      const result = await this.loginWorker.testProxyConnectivity(accountConfig);

      return {
        success: result,
        data: { message: result ? 'Proxy connectivity test passed' : 'Proxy connectivity test failed' },
        meta: {
          accountHandle,
          timestamp: Date.now()
        }
      };

    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        meta: {
          accountHandle,
          timestamp: Date.now()
        }
      };
    }
  }

  /**
   * Start the MCP bridge server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.app.listen(this.port, () => {
          log.info({ 
            port: this.port, 
            token: this.token.substring(0, 8) + '...' 
          }, 'MCP Bridge server started');
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the MCP bridge server
   */
  stop(): void {
    log.info('MCP Bridge server stopped');
  }
}
