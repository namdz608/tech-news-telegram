import { expect, it } from 'vitest';
import { healthSources } from '../../src/config/health-sources';

it('contains the seven approved isolated HTTPS RSS feeds', () => {
  expect(healthSources.map((source) => source.id)).toEqual([
    'vnexpress-health',
    'tuoitre-health',
    'thanhnien-health',
    'medlineplus-new',
    'medlineplus-healthy-living',
    'fda-medwatch',
    'niddk-news',
  ]);
  expect(new Set(healthSources.map((source) => source.id)).size).toBe(7);
  for (const source of healthSources) {
    expect(source).toMatchObject({ kind: 'rss', enabled: true, includeUnmatched: true });
    expect(source.feedUrl).toMatch(/^https:\/\//);
  }
});
