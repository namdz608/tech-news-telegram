import { describe, expect, it } from 'vitest';
import { formatArticleDate } from '../../src/services/article-message.service';
import type { Article } from '../../src/types/article';

const article: Article = {
  id: 'article', sourceId: 'source', sourceName: 'Source', title: 'Article',
  url: 'https://example.com/article', collectedAt: '2026-07-13T09:00:00.000Z', topics: ['ai'],
};

describe('article publication date', () => {
  it.each([undefined, 'invalid'])('keeps unknown publication date %s unknown', (publishedAt) => {
    expect(formatArticleDate({ ...article, publishedAt })).toBe('Không rõ');
  });

  it('uses the source publication date', () => {
    expect(formatArticleDate({ ...article, publishedAt: '2026-07-12T09:00:00.000Z' })).toBe('12/07/2026');
  });
});
