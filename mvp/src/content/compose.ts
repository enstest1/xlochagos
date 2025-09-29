import { SourceItem, PostDraft } from '../types';

export function composePost(item: SourceItem): PostDraft {
  // Simple post composition for testing
  const text = `${item.title}\n\n${item.summary}\n\n${item.url}`;
  
  return {
    text: text.length > 260 ? text.substring(0, 257) + '...' : text,
    sourceUrl: item.url,
    contentHash: Buffer.from(text).toString('base64').slice(0, 16), // Simple hash
    confidence: item.score
  };
}

export function composePostWithContext(item: SourceItem, contextHints: string[] = []): PostDraft {
  // Enhanced composition with context hints (for future Context7 integration)
  let text = `${item.title}\n\n${item.summary}`;
  
  if (contextHints.length > 0) {
    text += `\n\nContext: ${contextHints.join(' ')}`;
  }
  
  text += `\n\n${item.url}`;
  
  return {
    text: text.length > 260 ? text.substring(0, 257) + '...' : text,
    sourceUrl: item.url,
    contentHash: Buffer.from(text).toString('base64').slice(0, 16),
    confidence: item.score
  };
}
