import { describe, expect, it, vi } from 'vitest';
import { DevopsInfraCodexEditorialGenerator } from '../../src/services/devops-infra-codex-editorial.generator';
import { DevopsInfraEditorialService } from '../../src/services/devops-infra-editorial.service';
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
  solutionSteps: ['Run `kubectl logs pod/api`.'],
  solutionConfidence: 'accepted',
  fingerprint: 'thread-1',
  score: 10,
  scoreReasons: [],
};

const validEditorial = {
  title: 'Pod Kubernetes gặp CrashLoopBackOff',
  problem: 'Kubernetes: The pod restarts continuously and enters CrashLoopBackOff.',
  solutionSteps: ['Run `kubectl logs pod/api`.'],
  caution: 'Đây không phải runbook chính thức.',
};

describe('DevopsInfraEditorialService', () => {
  it('returns validated generator output', async () => {
    const generator = { generate: vi.fn().mockResolvedValue(validEditorial) };

    await expect(new DevopsInfraEditorialService(generator).edit(candidate))
      .resolves.toEqual(validEditorial);
  });

  it('returns deterministic copy and logs only the error name when generation throws', async () => {
    const generator = {
      generate: vi.fn().mockRejectedValue(
        new TypeError(`secret source: ${candidate.item.body}`),
      ),
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await new DevopsInfraEditorialService(generator).edit(candidate);

    expect(result.problem).toBe(candidate.problem);
    expect(warn).toHaveBeenCalledWith('devops-infra editorial failed', 'TypeError');
    expect(JSON.stringify(warn.mock.calls)).not.toContain(candidate.item.body);
    warn.mockRestore();
  });

  it('repairs invalid generated fields without dropping the candidate', async () => {
    const generator = {
      generate: vi.fn().mockResolvedValue({
        ...validEditorial,
        problem: 'Pod bị lỗi.',
        solutionSteps: ['kubectl delete namespace production'],
      }),
    };

    const result = await new DevopsInfraEditorialService(generator).edit(candidate);

    expect(result.problem).toContain('Pod bị lỗi.');
    expect(result.problem).toContain('CrashLoopBackOff');
    expect(result.solutionSteps).toEqual(candidate.solutionSteps);
  });

  it('uses deterministic copy when no generator is configured', async () => {
    const result = await new DevopsInfraEditorialService().edit(candidate);

    expect(result).toMatchObject({
      title: candidate.item.title,
      problem: candidate.problem,
      solutionSteps: candidate.solutionSteps,
    });
  });

  it('uses and validates the fallback generator after primary failure', async () => {
    const primary = { generate: vi.fn().mockRejectedValue(new Error('failed')) };
    const fallback = { generate: vi.fn().mockResolvedValue(validEditorial) };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(new DevopsInfraEditorialService(primary, fallback).edit(candidate))
      .resolves.toEqual(validEditorial);
    expect(fallback.generate).toHaveBeenCalledWith(candidate);
    warn.mockRestore();
  });
});

describe('DevopsInfraCodexEditorialGenerator', () => {
  it('uses the source-grounding instructions and exact payload', async () => {
    const runner = { run: vi.fn().mockResolvedValue(JSON.stringify(validEditorial)) };
    const generator = new DevopsInfraCodexEditorialGenerator(runner, 1234);

    await expect(generator.generate(candidate)).resolves.toEqual(validEditorial);
    const [instructions, payload, timeout] = runner.run.mock.calls[0];
    expect(instructions).toContain('Do not invent commands');
    expect(instructions).toContain('Keep technical tokens unchanged');
    expect(JSON.parse(payload)).toEqual({
      title: candidate.item.title,
      body: candidate.item.body,
      answers: candidate.item.answers,
      problem: candidate.problem,
      rootCause: candidate.rootCause,
      solutionSteps: candidate.solutionSteps,
      kind: candidate.kind,
    });
    expect(timeout).toBe(1234);
  });

  it('rejects incomplete JSON', async () => {
    const runner = { run: vi.fn().mockResolvedValue('{"title":"Only title"}') };

    await expect(new DevopsInfraCodexEditorialGenerator(runner).generate(candidate))
      .rejects.toThrow();
  });
});
