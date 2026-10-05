import axios from 'axios';
import { env } from '../config/env';
import { GoogleTranslationService } from './google-translation.service';

const MYMEMORY_ENDPOINT = 'https://api.mymemory.translated.net/get';

interface VerifiedTranslator {
  translateDigestVerified(text: string): Promise<{ text: string; succeeded: boolean }>;
}

interface TranslateHttp {
  get(
    url: string,
    config?: { params?: Record<string, string>; timeout?: number },
  ): Promise<{ data: unknown }>;
}

export class DevopsJobsTextTranslator implements VerifiedTranslator {
  constructor(
    private readonly google: VerifiedTranslator = new GoogleTranslationService(),
    private readonly http: TranslateHttp = axios,
    private readonly timeoutMs = env.REQUEST_TIMEOUT_MS,
  ) {}

  async translateDigestVerified(text: string): Promise<{ text: string; succeeded: boolean }> {
    const google = await this.google.translateDigestVerified(text);
    if (google.succeeded) return google;
    return this.translateWithMyMemory(text);
  }

  private async translateWithMyMemory(
    text: string,
  ): Promise<{ text: string; succeeded: boolean }> {
    try {
      const response = await this.http.get(MYMEMORY_ENDPOINT, {
        params: { q: text, langpair: 'en|vi' },
        timeout: this.timeoutMs,
      });
      const translated = readMyMemory(response.data);
      if (translated === '' || /MYMEMORY WARNING/i.test(translated)) {
        return { text, succeeded: false };
      }
      return { text: translated, succeeded: true };
    } catch (error) {
      console.error('DevOps job fallback translation failed', error);
      return { text, succeeded: false };
    }
  }
}

function readMyMemory(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const record = data as {
    responseStatus?: unknown;
    responseData?: { translatedText?: unknown };
  };
  if (record.responseStatus !== 200) return '';
  const translated = record.responseData?.translatedText;
  return typeof translated === 'string' ? translated.trim() : '';
}
