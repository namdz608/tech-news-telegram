import { expect, it } from 'vitest';
import { healthTopics } from '../../src/config/health-topics';

it('defines six ordered health topics with safety fallbacks', () => {
  expect(healthTopics.map((topic) => topic.key)).toEqual([
    'sleep-recovery',
    'nutrition-metabolism',
    'movement-musculoskeletal',
    'mental-wellbeing',
    'prevention-daily-life',
    'conditions-medicine-research',
  ]);
  for (const topic of healthTopics) {
    expect(topic.keywords.length).toBeGreaterThan(5);
    expect(topic.fallbackImageUrl).toMatch(/^https:\/\//);
    expect(topic.fallbackSafeTakeaway).toBeTruthy();
    expect(topic.fallbackEvidenceNote).toBeTruthy();
  }
});
