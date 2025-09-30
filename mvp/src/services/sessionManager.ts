import { Scraper } from 'goat-x';
import { log } from '../log';
import fs from 'fs';
import path from 'path';

interface SessionData {
  username: string;
  authToken?: string;
  ct0?: string;
  cookies?: string;
  timestamp: number;
  expiresAt: number;
}

export class SessionManager {
  private sessions: Map<string, SessionData> = new Map();
  private sessionDir: string;
  private readonly SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.sessionDir = path.join(process.cwd(), 'sessions');
    this.ensureSessionDir();
    this.loadSessions();
  }

  private ensureSessionDir(): void {
    try {
      if (!fs.existsSync(this.sessionDir)) {
        fs.mkdirSync(this.sessionDir, { recursive: true });
      }
    } catch (error) {
      // If we can't create the sessions directory (e.g., in production), 
      // use a temporary directory or disable file-based sessions
      console.warn('Could not create sessions directory, using memory-only sessions:', error);
      this.sessionDir = '/tmp/sessions';
      try {
        fs.mkdirSync(this.sessionDir, { recursive: true });
      } catch (tmpError) {
        console.warn('Could not create temp sessions directory, sessions will be memory-only');
        this.sessionDir = '';
      }
    }
  }

  private getSessionFile(username: string): string {
    return path.join(this.sessionDir, `${username}.session.json`);
  }

  private loadSessions(): void {
    try {
      if (!this.sessionDir) {
        console.log('Sessions directory not available, starting with empty session store');
        return;
      }
      const files = fs.readdirSync(this.sessionDir);
      
      for (const file of files) {
        if (file.endsWith('.session.json')) {
          const username = file.replace('.session.json', '');
          const sessionPath = path.join(this.sessionDir, file);
          
          try {
            const sessionData: SessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            
            // Check if session is still valid
            if (Date.now() < sessionData.expiresAt) {
              this.sessions.set(username, sessionData);
              log.info({ username }, 'Loaded valid session from disk');
            } else {
              // Remove expired session
              fs.unlinkSync(sessionPath);
              log.info({ username }, 'Removed expired session');
            }
          } catch (error) {
            log.warn({ username, error: (error as Error).message }, 'Failed to load session file');
          }
        }
      }
    } catch (error) {
      log.warn({ error: (error as Error).message }, 'Failed to load sessions directory');
    }
  }

  private saveSession(username: string, sessionData: SessionData): void {
    try {
      if (!this.sessionDir) {
        // If no session directory, just keep in memory
        this.sessions.set(username, sessionData);
        return;
      }
      const sessionPath = this.getSessionFile(username);
      fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));
      this.sessions.set(username, sessionData);
      log.info({ username }, 'Session saved to disk');
    } catch (error) {
      log.error({ username, error: (error as Error).message }, 'Failed to save session');
      // Still save to memory even if disk save fails
      this.sessions.set(username, sessionData);
    }
  }

  async createSession(username: string, password: string): Promise<SessionData | null> {
    try {
      const scraper = new Scraper();
      await scraper.login(username, password);
      
      // Extract session data from scraper
      const authToken = (scraper as any).auth?.token;
      const ct0 = (scraper as any).auth?.ct0;
      const cookies = (scraper as any).auth?.cookies;
      
      const sessionData: SessionData = {
        username,
        authToken,
        ct0,
        cookies,
        timestamp: Date.now(),
        expiresAt: Date.now() + this.SESSION_DURATION
      };
      
      this.saveSession(username, sessionData);
      log.info({ username }, 'New session created successfully');
      
      return sessionData;
    } catch (error) {
      log.error({ username, error: (error as Error).message }, 'Failed to create session');
      return null;
    }
  }

  getSession(username: string): SessionData | null {
    const session = this.sessions.get(username);
    
    if (!session) {
      return null;
    }
    
    // Check if session is still valid
    if (Date.now() >= session.expiresAt) {
      this.removeSession(username);
      return null;
    }
    
    return session;
  }

  removeSession(username: string): void {
    this.sessions.delete(username);
    const sessionPath = this.getSessionFile(username);
    
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
    }
    
    log.info({ username }, 'Session removed');
  }

  isSessionValid(username: string): boolean {
    const session = this.getSession(username);
    return session !== null;
  }

  async restoreScraper(username: string): Promise<Scraper | null> {
    // First try to load from existing cookie file
    try {
      const cookiePath = path.join(process.cwd(), 'secrets', `${username}.cookies.json`);
      if (fs.existsSync(cookiePath)) {
        log.info({ username }, 'Found existing cookie file, loading...');
        const cookieData = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
        
        const scraper = new Scraper();
        
        // Extract auth_token and ct0 from cookie data
        const authTokenCookie = cookieData.find((cookie: any) => cookie.name === 'auth_token');
        const ct0Cookie = cookieData.find((cookie: any) => cookie.name === 'ct0');
        
        if (authTokenCookie && ct0Cookie) {
          (scraper as any).auth = {
            token: authTokenCookie.value,
            ct0: ct0Cookie.value,
            cookies: cookieData
          };
          
          log.info({ username }, 'Successfully loaded cookies from file');
          return scraper;
        }
      }
    } catch (error) {
      log.warn({ username, error: (error as Error).message }, 'Failed to load cookie file');
    }
    
    // Fallback to session-based approach
    const session = this.getSession(username);
    
    if (!session) {
      return null;
    }
    
    try {
      const scraper = new Scraper();
      
      // Restore authentication data
      if (session.authToken && session.ct0) {
        (scraper as any).auth = {
          token: session.authToken,
          ct0: session.ct0,
          cookies: session.cookies
        };
      }
      
      log.info({ username }, 'Scraper restored from session');
      return scraper;
    } catch (error) {
      log.error({ username, error: (error as Error).message }, 'Failed to restore scraper from session');
      return null;
    }
  }

  getAllActiveSessions(): string[] {
    const activeSessions: string[] = [];
    
    for (const [username, session] of this.sessions.entries()) {
      if (Date.now() < session.expiresAt) {
        activeSessions.push(username);
      }
    }
    
    return activeSessions;
  }

  cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredUsernames: string[] = [];
    
    for (const [username, session] of this.sessions.entries()) {
      if (now >= session.expiresAt) {
        expiredUsernames.push(username);
      }
    }
    
    for (const username of expiredUsernames) {
      this.removeSession(username);
    }
    
    if (expiredUsernames.length > 0) {
      log.info({ expiredSessions: expiredUsernames.length }, 'Cleaned up expired sessions');
    }
  }
}

// Global session manager instance
export const sessionManager = new SessionManager();




