import fs from 'fs';
import path from 'path';
import { log } from '../log';

export interface DocSnippet {
  content: string;
  relevance: number;
  source: string;
}

export async function queryContext7Docs(
  query: string, 
  docsDir: string, 
  topK: number = 8
): Promise<DocSnippet[]> {
  if (!fs.existsSync(docsDir)) {
    log.warn({ docsDir }, 'Context7 docs directory not found');
    return [];
  }

  try {
    const files = fs.readdirSync(docsDir);
    const snippets: DocSnippet[] = [];

    for (const file of files) {
      if (!file.endsWith('.md') && !file.endsWith('.txt')) continue;
      
      const filePath = path.join(docsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Simple relevance scoring based on keyword matching
      const relevance = calculateRelevance(query, content);
      
      if (relevance > 0.1) {
        snippets.push({
          content: content.substring(0, 500) + (content.length > 500 ? '...' : ''),
          relevance,
          source: file
        });
      }
    }

    // Sort by relevance and return top K
    return snippets
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, topK);

  } catch (error) {
    log.error({ docsDir, error: (error as Error).message }, 'Failed to query Context7 docs');
    return [];
  }
}

function calculateRelevance(query: string, content: string): number {
  const queryWords = query.toLowerCase().split(/\s+/);
  const contentLower = content.toLowerCase();
  
  let matches = 0;
  let totalWords = queryWords.length;
  
  for (const word of queryWords) {
    if (word.length > 2 && contentLower.includes(word)) {
      matches++;
    }
  }
  
  return matches / totalWords;
}

// Mock function for when docs directory is empty
export function getMockContextHints(query: string): string[] {
  const hints = [
    'This relates to current industry trends',
    'Consider the broader implications',
    'Note the technical specifications',
    'Think about practical applications'
  ];
  
  return hints.slice(0, Math.min(3, Math.floor(Math.random() * 4)));
}
