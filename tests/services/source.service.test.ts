import { describe, expect, it, vi } from 'vitest';
import { SourceService } from '../../src/services/source.service';
import type { Article } from '../../src/types/article';
import type { SourceConfig } from '../../src/types/source';

describe('SourceService', () => {
  it('crawls enabled sources and deduplicates by URL', async () => {
    const sources: SourceConfig[] = [
      {
        id: 'rss-one',
        name: 'RSS One',
        kind: 'rss',
        enabled: true,
        homepageUrl: 'https://example.com',
        feedUrl: 'https://example.com/feed.xml',
      },
      {
        id: 'disabled',
        name: 'Disabled',
        kind: 'rss',
        enabled: false,
        homepageUrl: 'https://disabled.com',
        feedUrl: 'https://disabled.com/feed.xml',
      },
    ];

    const article: Article = {
      id: 'https://example.com/a',
      sourceId: 'rss-one',
      sourceName: 'RSS One',
      title: 'AI security',
      url: 'https://example.com/a',
      collectedAt: new Date().toISOString(),
      topics: ['ai', 'security'],
    };

    const service = new SourceService(sources, {
      rss: { crawl: async () => [article, article] },
      html: { crawl: async () => [] },
      xSearch: { crawl: async () => [] },
    });

    const result = await service.collectLatest();

    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://example.com/a');
  });

  it('continues when one enabled source fails', async () => {
    const sources: SourceConfig[] = [
      {
        id: 'rss-one',
        name: 'RSS One',
        kind: 'rss',
        enabled: true,
        homepageUrl: 'https://example.com',
        feedUrl: 'https://example.com/feed.xml',
      },
      {
        id: 'html-one',
        name: 'HTML One',
        kind: 'html',
        enabled: true,
        homepageUrl: 'https://blocked.example.com',
        listUrl: 'https://blocked.example.com/news',
        selectors: {
          item: '.post',
          title: '.title',
          url: 'a',
        },
      },
    ];

    const article: Article = {
      id: 'https://example.com/a',
      sourceId: 'rss-one',
      sourceName: 'RSS One',
      title: 'AI security',
      url: 'https://example.com/a',
      collectedAt: new Date().toISOString(),
      topics: ['ai', 'security'],
    };

    const service = new SourceService(sources, {
      rss: { crawl: async () => [article] },
      html: { crawl: async () => Promise.reject(new Error('blocked')) },
      xSearch: { crawl: async () => [] },
    });

    await expect(service.collectLatest()).resolves.toEqual([article]);
  });

  it('filters suspicious gambling links from aggregated feeds', async () => {
    const sources: SourceConfig[] = [
      {
        id: 'hn-rss',
        name: 'Hacker News',
        kind: 'rss',
        enabled: true,
        homepageUrl: 'https://news.ycombinator.com',
        feedUrl: 'https://hnrss.org/frontpage',
      },
    ];
    const goodArticle: Article = {
      id: 'https://example.com/ai-security',
      sourceId: 'hn-rss',
      sourceName: 'Hacker News',
      title: 'AI security architecture',
      url: 'https://example.com/ai-security',
      collectedAt: new Date().toISOString(),
      topics: ['ai', 'security'],
    };
    const gamblingArticle: Article = {
      id: 'https://co88.cfd/landmark-german-ruling-declares-googles-ai-overviews-are-googles-own-words/',
      sourceId: 'hn-rss',
      sourceName: 'Hacker News',
      title: 'Landmark German ruling declares Google AI Overviews are Google own words',
      url: 'https://co88.cfd/landmark-german-ruling-declares-googles-ai-overviews-are-googles-own-words/',
      collectedAt: new Date().toISOString(),
      topics: ['ai'],
    };

    const service = new SourceService(sources, {
      rss: { crawl: async () => [gamblingArticle, goodArticle] },
      html: { crawl: async () => [] },
      xSearch: { crawl: async () => [] },
    });

    const result = await service.collectLatest();

    expect(result).toEqual([goodArticle]);
  });

  it('filters articles older than the configured freshness window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T00:00:00.000Z'));

    try {
      const sources: SourceConfig[] = [
        {
          id: 'rss-one',
          name: 'RSS One',
          kind: 'rss',
          enabled: true,
          homepageUrl: 'https://example.com',
          feedUrl: 'https://example.com/feed.xml',
        },
      ];
      const freshArticle: Article = {
        id: 'https://example.com/fresh',
        sourceId: 'rss-one',
        sourceName: 'RSS One',
        title: 'Fresh AI security update',
        url: 'https://example.com/fresh',
        publishedAt: '2026-06-08T00:00:00.000Z',
        collectedAt: '2026-06-08T00:00:00.000Z',
        topics: ['ai', 'security'],
      };
      const staleArticle: Article = {
        id: 'https://example.com/stale',
        sourceId: 'rss-one',
        sourceName: 'RSS One',
        title: 'Old AWS weekly roundup',
        url: 'https://example.com/stale',
        publishedAt: '2026-04-20T00:00:00.000Z',
        collectedAt: '2026-04-20T00:00:00.000Z',
        topics: ['cloud'],
      };

      const service = new SourceService(sources, {
        rss: { crawl: async () => [staleArticle, freshArticle] },
        html: { crawl: async () => [] },
        xSearch: { crawl: async () => [] },
      });

      const result = await service.collectLatest();

      expect(result).toEqual([freshArticle]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('crawls enabled X search sources', async () => {
    const sources: SourceConfig[] = [
      {
        id: 'x-search',
        name: 'X Search',
        kind: 'x-search',
        enabled: true,
        homepageUrl: 'https://x.com',
        bearerToken: 'token',
        query: 'AI lang:en',
        maxResults: 20,
      },
    ];
    const article: Article = {
      id: 'https://x.com/i/web/status/123',
      sourceId: 'x-search',
      sourceName: 'X Search',
      title: 'Fresh AI post from X',
      url: 'https://x.com/i/web/status/123',
      publishedAt: new Date().toISOString(),
      collectedAt: new Date().toISOString(),
      topics: ['ai'],
    };

    const service = new SourceService(sources, {
      rss: { crawl: async () => [] },
      html: { crawl: async () => [] },
      xSearch: { crawl: async () => [article] },
    });

    await expect(service.collectLatest()).resolves.toEqual([article]);
  });

  it('crawls enabled GitHub repository sources', async () => {
    const sources: SourceConfig[] = [
      {
        id: 'github-ai-repos',
        name: 'GitHub AI Repos',
        kind: 'github-repos',
        enabled: true,
        homepageUrl: 'https://github.com',
        token: 'token',
        query: '',
        maxResults: 10,
        lookbackDays: 7,
      },
    ];
    const article: Article = {
      id: 'https://github.com/example/ai-agent',
      sourceId: 'github-ai-repos',
      sourceName: 'GitHub AI Repos',
      title: 'example/ai-agent',
      url: 'https://github.com/example/ai-agent',
      publishedAt: new Date().toISOString(),
      collectedAt: new Date().toISOString(),
      topics: ['ai'],
    };

    const service = new SourceService(sources, {
      rss: { crawl: async () => [] },
      html: { crawl: async () => [] },
      xSearch: { crawl: async () => [] },
      githubRepos: { crawl: async () => [article] },
    });

    await expect(service.collectLatest()).resolves.toEqual([article]);
  });
});
