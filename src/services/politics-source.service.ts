/** Thu thập tin chính trị từ mọi adapter đã bật, chuẩn hóa URL/giới hạn và cộng dồn lỗi ổn định. */
import { env } from '../config/env';
import type { PoliticsCollectionResult, PoliticsSourceItem } from '../types/gold-politics';
import { normalizeUrl } from '../utils/normalize-url';
import { compactText } from '../utils/text';
import type { PoliticsSourceAdapter } from './politics-source.adapter';

export interface PoliticsSourceLimits {
  maxItemsPerAdapter: number;
  maxCandidates: number;
  maxUrlLength: number;
  maxTitleLength: number;
  maxSourceTextLength: number;
  maxSourceNameLength: number;
  maxIdentityLength: number;
}

const LIMIT_CEILINGS: PoliticsSourceLimits = {
  maxItemsPerAdapter: 100,
  maxCandidates: 500,
  maxUrlLength: 2048,
  maxTitleLength: 500,
  maxSourceTextLength: 4000,
  maxSourceNameLength: 200,
  maxIdentityLength: 200,
};

const LIMIT_KEYS = [
  'maxItemsPerAdapter',
  'maxCandidates',
  'maxUrlLength',
  'maxTitleLength',
  'maxSourceTextLength',
  'maxSourceNameLength',
  'maxIdentityLength',
] as const satisfies readonly (keyof PoliticsSourceLimits)[];

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const PROMOTION_PATTERNS = ['mua ngay', 'giảm giá', 'khuyến mãi', 'affiliate', 'sponsored'] as const;

export class PoliticsSourceService {
  private readonly limits: Readonly<PoliticsSourceLimits>;

  constructor(
    private readonly adapters: readonly PoliticsSourceAdapter[],
    private readonly maxAgeHours = env.GOLD_POLITICS_MAX_AGE_HOURS,
    private readonly maxFutureSkewMs = 5 * 60 * 1000,
    limits: PoliticsSourceLimits = {
      maxItemsPerAdapter: 100,
      maxCandidates: 500,
      maxUrlLength: 2048,
      maxTitleLength: 500,
      maxSourceTextLength: 4000,
      maxSourceNameLength: 200,
      maxIdentityLength: 200,
    },
    private readonly now: () => Date = () => new Date(),
  ) {
    this.limits = copyAndFreezeLimits(limits);
  }

  async collectLatest(): Promise<PoliticsCollectionResult> {
    const collectedAt = this.now();
    const enabled = this.adapters.filter((adapter) => adapter.isEnabled());
    const settled = await Promise.allSettled(enabled.map((adapter) => adapter.collect()));

    const failedKeys = new Set<string>();
    const failedSources: string[] = [];
    const seenUrls = new Set<string>();
    const items: PoliticsSourceItem[] = [];
    let successfulSourceCount = 0;

    const addFailure = (key: string) => {
      if (failedKeys.has(key)) return;
      failedKeys.add(key);
      failedSources.push(key);
    };

    enabled.forEach((adapter, index) => {
      const outcome = settled[index];
      if (!outcome || outcome.status === 'rejected') {
        addFailure(adapter.key);
        return;
      }

      successfulSourceCount += outcome.value.successfulSourceCount;
      for (const key of outcome.value.failedSources) {
        addFailure(key);
      }

      if (items.length >= this.limits.maxCandidates) {
        return;
      }

      const rawItems = outcome.value.items.slice(0, this.limits.maxItemsPerAdapter);
      for (const raw of rawItems) {
        if (items.length >= this.limits.maxCandidates) break;
        const normalized = this.normalizeItem(raw, collectedAt);
        if (!normalized || seenUrls.has(normalized.url)) continue;
        seenUrls.add(normalized.url);
        items.push(normalized);
      }
    });

    return {
      items,
      collectedCount: items.length,
      successfulSourceCount,
      failedSourceCount: failedSources.length,
      failedSources,
    };
  }

