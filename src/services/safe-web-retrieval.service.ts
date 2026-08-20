/** Tải nội dung văn bản HTTP công cộng, chặn SSRF bằng DNS pin và giới hạn phản hồi. */
import { lookup as dnsLookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import { env } from '../config/env';

const TEXTUAL_ACCEPT = 'text/html, application/xhtml+xml, text/plain, application/json';
const ALLOWED_MEDIA_TYPES = new Set([
  'text/html',
  'application/xhtml+xml',
  'text/plain',
  'application/json',
]);
const ALLOWED_CHARSETS = new Set(['utf-8', 'utf8', 'us-ascii', 'ascii']);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const STABLE_ERROR_CODES = new Set([
  'unsafe-url',
  'unsafe-address',
  'redirect-limit',
  'response-too-large',
  'unsupported-content-type',
  'unsupported-content-encoding',
  'unsupported-charset',
  'unexpected-status',
  'request-timeout',
]);

const IPV4_BLOCKED: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface SafeRawResponse {
  statusCode: number;
  headers: Readonly<Record<string, string | undefined>>;
  body: AsyncIterable<Uint8Array>;
  destroy(): void;
}

export interface SafePinnedRequest {
  url: URL;
  address: ResolvedAddress;
  headers: Readonly<Record<string, string>>;
  signal: AbortSignal;
}

export interface SafeWebRetrievalDependencies {
  lookup(hostname: string): Promise<ResolvedAddress[]>;
  isAddressAllowed(address: ResolvedAddress): boolean;
  request(input: SafePinnedRequest): Promise<SafeRawResponse>;
  setTimer(callback: () => void, timeoutMs: number): ReturnType<typeof setTimeout>;
  clearTimer(timer: ReturnType<typeof setTimeout>): void;
}

export interface SafeWebContent {
  finalUrl: string;
  contentType: string;
  text: string;
}

export interface SafeWebRetrievalOptions {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  userAgent: string;
}

export function createSafeWebRetrievalDependencies(): SafeWebRetrievalDependencies {
  return {
    async lookup(hostname) {
      const results = await dnsLookup(hostname, { all: true, verbatim: true });
      return results.map((result) => ({
        address: result.address,
        family: result.family === 6 ? 6 : 4,
      }));
    },
    isAddressAllowed,
    request: requestPinned,
    setTimer: (callback, timeoutMs) => setTimeout(callback, timeoutMs),
    clearTimer: (timer) => clearTimeout(timer),
  };
}

export class SafeWebRetrievalService {
  constructor(
    private readonly dependencies: SafeWebRetrievalDependencies = createSafeWebRetrievalDependencies(),
    private readonly options: SafeWebRetrievalOptions = {
      timeoutMs: 8000,
      maxBytes: 256 * 1024,
      maxRedirects: 3,
      userAgent: env.USER_AGENT,
    },
  ) {}

  async retrieve(input: string): Promise<SafeWebContent> {
    const controller = new AbortController();
    const timer = this.dependencies.setTimer(() => {
      controller.abort();
    }, this.options.timeoutMs);

    try {
      return await this.retrieveUntilSettled(input, controller.signal);
    } catch (error) {
      if (isStableCode(error, 'request-timeout')) {
        throw error;
      }
      if (controller.signal.aborted) {
        // Abort errors can include socket/DNS details; keep the public code only.
        // eslint-disable-next-line preserve-caught-error -- do not leak caught transport details
        throw new Error('request-timeout');
      }
      throw stabilizeError(error);
    } finally {
      this.dependencies.clearTimer(timer);
    }
  }

  private async retrieveUntilSettled(input: string, signal: AbortSignal): Promise<SafeWebContent> {
    let url = parseSafeUrl(input);
    let redirects = 0;

    while (true) {
      throwIfAborted(signal);
      const address = await this.resolvePinnedAddress(url, signal);
      throwIfAborted(signal);

      const response = await raceAgainstAbort(
        this.dependencies.request({
          url,
          address,
          headers: {
            'User-Agent': this.options.userAgent,
            Accept: TEXTUAL_ACCEPT,
          },
          signal,
        }),
        signal,
      );

      if (REDIRECT_STATUSES.has(response.statusCode)) {
        if (redirects >= this.options.maxRedirects) {
          response.destroy();
          throw new Error('redirect-limit');
        }
        const location = headerValue(response.headers, 'location');
        response.destroy();
        url = parseRedirectUrl(location, url);
        redirects += 1;
        continue;
      }

      try {
        return await this.readSuccess(response, url, signal);
      } catch (error) {
        response.destroy();
        throw error;
      }
    }
  }

  private async resolvePinnedAddress(url: URL, signal: AbortSignal): Promise<ResolvedAddress> {
    const hostname = toDnsHostname(url.hostname);
    const family = isIP(hostname);
    const addresses: ResolvedAddress[] = family === 4 || family === 6
      ? [{ address: hostname, family: family === 6 ? 6 : 4 }]
      : await this.lookupAddresses(hostname, signal);

    if (addresses.length === 0) {
      throw new Error('unsafe-address');
    }
    if (!addresses.every((candidate) => this.dependencies.isAddressAllowed(candidate))) {
      throw new Error('unsafe-address');
    }
    const chosen = addresses[0];
    if (!chosen) {
      throw new Error('unsafe-address');
    }
    return chosen;
  }

  private async lookupAddresses(hostname: string, signal: AbortSignal): Promise<ResolvedAddress[]> {
    try {
      return await raceAgainstAbort(this.dependencies.lookup(hostname), signal);
    } catch (error) {
      if (isStableCode(error, 'request-timeout')) {
        throw error;
      }
      // DNS failures may include hostnames or resolver text; map to a stable code.
      // eslint-disable-next-line preserve-caught-error -- do not leak DNS error details
      throw new Error('unsafe-address');
    }
  }

  private async readSuccess(
    response: SafeRawResponse,
    url: URL,
    signal: AbortSignal,
  ): Promise<SafeWebContent> {
    if (response.statusCode < 200 || response.statusCode > 299) {
      throw new Error('unexpected-status');
    }

    const encoding = headerValue(response.headers, 'content-encoding');
    if (encoding && encoding.toLowerCase() !== 'identity') {
      throw new Error('unsupported-content-encoding');
    }

    const { mediaType, charset } = parseContentType(headerValue(response.headers, 'content-type'));
    if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
      throw new Error('unsupported-content-type');
    }
    if (charset && !ALLOWED_CHARSETS.has(charset)) {
      throw new Error('unsupported-charset');
    }

    const declaredLength = parseContentLength(headerValue(response.headers, 'content-length'));
    if (declaredLength !== undefined && declaredLength > this.options.maxBytes) {
      throw new Error('response-too-large');
    }

    const bytes = await readLimitedBody(response, this.options.maxBytes, signal);
    return {
      finalUrl: url.href,
      contentType: mediaType,
      text: new TextDecoder('utf-8').decode(bytes),
    };
  }
}

