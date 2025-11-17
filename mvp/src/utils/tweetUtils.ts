/**
 * Extract tweet ID from a tweet URL
 * Example: "https://x.com/user/status/1234567890" → "1234567890"
 */
export function extractTweetId(url: string): string {
  const match = url.match(/\/status\/(\d+)/);
  return match && match[1] ? match[1] : '';
}

/**
 * Build tweet URL from username and tweet ID
 * Example: buildTweetUrl("pelpa333", "1234567890") → "https://x.com/pelpa333/status/1234567890"
 */
export function buildTweetUrl(username: string, tweetId: string): string {
  const cleanUsername = username.replace('@', '');
  return `https://x.com/${cleanUsername}/status/${tweetId}`;
}

/**
 * Extract username from tweet URL
 * Example: "https://x.com/pelpa333/status/123" → "pelpa333"
 */
export function extractUsernameFromUrl(url: string): string {
  const match = url.match(/x\.com\/([^\/]+)/);
  return match ? `@${match[1]}` : '';
}

