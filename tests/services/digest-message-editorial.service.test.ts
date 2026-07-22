import { describe, expect, it, vi } from 'vitest';
import { editDigestMessages } from '../../src/services/digest-message-editorial.service';
import { DigestService } from '../../src/services/digest.service';

describe('editDigestMessages', () => {
  it('edits every message while preserving order, url and image', async () => {
    const messages = new DigestService(10).buildDigestMessages([
      {
        id: 'first',
        sourceId: 'hn-rss',
        sourceName: 'First Source',
        title: 'First',
        url: 'https://example.com/first',
        imageUrl: 'https://example.com/first.png',
        collectedAt: '2026-07-15T00:00:00.000Z',
        topics: ['ai'],
      },
      {
        id: 'second',
        sourceId: 'aws-news-blog',
        sourceName: 'Second Source',
        title: 'Second',
        url: 'https://example.com/second',
        collectedAt: '2026-07-15T00:00:00.000Z',
        topics: ['cloud'],
      },
    ]);
    const editor = {
      editArticle: vi.fn(async (article: (typeof messages)[number]['article']) => ({
        title: `VI ${article.title}`,
        summary: `Tóm tắt ${article.title}`,
        whyImportant: `Quan trọng ${article.title}`,
        actionLevel: 'high' as const,
        actionText: `Kiểm tra ${article.title}`,
      })),
    };

    const result = await editDigestMessages(messages, editor);

    expect(result.map((message) => message.article.id)).toEqual(['first', 'second']);
    expect(result[0].text).toContain('📰  <b>VI First</b>');
    expect(result[0].text).toContain('⚡ <b>Mức hành động</b>');
    expect(result[0].text).toContain('🟠 <b>CAO</b> —');
    expect(result[0].url).toBe(messages[0].url);
    expect(result[0].imageUrl).toBe(messages[0].imageUrl);
  });
});
