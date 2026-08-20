import { describe, expect, it, vi } from 'vitest';
import { PoliticsSourceService, type PoliticsSourceLimits } from '../../src/services/politics-source.service';
import type { PoliticsSourceAdapter, PoliticsSourceAdapterResult } from '../../src/services/politics-source.adapter';
import type { PoliticsSourceItem } from '../../src/types/gold-politics';

const NOW = new Date('2026-08-20T12:00:00.000Z');
const MAX_AGE_HOURS = 72;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const WITHIN_AGE = '2026-08-19T08:00:00.000Z';
const EXACTLY_MAX_AGE = '2026-08-17T12:00:00.000Z';
const ONE_MS_TOO_OLD = '2026-08-17T11:59:59.999Z';
const EXACTLY_MAX_FUTURE = '2026-08-20T12:05:00.000Z';
const ONE_MS_TOO_FUTURE = '2026-08-20T12:05:00.001Z';

const DEFAULT_LIMITS: PoliticsSourceLimits = {
  maxItemsPerAdapter: 100,
  maxCandidates: 500,
  maxUrlLength: 2048,
  maxTitleLength: 500,
  maxSourceTextLength: 4000,
  maxSourceNameLength: 200,
  maxIdentityLength: 200,
};

function item(overrides: Partial<PoliticsSourceItem> = {}): PoliticsSourceItem {
  const url = overrides.url ?? 'https://news.example/story';
  const publishedAt = Object.hasOwn(overrides, 'publishedAt')
    ? overrides.publishedAt!
    : WITHIN_AGE;
  const origin = overrides.originAttribution;
  return {
    id: overrides.id ?? url,
    sourceId: overrides.sourceId ?? 'rss-test',
    sourceName: overrides.sourceName ?? 'Test Source',
    title: overrides.title ?? 'Government announces a new budget plan',
    url,
    summary: overrides.summary ?? 'Parliament debated spending and gold-reserve policy.',
    author: overrides.author,
    publishedAt,
    collectedAt: overrides.collectedAt ?? NOW.toISOString(),
    topics: overrides.topics ?? [],
    discoveryChannel: overrides.discoveryChannel ?? 'rss',
    discoveredAt: overrides.discoveredAt ?? NOW.toISOString(),
    originalAuthor: overrides.originalAuthor,
    originalAccount: overrides.originalAccount,
    originalUrl: overrides.originalUrl,
    quotedOriginUrl: overrides.quotedOriginUrl,
    syndicationKey: overrides.syndicationKey,
    sourceQuotaKey: overrides.sourceQuotaKey ?? 'news.example',
    sourceTextStatus: overrides.sourceTextStatus ?? 'full',
    evidenceKind: overrides.evidenceKind ?? 'identified-report',
    evidentiaryEffect: overrides.evidentiaryEffect ?? 'mentions',
    evidenceOriginKey: overrides.evidenceOriginKey ?? 'news.example',
    originAttribution: {
      url: origin?.url ?? url,
      account: origin?.account,
      publishedAt: origin?.publishedAt ?? publishedAt,
      discoveredAt: origin?.discoveredAt ?? overrides.discoveredAt ?? NOW.toISOString(),
    },
  };
}

function fakeAdapter(options: {
  key: string;
  enabled?: boolean;
  result?: PoliticsSourceAdapterResult;
  error?: unknown;
  collect?: PoliticsSourceAdapter['collect'];
}): PoliticsSourceAdapter & { collect: ReturnType<typeof vi.fn> } {
  const collect =
    options.collect ??
    vi.fn(async () => {
      if (options.error !== undefined) {
        throw options.error;
      }
      return (
        options.result ?? {
          items: [],
          successfulSourceCount: 1,
          failedSources: [],
        }
      );
    });
  return {
    key: options.key,
    isEnabled: () => options.enabled ?? true,
    collect,
  };
}

function createService(
  adapters: readonly PoliticsSourceAdapter[],
  limits: PoliticsSourceLimits = DEFAULT_LIMITS,
  now: () => Date = () => NOW,
) {
  return new PoliticsSourceService(adapters, MAX_AGE_HOURS, MAX_FUTURE_SKEW_MS, limits, now);
}

