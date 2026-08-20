import { describe, expect, it, vi } from 'vitest';
import { goldPoliticsRssSources } from '../../src/config/gold-politics-sources';
import { PoliticsRssAdapter } from '../../src/services/politics-rss.adapter';
import type { Article } from '../../src/types/article';
import type { RssSourceConfig } from '../../src/types/source';

const NOW = new Date('2026-08-20T05:00:00.000Z');
const PUBLISHED_AT = '2026-08-19T08:00:00.000Z';

function rssArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 'https://www.vnexpress.net/chinh-tri/budget',
    sourceId: 'vnexpress-thoi-su',
    sourceName: 'VnExpress Thời sự',
    title: 'Government announces a new budget plan',
    url: 'https://www.vnexpress.net/chinh-tri/budget',
    summary: 'Parliament debated spending and gold-reserve policy.',
    imageUrl: 'https://vnexpress.net/photo.jpg',
    author: 'Hà Nội desk',
    publishedAt: PUBLISHED_AT,
    collectedAt: '2026-08-19T01:00:00.000Z',
    topics: [],
    ...overrides,
  };
}

function createCrawler(articles: Article[] | Error) {
  return {
    crawl: vi.fn().mockImplementation(async () => {
      if (articles instanceof Error) {
        throw articles;
      }
      return articles;
    }),
  };
}

