import { Scraper } from 'goat-x';
import { log } from '../log';
import { sessionManager } from './sessionManager';
import { getOutboundIp } from '../net/proxyClient';

export interface XPost {
  id: string;
  text: string;
  author: string;
  timestamp: number;
  url: string;
  isRetweet?: boolean;
  isReply?: boolean;
}

export class XApiService {
  private scraper: Scraper | null = null;
  private isLoggedIn = false;
  private username: string | null = null;

  constructor() {
    // Don't create scraper immediately - wait for login
  }

  async login(username: string, proxyUrl?: string): Promise<boolean> {
    try {
      // Only try to restore from existing cookie file - no password authentication
      this.scraper = await sessionManager.restoreScraper(username, proxyUrl);
      
      if (this.scraper) {
        // Test if the scraper is actually authenticated
        try {
          // Try a simple operation to verify authentication
          await this.scraper.getUserTweets(username, 1);
          log.info({ username }, 'Cookie-based authentication verified - no password used');
          
          // Log outbound IP to verify proxy usage
          if (proxyUrl) {
            const outboundIp = await getOutboundIp({ handle: username, proxyUrl });
            if (outboundIp) {
              log.info({ username, outboundIp }, 'Outbound IP verified for proxy configuration');
            }
          }
          
          this.isLoggedIn = true;
          this.username = username;
          return true;
        } catch (authError) {
          log.error({ username, error: (authError as Error).message }, 'Cookie authentication failed - no fallback available');
          this.scraper = null;
        }
      } else {
        log.error({ username }, 'No cookie file found - cookie-only authentication requires existing cookies');
        log.error({ username }, 'To fix this: 1) Export cookies from your browser 2) Upload to Railway secrets 3) Or switch to Twitter API');
      }
      
      this.isLoggedIn = false;
      this.username = null;
      return false;
    } catch (error) {
      log.error({ 
        username, 
        error: (error as Error).message 
      }, 'Cookie-based authentication failed');
      this.scraper = null;
      this.isLoggedIn = false;
      this.username = null;
      return false;
    }
  }

  async getRecentPosts(username: string, count = 20): Promise<XPost[]> {
    if (!this.isLoggedIn || !this.scraper) {
      throw new Error('Not logged into X. Call login() first.');
    }

    try {
      log.info({ username, count }, 'Fetching recent posts from X');
      
      // Try different methods to fetch user's recent posts
      let tweets = [];
      
      try {
        // First try getUserTweets
        const tweetsResult = await this.scraper.getUserTweets(username, count);
        tweets = Array.isArray(tweetsResult) ? tweetsResult : tweetsResult.tweets || [];
      } catch (error) {
        log.warn({ username, error: (error as Error).message }, 'getUserTweets failed, trying getTweets');
        
        try {
          // Fallback to getTweets - handle async generator
          const tweetsGenerator = this.scraper!.getTweets(username, count);
          const tweetArray = [];
          for await (const tweet of tweetsGenerator) {
            tweetArray.push(tweet);
            if (tweetArray.length >= count) break;
          }
          tweets = tweetArray;
        } catch (error2) {
          log.warn({ username, error: (error2 as Error).message }, 'getTweets failed, trying searchTweets');
          
          try {
            // Last resort: search for tweets from the user - handle async generator
            const searchGenerator = this.scraper!.searchTweets(`from:${username}`, count);
            const searchArray = [];
            for await (const tweet of searchGenerator) {
              searchArray.push(tweet);
              if (searchArray.length >= count) break;
            }
            tweets = searchArray;
          } catch (error3) {
            // If all methods fail, check if it's an authentication issue
            const errorMessage = (error as Error).message;
            if (errorMessage.includes('auth.installTo is not a function') || 
                errorMessage.includes('auth.isLoggedIn is not a function')) {
              log.error({ username, error: errorMessage }, 'Authentication method not supported - may need library update');
              // Try to re-authenticate
              this.isLoggedIn = false;
              throw new Error(`Authentication failed: ${errorMessage}`);
            }
            throw new Error(`All tweet fetching methods failed: ${errorMessage}, ${(error2 as Error).message}, ${(error3 as Error).message}`);
          }
        }
      }
      
      const posts: XPost[] = tweets.map((tweet: any) => ({
        id: tweet.id || `tweet_${Date.now()}_${Math.random()}`,
        text: tweet.text || tweet.fullText || '',
        author: username,
        timestamp: tweet.timestamp ? new Date(tweet.timestamp).getTime() : Date.now(),
        url: `https://x.com/${username}/status/${tweet.id || Date.now()}`,
        isRetweet: tweet.isRetweet || false,
        isReply: tweet.isReply || false
      }));

      log.info({ 
        username, 
        postsFound: posts.length 
      }, 'Successfully fetched posts from X');

      return posts;
    } catch (error) {
      log.error({ 
        username, 
        error: (error as Error).message 
      }, 'Failed to fetch posts from X');
      return [];
    }
  }

