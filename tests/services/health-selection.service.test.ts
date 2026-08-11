import { describe, expect, it } from 'vitest';
import { HealthSelectionService } from '../../src/services/health-selection.service';
import type { Article } from '../../src/types/article';

const now = new Date('2026-08-11T12:00:00.000Z');
const service = new HealthSelectionService(12, () => now);

function article(overrides: Partial<Article> & Pick<Article, 'title'>): Article {
  const slug = encodeURIComponent(overrides.title.toLowerCase());
  return {
    id: `https://example.com/${slug}`,
    sourceId: 'vnexpress-health',
    sourceName: 'VnExpress Sức khỏe',
    url: `https://example.com/${slug}`,
    collectedAt: '2026-08-11T10:00:00.000Z',
    topics: [],
    ...overrides,
  };
}

function buildHealthFixture(): Article[] {
  return [
    article({ title: 'Cải thiện giấc ngủ sâu', url: 'https://example.com/sleep-1', sourceId: 'vnexpress-health' }),
    article({ title: 'Dinh dưỡng cân bằng mỗi ngày', url: 'https://example.com/nutrition-1', sourceId: 'vnexpress-health' }),
    article({ title: 'Mất ngủ và phục hồi đúng cách', url: 'https://example.com/sleep-2', sourceId: 'tuoitre-health' }),
    article({ title: 'Đi bộ giúp tăng vận động', url: 'https://example.com/movement-1', sourceId: 'tuoitre-health' }),
    article({ title: 'Protein và chuyển hóa khỏe mạnh', url: 'https://example.com/nutrition-2', sourceId: 'thanhnien-health' }),
    article({ title: 'Tư thế bảo vệ xương khớp', url: 'https://example.com/movement-2', sourceId: 'thanhnien-health' }),
    article({ title: 'Cách giảm căng thẳng và lo âu', url: 'https://example.com/mental-1', sourceId: 'medlineplus-new' }),
    article({ title: 'Vệ sinh là thói quen phòng bệnh', url: 'https://example.com/prevention-1', sourceId: 'medlineplus-new' }),
    article({ title: 'Sức khỏe tinh thần và trầm cảm', url: 'https://example.com/mental-2', sourceId: 'medlineplus-healthy-living' }),
    article({ title: 'Nghiên cứu thuốc điều trị bệnh thận', url: 'https://example.com/conditions-1', sourceId: 'fda-medwatch' }),
    article({ title: 'Vắc xin giúp phòng bệnh', url: 'https://example.com/prevention-2', sourceId: 'medlineplus-healthy-living' }),
    article({ title: 'Thử nghiệm điều trị bệnh gan', url: 'https://example.com/conditions-2', sourceId: 'niddk-news' }),
    article({ title: 'Nghiên cứu bệnh tim đã gửi', url: 'https://example.com/already-sent?utm_source=rss', sourceId: 'niddk-news' }),
    article({ title: 'Bản sao bài ngủ', url: 'https://example.com/sleep-1?utm_medium=feed#top', sourceId: 'fda-medwatch' }),
  ];
}

describe('HealthSelectionService', () => {
  it.each([
    ['Cách cải thiện giấc ngủ', 'sleep-recovery'],
    ['Chế độ dinh dưỡng hỗ trợ chuyển hóa', 'nutrition-metabolism'],
    ['Đi bộ và tập thể dục bảo vệ xương khớp', 'movement-musculoskeletal'],
    ['Nhận biết căng thẳng và lo âu', 'mental-wellbeing'],
    ['Vắc xin và vệ sinh giúp phòng bệnh', 'prevention-daily-life'],
    ['Nghiên cứu thuốc điều trị bệnh thận', 'conditions-medicine-research'],
  ])('classifies %s as %s', (title, topic) => {
    const result = service.select([article({ title })], new Set());
    expect(result.selected[0].topic).toBe(topic);
  });

  it('rejects irrelevant and unsafe articles', () => {
    const result = service.select([
      article({ title: 'Company reports quarterly revenue' }),
      article({ title: 'Detox giảm 8 kg trong 7 ngày cam kết hiệu quả' }),
      article({ title: 'Uống 500 mg thuốc mỗi ngày để tự điều trị' }),
    ], new Set());
    expect(result).toMatchObject({ selected: [], eligibleCount: 0 });
  });

  it('canonicalizes history, balances six topics, caps sources, and returns at most 12', () => {
    const fixture = buildHealthFixture();
    const seen = new Set(['https://example.com/already-sent']);
    const result = service.select(fixture, seen);
    expect(result.selected).toHaveLength(12);
    expect(result.skippedSeenCount).toBe(1);
    expect(new Set(result.selected.map((entry) => entry.topic)).size).toBe(6);
    expect(result.selected.map((entry) => entry.article.url)).not.toContain(
      'https://example.com/sleep-1?utm_medium=feed#top',
    );
    for (const topic of new Set(result.selected.map((entry) => entry.topic))) {
      expect(result.selected.filter((entry) => entry.topic === topic)).toHaveLength(2);
    }
    for (const sourceId of new Set(result.selected.map((entry) => entry.article.sourceId))) {
      expect(result.selected.filter((entry) => entry.article.sourceId === sourceId).length)
        .toBeLessThanOrEqual(2);
    }
    expect(service.select(fixture, seen).selected).toEqual(result.selected);
  });
});