function isAddressAllowed(address: ResolvedAddress): boolean {
  const version = isIP(address.address);
  if (version === 4) return isPublicIpv4(address.address);
  if (version === 6) return isPublicIpv6(address.address);
  return false;
}

function requestPinned(input: SafePinnedRequest): Promise<SafeRawResponse> {
  const client = input.url.protocol === 'https:' ? https : http;
  const hostname = toDnsHostname(input.url.hostname);
  const lookup = createPinnedLookup(hostname, input.address);

  return new Promise((resolve, reject) => {
    let settled = false;
    const settleReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    let req: http.ClientRequest;
    try {
      req = client.request(input.url, {
        method: 'GET',
        agent: false,
        signal: input.signal,
        lookup,
        headers: {
          ...input.headers,
          'Accept-Encoding': 'identity',
        },
        ...(input.url.protocol === 'https:'
          ? { servername: hostname, rejectUnauthorized: true }
          : {}),
      });
    } catch (error) {
      settleReject(error);
      return;
    }

    req.on('error', (error) => {
      if (input.signal.aborted) {
        settleReject(new Error('request-timeout'));
        return;
      }
      settleReject(error);
    });

    req.on('response', (res) => {
      if (settled) {
        res.destroy();
        return;
      }
      settled = true;
      resolve({
        statusCode: res.statusCode ?? 0,
        headers: flattenHeaders(res.headers),
        body: res,
        destroy() {
          req.destroy();
          res.destroy();
        },
      });
    });

    req.end();
  });
}

