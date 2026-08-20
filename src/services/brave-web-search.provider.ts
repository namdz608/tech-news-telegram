import axios from 'axios';
import { env } from '../config/env';
import type { PoliticsSearchQuery } from '../types/gold-politics';
import { compactText } from '../utils/text';
import type { WebSearchProvider, WebSearchResult } from './web-search.provider';

const SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';
const MAX_BODY_BYTES = 512 * 1024;
const STABLE_ERROR = 'brave-search';
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

interface HttpClientLike {
  get(
    url: string,
    config: { headers: Record<string, string>; params: Record<string, string | number> },
  ): Promise<{
    data: unknown;
    headers?: Readonly<Record<string, string | undefined>>;
  }>;
}

function createDefaultHttpClient(): HttpClientLike {
  return axios.create({
    timeout: env.REQUEST_TIMEOUT_MS,
    maxRedirects: 0,
    maxContentLength: MAX_BODY_BYTES,
    maxBodyLength: MAX_BODY_BYTES,
    headers: { 'User-Agent': env.USER_AGENT },
  }) as HttpClientLike;
}

export class BraveWebSearchProvider implements WebSearchProvider {
  readonly key = 'brave-search';

  constructor(
    private readonly apiKey: string = env.BRAVE_SEARCH_API_KEY,
    private readonly http: HttpClientLike = createDefaultHttpClient(),
    private readonly searchUrl = SEARCH_URL,
  ) {}

  isEnabled(): boolean {
    return this.apiKey.trim() !== '';
  }

  async search(query: PoliticsSearchQuery): Promise<WebSearchResult[]> {
    if (!this.isEnabled()) {
      return [];
    }

    try {
      const response = await this.http.get(this.searchUrl, {
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': this.apiKey,
          'User-Agent': env.USER_AGENT,
        },
        params: {
          q: query.text,
          count: 10,
        },
      });
      assertJsonContentType(response.headers);
      return parseBraveResults(readJsonBody(response.data));
    } catch (error) {
      throw stabilizeBraveError(error);
    }
  }
}

function headerValue(
  headers: Readonly<Record<string, string | undefined>>,
  name: string,
): string {
  const record = headers as Record<string, unknown>;
  const direct = record[name] ?? record[name.toLowerCase()];
  if (typeof direct === 'string') {
    return direct;
  }
  const getter = (headers as { get?: (headerName: string) => unknown }).get;
  if (typeof getter === 'function') {
    const value = getter.call(headers, name);
    if (typeof value === 'string') {
      return value;
    }
  }
  return '';
}

function assertJsonContentType(headers?: Readonly<Record<string, string | undefined>>): void {
  if (!headers) {
    throw new Error(STABLE_ERROR);
  }
  const mime = headerValue(headers, 'content-type').split(';', 1)[0].trim().toLowerCase();
  if (mime !== 'application/json') {
    throw new Error(STABLE_ERROR);
  }
}

function readJsonBody(data: unknown): unknown {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as unknown;
    } catch {
      throw new Error(STABLE_ERROR);
    }
  }
  return data;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(STABLE_ERROR);
  }
  return value as Record<string, unknown>;
}

function parseBraveResults(payload: unknown): WebSearchResult[] {
  const web = asRecord(asRecord(payload).web);
  if (!Array.isArray(web.results)) {
    throw new Error(STABLE_ERROR);
  }

  return web.results.flatMap((entry) => {
    const mapped = mapBraveResult(entry);
    return mapped ? [mapped] : [];
  });
}

function mapBraveResult(entry: unknown): WebSearchResult | undefined {
  const record = asRecord(entry);
  const title = stripHtml(typeof record.title === 'string' ? record.title : '');
  const snippet = stripHtml(typeof record.description === 'string' ? record.description : '');
  const url = parsePublicHttpUrl(typeof record.url === 'string' ? record.url : '');
  const publishedAt = parseBraveDate(record.page_age);
  if (!title || !snippet || !url || !publishedAt) {
    return undefined;
  }

  const sourceName = parseProfileName(record.profile);
  return {
    title,
    url,
    snippet,
    publishedAt,
    ...(sourceName ? { sourceName } : {}),
  };
}

function parseProfileName(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const profile = asRecord(value);
  if (profile.name === undefined) {
    return undefined;
  }
  if (typeof profile.name !== 'string') {
    throw new Error(STABLE_ERROR);
  }
  return stripHtml(profile.name) || undefined;
}

function parseBraveDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !ISO_INSTANT.test(value.trim())) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

function parsePublicHttpUrl(value: string): string | undefined {
  if (!value.trim()) {
    return undefined;
  }
  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
      return undefined;
    }
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

function stripHtml(value: string): string {
  return compactText(value.replace(/<[^>]*>/g, ' '));
}

function stabilizeBraveError(error: unknown): Error {
  return error instanceof Error && error.message === STABLE_ERROR
    ? error
    : new Error(STABLE_ERROR);
}
