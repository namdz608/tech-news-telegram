import { describe, expect, it, vi } from 'vitest';
import {
  AllDevopsInfraSourcesFailedError,
  DevopsInfraFlowError,
  DevopsInfraFlowService,
  isAllDevopsInfraSourcesFailedError,
} from '../../src/services/devops-infra-flow.service';
import type {
  DevopsInfraCandidate,
  DevopsInfraCollectionResult,
  DevopsInfraMessage,
  DevopsInfraSelectionResult,
  DevopsInfraSourceItem,
} from '../../src/types/devops-infra';

function item(index: number): DevopsInfraSourceItem {
  const timestamp = '2026-09-21T04:00:00.000Z';
  return {
    id: `item-${index}`,
    sourceId: 'reddit',
    sourceName: 'r/devops',
    title: `Item ${index}`,
    url: `https://example.com/item-${index}`,
    summary: 'summary',
    body: 'body',
    publishedAt: timestamp,
    collectedAt: timestamp,
    discoveredAt: timestamp,
    discoveryChannel: 'reddit',
    communityKey: 'reddit:r/devops',
    sourceQuotaKey: 'reddit:r/devops',
    sourceTextStatus: 'full',
    answers: [],
  };
}

function candidate(index: number): DevopsInfraCandidate {
  return {
    item: item(index),
    kind: 'problem-solution',
    category: 'cicd',
    environment: 'cloud',
    problem: 'problem',
    solutionSteps: ['solution'],
    solutionConfidence: 'anecdotal',
    fingerprint: `fingerprint-${index}`,
    score: 10,
    scoreReasons: ['test'],
  };
}

function collected(overrides: Partial<DevopsInfraCollectionResult> = {}): DevopsInfraCollectionResult {
  return {
    items: [item(1), item(2)],
    collectedCount: 2,
    successfulSourceCount: 2,
    failedSources: [],
    ...overrides,
  };
}

function selected(overrides: Partial<DevopsInfraSelectionResult> = {}): DevopsInfraSelectionResult {
  return {
    selected: [candidate(1), candidate(2)],
    eligibleCount: 2,
    skippedSeenCount: 0,
    ...overrides,
  };
}

function dependencies() {
  return {
    source: { collectLatest: vi.fn().mockResolvedValue(collected()) },
    history: { seenUrls: vi.fn().mockResolvedValue(new Set<string>()) },
    selection: { select: vi.fn().mockReturnValue(selected()) },
    messages: {
      buildMessages: vi.fn().mockResolvedValue([
        { text: 'one', url: 'https://example.com/item-1' },
        { text: 'two', url: 'https://example.com/item-2' },
      ] satisfies DevopsInfraMessage[]),
    },
    delivery: { send: vi.fn().mockResolvedValue(undefined) },
  };
}

describe('DevopsInfraFlowService', () => {
  it('throws the named all-failed error before history and delivery', async () => {
    const deps = dependencies();
    deps.source.collectLatest.mockResolvedValue(collected({
      items: [],
      collectedCount: 0,
      successfulSourceCount: 0,
      failedSources: ['reddit', 'hn'],
    }));

    const error = await new DevopsInfraFlowService(deps).run().catch((value) => value);
    expect(error).toBeInstanceOf(AllDevopsInfraSourcesFailedError);
    expect(error).toMatchObject({ name: 'AllDevopsInfraSourcesFailedError' });
    expect(isAllDevopsInfraSourcesFailedError(error)).toBe(true);
    expect(deps.history.seenUrls).not.toHaveBeenCalled();
    expect(deps.delivery.send).not.toHaveBeenCalled();
  });

  it('returns the exact successful response and marks partial from failed sources', async () => {
    const deps = dependencies();
    deps.source.collectLatest.mockResolvedValue(collected({ failedSources: ['discord'] }));

    await expect(new DevopsInfraFlowService(deps).run()).resolves.toEqual({
      sent: true,
      channel: 'telegram-devops-infra',
      messageCount: 2,
      collectedCount: 2,
      eligibleCount: 2,
      skippedSeenCount: 0,
      partial: true,
      failedSources: ['discord'],
      language: 'vi',
    });
    expect(deps.delivery.send).toHaveBeenCalledWith(await deps.messages.buildMessages.mock.results[0].value);
  });

  it('returns no_new_articles without building or delivering messages', async () => {
    const deps = dependencies();
    deps.selection.select.mockReturnValue(selected({
      selected: [],
      eligibleCount: 0,
      skippedSeenCount: 2,
    }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      await expect(new DevopsInfraFlowService(deps).run()).resolves.toEqual({
        sent: false,
        reason: 'no_new_articles',
        channel: 'telegram-devops-infra',
        messageCount: 0,
        collectedCount: 2,
        eligibleCount: 0,
        skippedSeenCount: 2,
        partial: false,
        failedSources: [],
        language: 'vi',
      });
      expect(deps.messages.buildMessages).not.toHaveBeenCalled();
      expect(deps.delivery.send).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        'devops-infra skip send',
        'no_new_articles',
        2,
        2,
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('rethrows AllDevopsInfraSourcesFailedError from history.seenUrls without wrapping', async () => {
    const deps = dependencies();
    deps.history.seenUrls.mockRejectedValue(new AllDevopsInfraSourcesFailedError());

    const error = await new DevopsInfraFlowService(deps).run().catch((value) => value);
    expect(error).toBeInstanceOf(AllDevopsInfraSourcesFailedError);
    expect(isAllDevopsInfraSourcesFailedError(error)).toBe(true);
    expect(error).not.toBeInstanceOf(DevopsInfraFlowError);
    expect(deps.selection.select).not.toHaveBeenCalled();
    expect(deps.delivery.send).not.toHaveBeenCalled();
  });

  it('maps history read failures to a safe flow error before selection and send', async () => {
    const deps = dependencies();
    deps.history.seenUrls.mockRejectedValue(new Error('dummy-sensitive-history-value'));

    const error = await new DevopsInfraFlowService(deps).run().catch((value) => value);
    expect(error).toBeInstanceOf(DevopsInfraFlowError);
    expect(error).toMatchObject({
      name: 'DevopsInfraFlowError',
      code: 'sent-history-read-failed',
      message: 'sent-history-read-failed',
    });
    expect((error as Error).cause).toBeUndefined();
    expect(String(error)).not.toContain('dummy-sensitive-history-value');
    expect(deps.selection.select).not.toHaveBeenCalled();
    expect(deps.messages.buildMessages).not.toHaveBeenCalled();
    expect(deps.delivery.send).not.toHaveBeenCalled();
  });
});
