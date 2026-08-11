import { expect, it, vi } from 'vitest';
import { verifiedVietnameseEditorial } from '../../src/services/article-editorial.types';
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
    [verifiedVietnameseEditorial]: true,
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
    [verifiedVietnameseEditorial]: true,
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
    [verifiedVietnameseEditorial]: true,
  }) };
  const service = new HealthMessageService(editor);
  const [message] = await service.buildMessages([{
    article: {
      ...article,
      sourceId: 'vnexpress-health',
      sourceName: 'MedlinePlus <Official>',
    },
    topic: 'sleep-recovery', evidence: 'guidance', score: 100,
  }]);

  expect(message.text).not.toContain('<script>');
  expect(message.text).toContain('&lt;b&gt;Healthy sleep&lt;/b&gt;');
  expect(message.text).toContain('MedlinePlus &lt;Official&gt;');
  expect(message.text.length).toBeLessThanOrEqual(4_096);
});

it('forces clinician guidance for drug-safety messages', async () => {
  const editor = { editArticle: vi.fn().mockResolvedValue({
    title: 'Cảnh báo an toàn thuốc',
    summary: 'Cơ quan quản lý vừa phát cảnh báo an toàn.',
    whyImportant: 'Cảnh báo áp dụng cho một số sản phẩm.',
    actionLevel: 'high' as const,
    actionText: 'Bác sĩ đang theo dõi cảnh báo.',
    [verifiedVietnameseEditorial]: true,
  }) };
  const service = new HealthMessageService(editor);
  const [message] = await service.buildMessages([{
    article: { ...article, sourceId: 'fda-medwatch', sourceName: 'FDA MedWatch' },
    topic: 'conditions-medicine-research', evidence: 'drug-safety', score: 100,
  }]);

  expect(message.text).toContain(
    'Không tự thay đổi điều trị; hãy trao đổi với bác sĩ hoặc dược sĩ trước mọi quyết định liên quan đến thuốc.',
  );
});

it('forces an evidence limitation for research messages', async () => {
  const editor = { editArticle: vi.fn().mockResolvedValue({
    title: 'Nghiên cứu mới về bệnh thận',
    summary: 'Nghiên cứu ghi nhận một kết quả mới.',
    whyImportant: `Kết quả còn sơ bộ và rất đáng chú ý. ${'Chi tiết. '.repeat(80)}`,
    actionLevel: 'monitor' as const,
    actionText: 'Theo dõi nguồn nghiên cứu chính thức.',
    [verifiedVietnameseEditorial]: true,
  }) };
  const service = new HealthMessageService(editor);
  const [message] = await service.buildMessages([{
    article: {
      ...article,
      sourceId: 'niddk-news',
      sourceName: 'NIH/NIDDK',
      summary: 'Preliminary animal study with a small sample.',
    },
    topic: 'conditions-medicine-research', evidence: 'research', score: 100,
  }]);

  expect(message.text).toMatch(/sơ bộ/iu);
  expect(message.text).toMatch(/động vật/iu);
  expect(message.text).toMatch(/mẫu nhỏ/iu);
});

it('uses deterministic Vietnamese copy when an international article is not translated', async () => {
  const editor = { editArticle: vi.fn().mockResolvedValue({
    title: 'Healthy sleep habits',
    summary: 'Café consumption may support heart health.',
    whyImportant: 'General guidance may not apply to everyone.',
    actionLevel: 'monitor' as const,
    actionText: 'Keep a regular sleep schedule.',
  }) };
  const translator = {
    translateDigestVerified: vi.fn(async (text: string) => ({ text, succeeded: false })),
  };
  const service = new HealthMessageService(editor, translator);
  const [message] = await service.buildMessages([{
    article,
    topic: 'sleep-recovery', evidence: 'guidance', score: 100,
  }]);

  expect(message.text).not.toContain('Healthy sleep habits');
  expect(message.text).not.toContain('Café consumption');
  expect(message.text).toContain('Bản tin sức khỏe từ nguồn quốc tế');
  expect(message.text).toContain('chưa có bản dịch tiếng Việt an toàn');
});

it('uses explicitly verified Vietnamese translations for international title and summary', async () => {
  const editor = { editArticle: vi.fn().mockResolvedValue({
    title: 'Healthy sleep habits',
    summary: 'A regular sleep schedule may support health.',
    whyImportant: 'General guidance may not apply to everyone.',
    actionLevel: 'monitor' as const,
    actionText: 'Keep a regular sleep schedule.',
  }) };
  const translator = {
    translateDigestVerified: vi
      .fn()
      .mockResolvedValueOnce({ text: 'Thói quen ngủ lành mạnh', succeeded: true })
      .mockResolvedValueOnce({
        text: 'Lịch ngủ đều đặn có thể hỗ trợ sức khỏe.',
        succeeded: true,
      }),
  };
  const service = new HealthMessageService(editor, translator);

  const [message] = await service.buildMessages([{
    article,
    topic: 'sleep-recovery', evidence: 'guidance', score: 100,
  }]);

  expect(message.text).toContain('Thói quen ngủ lành mạnh');
  expect(message.text).toContain('Lịch ngủ đều đặn có thể hỗ trợ sức khỏe.');
  expect(message.text).not.toContain('General guidance');
  expect(message.text).toContain('Khuyến nghị về giấc ngủ');
});
