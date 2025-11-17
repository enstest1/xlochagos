/**
 * Shared configuration for sideways and inbound reply systems
 * Used by monitor (detection) and reply services (processing)
 */
export const REPLY_CONFIG = {
  sideways: {
    MAX_PER_ROOT: 6,
    MAX_PER_ALT_PER_ROOT: 2,
    MIN_SCORE_THRESHOLD: 3,
    MAX_RETRIES: 3,
  },
  inbound: {
    MAX_PER_ALT_PER_HOUR: 8,
    MAX_PER_USER_PER_ALT_PER_DAY: 2,
    MIN_SCORE_THRESHOLD: 2,
  },
  delays: {
    // Testing delays (fast for development)
    SIDEWAYS_MIN_MS: 5 * 1000,   // 5 seconds
    SIDEWAYS_MAX_MS: 60 * 1000,  // 60 seconds
    INBOUND_MIN_MS: 10 * 1000,   // 10 seconds
    INBOUND_MAX_MS: 90 * 1000,   // 90 seconds
    BETWEEN_TWEETS_MS: 10 * 1000, // 10 seconds
  },
  rateLimits: {
    // X.com rate limits (to keep process natural and avoid detection)
    MAX_REQUESTS_PER_MINUTE: 10,      // Max API/scraper requests per minute
    MAX_REPLIES_PER_HOUR: 20,         // Max total replies per hour (across all alts)
    MIN_SECONDS_BETWEEN_REPLIES: 30,  // Minimum seconds between any two replies
    MAX_REPLIES_PER_DAY: 100,         // Max total replies per day (across all alts)
  }
} as const;

