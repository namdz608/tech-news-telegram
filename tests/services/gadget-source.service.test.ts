import { describe, expect, it, vi } from 'vitest';
import { GadgetSourceService } from '../../src/services/gadget-source.service';
import type { Article } from '../../src/types/article';
import type { RssSourceConfig } from '../../src/types/source';

const sources: RssSourceConfig[] = [
  {
    id: 'one',
    name: 'One',
    kind: 'rss',
    enabled: true,
    includeUnmatched: true,
    homepageUrl: 'https://one.test',
    feedUrl: 'https://one.test/rss',
  },
  {
    id: 'two',
    name: 'Two',
    kind: 'rss',
    enabled: true,
    includeUnmatched: true,
    homepageUrl: 'https://two.test',
    feedUrl: 'https://two.test/rss',
  },
];

const fresh: Article = {
  id: 'a',
  sourceId: 'one',
  sourceName: 'One',
  title: 'New GPU',
  url: 'https://one.test/a',
  collectedAt: '2026-08-10T00:00:00.000Z',
  topics: [],
};

describe('GadgetSourceService', () => {
  it('keeps successful feeds and reports failed feeds', async () => {
    const crawler = {
      crawl: vi.fn(async (source: RssSourceConfig) => {
        if (source.id === 'two') throw new Error('feed down');
        return [fresh];
      }),
    };
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = new GadgetSourceService(sources, crawler, 14, () => new Date('2026-08-10T01:00:00.000Z'));

    try {
      await expect(service.collectLatest()).resolves.toEqual({
        articles: [fresh],
        successfulSourceCount: 1,
        failedSourceCount: 1,
      });
    } finally {
      error.mockRestore();
    }
  });

  it('reports all-source failure without throwing away the counts', async () => {
    const crawler = { crawl: vi.fn().mockRejectedValue(new Error('down')) };
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = new GadgetSourceService(sources, crawler, 14);

    try {
      await expect(service.collectLatest()).resolves.toEqual({
        articles: [],
        successfulSourceCount: 0,
        failedSourceCount: 2,
      });
    } finally {
      error.mockRestore();
    }
  });

  it('filters stale, suspicious, and duplicate articles', async () => {
    const stale = { ...fresh, id: 'old', url: 'https://one.test/old', collectedAt: '2026-01-01T00:00:00.000Z' };
    const suspicious = { ...fresh, id: 'bad', url: 'https://co88.cfd/bad' };
    const crawler = { crawl: vi.fn().mockResolvedValue([fresh, fresh, stale, suspicious]) };
    const service = new GadgetSourceService([sources[0]], crawler, 14, () => new Date('2026-08-10T01:00:00.000Z'));

    await expect(service.collectLatest()).resolves.toMatchObject({ articles: [fresh] });
  });
});
