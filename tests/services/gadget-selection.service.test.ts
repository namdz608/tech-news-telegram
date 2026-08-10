import { describe, expect, it } from 'vitest';
import { GadgetSelectionService } from '../../src/services/gadget-selection.service';
import type { Article } from '../../src/types/article';

const now = new Date('2026-08-10T01:00:00.000Z');
const service = new GadgetSelectionService(12, () => now);

function article(overrides: Partial<Article> = {}): Article {
  const id = overrides.id ?? overrides.url ?? `https://example.com/${Math.random()}`;
  return {
    id,
    sourceId: 'source-default',
    sourceName: 'Default Source',
    title: 'New consumer gadget',
    url: id,
    collectedAt: '2026-08-10T00:00:00.000Z',
    topics: [],
    ...overrides,
  };
}

describe('GadgetSelectionService', () => {
  it.each([
    ['Apple unveils iPhone 18 Pro', 'apple'],
    ['Samsung Galaxy tablet launches', 'mobile'],
    ['New gaming laptop arrives', 'computers'],
    ['Nvidia GPU and GDDR7 memory tested', 'components'],
    ['OLED monitor and wireless earbuds reviewed', 'av-accessories'],
    ['Smart home camera gains Matter support', 'smart-devices'],
  ])('classifies %s as %s', (title, topic) => {
    const result = service.select([article({ title })], new Set());
    expect(result.selected[0].topic).toBe(topic);
  });

  it('gives Apple precedence over generic mobile and computer terms', () => {
    const result = service.select([article({ title: 'Apple iPhone and MacBook launch' })], new Set());
    expect(result.selected[0].topic).toBe('apple');
  });

  it('rejects generic software and company news', () => {
    const result = service.select(
      [
        article({ title: 'Company reports quarterly revenue' }),
        article({ title: 'New AI model API released for developers' }),
        article({ title: 'Apple reports quarterly revenue' }),
        article({ title: 'Nvidia faces antitrust investigation' }),
        article({ title: 'Intel announces layoffs' }),
      ],
      new Set(),
    );
    expect(result.selected).toEqual([]);
    expect(result.eligibleCount).toBe(0);
  });

  it('canonicalizes duplicate URLs and removes URLs found in history', () => {
    const result = service.select(
      [
        article({ title: 'New GPU', url: 'https://example.com/item?utm_source=rss#section' }),
        article({ title: 'New GPU duplicate', url: 'https://example.com/item' }),
        article({ title: 'New laptop', url: 'https://example.com/already-sent' }),
      ],
      new Set(['https://example.com/already-sent']),
    );

    expect(result.selected.map((entry) => entry.article.url)).toEqual(['https://example.com/item']);
    expect(result.skippedSeenCount).toBe(1);
  });

  it('balances categories, caps each source at two, backfills, and returns at most 12', () => {
    const titles = [
      'iPhone launch',
      'MacBook launch',
      'Galaxy phone launch',
      'Android tablet launch',
      'Gaming laptop launch',
      'Desktop PC launch',
      'Nvidia GPU launch',
      'AMD CPU launch',
      'OLED monitor launch',
      'Wireless earbuds launch',
      'Smartwatch launch',
      'Smart home camera launch',
      'Router launch',
      'SSD launch',
    ];
    const input = titles.map((title, index) =>
      article({
        id: `https://example.com/${index}`,
        url: `https://example.com/${index}`,
        title,
        sourceId: `source-${index % 6}`,
        sourceName: `Source ${index % 6}`,
      }),
    );

    const result = service.select(input, new Set());

    expect(result.selected).toHaveLength(12);
    expect(new Set(result.selected.map((entry) => entry.article.url)).size).toBe(12);
    for (const sourceId of new Set(result.selected.map((entry) => entry.article.sourceId))) {
      expect(result.selected.filter((entry) => entry.article.sourceId === sourceId).length).toBeLessThanOrEqual(2);
    }
    expect(new Set(result.selected.map((entry) => entry.topic)).size).toBeGreaterThanOrEqual(5);
  });

  it('is deterministic when scores tie', () => {
    const input = [
      article({ id: 'first', url: 'https://example.com/first', title: 'New GPU', sourceId: 'one' }),
      article({ id: 'second', url: 'https://example.com/second', title: 'New GPU', sourceId: 'two' }),
    ];
    expect(service.select(input, new Set()).selected.map((entry) => entry.article.url)).toEqual([
      'https://example.com/first',
      'https://example.com/second',
    ]);
  });
});