function createPinnedLookup(expectedHostname: string, address: ResolvedAddress): LookupFunction {
  return ((hostname, options, callback) => {
    const cb = typeof options === 'function' ? options : callback;
    const lookupOptions = typeof options === 'object' && options !== null ? options : {};
    if (typeof cb !== 'function') return;

    const complete = cb as (
      err: NodeJS.ErrnoException | null,
      address?: string | Array<{ address: string; family: number }>,
      family?: number,
    ) => void;

    if (toDnsHostname(hostname) !== expectedHostname) {
      const error = Object.assign(new Error('unsafe-address'), { code: 'ENOTFOUND' });
      complete(error);
      return;
    }

    if ('all' in lookupOptions && lookupOptions.all === true) {
      complete(null, [{ address: address.address, family: address.family }]);
      return;
    }
    complete(null, address.address, address.family);
  }) as LookupFunction;
}

function parseRedirectUrl(location: string, base: URL): URL {
  const trimmed = location.trim();
  if (!trimmed) {
    throw new Error('unsafe-url');
  }
  if (trimmed.startsWith('//')) {
    return parseSafeUrl(`${base.protocol}${trimmed}`);
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/u.test(trimmed)) {
    return parseSafeUrl(trimmed);
  }
  const colon = trimmed.indexOf(':');
  const slash = trimmed.indexOf('/');
  if (colon !== -1 && (slash === -1 || colon < slash) && !trimmed.startsWith('/')) {
    throw new Error('unsafe-url');
  }
  return parseSafeUrl(trimmed, base);
}

function parseSafeUrl(input: string, base?: URL): URL {
  if (typeof input !== 'string' || input.length === 0) {
    throw new Error('unsafe-url');
  }

  let url: URL;
  try {
    url = base ? new URL(input, base) : new URL(input);
  } catch {
    throw new Error('unsafe-url');
  }

  url.hash = '';
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('unsafe-url');
  }
  if (url.username || url.password) {
    throw new Error('unsafe-url');
  }

  const hostname = toDnsHostname(url.hostname);
  if (!hostname || hostname.includes('%')) {
    throw new Error('unsafe-url');
  }

  const family = isIP(hostname);
  if (family === 0) {
    if (isLocalhostName(hostname) || !isValidHostname(hostname)) {
      throw new Error('unsafe-url');
    }
  }

  return url;
}

function isLocalhostName(hostname: string): boolean {
  return hostname === 'localhost' || hostname.endsWith('.localhost');
}

function isValidHostname(hostname: string): boolean {
  if (hostname.length > 253) return false;
  const labels = hostname.split('.');
  return labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
}

function toDnsHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').replace(/\.+$/g, '').toLowerCase();
}

function isPublicIpv4(address: string): boolean {
  const ip = ipv4ToInt(address);
  if (ip === undefined) return false;
  return !IPV4_BLOCKED.some(([prefix, bits]) => ipv4InCidr(ip, prefix, bits));
}

function isPublicIpv6(address: string): boolean {
  if (address.includes('%')) return false;
  const groups = expandIpv6(address);
  if (!groups) return false;
  if (groups.every((group) => group === 0)) return false;
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return false;

  const first = groups[0] ?? 0;
  if ((first & 0xfe00) === 0xfc00) return false;
  if ((first & 0xffc0) === 0xfe80) return false;
  if ((first & 0xff00) === 0xff00) return false;
  if (first === 0x2001 && groups[1] === 0xdb8) return false;

  if (
    groups[0] === 0
    && groups[1] === 0
    && groups[2] === 0
    && groups[3] === 0
    && groups[4] === 0
    && groups[5] === 0xffff
  ) {
    const mapped = `${(groups[6] ?? 0) >> 8}.${(groups[6] ?? 0) & 0xff}.${(groups[7] ?? 0) >> 8}.${(groups[7] ?? 0) & 0xff}`;
    return isPublicIpv4(mapped);
  }

  return true;
}

