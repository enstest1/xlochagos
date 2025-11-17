import { loadCharacter, CharacterFile, CharacterExampleMessage } from './characters';
import { llmService } from './services/llmService';

// Add new types for unified reply generation
export type ReplyMode = "amplify" | "sideways" | "inbound";

export interface ReplyContext {
  mode: ReplyMode;
  altHandle: string;
  rootTweetText?: string;   // Pelpa tweet (if relevant)
  parentText?: string;      // Comment we're replying to
  fromUser?: string;        // Handle of person we're replying to
}

function coalesceText(content: string | { text?: string } | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (typeof content.text === 'string') return content.text;
  return '';
}

function formatMessageExamples(examples?: CharacterFile['messageExamples']): string {
  if (!examples || examples.length === 0) return '';

  const formatted = examples
    .map((conversation: CharacterExampleMessage[]) => {
      const lines = conversation
        .map(entry => {
          const text = coalesceText(entry.content);
          return text ? `${entry.user}: ${text}` : '';
        })
        .filter(Boolean);
      return lines.join('\n');
    })
    .filter(Boolean);

  return formatted.length ? formatted.join('\n\n') : '';
}

function formatPostExamples(examples?: string[]): string {
  if (!examples || examples.length === 0) return '';
  return examples.map(line => `- ${line}`).join('\n');
}

// NEW: Unified reply generator for all modes
export async function generatePersonaReply(ctx: ReplyContext): Promise<string> {
  const character = loadCharacter(ctx.altHandle);

  // Build style lines (reuse existing logic)
  const styleLines = [
    ...(character.style?.all || []),
    ...(character.style?.chat || []),
    ...(character.style?.post || [])
  ].filter(Boolean).join('\n');

  // Build bio/lore (reuse existing logic)
  const bioLore = [
    ...(character.bio || []),
    ...(character.lore || [])
  ].filter(Boolean).join('\n');

  // Format examples (reuse existing functions)
  const messageExampleText = formatMessageExamples(character.messageExamples);
  const postExampleText = formatPostExamples(character.postExamples);

  // Build context blocks
  const rootBlock = ctx.rootTweetText
    ? `Root tweet from @pelpa333:\n"${ctx.rootTweetText}"\n\n`
    : '';

  const parentBlock = ctx.parentText
    ? `You are replying to ${ctx.fromUser || 'a user'} who said:\n"${ctx.parentText}"\n\n`
    : '';

  // Mode-specific hints
  const modeHint =
    ctx.mode === "amplify"
      ? "You are replying directly under @pelpa333 to support his post."
      : ctx.mode === "sideways"
      ? "You are replying sideways to another user's comment in @pelpa333's thread. This could be a user OR another alt account - engage naturally."
      : "You are replying to someone who directly replied to you or @mentioned you.";

  // Build prompt sections
  const sections: string[] = [];
  if (bioLore) sections.push(`ABOUT YOU:\n${bioLore}`);
  if (character.adjectives?.length) {
    sections.push(`PERSONALITY ADJECTIVES:\n${character.adjectives.join(', ')}`);
  }
  if (character.topics?.length) {
    sections.push(`CORE TOPICS:\n${character.topics.join(', ')}`);
  }
  if (styleLines) sections.push(`STYLE GUIDELINES:\n${styleLines}`);
  if (messageExampleText) sections.push(`DIALOGUE EXAMPLES:\n${messageExampleText}`);
  if (postExampleText) sections.push(`POST EXAMPLES:\n${postExampleText}`);

  const userPrompt = `${sections.join('\n\n')}\n\nCONTEXT:\n${rootBlock}${parentBlock}MODE:\n${modeHint}\n\nTASK:\nWrite ONE reply as ${character.username}.\n- Follow your system and style EXACTLY - never deviate from your character profile.\n- Stay perfectly in character - use your established personality, tone, and style.\n- Reference at least one specific detail from the relevant tweet/comment.\n- Do NOT copy any text verbatim.\n- Do NOT output a generic 3-6 word hype reply.\n- Avoid emojis and hashtags unless your style explicitly allows them.\n- Keep it concise, natural, and on-brand.\n- ${ctx.mode === 'sideways' ? 'If replying to another alt, engage naturally - don\'t be overly formal.' : ''}\n- CRITICAL: Your character profile defines who you are - never break character.\n`;

  // Use existing llmService.chat() (not generateCompletion)
  const response = await llmService.chat(
    [
      {
        role: 'system',
        content: character.system || `You are ${character.username}. Stay perfectly in character.`
      },
      {
        role: 'user',
        content: userPrompt
      }
    ],
    process.env.OPENROUTER_MODEL_RESPONDER || 'openai/gpt-4o',
    {
      temperature: 0.75,
      max_tokens: ctx.mode === 'inbound' ? 220 : 150, // Inbound can be slightly longer
      logToOpenPipe: true,
      tags: {
        agent: 'alt_responder',
        persona: character.username,
        mode: ctx.mode
      }
    }
  );

  return response.content.trim();
}

// MODIFY: Update existing function to use new unified generator (backward compatible)
export async function generateReplyForAlt(
  altHandle: string,
  pelpaTweetText: string
): Promise<string> {
  // Backward compatibility: call new function with amplify mode
  return generatePersonaReply({
    mode: 'amplify',
    altHandle,
    rootTweetText: pelpaTweetText
  });
}


