import { loadCharacter, CharacterFile, CharacterExampleMessage } from './characters';
import { llmService } from './services/llmService';

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

export async function generateReplyForAlt(
  altHandle: string,
  pelpaTweetText: string
): Promise<string> {
  const character = loadCharacter(altHandle);

  const styleLines = [
    ...(character.style?.all || []),
    ...(character.style?.post || [])
  ].filter(Boolean).join('\n');

  const bioLore = [
    ...(character.bio || []),
    ...(character.lore || [])
  ].filter(Boolean).join('\n');

  const messageExampleText = formatMessageExamples(character.messageExamples);
  const postExampleText = formatPostExamples(character.postExamples);

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

  const userPrompt = `${sections.join('\n\n')}\n\nCONTEXT:\nThis is a tweet from @pelpa333 you are replying under:\n"${pelpaTweetText}"\n\nTASK:\nWrite ONE reply as ${character.username}.\n- Follow your system and style exactly.\n- Reference at least one specific detail from the Pelpa tweet.\n- Do NOT copy the tweet verbatim.\n- Avoid emojis and hashtags unless your style explicitly allows them.\n- Reply in 130 characters or fewer.\n- Keep it concise, natural, and on-brand.\n`;

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
      max_tokens: 150,
      logToOpenPipe: true,
      tags: {
        agent: 'alt_responder',
        persona: character.username
      }
    }
  );

  return response.content.trim();
}


