import { describe, expect, it } from 'vitest';
import { createCrawlWebSearch, createCrawlWebRetrieval } from '../../src/services/crawl-backends.factory';
import { AgentReachRetrievalService } from '../../src/services/agent-reach-retrieval.service';
import { SafeWebRetrievalService } from '../../src/services/safe-web-retrieval.service';

describe('crawl backend selection', () => {
  it('enables Exa search only with explicit credentials', () => {
    expect(createCrawlWebSearch({ enabled: true, braveKey: '', exaKey: '' }).isEnabled()).toBe(false);
    expect(createCrawlWebSearch({ enabled: true, braveKey: '', exaKey: 'explicit-key' }).isEnabled()).toBe(true);
  });

  it('keeps existing native readers and search when the feature is disabled', () => {
    expect(createCrawlWebSearch({ enabled: false, braveKey: '', exaKey: 'key' }).isEnabled()).toBe(false);
    expect(createCrawlWebRetrieval(false)).toBeInstanceOf(SafeWebRetrievalService);
    expect(createCrawlWebRetrieval(true)).toBeInstanceOf(AgentReachRetrievalService);
  });
});