function ipv4ToInt(address: string): number | undefined {
  const parts = address.split('.');
  if (parts.length !== 4) return undefined;
  const octets = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return Number.NaN;
    return Number(part);
  });
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return undefined;
  }
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

function ipv4InCidr(ip: number, prefix: string, bits: number): boolean {
  const base = ipv4ToInt(prefix);
  if (base === undefined) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) === (base & mask);
}

function expandIpv6(address: string): number[] | undefined {
  const zoneless = address.split('%')[0] ?? address;
  let ipv4Tail: number[] | undefined;
  let core = zoneless;
  const ipv4Match = zoneless.match(/:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (ipv4Match?.[1] && ipv4Match.index !== undefined) {
    const octets = ipv4Match[1].split('.').map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
      return undefined;
    }
    ipv4Tail = [((octets[0] << 8) | octets[1]) >>> 0, ((octets[2] << 8) | octets[3]) >>> 0];
    core = zoneless.slice(0, ipv4Match.index);
  }

  if ((core.match(/::/g) ?? []).length > 1) return undefined;
  const halves = core.split('::');
  const head = halves[0] ? halves[0].split(':').filter(Boolean) : [];
  const tail = halves[1] ? halves[1].split(':').filter(Boolean) : [];
  const extra = ipv4Tail ? 2 : 0;
  const missing = 8 - extra - head.length - tail.length;
  if (halves.length === 1 && missing !== 0) return undefined;
  if (missing < 0) return undefined;

  const groups = [
    ...head.map((group) => Number.parseInt(group, 16)),
    ...Array.from({ length: halves.length === 2 ? missing : 0 }, () => 0),
    ...tail.map((group) => Number.parseInt(group, 16)),
    ...(ipv4Tail ?? []),
  ];
  if (
    groups.length !== 8
    || groups.some((group) => !Number.isInteger(group) || group < 0 || group > 0xffff)
  ) {
    return undefined;
  }
  return groups;
}

function parseContentType(value: string): { mediaType: string; charset?: string } {
  const [rawMedia, ...params] = value.split(';');
  const mediaType = (rawMedia ?? '').trim().toLowerCase();
  let charset: string | undefined;
  for (const param of params) {
    const [rawName, ...rawValue] = param.split('=');
    if (rawName?.trim().toLowerCase() !== 'charset') continue;
    charset = rawValue.join('=').trim().replace(/^["']|["']$/g, '').toLowerCase();
  }
  return { mediaType, charset };
}

function parseContentLength(value: string): number | undefined {
  if (!value) return undefined;
  if (!/^\d+$/.test(value.trim())) return undefined;
  const length = Number.parseInt(value, 10);
  return Number.isSafeInteger(length) ? length : undefined;
}

function headerValue(
  headers: Readonly<Record<string, string | undefined>>,
  name: string,
): string {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target && typeof value === 'string') {
      return value;
    }
  }
  return '';
}

function flattenHeaders(headers: http.IncomingHttpHeaders): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      result[key] = value.join(', ');
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function readLimitedBody(
  response: SafeRawResponse,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body) {
    throwIfAborted(signal);
    const bytes = chunk instanceof Uint8Array ? chunk : new TextEncoder().encode(String(chunk));
    total += bytes.byteLength;
    if (total > maxBytes) {
      throw new Error('response-too-large');
    }
    chunks.push(bytes);
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function raceAgainstAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(new Error('request-timeout'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error('request-timeout');
  }
}

function isStableCode(error: unknown, code: string): boolean {
  return error instanceof Error && error.message === code;
}

function stabilizeError(error: unknown): Error {
  if (error instanceof Error && STABLE_ERROR_CODES.has(error.message)) {
    return error;
  }
  return new Error('unexpected-status');
}
