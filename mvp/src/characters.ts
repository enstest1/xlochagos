import fs from 'fs';
import path from 'path';

export type CharacterExampleMessage = {
  user: string;
  content: string | { text?: string };
};

export type CharacterFile = {
  name: string;
  username: string;
  system: string;
  modelProvider?: string;
  clients?: any[];
  plugins?: any[];
  settings?: Record<string, any>;
  bio?: string[];
  lore?: string[];
  topics?: string[];
  adjectives?: string[];
  style?: {
    all?: string[];
    chat?: string[];
    post?: string[];
    tone?: string[];
    emoji_policy?: string;
    length_guidance?: string;
  };
  messageExamples?: CharacterExampleMessage[][];
  postExamples?: string[];
  [key: string]: any;
};

const CWD_CHAR_DIR = path.join(process.cwd(), 'characters');
const ROOT_CHAR_DIR = path.join(process.cwd(), '..', 'characters');

export function loadCharacter(username: string): CharacterFile {
  const safe = username.startsWith('@') ? username.slice(1) : username;
  let filePath = path.join(CWD_CHAR_DIR, `${safe}.character.json`);

  if (!fs.existsSync(filePath)) {
    const altPath = path.join(ROOT_CHAR_DIR, `${safe}.character.json`);
    if (fs.existsSync(altPath)) {
      filePath = altPath;
    } else {
      throw new Error(`Character file not found for ${username} at ${filePath} or ${altPath}`);
    }
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as CharacterFile;
}