  async postTweet(text: string): Promise<{ success: boolean; id?: string; error?: string }> {
    if (!this.isLoggedIn || !this.scraper) {
      return { success: false, error: 'Not logged into X. Call login() first.' };
    }

    try {
      log.info({ textLength: text.length }, 'Posting tweet to X');
      
      const result = await this.scraper.sendTweet(text);
      
      log.info({ 
        success: true,
        textLength: text.length 
      }, 'Successfully posted tweet to X');

      return { 
        success: true, 
        id: `tweet_${Date.now()}` 
      };
    } catch (error) {
      log.error({ 
        error: (error as Error).message,
        textLength: text.length 
      }, 'Failed to post tweet to X');

      return { 
        success: false, 
        error: (error as Error).message 
      };
    }
  }

  async likeTweet(tweetId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isLoggedIn || !this.scraper) {
      return { success: false, error: 'Not logged into X. Call login() first.' };
    }

    try {
      log.info({ tweetId }, 'Liking tweet on X');
      
      await this.scraper.likeTweet(tweetId);
      
      log.info({ tweetId }, 'Successfully liked tweet on X');
      return { success: true };
    } catch (error) {
      log.error({ 
        tweetId,
        error: (error as Error).message 
      }, 'Failed to like tweet on X');

      return { 
        success: false, 
        error: (error as Error).message 
      };
    }
  }

  async replyToTweet(tweetId: string, text: string): Promise<{ success: boolean; id?: string; error?: string }> {
    if (!this.isLoggedIn || !this.scraper) {
      return { success: false, error: 'Not logged into X. Call login() first.' };
    }

    try {
      log.info({ tweetId, textLength: text.length }, 'Replying to tweet on X');
      
      // Use sendTweet with replyToTweetId parameter for proper reply
      const result = await this.scraper.sendTweet(text, tweetId);
      
      log.info({ 
        tweetId,
        success: true,
        textLength: text.length 
      }, 'Successfully posted reply tweet to X');

      return { 
        success: true, 
        id: `reply_${Date.now()}` 
      };
    } catch (error) {
      log.error({ 
        tweetId,
        error: (error as Error).message,
        textLength: text.length 
      }, 'Failed to reply to tweet on X');

      return { 
        success: false, 
        error: (error as Error).message 
      };
    }
  }

  isAuthenticated(): boolean {
    return this.isLoggedIn;
  }

  getCurrentUsername(): string | null {
    return this.username;
  }

  async logout(): Promise<void> {
    try {
      if (this.username) {
        sessionManager.removeSession(this.username);
      }
      this.scraper = null;
      this.isLoggedIn = false;
      this.username = null;
      log.info('Logged out of X');
    } catch (error) {
      log.error({ 
        error: (error as Error).message 
      }, 'Error during logout');
    }
  }
}
