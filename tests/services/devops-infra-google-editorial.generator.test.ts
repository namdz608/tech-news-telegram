import { describe, expect, it, vi } from 'vitest';
import { DevopsInfraGoogleEditorialGenerator } from '../../src/services/devops-infra-google-editorial.generator';
import type { DevopsInfraCandidate } from '../../src/types/devops-infra';

const candidate: DevopsInfraCandidate = {
  item: {
    id: 'thread-1',
    sourceId: 'thread-1',
    sourceName: 'Stack Exchange',
    title: 'Kubernetes pod CrashLoopBackOff',
    url: 'https://example.com/thread-1',
    summary: '',
    body: 'The pod restarts continuously.',
    publishedAt: '2026-09-21T03:00:00.000Z',
    collectedAt: '2026-09-21T03:01:00.000Z',
    discoveredAt: '2026-09-21T03:01:00.000Z',
    discoveryChannel: 'stackexchange',
    communityKey: 'stackoverflow',
    sourceQuotaKey: 'stackoverflow',
    sourceTextStatus: 'full',
    answers: [{ body: 'Run `kubectl logs pod/api`.' }],
  },
  kind: 'problem-solution',
  category: 'k8s-containers',
  environment: 'cloud',
  problem: 'The pod enters CrashLoopBackOff.',
  rootCause: 'The container exits on startup.',
  solutionSteps: ['Run `kubectl logs pod/api`.'],
  solutionConfidence: 'accepted',
  fingerprint: 'thread-1',
  score: 10,
  scoreReasons: [],
};

describe('DevopsInfraGoogleEditorialGenerator', () => {
  it('translates editorial fields and rebuilds JSON in code', async () => {
    const translator = {
      translateDigestVerified: vi.fn(async (text: string) => ({
        text: `VI ${text}`,
        succeeded: true,
      })),
    };

    const result = await new DevopsInfraGoogleEditorialGenerator(translator)
      .generate(candidate);

    expect(translator.translateDigestVerified.mock.calls.map((call) => call[0])).toEqual([
      candidate.item.title,
      candidate.problem,
      candidate.rootCause,
      candidate.solutionSteps[0],
    ]);
    expect(result).toEqual({
      title: `VI ${candidate.item.title}`,
      problem: `VI ${candidate.problem}`,
      rootCause: `VI ${candidate.rootCause}`,
      solutionSteps: [`VI ${candidate.solutionSteps[0]}`],
      caution: 'Một thread diễn đàn không phải runbook chính thức.',
    });
  });

  it('throws when a field translation is not verified', async () => {
    const translator = {
      translateDigestVerified: vi.fn(async (text: string) => ({
        text,
        succeeded: false,
      })),
    };

    await expect(
      new DevopsInfraGoogleEditorialGenerator(translator).generate(candidate),
    ).rejects.toThrow('Google translation failed');
  });
});
