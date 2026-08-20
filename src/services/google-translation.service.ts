/**
 * Chia digest thành đoạn và gọi Google Translate HTTP endpoint.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
import axios from 'axios';
import { env } from '../config/env';
import type { DigestTranslator } from './translation.types';

const TRANSLATE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const GET_QUERY_CHAR_LIMIT = 1_500;
const TRANSLATE_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

interface TranslateHttp {
  get(url: string, config?: unknown): Promise<{ data: unknown }>;
  post?(url: string, data?: unknown, config?: unknown): Promise<{ data: unknown }>;
}

export interface GoogleTranslationServiceOptions {
  retries?: number;
  retryDelayMs?: number;
  maxConcurrent?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Class `GoogleTranslationService` sở hữu vòng đời dependency và điều phối các bước google translation service.
 *
 * Được sử dụng tại:
 * - `src/services/google-article-editorial.generator.ts`
 * - `src/services/translation.service.ts`
 * - `tests/services/google-translation.service.test.ts`
 * - `tests/services/translation.service.test.ts`
 */
export class GoogleTranslationService implements DigestTranslator {
  private readonly retries: number;
  private readonly retryDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly limit: ConcurrencyLimit;

  constructor(
    private readonly targetLanguage = env.TRANSLATION_TARGET_LANGUAGE,
    private readonly http: TranslateHttp = axios.create({
      timeout: env.REQUEST_TIMEOUT_MS,
      headers: { 'User-Agent': TRANSLATE_USER_AGENT },
    }),
    options: GoogleTranslationServiceOptions = {},
  ) {
    this.retries = options.retries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 250;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => {
      setTimeout(resolve, ms);
    }));
    this.limit = new ConcurrencyLimit(options.maxConcurrent ?? 2);
  }

  async translateDigest(digest: string): Promise<string> {
    return (await this.translateDigestVerified(digest)).text;
  }

  async translateDigestVerified(
    digest: string,
  ): Promise<{ text: string; succeeded: boolean }> {
    if (!digest.trim()) {
      return { text: digest, succeeded: true };
    }

    try {
      const chunks = splitDigestForTranslation(digest, 4000);
      const translatedChunks = await Promise.all(
        chunks.map((chunk) => this.translateText(chunk)),
      );
      const succeeded = translatedChunks.every((chunk) => chunk.succeeded);
      const translated = translatedChunks
        .map((chunk) => chunk.text.trim())
        .filter(Boolean)
        .join('\n\n');
      const text = translated.trim();
      return succeeded && text
        ? { text, succeeded: true }
        : { text: digest, succeeded: false };
    } catch {
      console.error('Google Translate failed');
      return { text: digest, succeeded: false };
    }
  }

  private async translateText(text: string): Promise<{ text: string; succeeded: boolean }> {
    return this.limit.run(() => this.translateTextWithRetry(text));
  }

  private async translateTextWithRetry(
    text: string,
  ): Promise<{ text: string; succeeded: boolean }> {
    let lastError: unknown;
    let lastResult: { text: string; succeeded: boolean } = { text, succeeded: false };

    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try {
        lastResult = await this.translateTextOnce(text);
        if (lastResult.succeeded) return lastResult;
        lastError = undefined;
      } catch (error) {
        lastError = error;
        lastResult = { text, succeeded: false };
      }
      if (attempt < this.retries) {
        await this.sleep(this.retryDelayMs * (attempt + 1));
      }
    }

    if (lastError) throw lastError;
    return lastResult;
  }

  private async translateTextOnce(
    text: string,
  ): Promise<{ text: string; succeeded: boolean }> {
    const params = {
      client: 'gtx',
      sl: 'auto',
      tl: this.targetLanguage,
      dt: 't',
    };
    const response = text.length > GET_QUERY_CHAR_LIMIT && this.http.post
      ? await this.http.post(TRANSLATE_ENDPOINT, new URLSearchParams({ q: text }).toString(), {
        params,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      : await this.http.get(TRANSLATE_ENDPOINT, { params: { ...params, q: text } });

    return parseTranslatedSegments(response.data, text);
  }
}

function parseTranslatedSegments(
  data: unknown,
  original: string,
): { text: string; succeeded: boolean } {
  if (Array.isArray(data) && Array.isArray(data[0])) {
    const translated = data[0]
      .map((segment: unknown) =>
        Array.isArray(segment) && typeof segment[0] === 'string' ? segment[0] : '',
      )
      .join('');
    return translated
      ? { text: translated, succeeded: true }
      : { text: original, succeeded: false };
  }
  return { text: original, succeeded: false };
}

class ConcurrencyLimit {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await work();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiters.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.active -= 1;
    const next = this.waiters.shift();
    if (next) next();
  }
}

/**
 * Hàm `splitDigestForTranslation` chia nội dung theo giới hạn của API đích; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/google-translation.service.ts`
 */
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
