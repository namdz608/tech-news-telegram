import { describe, expect, it, vi } from 'vitest';
import type {
  DevopsInfraSourceAdapter,
  DevopsInfraSourceAdapterResult,
} from '../../src/services/devops-infra-source.adapter';
import { DevopsInfraSourceService } from '../../src/services/devops-infra-source.service';
import type { DevopsInfraSourceItem } from '../../src/types/devops-infra';

const NOW = new Date('2026-09-21T03:00:00.000Z');

function item(
  id: string,
  overrides: Partial<DevopsInfraSourceItem> = {},
): DevopsInfraSourceItem {
  return {
    id,
    sourceId: id,
    sourceName: 'Test',
    title: `Title ${id}`,
    url: `https://example.com/${id}`,
    summary: '',
    body: `Body ${id}`,
    publishedAt: '2026-09-21T02:00:00.000Z',
    collectedAt: NOW.toISOString(),
    discoveredAt: '2026-09-21T02:00:00.000Z',
    discoveryChannel: 'web',
    communityKey: 'test',
    sourceQuotaKey: 'test',
    sourceTextStatus: 'full',
    answers: [],
    ...overrides,
  };
}

function adapter(
  key: string,
  result: DevopsInfraSourceAdapterResult | Error,
  enabled = true,
): DevopsInfraSourceAdapter & { collect: ReturnType<typeof vi.fn> } {
  return {
    key,
    isEnabled: () => enabled,
    collect: vi.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  };
}

describe('DevopsInfraSourceService', () => {
  // Production factory order (enforced in Task 13): Reddit, Stack Exchange,
  // HN, web, X, Discord, Facebook.
  it('skips disabled adapters completely', async () => {
    const disabled = adapter('disabled', new Error('must not run'), false);

    const result = await new DevopsInfraSourceService(
      [disabled],
      72,
      () => NOW,
    ).collectLatest();

    expect(disabled.collect).not.toHaveBeenCalled();
    expect(result.failedSources).toEqual([]);
  });

  it('concatenates enabled successes and aggregates source metadata', async () => {
    const first = adapter('first', {
      items: [item('one')],
      successfulSourceCount: 2,
      failedSources: ['shared', 'first-child'],
    });
    const second = adapter('second', {
      items: [item('two')],
      successfulSourceCount: 3,
      failedSources: ['shared', 'second-child'],
    });

    const result = await new DevopsInfraSourceService(
      [first, second],
      72,
      () => NOW,
    ).collectLatest();

    expect(result.items.map(({ id }) => id)).toEqual(['one', 'two']);
    expect(result).toMatchObject({
      successfulSourceCount: 5,
      collectedCount: 2,
      failedSources: ['shared', 'first-child', 'second-child'],
    });
  });

  it('isolates an enabled adapter rejection', async () => {
    const failed = adapter('broken', new Error('network down'));

    await expect(
      new DevopsInfraSourceService([failed], 72, () => NOW).collectLatest(),
    ).resolves.toEqual({
      items: [],
      collectedCount: 0,
      successfulSourceCount: 0,
      failedSources: ['broken'],
    });
  });

  it('time-boxes a hanging adapter so other sources can finish', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const hanging: DevopsInfraSourceAdapter = {
      key: 'hanging',
      isEnabled: () => true,
      collect: vi.fn(() => new Promise<DevopsInfraSourceAdapterResult>(() => undefined)),
    };
    const ok = adapter('ok', {
      items: [item('one')],
      successfulSourceCount: 1,
      failedSources: [],
    });

    try {
      const result = await new DevopsInfraSourceService(
        [hanging, ok],
        72,
        () => NOW,
        30,
      ).collectLatest();

      expect(result.items.map(({ id }) => id)).toEqual(['one']);
      expect(result.successfulSourceCount).toBe(1);
      expect(result.failedSources).toEqual(['hanging']);
      expect(warn).toHaveBeenCalledWith(
        'devops-infra collect timeout',
        'hanging',
        expect.stringMatching(/ms$/),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('normalizes URLs and keeps the first duplicate in adapter order', async () => {
    const first = adapter('first', {
      items: [
        item('first', {
          url: 'https://example.com/post/?utm_source=feed#section',
        }),
      ],
      successfulSourceCount: 1,
      failedSources: [],
    });
    const second = adapter('second', {
      items: [item('second', { url: 'https://example.com/post' })],
      successfulSourceCount: 1,
      failedSources: [],
    });

    const result = await new DevopsInfraSourceService(
      [first, second],
      72,
      () => NOW,
    ).collectLatest();

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'first',
      url: 'https://example.com/post',
    });
  });

  it('drops invalid, empty, and stale items', async () => {
    const source = adapter('source', {
      items: [
        item('ftp', { url: 'ftp://example.com/file' }),
        item('malformed', { url: 'not a URL' }),
        item('empty', { title: '  ', body: '\n' }),
        item('stale-published', {
          publishedAt: '2026-09-17T02:59:59.999Z',
        }),
        item('stale-discovered', {
          publishedAt: '',
          discoveredAt: '2026-09-17T02:59:59.999Z',
        }),
        item('valid'),
      ],
      successfulSourceCount: 1,
      failedSources: [],
    });

    const result = await new DevopsInfraSourceService(
      [source],
      72,
      () => NOW,
    ).collectLatest();

    expect(result.items.map(({ id }) => id)).toEqual(['valid']);
    expect(result.collectedCount).toBe(1);
  });
});
