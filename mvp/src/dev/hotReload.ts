import { log } from '../log';
import fs from 'fs';
import path from 'path';
import * as chokidar from 'chokidar';

interface HotReloadConfig {
  watchPaths: string[];
  excludePaths: string[];
  rebuildCommand: string;
  restartCommand?: string | undefined;
}

export class HotReloadManager {
  private watcher: chokidar.FSWatcher | null = null;
  private isBuilding = false;
  private buildTimeout: NodeJS.Timeout | null = null;
  private readonly BUILD_DELAY = 1000; // Wait 1 second after last change before rebuilding

  constructor(private config: HotReloadConfig) {}

  start(): void {
    log.info({ 
      watchPaths: this.config.watchPaths,
      excludePaths: this.config.excludePaths 
    }, 'Starting hot reload watcher');

    this.watcher = chokidar.watch(this.config.watchPaths, {
      ignored: this.config.excludePaths,
      ignoreInitial: true,
      persistent: true
    });

    this.watcher
      .on('change', (filePath: string) => this.handleFileChange(filePath))
      .on('add', (filePath: string) => this.handleFileChange(filePath))
      .on('unlink', (filePath: string) => this.handleFileChange(filePath))
      .on('error', (error: unknown) => {
        log.error({ error: (error as Error).message }, 'Hot reload watcher error');
      });

    log.info('Hot reload watcher started successfully');
  }

  private handleFileChange(filePath: string): void {
    const relativePath = path.relative(process.cwd(), filePath);
    
    log.info({ filePath: relativePath }, 'File changed, scheduling rebuild');

    // Clear existing timeout
    if (this.buildTimeout) {
      clearTimeout(this.buildTimeout);
    }

    // Set new timeout for rebuild
    this.buildTimeout = setTimeout(() => {
      this.rebuild();
    }, this.BUILD_DELAY);
  }

  private async rebuild(): Promise<void> {
    if (this.isBuilding) {
      log.info('Build already in progress, skipping');
      return;
    }

    this.isBuilding = true;

    try {
      log.info('Starting hot rebuild...');
      
      // Import and execute the build command
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      await execAsync(this.config.rebuildCommand, {
        cwd: process.cwd()
      });

      log.info('Hot rebuild completed successfully');

      // If restart command is provided, restart the process
      if (this.config.restartCommand) {
        log.info('Restarting application...');
        await execAsync(this.config.restartCommand, {
          cwd: process.cwd()
        });
      }

    } catch (error) {
      log.error({ 
        error: (error as Error).message 
      }, 'Hot rebuild failed');
    } finally {
      this.isBuilding = false;
    }
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.buildTimeout) {
      clearTimeout(this.buildTimeout);
      this.buildTimeout = null;
    }

    log.info('Hot reload watcher stopped');
  }

  isWatching(): boolean {
    return this.watcher !== null;
  }
}

// Default hot reload configuration
export const defaultHotReloadConfig: HotReloadConfig = {
  watchPaths: [
    'src/**/*.ts',
    'src/**/*.js',
    'config/**/*.yaml',
    'config/**/*.yml'
  ],
  excludePaths: [
    '**/node_modules/**',
    '**/dist/**',
    '**/.git/**',
    '**/sessions/**',
    '**/*.log'
  ],
  rebuildCommand: 'npm run build',
  restartCommand: undefined // Don't restart, just rebuild
};

// Create hot reload manager instance
export const hotReloadManager = new HotReloadManager(defaultHotReloadConfig);
