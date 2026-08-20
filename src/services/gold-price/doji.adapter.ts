import { createDecipheriv } from 'node:crypto';
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

export const DOJI_GOLD_FETCH_URL = 'https://banggia.doji.vn/api/TablePrice/GetTablePrice';
export const DOJI_GOLD_SOURCE_URL = 'https://banggia.doji.vn/';
export const DOJI_UI_UNIT = 'Nghìn VND/chỉ';

const MAX_BODY_BYTES = 512 * 1024;
const DOJI_FRONTEND_AES_KEY_HEX =
  '7a4b8c3d1e9f2a5b6c0d4e8f3a7b1c5d9e2f6a0b4c8d3e7f1a5b9c2d6e0f4a8b';
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

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

function decodeCanonicalBase64(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new GoldPriceAdapterError('invalid-payload');
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) {
    throw new GoldPriceAdapterError('invalid-payload');
  }
  return decoded;
}

function decryptDojiEnvelope(payload: unknown): unknown {
  const envelope = asRecord(payload);
  if (envelope.status !== true || typeof envelope.data !== 'string') {
    throw new GoldPriceAdapterError('invalid-payload');
  }

  const decoded = decodeCanonicalBase64(envelope.data);
  if (decoded.length < 32 || (decoded.length - 16) % 16 !== 0) {
    throw new GoldPriceAdapterError('invalid-payload');
  }

  const iv = decoded.subarray(0, 16);
  const ciphertext = decoded.subarray(16);
  try {
    const decipher = createDecipheriv(
      'aes-256-cbc',
      Buffer.from(DOJI_FRONTEND_AES_KEY_HEX, 'hex'),
      iv,
    );
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return JSON.parse(plaintext) as unknown;
  } catch {
    throw new GoldPriceAdapterError('invalid-payload');
  }
}

function isDojiSjcBar(row: Record<string, unknown>): boolean {
  return (
    row.type === 'G'
    && row.materialCode === '01'
    && row.materialName === 'VÀNG MIẾNG SJC'
    && row.isActive === true
  );
}

export function parseDojiGoldQuote(payload: unknown): ParsedGoldQuote {
  const record = asRecord(payload);
  const sourceUnit = resolveDomesticUnit(record.unit);
  if (!Array.isArray(record.data)) {
    throw new GoldPriceAdapterError('invalid-payload');
  }

  const matches = record.data.filter(
    (row): row is Record<string, unknown> =>
      Boolean(row) && typeof row === 'object' && !Array.isArray(row) && isDojiSjcBar(row as Record<string, unknown>),
  );
  if (matches.length !== 1) {
    throw new GoldPriceAdapterError('invalid-payload');
  }

  const [row] = matches;
  const buy = parsePositiveNumber(row.priceDojiBuyIn);
  const sell = parsePositiveNumber(row.priceDojiSellOut);
  if (buy > sell) {
    throw new GoldPriceAdapterError('invalid-payload');
  }

  return {
    quoteKind: 'buy-sell',
    buy,
    sell,
    sourceUnit,
    sourceTimestamp: parseIsoTimestamp(row.updateDate),
  };
}

export class DojiGoldPriceAdapter implements GoldPriceAdapter {
  readonly source: GoldPriceSource;

  constructor(
    private readonly url = DOJI_GOLD_FETCH_URL,
    private readonly http: HttpClientLike = createDefaultHttpClient(),
  ) {
    this.source = {
      providerKey: 'doji',
      providerName: 'DOJI',
      instrumentKey: 'doji-sjc-bar',
      instrumentName: 'VÀNG MIẾNG SJC',
      sourceUrl: DOJI_GOLD_SOURCE_URL,
      displayUnit: 'million-vnd-per-tael',
    };
  }

  async fetch(): Promise<ParsedGoldQuote> {
    try {
      const response = await this.http.get(this.url);
      assertContentType(response.headers, 'application/json');
      const rows = decryptDojiEnvelope(readJsonBody(response.data));
      return parseDojiGoldQuote({ unit: DOJI_UI_UNIT, data: rows });
    } catch (error) {
      throw new GoldPriceAdapterError(normalizeGoldPriceAdapterError(error));
    }
  }
}
