import { describe, expect, it } from 'vitest';
import { DevopsJobsSelectionService } from '../../src/services/devops-jobs-selection.service';
import type { DevopsJob } from '../../src/types/devops-jobs';

const NOW = new Date('2026-10-02T12:00:00.000Z');

function job(overrides: Partial<DevopsJob> = {}): DevopsJob {
  return {
    id: overrides.url ?? 'job',
    sourceId: 'remoteok',
    sourceName: 'Remote OK',
    title: 'DevOps Engineer',
    company: 'Acme',
    url: 'https://example.com/jobs/1',
    location: 'Worldwide',
    description: 'Remote',
    tags: [],
    publishedAt: '2026-10-02T00:00:00.000Z',
    ...overrides,
  };
}

function service(): DevopsJobsSelectionService {
  return new DevopsJobsSelectionService(8, 2, 72, () => NOW);
}

describe('DevopsJobsSelectionService', () => {
  it('drops seen URLs and reports both counts', () => {
    const result = service().select(
      [
        job({ url: 'https://example.com/jobs/1' }),
        job({ url: 'https://example.com/jobs/2?utm_source=x' }),
      ],
      new Set(['https://example.com/jobs/1']),
    );
    expect(result.skippedSeenCount).toBe(1);
    expect(result.eligibleCount).toBe(1);
    expect(result.selected.map((entry) => entry.url)).toEqual([
      'https://example.com/jobs/2?utm_source=x',
    ]);
  });

  it('drops jobs older than 72 hours', () => {
    const result = service().select(
      [job({ publishedAt: '2026-09-28T00:00:00.000Z' })],
      new Set(),
    );
    expect(result.selected).toEqual([]);
    expect(result.eligibleCount).toBe(0);
  });

  it('keeps an older HN hiring comment', () => {
    const result = service().select(
      [job({
        sourceId: 'hn',
        sourceName: 'HN Who is hiring',
        publishedAt: '2026-09-01T00:00:00.000Z',
        description: 'Remote platform work',
      })],
      new Set(),
    );
    expect(result.selected).toHaveLength(1);
  });

  it('caps at two jobs per source and eight overall', () => {
    const jobs = [
      'remoteok',
      'remotive',
      'weworkremotely',
      'himalayas',
      'hn',
    ].flatMap((sourceId, sourceIndex) =>
      [0, 1, 2].map((index) => job({
        sourceId,
        url: `https://example.com/${sourceId}/${index}`,
        publishedAt: new Date(NOW.getTime() - (sourceIndex * 3 + index) * 1000).toISOString(),
      })));
    const result = service().select(jobs, new Set());
    expect(result.selected).toHaveLength(8);
    expect(result.selected.filter((entry) => entry.sourceId === 'remoteok')).toHaveLength(2);
    expect(result.eligibleCount).toBe(15);
  });

  it('drops jobs that fail the keyword filter before counting them eligible', () => {
    const result = service().select(
      [job({ title: 'Accountant', description: 'Ledgers' })],
      new Set(),
    );
    expect(result.eligibleCount).toBe(0);
    expect(result.skippedSeenCount).toBe(0);
  });

  it('deduplicates canonical URLs before counting jobs and consuming source quotas', () => {
    const result = service().select([
      job({ url: 'https://example.com/jobs/1?utm_source=devops' }),
      job({ url: 'https://example.com/jobs/1?utm_source=sre' }),
      job({ url: 'https://example.com/jobs/2' }),
    ], new Set());

    expect(result.eligibleCount).toBe(2);
    expect(result.skippedSeenCount).toBe(0);
    expect(result.selected.map((entry) => entry.url)).toEqual([
      'https://example.com/jobs/1?utm_source=devops',
      'https://example.com/jobs/2',
    ]);
  });

  it('deduplicates the same URL collected from different sources', () => {
    const result = service().select([
      job(),
      job({ sourceId: 'linkedin' }),
    ], new Set());

    expect(result.selected).toHaveLength(1);
    expect(result.eligibleCount).toBe(1);
  });
});
