import axios from 'axios';
import * as cheerio from 'cheerio';
import { env } from '../../config/env';
import {
  GoldPriceAdapterError,
  normalizeGoldPriceAdapterError,
  type GoldPriceAdapter,
  type GoldPriceSource,
  type GoldSourceUnit,
  type ParsedGoldQuote,
} from '../../types/gold-politics';

export const SJC_GOLD_FETCH_URL = 'https://www.sjc.com.vn/bieu-do-gia-vang';
export const SJC_GOLD_SOURCE_URL = 'https://www.sjc.com.vn/bieu-do-gia-vang';

const MAX_BODY_BYTES = 512 * 1024;
const VIETNAM_DATE_TIME = /\b(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})\b/g;

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

function parseVietnamTimestamp(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
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

function parseHtmlNumber(text: string): number {
  const compact = text.replace(/\s+/g, '');
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(compact)) {
    throw new GoldPriceAdapterError('invalid-payload');
  }
  const value = Number(compact.includes('.') ? compact.replace(/\./g, '') : compact);
  if (!Number.isFinite(value) || value <= 0) {
    throw new GoldPriceAdapterError('invalid-payload');
  }
  return value;
}

function isSjcOneTael(name: string): boolean {
  const normalized = name.toLowerCase().replace(/\s+/g, ' ').trim();
  if (/(nhẫn|nữ trang|10l|10 lượng)/.test(normalized)) {
    return false;
  }
  return (
    normalized === 'sjc'
    || normalized === 'sjc 1l'
    || normalized === 'sjc 1 l'
    || normalized === 'vàng sjc 1 lượng'
    || normalized === 'vàng miếng sjc'
  );
}

export function parseSjcGoldQuote(payload: unknown): ParsedGoldQuote {
  if (typeof payload !== 'string' || !payload.trim()) {
    throw new GoldPriceAdapterError('invalid-payload');
  }

  const $ = cheerio.load(payload);
  const pageText = $.root().text();
  const sourceUnit = resolveDomesticUnit(pageText);
  const timestamps = [...new Set(pageText.match(VIETNAM_DATE_TIME) ?? [])];
  if (timestamps.length !== 1) {
    throw new GoldPriceAdapterError('invalid-timestamp');
  }

  const matches: Array<{ buy: number; sell: number }> = [];
  $('table tr').each((_index, row) => {
    const cells = $(row)
      .find('td')
      .toArray()
      .map((cell) => $(cell).text().replace(/\s+/g, ' ').trim());
    if (cells.length < 3 || !isSjcOneTael(cells[0])) {
      return;
    }
    matches.push({ buy: parseHtmlNumber(cells[1]), sell: parseHtmlNumber(cells[2]) });
  });

  if (matches.length !== 1) {
    throw new GoldPriceAdapterError('invalid-payload');
  }

  const [{ buy, sell }] = matches;
  if (buy > sell) {
    throw new GoldPriceAdapterError('invalid-payload');
  }

  return {
    quoteKind: 'buy-sell',
    buy,
    sell,
    sourceUnit,
    sourceTimestamp: parseVietnamTimestamp(timestamps[0]),
  };
}

export class SjcGoldPriceAdapter implements GoldPriceAdapter {
  readonly source: GoldPriceSource;

  constructor(
    private readonly url = SJC_GOLD_FETCH_URL,
    private readonly http: HttpClientLike = createDefaultHttpClient(),
  ) {
    this.source = {
      providerKey: 'sjc',
      providerName: 'SJC',
      instrumentKey: 'sjc-1l',
      instrumentName: 'SJC 1 lượng',
      sourceUrl: SJC_GOLD_SOURCE_URL,
      displayUnit: 'million-vnd-per-tael',
    };
  }

  async fetch(): Promise<ParsedGoldQuote> {
    try {
      const response = await this.http.get(this.url);
      assertContentType(response.headers, 'text/html');
      return parseSjcGoldQuote(response.data);
    } catch (error) {
      throw new GoldPriceAdapterError(normalizeGoldPriceAdapterError(error));
    }
  }
}
