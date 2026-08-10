import { describe, expect, it } from 'vitest';
import { gadgetSources } from '../../src/config/gadget-sources';

describe('gadgetSources', () => {
  it('contains the seven isolated HTTPS RSS feeds', () => {
    expect(gadgetSources.map((source) => source.id)).toEqual([
      'vnexpress-tech',
      'thanhnien-products',
      'tuoitre-tech',
      'ars-gadgets',
      'macrumors-all',
      'tomshardware-all',
      'engadget-all',
    ]);

    expect(new Set(gadgetSources.map((source) => source.id)).size).toBe(gadgetSources.length);
    for (const source of gadgetSources) {
      expect(source.kind).toBe('rss');
      expect(source.enabled).toBe(true);
      expect(source.feedUrl).toMatch(/^https:\/\//);
      expect(source.includeUnmatched).toBe(true);
    }
  });
});
