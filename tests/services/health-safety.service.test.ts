import { describe, expect, it } from 'vitest';
import {
  classifyHealthEvidence,
  isSafeHealthArticle,
  sanitizeHealthEditorialText,
} from '../../src/services/health-safety.service';
import type { Article } from '../../src/types/article';

const article = (title: string, sourceId = 'vnexpress-health'): Article => ({
  id: title, sourceId, sourceName: sourceId, title,
  url: `https://example.com/${encodeURIComponent(title)}`,
  collectedAt: '2026-08-11T00:00:00.000Z', topics: [],
});

describe('health safety policy', () => {
  it.each([
    'Thần dược chữa khỏi mọi bệnh',
    'Detox giảm 8 kg trong 7 ngày cam kết hiệu quả',
    'Mua ngay thực phẩm chức năng giảm giá',
    'Uống 500 mg thuốc mỗi ngày để tự điều trị',
  ])('rejects unsafe promotional or self-medication title: %s', (title) => {
    expect(isSafeHealthArticle(article(title))).toBe(false);
  });

  it('keeps an official FDA warning even when it mentions a supplement', () => {
    expect(isSafeHealthArticle(article(
      'FDA warns detox supplement contains hidden drug ingredient',
      'fda-medwatch',
    ))).toBe(true);
  });

  it('labels official FDA, research, alerts, guidance, and general medical news', () => {
    expect(classifyHealthEvidence(article('Drug safety warning', 'fda-medwatch')))
      .toBe('drug-safety');
    expect(classifyHealthEvidence(article('New clinical study', 'niddk-news')))
      .toBe('research');
    expect(classifyHealthEvidence(article('Outbreak prevention alert')))
      .toBe('public-health-alert');
    expect(classifyHealthEvidence(article('Healthy sleep habits'))).toBe('guidance');
    expect(classifyHealthEvidence(article('Hospital treats kidney disease')))
      .toBe('medical-news');
  });

  it('replaces unsafe generated directives with deterministic fallback', () => {
    const fallback = 'Trao đổi với bác sĩ hoặc dược sĩ.';
    expect(sanitizeHealthEditorialText('Uống 500 mg mỗi ngày.', fallback)).toBe(fallback);
    expect(sanitizeHealthEditorialText('Hãy ngừng thuốc ngay.', fallback)).toBe(fallback);
    expect(sanitizeHealthEditorialText('Bạn mắc bệnh thận.', fallback)).toBe(fallback);
    expect(sanitizeHealthEditorialText('Kê đơn thuốc mới cho bạn.', fallback)).toBe(fallback);
    expect(sanitizeHealthEditorialText(
      'Nghiên cứu chứng minh chắc chắn thuốc này gây khỏi bệnh.',
      fallback,
    )).toBe(fallback);
    expect(sanitizeHealthEditorialText('Duy trì giờ ngủ đều.', fallback))
      .toBe('Duy trì giờ ngủ đều.');
  });
});
