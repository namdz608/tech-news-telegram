import { describe, expect, it } from 'vitest';
import type { DevopsJobsSourceAdapter } from '../../src/services/devops-jobs-source.adapter';
import { DevopsJobsSourceService } from '../../src/services/devops-jobs-source.service';
import type { DevopsJob } from '../../src/types/devops-jobs';

function adapter(key: string, result: DevopsJob[] | Error): DevopsJobsSourceAdapter {
  return {
    key,
    collect: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

const job: DevopsJob = {
  id: '1',
  sourceId: 'remoteok',
  sourceName: 'Remote OK',
  title: 'DevOps',
  company: 'Acme',
  url: 'https://example.com/1',
  location: '',
  description: '',
  tags: [],
  publishedAt: '2026-10-02T00:00:00.000Z',
};

describe('DevopsJobsSourceService', () => {
  it('keeps jobs from live sources when one adapter throws', async () => {
    const service = new DevopsJobsSourceService([
      adapter('remoteok', [job]),
      adapter('linkedin', new Error('HTTP 403')),
    ]);
    const result = await service.collectLatest();
    expect(result.collectedCount).toBe(1);
    expect(result.successfulSourceCount).toBe(1);
    expect(result.failedSources).toEqual(['linkedin']);
  });

  it('counts an empty adapter as success', async () => {
    const service = new DevopsJobsSourceService([adapter('indeed', [])]);
    const result = await service.collectLatest();
    expect(result.successfulSourceCount).toBe(1);
    expect(result.items).toEqual([]);
  });
});
