import axios from 'axios';
import { env } from '../config/env';
import type { DigestTranslator } from './translation.types';

export class GoogleTranslationService implements DigestTranslator {
  constructor(
    private readonly targetLanguage = env.TRANSLATION_TARGET_LANGUAGE,
    private readonly http = axios.create({ timeout: env.REQUEST_TIMEOUT_MS })
  ) {}

  async translateDigest(digest: string): Promise<string> {
    if (!digest.trim()) {
      return digest;
    }

    try {
      const chunks = splitDigestForTranslation(digest, 4000);
      const translatedChunks = await Promise.all(
        chunks.map(chunk => this.translateText(chunk))
      );
      
      const translated = translatedChunks.map((chunk) => chunk.trim()).filter(Boolean).join('\n\n');
      return translated.trim() || digest;
    } catch (error) {
      console.error('Google Translate failed', error);
      return digest;
    }
  }

  private async translateText(text: string): Promise<string> {
    const response = await this.http.get('https://translate.googleapis.com/translate_a/single', {
      params: {
        client: 'gtx',
        sl: 'auto',
        tl: this.targetLanguage,
        dt: 't',
        q: text,
      },
    });

    const data: unknown = response.data;

    if (Array.isArray(data) && Array.isArray(data[0])) {
      const translated = data[0]
        .map((segment: unknown) =>
          Array.isArray(segment) && typeof segment[0] === 'string' ? segment[0] : '',
        )
        .join('');

      return translated || text;
    }

    return text;
  }
}

function splitDigestForTranslation(digest: string, maxChars: number): string[] {
  if (digest.length <= maxChars) {
    return [digest];
  }

  const chunks: string[] = [];
  let current = '';

  for (const block of digest.split(/\n{2,}/)) {
    const candidate = current ? `${current}\n\n${block}` : block;

    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = '';
    }

    if (block.length <= maxChars) {
      current = block;
      continue;
    }

    for (let index = 0; index < block.length; index += maxChars) {
      chunks.push(block.slice(index, index + maxChars));
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}
