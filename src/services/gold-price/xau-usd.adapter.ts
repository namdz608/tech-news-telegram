import axios from 'axios';
import { env } from '../../config/env';
import {
  GoldPriceAdapterError,
  normalizeGoldPriceAdapterError,
  type GoldPriceAdapter,
  type GoldPriceSource,
  type ParsedGoldQuote,
} from '../../types/gold-politics';

const MAX_BODY_BYTES = 512 * 1024;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

interface HttpClientLike {
  get(url: string): Promise<{
    data: unknown;
    headers: Readonly<Record<string, string | undefined>>;
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

function assertContentType(
  headers: Readonly<Record<string, string | undefined>>,
  expected: string,
): void {
  const mime = headerValue(headers, 'content-type').split(';', 1)[0].trim().toLowerCase();
  if (mime !== expected) {
    throw new GoldPriceAdapterError('invalid-payload');
  }
}

function readJsonBody(data: unknown): unknown {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as unknown;
    } catch {
      throw new GoldPriceAdapterError('invalid-payload');
    }
  }
  return data;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GoldPriceAdapterError('invalid-payload');
  }
  return value as Record<string, unknown>;
}

function parseIsoTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !ISO_INSTANT.test(value.trim())) {
    throw new GoldPriceAdapterError('invalid-timestamp');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new GoldPriceAdapterError('invalid-timestamp');
  }
  return date.toISOString();
}

function parsePositiveNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new GoldPriceAdapterError('invalid-payload');
  }
  return value;
}

export function toPublicSourceOrigin(url: string): string {
  return `${new URL(url).origin}/`;
}

export function parseXauUsdGoldQuote(payload: unknown): ParsedGoldQuote {
  const record = asRecord(payload);
  if (record.symbol !== 'XAU' || record.currency !== 'USD') {
    throw new GoldPriceAdapterError('invalid-payload');
  }

  return {
    quoteKind: 'spot',
    spot: parsePositiveNumber(record.price),
    sourceUnit: 'usd-per-troy-ounce',
    sourceTimestamp: parseIsoTimestamp(record.updatedAt),
  };
}

export class XauUsdGoldPriceAdapter implements GoldPriceAdapter {
  readonly source: GoldPriceSource;

  constructor(
    private readonly url = env.GOLD_SPOT_API_URL,
    private readonly http: HttpClientLike = createDefaultHttpClient(),
  ) {
    this.source = {
      providerKey: 'xau-usd',
      providerName: 'Gold API',
      instrumentKey: 'xau-usd-spot',
      instrumentName: 'XAU/USD',
      sourceUrl: toPublicSourceOrigin(url),
      displayUnit: 'usd-per-troy-ounce',
    };
  }

  async fetch(): Promise<ParsedGoldQuote> {
    try {
      const response = await this.http.get(this.url);
      assertContentType(response.headers, 'application/json');
      return parseXauUsdGoldQuote(readJsonBody(response.data));
    } catch (error) {
      throw new GoldPriceAdapterError(normalizeGoldPriceAdapterError(error));
    }
  }
}
