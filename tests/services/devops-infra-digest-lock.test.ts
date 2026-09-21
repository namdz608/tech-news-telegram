import { afterEach, describe, expect, it } from 'vitest';
import {
  releaseDevopsInfraDigestLock,
  tryAcquireDevopsInfraDigestLock,
} from '../../src/services/devops-infra-digest-lock';

describe('devops-infra digest lock', () => {
  afterEach(() => {
    releaseDevopsInfraDigestLock();
  });

  it('rejects a second acquire until released', () => {
    expect(tryAcquireDevopsInfraDigestLock()).toBe(true);
    expect(tryAcquireDevopsInfraDigestLock()).toBe(false);
    releaseDevopsInfraDigestLock();
    expect(tryAcquireDevopsInfraDigestLock()).toBe(true);
  });

  it('survives a fresh import of the lock module', async () => {
    expect(tryAcquireDevopsInfraDigestLock()).toBe(true);
    const reimported = await import('../../src/services/devops-infra-digest-lock');
    expect(reimported.tryAcquireDevopsInfraDigestLock()).toBe(false);
  });
});
