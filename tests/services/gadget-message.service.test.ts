import { describe, expect, it, vi } from 'vitest';
import { GadgetMessageService } from '../../src/services/gadget-message.service';
import type { Article } from '../../src/types/article';

const article: Article = {
  id: 'https://example.com/gpu',
  sourceId: 'tomshardware-all',
  sourceName: "Tom's Hardware",
  title: 'New GPU',
  url: 'https://example.com/gpu',
  collectedAt: '2026-08-10T00:00:00.000Z',
  topics: [],
};

describe('GadgetMessageService', () => {
  it('edits and renders gadget messages in selection order', async () => {
    const editor = {
      editArticle: vi.fn().mockResolvedValue({
        title: 'GPU mới ra mắt',
        summary: 'Mẫu GPU mới có bộ nhớ nhanh hơn.',
        whyImportant: 'Người dùng PC có thêm lựa chọn nâng cấp.',
        actionLevel: 'monitor' as const,
        actionText: 'Theo dõi benchmark độc lập.',
      }),
    };
    const service = new GadgetMessageService(editor);
    const messages = await service.buildMessages([{ article, topic: 'components', score: 100 }]);

    expect(messages[0]).toMatchObject({ url: article.url, article, topic: 'components' });
    expect(messages[0].text).toContain('🧩  <b>LINH KIỆN UPDATE</b>');
    expect(messages[0].text).toContain('GPU mới ra mắt');
    expect(messages[0].imageUrl).toMatch(/^https:\/\/placehold\.co\//);
  });

  it('omits gadget items whose editorial is still English after translation failure', async () => {
    const editor = {
      editArticle: vi.fn()
        .mockResolvedValueOnce({
          title: 'GPU mới ra mắt',
          summary: 'Mẫu GPU mới có bộ nhớ nhanh hơn.',
          whyImportant: 'Người dùng PC có thêm lựa chọn nâng cấp.',
          actionLevel: 'monitor' as const,
          actionText: 'Theo dõi benchmark độc lập.',
        })
        .mockResolvedValueOnce({
          title: 'New GPU',
          summary: 'The new GPU has faster memory.',
          whyImportant: 'PC builders may want to wait for independent reviews.',
          actionLevel: 'monitor' as const,
          actionText: 'Watch independent benchmarks.',
        }),
    };
    const service = new GadgetMessageService(editor);
    const messages = await service.buildMessages([
      { article, topic: 'components', score: 100 },
      { article: { ...article, id: 'https://example.com/gpu-2', url: 'https://example.com/gpu-2' }, topic: 'components', score: 90 },
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0].text).toContain('GPU mới ra mắt');
    expect(messages[0].text).not.toContain('New GPU');
    expect(messages[0].text).not.toContain('faster memory');
  });
});
