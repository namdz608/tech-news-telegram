import { expect, it, vi } from 'vitest';
import { HealthMessageService } from '../../src/services/health-message.service';
import type { Article } from '../../src/types/article';

const article: Article = {
  id: 'https://example.com/sleep', sourceId: 'medlineplus-healthy-living',
  sourceName: 'MedlinePlus', title: 'Healthy sleep habits',
  url: 'https://example.com/sleep', collectedAt: '2026-08-11T00:00:00.000Z', topics: [],
};

it('renders evidence, safe action, limitation, disclaimer, and source', async () => {
  const editor = { editArticle: vi.fn().mockResolvedValue({
    title: 'Thói quen ngủ lành mạnh',
    summary: 'Giữ lịch ngủ ổn định có thể hỗ trợ sức khỏe.',
    whyImportant: 'Khuyến nghị chung có thể không phù hợp với mọi người.',
    actionLevel: 'monitor' as const,
    actionText: 'Duy trì giờ ngủ đều.',
  }) };
  const service = new HealthMessageService(editor);
  const messages = await service.buildMessages([{
    article, topic: 'sleep-recovery', evidence: 'guidance', score: 100,
  }]);

  expect(messages[0]).toMatchObject({
    url: article.url, article, topic: 'sleep-recovery', evidence: 'guidance',
  });
  expect(messages[0].imageUrl).toMatch(/^https:\/\//);
  expect(messages[0].text).toContain('GIẤC NGỦ &amp; PHỤC HỒI');
  expect(messages[0].text).toContain('HƯỚNG DẪN');
  expect(messages[0].text).toContain('Điều có thể áp dụng an toàn');
  expect(messages[0].text).toContain('Giới hạn/Lưu ý');
  expect(messages[0].text).toContain('không thay thế chẩn đoán hoặc điều trị y khoa');
  expect(messages[0].text).toContain('Nguồn: MedlinePlus');
  expect(editor.editArticle).toHaveBeenCalledWith(article, expect.objectContaining({
    fallbackActionText: expect.stringContaining('giờ ngủ'),
    instructions: expect.stringContaining('Không chẩn đoán'),
  }));
});

it('replaces generated dosage and treatment directives', async () => {
  const editor = { editArticle: vi.fn().mockResolvedValue({
    title: 'Thông tin thuốc', summary: 'Uống 500 mg mỗi ngày.',
    whyImportant: 'Hãy ngừng thuốc ngay.', actionLevel: 'high' as const,
    actionText: 'Đổi thuốc và tăng liều.',
  }) };
  const service = new HealthMessageService(editor);
  const [message] = await service.buildMessages([{
    article: { ...article, title: 'Drug safety warning', sourceId: 'fda-medwatch' },
    topic: 'conditions-medicine-research', evidence: 'drug-safety', score: 100,
  }]);

  expect(message.text).not.toMatch(/500\s?mg|ngừng thuốc|tăng liều/iu);
  expect(message.text).toContain('bác sĩ hoặc dược sĩ');
});

it('escapes HTML and stays below Telegram text limits', async () => {
  const editor = { editArticle: vi.fn().mockResolvedValue({
    title: '<b>Healthy sleep</b>',
    summary: `<script>${'x'.repeat(5_000)}</script>`,
    whyImportant: 'Giới hạn <cần xem xét>.',
    actionLevel: 'monitor' as const,
    actionText: 'Duy trì giờ ngủ đều.',
  }) };
  const service = new HealthMessageService(editor);
  const [message] = await service.buildMessages([{
    article: { ...article, sourceName: 'MedlinePlus <Official>' },
    topic: 'sleep-recovery', evidence: 'guidance', score: 100,
  }]);

  expect(message.text).not.toContain('<script>');
  expect(message.text).toContain('&lt;b&gt;Healthy sleep&lt;/b&gt;');
  expect(message.text).toContain('MedlinePlus &lt;Official&gt;');
  expect(message.text.length).toBeLessThanOrEqual(4_096);
});
