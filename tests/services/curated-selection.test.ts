import { describe, expect, it } from 'vitest';
import {
  canonicalizeCuratedArticles,
  matchesCuratedKeyword,
  pickBalancedCuratedEntries,
} from '../../src/services/curated-selection';
import type { Article } from '../../src/types/article';

const article = (url: string, sourceId: string): Article => ({
  id: url, sourceId, sourceName: sourceId, title: 'Health article', url,
  collectedAt: '2026-08-11T00:00:00.000Z', topics: [],
});

describe('curated selection helpers', () => {
  it('canonicalizes URLs and removes duplicates', () => {
    expect(canonicalizeCuratedArticles([
      article('https://example.com/a?utm_source=rss#top', 'one'),
      article('https://example.com/a', 'two'),
    ]).map((item) => item.url)).toEqual(['https://example.com/a']);
  });

  it('matches Unicode words and phrases without substring collisions', () => {
    expect(matchesCuratedKeyword('Cải thiện giấc ngủ sâu', 'giấc ngủ')).toBe(true);
    expect(matchesCuratedKeyword('Sony headphones reviewed', 'phone')).toBe(false);
    expect(matchesCuratedKeyword('Company monitors performance', 'monitor')).toBe(false);
  });

  it('caps topics and sources while backfilling deterministically', () => {
    const ranked = [
      { article: article('https://e.test/1', 'one'), topic: 'a', score: 9, index: 0 },
      { article: article('https://e.test/2', 'one'), topic: 'a', score: 8, index: 1 },
      { article: article('https://e.test/3', 'one'), topic: 'b', score: 7, index: 2 },
      { article: article('https://e.test/4', 'two'), topic: 'b', score: 6, index: 3 },
      { article: article('https://e.test/5', 'three'), topic: 'b', score: 5, index: 4 },
      { article: article('https://e.test/6', 'four'), topic: 'b', score: 4, index: 5 },
    ];
    const selected = pickBalancedCuratedEntries(ranked, ['a', 'b'], 5, 2, 2);
    expect(selected.map((entry) => entry.article.url)).toEqual([
      'https://e.test/1', 'https://e.test/2', 'https://e.test/4', 'https://e.test/5',
    ]);
  });
});
