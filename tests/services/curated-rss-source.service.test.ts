import { expect, it, vi } from 'vitest';
import { CuratedRssSourceService } from '../../src/services/curated-rss-source.service';
import type { Article } from '../../src/types/article';
import type { RssSourceConfig } from '../../src/types/source';

const sources: RssSourceConfig[] = [
  {
    id: 'one', name: 'One', kind: 'rss', enabled: true,
    homepageUrl: 'https://one.test', feedUrl: 'https://one.test/feed.xml',
    includeUnmatched: true,
  },
  {
    id: 'two', name: 'Two', kind: 'rss', enabled: true,
    homepageUrl: 'https://two.test', feedUrl: 'https://two.test/feed.xml',
    includeUnmatched: true,
  },
];

const fresh: Article = {
  id: 'fresh', sourceId: 'one', sourceName: 'One', title: 'Fresh article',
  url: 'https://one.test/fresh', collectedAt: '2026-08-11T00:00:00.000Z', topics: [],
};

it('keeps successful feeds, reports failures, and logs the domain label', async () => {
  const crawler = {
    crawl: vi.fn(async (source: RssSourceConfig) => {
      if (source.id === 'two') throw new Error('down');
      return [fresh];
    }),
  };
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const service = new CuratedRssSourceService({
    sources,
    crawler,
    maxArticleAgeDays: 14,
    logLabel: 'health',
    now: () => new Date('2026-08-11T01:00:00.000Z'),
  });

  try {
    await expect(service.collectLatest()).resolves.toEqual({
      articles: [fresh], successfulSourceCount: 1, failedSourceCount: 1,
    });
    expect(error).toHaveBeenCalledWith('Failed to crawl health source two', expect.any(Error));
  } finally {
    error.mockRestore();
  }
});

it('filters stale, suspicious, invalid-date, and duplicate articles', async () => {
  const stale = {
    ...fresh, id: 'old', url: 'https://one.test/old', collectedAt: '2026-01-01T00:00:00.000Z',
  };
  const invalidDate = {
    ...fresh, id: 'date', url: 'https://one.test/date', collectedAt: 'invalid',
  };
  const suspicious = { ...fresh, id: 'bad', url: 'https://co88.cfd/bad' };
  const crawler = {
    crawl: vi.fn().mockResolvedValue([fresh, fresh, stale, invalidDate, suspicious]),
  };
  const service = new CuratedRssSourceService({
    sources: [sources[0]], crawler, maxArticleAgeDays: 14, logLabel: 'test',
    now: () => new Date('2026-08-11T01:00:00.000Z'),
  });

  await expect(service.collectLatest()).resolves.toMatchObject({ articles: [fresh] });
});
