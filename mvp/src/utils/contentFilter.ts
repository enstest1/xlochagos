/**
 * Check if a reply text is too generic/low-effort to post
 * Exported from ResponseAgent for reuse across services
 */
export function isGarbage(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 20) return true;

  const blacklist = [
    'gm',
    'bullish',
    'insane',
    'crazy',
    'nice',
    'love this',
    'awesome',
    'great',
    'so true',
    'facts',
    'let\'s go',
    'lfg'
  ];

  const lower = trimmed.toLowerCase();
  return blacklist.includes(lower);
}






