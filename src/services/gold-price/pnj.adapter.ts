import axios from 'axios';
import { env } from '../../config/env';
import {
  GoldPriceAdapterError,
  normalizeGoldPriceAdapterError,
  type GoldPriceAdapter,
  type GoldPriceSource,
  type GoldSourceUnit,
  type ParsedGoldQuote,
} from '../../types/gold-politics';

export const PNJ_GOLD_FETCH_URL = 'https://edge-api.pnj.io/ecom-frontend/v1/get-gold-price?zone=00';
export const PNJ_GOLD_SOURCE_URL = 'https://www.pnj.com.vn/site/gia-vang';
export const PNJ_UI_UNIT = 'ĐVT: 1.000đ/Chỉ';

const MAX_BODY_BYTES = 512 * 1024;

interface HttpClientLike {
  get(url: string): Promise<{
    data: unknown;
    headers: Readonly<Record<string, string | undefined>>;
  }>;
}

type DomesticUnit = Exclude<GoldSourceUnit, 'usd-per-troy-ounce'>;

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

function resolveDomesticUnit(text: unknown): DomesticUnit {
  if (typeof text !== 'string' || !text.trim()) {
    throw new GoldPriceAdapterError('ambiguous-unit');
  }

  const normalized = text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  const units = new Set<DomesticUnit>();

  if (/nghìn\s*(đồng|vnd)\s*\/\s*lượng/.test(normalized)) {
    units.add('thousand-vnd-per-tael');
  }
  if (/nghìn\s*(đồng|vnd)\s*\/\s*chỉ/.test(normalized)) {
    units.add('thousand-vnd-per-chi');
  }
  if (/đvt:\s*1\.000\s*đ\s*\/\s*chỉ/.test(normalized)) {
    units.add('thousand-vnd-per-chi');
  }

  const withoutThousand = normalized.replace(/nghìn\s*(đồng|vnd)\s*\/\s*(lượng|chỉ)/g, ' ');
  if (/(đồng|vnd)\s*\/\s*lượng/.test(withoutThousand)) {
    units.add('vnd-per-tael');
  }
  if (/(đồng|vnd)\s*\/\s*chỉ/.test(withoutThousand)) {
    units.add('vnd-per-chi');
  }

  if (units.size !== 1) {
    throw new GoldPriceAdapterError('ambiguous-unit');
  }
  return [...units][0];
}

function parseVietnamTimestamp(value: unknown): string {
  if (typeof value !== 'string') {
    throw new GoldPriceAdapterError('invalid-timestamp');
  }
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    throw new GoldPriceAdapterError('invalid-timestamp');
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) {
    throw new GoldPriceAdapterError('invalid-timestamp');
  }

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second) - 7 * 60 * 60 * 1000);
  const plus7 = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  if (
    plus7.getUTCFullYear() !== year
    || plus7.getUTCMonth() + 1 !== month
    || plus7.getUTCDate() !== day
    || plus7.getUTCHours() !== hour
    || plus7.getUTCMinutes() !== minute
    || plus7.getUTCSeconds() !== second
  ) {
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

function isPnjSjcBar(row: Record<string, unknown>): boolean {
  return row.masp === 'SJC' && row.tensp === 'Vàng miếng SJC 999.9';
}

export function parsePnjGoldQuote(payload: unknown): ParsedGoldQuote {
  const record = asRecord(payload);
  const sourceUnit = resolveDomesticUnit(record.unit);
  if (!Array.isArray(record.data)) {
    throw new GoldPriceAdapterError('invalid-payload');
  }

  const matches = record.data.filter(
    (row): row is Record<string, unknown> =>
      Boolean(row) && typeof row === 'object' && !Array.isArray(row) && isPnjSjcBar(row as Record<string, unknown>),
  );
  if (matches.length !== 1) {
    throw new GoldPriceAdapterError('invalid-payload');
  }

  const [row] = matches;
  const buy = parsePositiveNumber(row.giamua);
  const sell = parsePositiveNumber(row.giaban);
  if (buy > sell) {
    throw new GoldPriceAdapterError('invalid-payload');
  }

  return {
    quoteKind: 'buy-sell',
    buy,
    sell,
    sourceUnit,
    sourceTimestamp: parseVietnamTimestamp(record.updateDate),
  };
}

export class PnjGoldPriceAdapter implements GoldPriceAdapter {
  readonly source: GoldPriceSource;

  constructor(
    private readonly url = PNJ_GOLD_FETCH_URL,
    private readonly http: HttpClientLike = createDefaultHttpClient(),
  ) {
    this.source = {
      providerKey: 'pnj',
      providerName: 'PNJ',
      instrumentKey: 'pnj-sjc-999.9',
      instrumentName: 'Vàng miếng SJC 999.9',
      sourceUrl: PNJ_GOLD_SOURCE_URL,
      displayUnit: 'million-vnd-per-tael',
    };
  }

  async fetch(): Promise<ParsedGoldQuote> {
    try {
      const response = await this.http.get(this.url);
      assertContentType(response.headers, 'application/json');
      const body = asRecord(readJsonBody(response.data));
      return parsePnjGoldQuote({
        ...body,
        unit: body.unit ?? PNJ_UI_UNIT,
      });
    } catch (error) {
      throw new GoldPriceAdapterError(normalizeGoldPriceAdapterError(error));
    }
  }
}