describe('PoliticsSourceService', () => {
  it('counts enabled fulfilled sources, including empty results, as successful', async () => {
    const rss = fakeAdapter({
      key: 'rss-vnexpress',
      result: {
        items: [item({ url: 'https://www.vnexpress.net/budget' })],
        successfulSourceCount: 1,
        failedSources: [],
      },
    });
    const reddit = fakeAdapter({
      key: 'reddit-search',
      result: { items: [], successfulSourceCount: 1, failedSources: [] },
    });

    const result = await createService([rss, reddit]).collectLatest();

    expect(result.successfulSourceCount).toBe(2);
    expect(result.failedSourceCount).toBe(0);
    expect(result.failedSources).toEqual([]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.url).toBe('https://www.vnexpress.net/budget');
    expect(result.collectedCount).toBe(1);
  });

  it('omits disabled X/Brave adapters from both success and failure counts', async () => {
    const xSearch = fakeAdapter({
      key: 'x-search',
      enabled: false,
      error: new Error('x-search should not run'),
    });
    const brave = fakeAdapter({
      key: 'brave-search',
      enabled: false,
      error: new Error('brave-search should not run'),
    });
    const rss = fakeAdapter({
      key: 'rss-vnexpress',
      result: {
        items: [item({ url: 'https://www.vnexpress.net/budget' })],
        successfulSourceCount: 1,
        failedSources: [],
      },
    });

    const result = await createService([xSearch, brave, rss]).collectLatest();

    expect(xSearch.collect).not.toHaveBeenCalled();
    expect(brave.collect).not.toHaveBeenCalled();
    expect(rss.collect).toHaveBeenCalledTimes(1);
    expect(result.successfulSourceCount).toBe(1);
    expect(result.failedSourceCount).toBe(0);
    expect(result.failedSources).toEqual([]);
    expect(result.items).toHaveLength(1);
  });

  it('keeps other results when one adapter is rejected', async () => {
    const rss = fakeAdapter({
      key: 'rss-vnexpress',
      result: {
        items: [item({ url: 'https://www.vnexpress.net/budget' })],
        successfulSourceCount: 1,
        failedSources: [],
      },
    });
    const xSearch = fakeAdapter({
      key: 'x-search',
      error: new Error('raw x boom'),
    });
    const reddit = fakeAdapter({
      key: 'reddit-search',
      result: {
        items: [item({ url: 'https://www.reddit.com/r/worldnews/comments/abc/policy' })],
        successfulSourceCount: 4,
        failedSources: ['reddit:q5'],
      },
    });

    const result = await createService([rss, xSearch, reddit]).collectLatest();

    expect(result.successfulSourceCount).toBe(5);
    expect(result.failedSources).toEqual(['x-search', 'reddit:q5']);
    expect(result.failedSourceCount).toBe(2);
    expect(result.items.map((entry) => entry.url)).toEqual([
      'https://www.vnexpress.net/budget',
      'https://www.reddit.com/r/worldnews/comments/abc/policy',
    ]);
    expect(result.collectedCount).toBe(2);
  });

  it('merges adapter leaf failures while retaining fulfilled leaf items', async () => {
    const reddit = fakeAdapter({
      key: 'reddit-search',
      result: {
        items: [item({ url: 'https://www.reddit.com/r/worldnews/comments/abc/policy' })],
        successfulSourceCount: 3,
        failedSources: ['reddit:q2', 'reddit:q4'],
      },
    });
    const allFailed = fakeAdapter({
      key: 'brave-search',
      result: {
        items: [],
        successfulSourceCount: 0,
        failedSources: ['brave:gold', 'brave:politics'],
      },
    });

    const result = await createService([reddit, allFailed]).collectLatest();

    expect(result.successfulSourceCount).toBe(3);
    expect(result.failedSources).toEqual(['reddit:q2', 'reddit:q4', 'brave:gold', 'brave:politics']);
    expect(result.failedSourceCount).toBe(4);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.url).toBe('https://www.reddit.com/r/worldnews/comments/abc/policy');
  });

  it('returns unique failed keys in adapter registration order, never raw error order or message', async () => {
    let releaseFirst: () => void = () => undefined;
    const firstRejected = new Promise<never>((_, reject) => {
      releaseFirst = () => reject(new Error('zzz-later-adapter-raw-message'));
    });
    const laterRejected = fakeAdapter({
      key: 'rss-reuters',
      collect: vi.fn(async () => firstRejected),
    });
    const earlierRejected = fakeAdapter({
      key: 'x-search',
      error: new Error('aaa-first-to-settle-raw-message'),
    });
    const reddit = fakeAdapter({
      key: 'reddit-search',
      result: {
        items: [item({ url: 'https://www.reddit.com/r/worldnews/comments/abc/policy' })],
        successfulSourceCount: 2,
        failedSources: ['reddit:q2', 'reddit:q1'],
      },
    });
    const duplicateLeaf = fakeAdapter({
      key: 'rss-bbc',
      result: {
        items: [item({ url: 'https://www.bbc.co.uk/news/policy' })],
        successfulSourceCount: 1,
        failedSources: ['reddit:q2', 'rss-bbc-leaf'],
      },
    });

    const pending = createService([laterRejected, earlierRejected, reddit, duplicateLeaf]).collectLatest();
    await Promise.resolve();
    releaseFirst();
    const result = await pending;

    expect(result.failedSources).toEqual(['rss-reuters', 'x-search', 'reddit:q2', 'reddit:q1', 'rss-bbc-leaf']);
    expect(result.failedSourceCount).toBe(5);
    expect(result.failedSources.join(',')).not.toContain('raw-message');
    expect(result.successfulSourceCount).toBe(3);
  });

  it('accepts publication age exactly 72 hours and rejects older, too-future, missing, or invalid dates', async () => {
    const rss = fakeAdapter({
      key: 'rss-mixed',
      result: {
        items: [
          item({ url: 'https://news.example/exact-age', publishedAt: EXACTLY_MAX_AGE }),
          item({ url: 'https://news.example/too-old', publishedAt: ONE_MS_TOO_OLD }),
          item({ url: 'https://news.example/exact-future', publishedAt: EXACTLY_MAX_FUTURE }),
          item({ url: 'https://news.example/too-future', publishedAt: ONE_MS_TOO_FUTURE }),
          item({
            url: 'https://news.example/missing-date',
            publishedAt: undefined as unknown as string,
            collectedAt: NOW.toISOString(),
            originAttribution: {
              url: 'https://news.example/missing-date',
              publishedAt: NOW.toISOString(),
              discoveredAt: NOW.toISOString(),
            },
          }),
          item({ url: 'https://news.example/invalid-date', publishedAt: 'not-an-instant' }),
          item({ url: 'https://news.example/empty-date', publishedAt: '' }),
        ],
        successfulSourceCount: 1,
        failedSources: [],
      },
    });

    const result = await createService([rss]).collectLatest();

    expect(result.items.map((entry) => entry.url)).toEqual([
      'https://news.example/exact-age',
      'https://news.example/exact-future',
    ]);
    expect(result.collectedCount).toBe(2);
    expect(result.successfulSourceCount).toBe(1);
  });

  it('never falls back to collectedAt when a search date is missing', async () => {
    const rss = fakeAdapter({
      key: 'rss-fallback',
      result: {
        items: [
          item({
            url: 'https://news.example/collected-only',
            publishedAt: undefined as unknown as string,
            collectedAt: NOW.toISOString(),
          }),
        ],
        successfulSourceCount: 1,
        failedSources: [],
      },
    });

    const result = await createService([rss]).collectLatest();
    expect(result.items).toEqual([]);
    expect(result.collectedCount).toBe(0);
    expect(result.successfulSourceCount).toBe(1);
  });

  it('rejects unsafe required URLs, empty titles, and obvious promotion, while dropping unsafe optional URLs', async () => {
    const rss = fakeAdapter({
      key: 'rss-urls',
      result: {
        items: [
          item({ url: 'ftp://news.example/story', title: 'Valid government update' }),
          item({ url: 'https://user:pass@news.example/secret', title: 'Valid government update' }),
          item({ url: 'not a url', title: 'Valid government update' }),
          item({
            url: 'https://news.example/ok',
            originAttribution: {
              url: 'https://user:token@origin.example/claim',
              publishedAt: WITHIN_AGE,
              discoveredAt: NOW.toISOString(),
            },
          }),
          item({ url: 'https://news.example/empty-title', title: '   ' }),
          item({ url: 'https://news.example/promo-mua', title: 'Mua ngay lô vàng miếng' }),
          item({ url: 'https://news.example/promo-giam', title: 'Chính phủ GIẢM GIÁ lãi suất' }),
          item({ url: 'https://news.example/promo-khuyen', title: 'Khuyến mãi chính sách mới' }),
          item({ url: 'https://news.example/promo-aff', title: 'Policy brief with affiliate desk' }),
          item({
            url: 'https://news.example/promo-sponsored',
            title: 'Cabinet meeting notes',
            summary: 'This briefing is sponsored by a broker.',
          }),
          item({
            url: 'https://news.example/keep',
            originalUrl: 'https://user:pass@leaked.example/original',
            quotedOriginUrl: 'javascript:alert(1)',
          }),
        ],
        successfulSourceCount: 1,
        failedSources: [],
      },
    });

    const result = await createService([rss]).collectLatest();

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.url).toBe('https://news.example/keep');
    expect(result.items[0]?.originalUrl).toBeUndefined();
    expect(result.items[0]?.quotedOriginUrl).toBeUndefined();
    expect(JSON.stringify(result.items[0])).not.toContain('user:pass');
    expect(JSON.stringify(result.items[0])).not.toContain('javascript:');
    expect(result.collectedCount).toBe(1);
  });

  it('canonicalizes credential-free HTTP(S) URLs, strips tracking, and collapses duplicates stably', async () => {
    const rss = fakeAdapter({
      key: 'rss-canonical',
      result: {
        items: [
          item({
            url: 'https://News.Example/story?utm_source=rss&utm_medium=feed#comments',
            originalUrl: 'https://News.Example/story?utm_source=rss#comments',
            quotedOriginUrl: 'https://quoted.example/origin?fbclid=abc&gclid=def',
            originAttribution: {
              url: 'https://News.Example/story?utm_campaign=x',
              publishedAt: WITHIN_AGE,
              discoveredAt: NOW.toISOString(),
            },
          }),
          item({
            url: 'https://news.example/story?fbclid=tracker',
            title: 'Duplicate canonical URL should be dropped',
          }),
          item({ url: 'https://news.example/other/' }),
        ],
        successfulSourceCount: 1,
        failedSources: [],
      },
    });

    const result = await createService([rss]).collectLatest();

    expect(result.items.map((entry) => entry.url)).toEqual([
      'https://news.example/story',
      'https://news.example/other',
    ]);
    expect(result.items[0]?.originAttribution.url).toBe('https://news.example/story');
    expect(result.items[0]?.originalUrl).toBe('https://news.example/story');
    expect(result.items[0]?.quotedOriginUrl).toBe('https://quoted.example/origin');
    expect(result.collectedCount).toBe(2);
  });

  it('inspects at most 100 raw items per adapter and stops appending at 500 candidates', async () => {
    const flood = Array.from({ length: 10_000 }, (_, index) =>
      item({ url: `https://flood.example/story-${index}` }),
    );
    const fillers = [2, 3, 4, 5].map((slot) =>
      fakeAdapter({
        key: `rss-fill-${slot}`,
        result: {
          items: Array.from({ length: 100 }, (_, index) =>
            item({ url: `https://fill-${slot}.example/story-${index}` }),
          ),
          successfulSourceCount: 1,
          failedSources: [],
        },
      }),
    );
    const overflow = fakeAdapter({
      key: 'rss-overflow',
      result: {
        items: [item({ url: 'https://overflow.example/never-appended' })],
        successfulSourceCount: 1,
        failedSources: [],
      },
    });

    const result = await createService([
      fakeAdapter({
        key: 'rss-flood',
        result: { items: flood, successfulSourceCount: 1, failedSources: [] },
      }),
      ...fillers,
      overflow,
    ]).collectLatest();

    expect(result.items).toHaveLength(500);
    expect(result.collectedCount).toBe(500);
    expect(result.items[0]?.url).toBe('https://flood.example/story-0');
    expect(result.items[99]?.url).toBe('https://flood.example/story-99');
    expect(result.items.some((entry) => entry.url === 'https://flood.example/story-100')).toBe(false);
    expect(result.items[100]?.url).toBe('https://fill-2.example/story-0');
    expect(result.items[499]?.url).toBe('https://fill-5.example/story-99');
    expect(result.items.some((entry) => entry.url === 'https://overflow.example/never-appended')).toBe(
      false,
    );
    expect(result.successfulSourceCount).toBe(6);
  });

  it('rejects canonical URLs longer than 2,048 code units and bounds title, source text, name, and identity', async () => {
    const longUrl = `https://news.example/${'a'.repeat(2048)}`;
    const longTitle = `Cabinet ${'plan '.repeat(120)}end`;
    const longSummary = `${'policy '.repeat(800)}tail`;
    const longName = `Source ${'Name'.repeat(60)}`;
    const longAuthor = `Author ${'X'.repeat(200)}`;
    const longAccount = `account${'Y'.repeat(200)}`;
    const rss = fakeAdapter({
      key: 'rss-bounds',
      result: {
        items: [
          item({ url: longUrl, title: 'Overlong canonical URL' }),
          item({
            url: 'https://news.example/bounded',
            title: longTitle,
            summary: longSummary,
            sourceName: longName,
            author: longAuthor,
            originalAuthor: longAuthor,
            originalAccount: longAccount,
            originAttribution: {
              url: 'https://news.example/bounded',
              account: longAccount,
              publishedAt: WITHIN_AGE,
              discoveredAt: NOW.toISOString(),
            },
            sourceTextStatus: 'full',
            evidenceKind: 'identified-report',
          }),
        ],
        successfulSourceCount: 1,
        failedSources: [],
      },
    });

    const result = await createService([rss]).collectLatest();

    expect(result.items).toHaveLength(1);
    const bounded = result.items[0]!;
    expect(bounded.url).toBe('https://news.example/bounded');
    expect(bounded.title).toHaveLength(500);
    expect(bounded.title).toBe(longTitle.slice(0, 500));
    expect(bounded.summary).toHaveLength(4000);
    expect(bounded.summary).toBe(longSummary.slice(0, 4000));
    expect(bounded.sourceName).toHaveLength(200);
    expect(bounded.sourceName).toBe(longName.slice(0, 200));
    expect(bounded.sourceTextStatus).toBe('incomplete');
    expect(bounded.author).toBeUndefined();
    expect(bounded.originalAuthor).toBeUndefined();
    expect(bounded.originalAccount).toBeUndefined();
    expect(bounded.originAttribution.account).toBeUndefined();
    expect(bounded.evidenceKind).toBe('anonymous-rumor');
    expect(bounded.author).not.toBe(longAuthor.slice(0, 200));
    expect(bounded.originalAccount).not.toBe(longAccount.slice(0, 200));
    expect(result.collectedCount).toBe(1);
  });

  it('keeps an identity of exactly the identity ceiling and does not invent a truncated identity', async () => {
    const exactAuthor = 'A'.repeat(200);
    const rss = fakeAdapter({
      key: 'rss-identity',
      result: {
        items: [
          item({
            url: 'https://news.example/exact-identity',
            author: exactAuthor,
            originalAuthor: exactAuthor,
            originalAccount: 'B'.repeat(200),
            originAttribution: {
              url: 'https://news.example/exact-identity',
              account: 'C'.repeat(200),
              publishedAt: WITHIN_AGE,
              discoveredAt: NOW.toISOString(),
            },
            evidenceKind: 'identified-report',
          }),
        ],
        successfulSourceCount: 1,
        failedSources: [],
      },
    });

    const result = await createService([rss]).collectLatest();
    expect(result.items[0]?.author).toBe(exactAuthor);
    expect(result.items[0]?.originalAuthor).toBe(exactAuthor);
    expect(result.items[0]?.originalAccount).toBe('B'.repeat(200));
    expect(result.items[0]?.originAttribution.account).toBe('C'.repeat(200));
    expect(result.items[0]?.evidenceKind).toBe('identified-report');
    expect(result.items[0]?.sourceTextStatus).toBe('full');
  });

  it('throws RangeError for non-positive, non-integer, or above-ceiling source limits', () => {
    const adapters = [fakeAdapter({ key: 'rss-test' })];
    const invalid: Array<Partial<PoliticsSourceLimits>> = [
      { maxItemsPerAdapter: 0 },
      { maxCandidates: -1 },
      { maxUrlLength: 1.5 },
      { maxTitleLength: Number.NaN },
      { maxSourceTextLength: Number.POSITIVE_INFINITY },
      { maxItemsPerAdapter: 101 },
      { maxCandidates: 501 },
      { maxUrlLength: 2049 },
      { maxTitleLength: 501 },
      { maxSourceTextLength: 4001 },
      { maxSourceNameLength: 201 },
      { maxIdentityLength: 201 },
    ];

    for (const override of invalid) {
      expect(() => createService(adapters, { ...DEFAULT_LIMITS, ...override })).toThrow(RangeError);
      expect(() => createService(adapters, { ...DEFAULT_LIMITS, ...override })).toThrow(
        'invalid-politics-source-limits',
      );
    }
  });

  it('freezes copied limits so later caller mutation cannot raise a ceiling', async () => {
    const limits: PoliticsSourceLimits = {
      ...DEFAULT_LIMITS,
      maxItemsPerAdapter: 2,
      maxCandidates: 3,
      maxTitleLength: 10,
    };
    const rss = fakeAdapter({
      key: 'rss-limits',
      result: {
        items: [
          item({ url: 'https://news.example/one', title: '123456789012345' }),
          item({ url: 'https://news.example/two' }),
          item({ url: 'https://news.example/three' }),
          item({ url: 'https://news.example/four' }),
        ],
        successfulSourceCount: 1,
        failedSources: [],
      },
    });
    const extra = fakeAdapter({
      key: 'rss-extra',
      result: {
        items: [item({ url: 'https://news.example/five' }), item({ url: 'https://news.example/six' })],
        successfulSourceCount: 1,
        failedSources: [],
      },
    });
    const service = createService([rss, extra], limits);
    limits.maxItemsPerAdapter = 100;
    limits.maxCandidates = 500;
    limits.maxTitleLength = 500;

    const result = await service.collectLatest();

    expect(result.items.map((entry) => entry.url)).toEqual([
      'https://news.example/one',
      'https://news.example/two',
      'https://news.example/five',
    ]);
    expect(result.items[0]?.title).toBe('1234567890');
    expect(result.items[0]?.sourceTextStatus).toBe('incomplete');
    expect(result.collectedCount).toBe(3);
    expect(result.successfulSourceCount).toBe(2);
  });

  it('sets collectedCount after validity and freshness filtering, before later selection', async () => {
    const rss = fakeAdapter({
      key: 'rss-count',
      result: {
        items: [
          item({ url: 'https://news.example/fresh' }),
          item({ url: 'https://news.example/old', publishedAt: ONE_MS_TOO_OLD }),
          item({ url: 'https://news.example/promo', title: 'sponsored cabinet leak' }),
          item({
            url: 'https://news.example/dup?utm_source=feed',
          }),
          item({ url: 'https://news.example/dup' }),
        ],
        successfulSourceCount: 1,
        failedSources: [],
      },
    });

    const result = await createService([rss]).collectLatest();

    expect(result.items.map((entry) => entry.url)).toEqual([
      'https://news.example/fresh',
      'https://news.example/dup',
    ]);
    expect(result.collectedCount).toBe(result.items.length);
    expect(result.collectedCount).toBe(2);
  });
});