describe('PoliticsRssAdapter', () => {
  it('builds every approved feed with unmatched items, bounded fetch, no page enrichment, and maxItems 20', async () => {
    expect(goldPoliticsRssSources.length).toBeGreaterThan(0);

    for (const source of goldPoliticsRssSources) {
      const crawler = createCrawler([]);
      const adapter = new PoliticsRssAdapter(source, crawler, () => NOW);

      expect(adapter.key).toBe(source.id);
      expect(adapter.isEnabled()).toBe(true);

      const result = await adapter.collect();
      expect(crawler.crawl).toHaveBeenCalledTimes(1);
      expect(crawler.crawl).toHaveBeenCalledWith({
        ...source,
        includeUnmatched: true,
        boundedFeedFetch: true,
        enrichArticlePage: false,
        maxItems: 20,
      } satisfies RssSourceConfig);
      expect(result).toEqual({ items: [], successfulSourceCount: 1, failedSources: [] });
    }
  });

  it('maps a dated RSS item onto identified-report evidence and strips imageUrl', async () => {
    const source = goldPoliticsRssSources[0]!;
    const crawler = createCrawler([rssArticle()]);
    const adapter = new PoliticsRssAdapter(source, crawler, () => NOW);

    const result = await adapter.collect();
    expect(result.successfulSourceCount).toBe(1);
    expect(result.failedSources).toEqual([]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'https://www.vnexpress.net/chinh-tri/budget',
        sourceId: source.id,
        sourceName: source.name,
        title: 'Government announces a new budget plan',
        url: 'https://www.vnexpress.net/chinh-tri/budget',
        summary: 'Parliament debated spending and gold-reserve policy.',
        author: 'Hà Nội desk',
        publishedAt: PUBLISHED_AT,
        collectedAt: NOW.toISOString(),
        topics: [],
        discoveryChannel: 'rss',
        discoveredAt: NOW.toISOString(),
        originalAuthor: 'Hà Nội desk',
        originalUrl: 'https://www.vnexpress.net/chinh-tri/budget',
        sourceQuotaKey: 'vnexpress.net',
        evidenceOriginKey: 'vnexpress.net',
        sourceTextStatus: 'full',
        evidenceKind: 'identified-report',
        evidentiaryEffect: 'mentions',
        originAttribution: {
          url: 'https://www.vnexpress.net/chinh-tri/budget',
          publishedAt: PUBLISHED_AT,
          discoveredAt: NOW.toISOString(),
        },
      }),
    );
    expect(result.items[0]).not.toHaveProperty('imageUrl');
    expect(result.items[0].evidentiaryEffect).not.toBe('establishes');
    expect(result.items[0].evidenceKind).not.toBe('official-final');
  });

  it('uses one registrable publisher identity for sibling subdomains and distinct article URLs', async () => {
    const source = goldPoliticsRssSources[0]!;
    const crawler = createCrawler([
      rssArticle({
        id: 'https://www.vnexpress.net/a',
        url: 'https://www.vnexpress.net/a',
        originalUrl: undefined,
      }),
      rssArticle({
        id: 'https://news.vnexpress.net/b',
        url: 'https://news.vnexpress.net/b',
        title: 'Cabinet meeting on interest rates',
      }),
    ]);

    const result = await new PoliticsRssAdapter(source, crawler, () => NOW).collect();
    expect(result.items.map((item) => item.sourceQuotaKey)).toEqual([
      'vnexpress.net',
      'vnexpress.net',
    ]);
    expect(result.items.map((item) => item.evidenceOriginKey)).toEqual([
      'vnexpress.net',
      'vnexpress.net',
    ]);
    expect(result.items.map((item) => item.originAttribution.url)).toEqual([
      'https://www.vnexpress.net/a',
      'https://news.vnexpress.net/b',
    ]);
  });

  it('resolves bbc.co.uk as the publisher key rather than the last two labels', async () => {
    const source = goldPoliticsRssSources.find((item) => item.id === 'bbc-world')!;
    const crawler = createCrawler([
      rssArticle({
        id: 'https://www.bbc.co.uk/news/world-123',
        url: 'https://www.bbc.co.uk/news/world-123',
        sourceId: source.id,
        sourceName: source.name,
      }),
    ]);

    const result = await new PoliticsRssAdapter(source, crawler, () => NOW).collect();
    expect(result.items[0]?.sourceQuotaKey).toBe('bbc.co.uk');
    expect(result.items[0]?.evidenceOriginKey).toBe('bbc.co.uk');
  });

  it('keeps a stable per-feed key and counts a fulfilled crawl as one successful source', async () => {
    const source = goldPoliticsRssSources[3]!;
    const adapter = new PoliticsRssAdapter(source, createCrawler([rssArticle()]), () => NOW);

    expect(adapter.key).toBe(source.id);
    expect(adapter.key).toBe('vnexpress-kinh-doanh');
    await expect(adapter.collect()).resolves.toEqual(
      expect.objectContaining({ successfulSourceCount: 1, failedSources: [] }),
    );
  });

  it('maps explicit allegation or proceeding coverage to records-claim', async () => {
    const crawler = createCrawler([
      rssArticle({
        title: 'Cáo buộc tham nhũng đối với lãnh đạo bộ',
        summary: 'Prosecutors filed an allegation and opened a proceeding.',
      }),
    ]);

    const result = await new PoliticsRssAdapter(
      goldPoliticsRssSources[0]!,
      crawler,
      () => NOW,
    ).collect();
    expect(result.items[0]?.evidentiaryEffect).toBe('records-claim');
    expect(result.items[0]?.evidenceKind).toBe('identified-report');
    expect(result.items[0]?.evidentiaryEffect).not.toBe('establishes');
  });

  it('drops items without a valid publication time and incomplete publisher URLs', async () => {
    const crawler = createCrawler([
      rssArticle({ publishedAt: undefined }),
      rssArticle({ publishedAt: 'yesterday' }),
      rssArticle({ publishedAt: 'not-a-date' }),
      rssArticle({ url: 'https://user:pass@vnexpress.net/secret', id: 'https://user:pass@vnexpress.net/secret' }),
      rssArticle({
        id: 'https://www.vnexpress.net/kept',
        url: 'https://www.vnexpress.net/kept',
        title: 'Kept dated report',
      }),
    ]);

    const result = await new PoliticsRssAdapter(
      goldPoliticsRssSources[0]!,
      crawler,
      () => NOW,
    ).collect();
    expect(result.items.map((item) => item.title)).toEqual(['Kept dated report']);
  });

  it('marks title-only items as incomplete source text', async () => {
    const crawler = createCrawler([
      rssArticle({
        summary: '   ',
        title: 'Cabinet statement on interest rates',
      }),
    ]);

    const result = await new PoliticsRssAdapter(
      goldPoliticsRssSources[0]!,
      crawler,
      () => NOW,
    ).collect();
    expect(result.items[0]?.sourceTextStatus).toBe('incomplete');
    expect(result.items[0]?.evidentiaryEffect).toBe('mentions');
  });

  it('does not swallow crawler errors', async () => {
    const crawler = createCrawler(new Error('rss-feed'));
    const adapter = new PoliticsRssAdapter(goldPoliticsRssSources[0]!, crawler, () => NOW);

    await expect(adapter.collect()).rejects.toThrow('rss-feed');
  });
});
