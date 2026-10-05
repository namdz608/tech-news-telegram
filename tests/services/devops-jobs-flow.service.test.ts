import { describe, expect, it, vi } from 'vitest';
import {
  AllDevopsJobsSourcesFailedError,
  DevopsJobsFlowError,
  DevopsJobsFlowService,
} from '../../src/services/devops-jobs-flow.service';
import type { DevopsJob, DevopsJobsCollectionResult } from '../../src/types/devops-jobs';

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

function collection(overrides: Partial<DevopsJobsCollectionResult> = {}): DevopsJobsCollectionResult {
  return {
    items: [job],
    collectedCount: 1,
    successfulSourceCount: 1,
    failedSources: [],
    ...overrides,
  };
}

function flow(overrides: {
  collection?: DevopsJobsCollectionResult;
  seen?: Set<string>;
  selected?: DevopsJob[];
  eligibleCount?: number;
  skippedSeenCount?: number;
} = {}) {
  const send = vi.fn().mockResolvedValue(undefined);
  const service = new DevopsJobsFlowService({
    source: { collectLatest: vi.fn().mockResolvedValue(overrides.collection ?? collection()) },
    history: { seenUrls: vi.fn().mockResolvedValue(overrides.seen ?? new Set<string>()) },
    selection: {
      select: vi.fn().mockReturnValue({
        selected: overrides.selected ?? [job],
        eligibleCount: overrides.eligibleCount ?? 1,
        skippedSeenCount: overrides.skippedSeenCount ?? 0,
      }),
    },
    messages: {
      buildMessages: vi.fn().mockResolvedValue([{ text: 'card', url: job.url }]),
    },
    delivery: { send },
  });
  return { service, send };
}

describe('DevopsJobsFlowService', () => {
  it('throws when every source fails', async () => {
    const { service } = flow({
      collection: collection({
        items: [],
        collectedCount: 0,
        successfulSourceCount: 0,
        failedSources: ['remoteok'],
      }),
    });
    await expect(service.run()).rejects.toBeInstanceOf(AllDevopsJobsSourcesFailedError);
  });

  it('sends when some sources fail', async () => {
    const { service, send } = flow({
      collection: collection({ failedSources: ['linkedin'], successfulSourceCount: 6 }),
    });
    const result = await service.run();
    expect(send).toHaveBeenCalledOnce();
    expect(result.sent).toBe(true);
    expect(result.partial).toBe(true);
    expect(result.channel).toBe('telegram-devops-jobs');
    expect(result.language).toBe('vi');
  });

  it('returns no_new_articles without sending', async () => {
    const { service, send } = flow({ selected: [], eligibleCount: 0, skippedSeenCount: 1 });
    const result = await service.run();
    expect(send).not.toHaveBeenCalled();
    expect(result).toMatchObject({ sent: false, reason: 'no_new_articles', messageCount: 0 });
  });

  it('wraps a history read failure', async () => {
    const service = new DevopsJobsFlowService({
      source: { collectLatest: vi.fn().mockResolvedValue(collection()) },
      history: { seenUrls: vi.fn().mockRejectedValue(new Error('disk')) },
      selection: { select: vi.fn() },
      messages: { buildMessages: vi.fn() },
      delivery: { send: vi.fn() },
    });
    await expect(service.run()).rejects.toMatchObject({
      code: 'sent-history-read-failed',
    } satisfies Partial<DevopsJobsFlowError>);
  });
});
