import { log } from '../log';

/**
 * Health Check Server for Fly.io deployment
 * Provides HTTP endpoint for health checks and monitoring
 */
export class HealthServer {
  private server: any;
  private port: number;

  constructor(port: number = 3000) {
    this.port = port;
  }

  start(): void {
    const http = require('http');
    
    this.server = http.createServer((req: any, res: any) => {
      // Enable CORS for all requests
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.url === '/health' || req.url === '/') {
        const healthData = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          service: 'xlochagos',
          version: '1.0.0',
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          environment: process.env.NODE_ENV || 'development'
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(healthData, null, 2));
      } else if (req.url === '/status') {
        const statusData = {
          service: 'xlochagos',
          status: 'running',
          timestamp: new Date().toISOString(),
          pid: process.pid,
          platform: process.platform,
          nodeVersion: process.version
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(statusData, null, 2));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Not Found', 
          message: 'Available endpoints: /health, /status' 
        }));
      }
    });

    this.server.listen(this.port, () => {
      log.info({ port: this.port }, 'Health check server started');
    });

    this.server.on('error', (error: any) => {
      log.error({ error: error.message }, 'Health server error');
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close(() => {
        log.info('Health check server stopped');
      });
    }
  }
}

