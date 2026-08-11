import { describe, expect, it, vi } from 'vitest';
import {
  AllHealthSourcesFailedError,
  HealthFlowService,
} from '../../src/services/health-flow.service';
import type { Article } from '../../src/types/article';

const article: Article = {
  id: 'a', sourceId: 'one', sourceName: 'One', title: 'Healthy sleep',
  url: 'https://example.com/a', collectedAt: '2026-08-11T00:00:00.000Z', topics: [],
};
const entry = {
  article, topic: 'sleep-recovery' as const, evidence: 'guidance' as const, score: 100,
};
const message = {
  text: 'Sleep', url: article.url, article,
  topic: 'sleep-recovery' as const, evidence: 'guidance' as const,
};

function dependencies() {
  return {
    source: { collectLatest: vi.fn() },
    history: { seenUrls: vi.fn().mockResolvedValue(new Set<string>()) },
    selection: { select: vi.fn() },
    messages: { buildMessages: vi.fn() },
    delivery: { send: vi.fn().mockResolvedValue(undefined) },
  };
}

describe('HealthFlowService', () => {
  it('collects, selects, builds, and delivers', async () => {
    const deps = dependencies();
    deps.source.collectLatest.mockResolvedValue({
      articles: [article], successfulSourceCount: 6, failedSourceCount: 1,
    });
    deps.selection.select.mockReturnValue({
      selected: [entry], eligibleCount: 1, skippedSeenCount: 0,
    });
    deps.messages.buildMessages.mockResolvedValue([message]);
    const flow = new HealthFlowService(
      deps.source, deps.history, deps.selection, deps.messages, deps.delivery,
    );

    await expect(flow.run()).resolves.toEqual({
      sent: true,
      messageCount: 1,
      collectedCount: 1,
      eligibleCount: 1,
      skippedSeenCount: 0,
      language: 'vi',
      channel: 'telegram-health',
    });
    expect(deps.delivery.send).toHaveBeenCalledWith([message]);
  });

  it('does not send when no unseen article exists', async () => {
    const deps = dependencies();
    deps.source.collectLatest.mockResolvedValue({
      articles: [article], successfulSourceCount: 7, failedSourceCount: 0,
    });
    deps.selection.select.mockReturnValue({
      selected: [], eligibleCount: 0, skippedSeenCount: 1,
    });
    const flow = new HealthFlowService(
      deps.source, deps.history, deps.selection, deps.messages, deps.delivery,
    );

    await expect(flow.run()).resolves.toMatchObject({
      sent: false, reason: 'no_new_articles', messageCount: 0,
    });
    expect(deps.delivery.send).not.toHaveBeenCalled();
  });

  it('throws when every health source fails', async () => {
    const deps = dependencies();
    deps.source.collectLatest.mockResolvedValue({
      articles: [], successfulSourceCount: 0, failedSourceCount: 7,
    });
    const flow = new HealthFlowService(
      deps.source, deps.history, deps.selection, deps.messages, deps.delivery,
    );

    await expect(flow.run()).rejects.toBeInstanceOf(AllHealthSourcesFailedError);
  });
});
