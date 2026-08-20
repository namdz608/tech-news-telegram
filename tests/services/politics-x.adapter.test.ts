import { describe, expect, it, vi } from 'vitest';
import { PoliticsXAdapter } from '../../src/services/politics-x.adapter';
import type { Article } from '../../src/types/article';
import type { XSearchSourceConfig } from '../../src/types/source';

const NOW = new Date('2026-08-20T05:00:00.000Z');
const PUBLISHED_AT = '2026-08-19T08:00:00.000Z';
const TOKEN = 'test-x-bearer';

function xArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 'https://x.com/i/web/status/123',
    sourceId: 'x-search',
    sourceName: 'X Search',
    title: 'Leader controversy update',
    url: 'https://x.com/i/web/status/123',
    summary: '@NewsDesk: Prosecutors filed an allegation against the minister.',
    author: '@NewsDesk',
    publishedAt: PUBLISHED_AT,
    collectedAt: '2026-08-19T01:00:00.000Z',
    topics: [],
    engagement: { likes: 7, shares: 3 },
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

describe('PoliticsXAdapter', () => {
  it('is disabled when the bearer token is empty', () => {
    const crawler = createCrawler([]);
    const adapter = new PoliticsXAdapter(crawler, '', () => NOW);

    expect(adapter.key).toBe('x-search');
    expect(adapter.isEnabled()).toBe(false);
    expect(crawler.crawl).not.toHaveBeenCalled();
  });

  it('crawls once with unmatched posts, 20 results, and one OR-combined query under 512 characters', async () => {
    const crawler = createCrawler([]);
    const adapter = new PoliticsXAdapter(crawler, TOKEN, () => NOW);

    expect(adapter.isEnabled()).toBe(true);
    const result = await adapter.collect();

    expect(crawler.crawl).toHaveBeenCalledTimes(1);
    const source = crawler.crawl.mock.calls[0]![0] as XSearchSourceConfig;
    expect(source).toEqual(
      expect.objectContaining({
        id: 'x-search',
        kind: 'x-search',
        bearerToken: TOKEN,
        includeUnmatched: true,
        maxResults: 20,
      }),
    );
    expect(source.query.length).toBeLessThanOrEqual(512);
    expect(source.query).toContain('-is:retweet');
    expect(source.query).toMatch(/chính phủ|quốc hội|bầu cử|chính sách|xung đột/i);
    expect(source.query).toMatch(/government|election|parliament|policy|conflict/i);
    expect(source.query).toMatch(/tranh cãi|tham nhũng|cáo buộc/i);
    expect(source.query).toMatch(/controversy|corruption|allegation/i);
    expect(source.query).toMatch(/lãnh đạo|leader/i);
    expect(source.query).toMatch(/giá vàng|gold|lãi suất|central bank|usd/i);
    expect(result).toEqual({ items: [], successfulSourceCount: 1, failedSources: [] });
  });

  it('maps a parsed account onto a shared x:<account> quota and independent-source identity', async () => {
    const crawler = createCrawler([
      xArticle(),
      xArticle({
        id: 'https://x.com/i/web/status/456',
        url: 'https://x.com/i/web/status/456',
        title: 'Second post from the same desk',
      }),
    ]);

    const result = await new PoliticsXAdapter(crawler, TOKEN, () => NOW).collect();
    expect(result.successfulSourceCount).toBe(1);
    expect(result.failedSources).toEqual([]);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        url: 'https://x.com/i/web/status/123',
        discoveryChannel: 'x',
        discoveredAt: NOW.toISOString(),
        collectedAt: NOW.toISOString(),
        originalAuthor: '@NewsDesk',
        originalAccount: 'NewsDesk',
        originalUrl: 'https://x.com/i/web/status/123',
        sourceQuotaKey: 'x:newsdesk',
        evidenceOriginKey: 'x:newsdesk',
        sourceTextStatus: 'full',
        evidenceKind: 'social-claim',
        evidentiaryEffect: 'records-claim',
        engagement: { likes: 7, shares: 3 },
        originAttribution: {
          url: 'https://x.com/i/web/status/123',
          account: 'NewsDesk',
          publishedAt: PUBLISHED_AT,
          discoveredAt: NOW.toISOString(),
        },
      }),
    );
    expect(result.items[0]).not.toHaveProperty('imageUrl');
    expect(result.items.map((item) => item.sourceQuotaKey)).toEqual(['x:newsdesk', 'x:newsdesk']);
    expect(result.items[0]?.evidentiaryEffect).not.toBe('establishes');
  });

  it('falls back to x.com without inventing an account when author expansion is missing or malformed', async () => {
    const crawler = createCrawler([
      xArticle({ author: undefined, summary: 'Anonymous rumor about a minister.' }),
      xArticle({
        id: 'https://x.com/i/web/status/789',
        url: 'https://x.com/i/web/status/789',
        author: 'Display Name Only',
        summary: 'No usable handle here.',
      }),
    ]);

    const result = await new PoliticsXAdapter(crawler, TOKEN, () => NOW).collect();
    expect(result.items).toEqual([
      expect.objectContaining({
        originalAccount: undefined,
        sourceQuotaKey: 'x.com',
        evidenceOriginKey: 'x.com',
        evidenceKind: 'anonymous-rumor',
        evidentiaryEffect: 'records-claim',
        originAttribution: expect.objectContaining({
          url: 'https://x.com/i/web/status/123',
          account: undefined,
        }),
      }),
      expect.objectContaining({
        originalAccount: undefined,
        sourceQuotaKey: 'x.com',
        evidenceOriginKey: 'x.com',
        evidenceKind: 'anonymous-rumor',
      }),
    ]);
  });

  it('keeps the claim-post URL as origin and stores a quoted original separately', async () => {
    const crawler = createCrawler([
      xArticle({
        summary:
          '@NewsDesk: See the original report https://x.com/OriginalAcc/status/999 for the allegation.',
      }),
    ]);

    const result = await new PoliticsXAdapter(crawler, TOKEN, () => NOW).collect();
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        url: 'https://x.com/i/web/status/123',
        originalUrl: 'https://x.com/i/web/status/123',
        quotedOriginUrl: 'https://x.com/OriginalAcc/status/999',
        originAttribution: expect.objectContaining({
          url: 'https://x.com/i/web/status/123',
        }),
        sourceQuotaKey: 'x:newsdesk',
      }),
    );
  });

  it('maps an explicit denial to denies and never emits establishes', async () => {
    const crawler = createCrawler([
      xArticle({
        title: 'Minister phủ nhận cáo buộc',
        summary: '@NewsDesk: The minister denies the allegation of corruption.',
      }),
    ]);

    const result = await new PoliticsXAdapter(crawler, TOKEN, () => NOW).collect();
    expect(result.items[0]?.evidentiaryEffect).toBe('denies');
    expect(result.items[0]?.evidenceKind).toBe('social-claim');
    expect(result.items.map((item) => item.evidentiaryEffect)).not.toContain('establishes');
  });

  it('drops posts without a valid publication time', async () => {
    const crawler = createCrawler([
      xArticle({ publishedAt: undefined }),
      xArticle({ publishedAt: 'moments ago' }),
      xArticle({
        id: 'https://x.com/i/web/status/kept',
        url: 'https://x.com/i/web/status/kept',
        title: 'Kept dated post',
      }),
    ]);

    const result = await new PoliticsXAdapter(crawler, TOKEN, () => NOW).collect();
    expect(result.items.map((item) => item.title)).toEqual(['Kept dated post']);
  });

  it('does not swallow crawler errors', async () => {
    const crawler = createCrawler(new Error('x-search'));
    await expect(new PoliticsXAdapter(crawler, TOKEN, () => NOW).collect()).rejects.toThrow(
      'x-search',
    );
  });
});