  private normalizeItem(raw: PoliticsSourceItem, now: Date): PoliticsSourceItem | undefined {
    const publishedAt = parseIsoTimestamp(raw.publishedAt);
    if (!publishedAt) return undefined;

    const publishedMs = Date.parse(publishedAt);
    if (now.getTime() - publishedMs > this.maxAgeHours * 60 * 60 * 1000) return undefined;
    if (publishedMs > now.getTime() + this.maxFutureSkewMs) return undefined;

    const url = canonicalizePublicHttpUrl(raw.url, this.limits.maxUrlLength);
    const originUrl = canonicalizePublicHttpUrl(raw.originAttribution?.url, this.limits.maxUrlLength);
    if (!url || !originUrl) return undefined;

    const title = compactText(raw.title ?? '');
    if (!title) return undefined;

    const summary = raw.summary === undefined ? undefined : compactText(raw.summary);
    const searchable = `${title} ${summary ?? ''}`.toLowerCase();
    if (PROMOTION_PATTERNS.some((pattern) => searchable.includes(pattern))) {
      return undefined;
    }

    const boundedTitle = boundText(title, this.limits.maxTitleLength);
    const boundedSummary =
      summary === undefined ? undefined : boundText(summary, this.limits.maxSourceTextLength);
    const truncatedText =
      boundedTitle.length < title.length
      || (summary !== undefined && boundedSummary !== undefined && boundedSummary.length < summary.length);

    const author = boundIdentity(raw.author, this.limits.maxIdentityLength);
    const originalAuthor = boundIdentity(raw.originalAuthor, this.limits.maxIdentityLength);
    const originalAccount = boundIdentity(raw.originalAccount, this.limits.maxIdentityLength);
    const originAccount = boundIdentity(raw.originAttribution?.account, this.limits.maxIdentityLength);
    const identityOverlong =
      author.overlong || originalAuthor.overlong || originalAccount.overlong || originAccount.overlong;

    return {
      ...raw,
      title: boundedTitle,
      url,
      summary: boundedSummary || undefined,
      sourceName: boundText(compactText(raw.sourceName ?? ''), this.limits.maxSourceNameLength),
      author: author.value,
      publishedAt,
      originalAuthor: originalAuthor.value,
      originalAccount: originalAccount.value,
      originalUrl: canonicalizeOptionalHttpUrl(raw.originalUrl, this.limits.maxUrlLength),
      quotedOriginUrl: canonicalizeOptionalHttpUrl(raw.quotedOriginUrl, this.limits.maxUrlLength),
      sourceTextStatus: truncatedText ? 'incomplete' : raw.sourceTextStatus,
      evidenceKind: identityOverlong ? 'anonymous-rumor' : raw.evidenceKind,
      originAttribution: {
        url: originUrl,
        account: originAccount.value,
        publishedAt: parseIsoTimestamp(raw.originAttribution?.publishedAt) ?? publishedAt,
        discoveredAt: raw.originAttribution?.discoveredAt ?? raw.discoveredAt,
      },
    };
  }
}

function copyAndFreezeLimits(limits: PoliticsSourceLimits): Readonly<PoliticsSourceLimits> {
  const copied = {} as PoliticsSourceLimits;
  for (const key of LIMIT_KEYS) {
    const value = limits[key];
    if (!Number.isInteger(value) || value < 1 || value > LIMIT_CEILINGS[key]) {
      throw new RangeError('invalid-politics-source-limits');
    }
    copied[key] = value;
  }
  return Object.freeze(copied);
}

function parseIsoTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string' || !ISO_INSTANT.test(value.trim())) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

function canonicalizePublicHttpUrl(input: unknown, maxLength: number): string | undefined {
  if (typeof input !== 'string' || !input.trim()) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return undefined;
  }
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password) {
    return undefined;
  }
  const canonical = normalizeUrl(parsed.toString());
  if (canonical.length > maxLength) return undefined;
  return canonical;
}

function canonicalizeOptionalHttpUrl(input: string | undefined, maxLength: number): string | undefined {
  if (input === undefined) return undefined;
  return canonicalizePublicHttpUrl(input, maxLength);
}

function boundText(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function boundIdentity(
  value: string | undefined,
  maxLength: number,
): { value: string | undefined; overlong: boolean } {
  if (typeof value !== 'string') return { value: undefined, overlong: false };
  const trimmed = compactText(value);
  if (!trimmed) return { value: undefined, overlong: false };
  if (trimmed.length > maxLength) return { value: undefined, overlong: true };
  return { value: trimmed, overlong: false };
}
