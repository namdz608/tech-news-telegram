import { GoogleTranslationService } from './google-translation.service';
import type { DigestTranslator } from './translation.types';

export function createDefaultTranslator(): DigestTranslator {
  return new GoogleTranslationService();
}

export class TranslationService {
  constructor(private readonly translator: DigestTranslator = createDefaultTranslator()) {}

  async translateDigest(digest: string): Promise<string> {
    if (!digest.trim()) {
      return digest;
    }

    const protectedDigest = protectMarkup(digest);

    try {
      const translated = await this.translator.translateDigest(protectedDigest.text);
      return restoreMarkup(translated, protectedDigest.tokens);
    } catch (error) {
      console.error('Digest translation failed, returning original digest', error);
      return digest;
    }
  }
}

interface ProtectedText {
  text: string;
  tokens: string[];
}

const protectPatterns: { name: string; regex: RegExp }[] = [
  { name: 'TAG', regex: /<[^>]+>/g },
  { name: 'ENT', regex: /&[a-zA-Z]+;|&#\d+;/g },
  { name: 'URL', regex: /https?:\/\/[^\s<>"']+/g },
];

function protectMarkup(text: string): ProtectedText {
  const tokens: string[] = [];
  let protectedText = text;

  for (const { name, regex } of protectPatterns) {
    protectedText = protectedText.replace(regex, (match) => {
      const token = `__TNX_${name}_${tokens.length}__`;
      tokens.push(match);
      return token;
    });
  }

  return {
    text: protectedText,
    tokens,
  };
}

function restoreMarkup(text: string, tokens: string[]): string {
  let restored = text;

  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    for (const { name } of protectPatterns) {
      restored = restored.replaceAll(`__TNX_${name}_${index}__`, tokens[index]);
    }
  }

  return restored;
}
