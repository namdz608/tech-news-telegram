import { afterEach, describe, expect, it } from 'vitest';
import {
  releaseDevopsJobsDigestLock,
  tryAcquireDevopsJobsDigestLock,
} from '../../src/services/devops-jobs-digest-lock';

describe('devops-jobs digest lock', () => {
  afterEach(() => {
    releaseDevopsJobsDigestLock();
  });

  it('rejects a second acquire until released', () => {
    expect(tryAcquireDevopsJobsDigestLock()).toBe(true);
    expect(tryAcquireDevopsJobsDigestLock()).toBe(false);
    releaseDevopsJobsDigestLock();
    expect(tryAcquireDevopsJobsDigestLock()).toBe(true);
  });

  it('survives a fresh import of the lock module', async () => {
    expect(tryAcquireDevopsJobsDigestLock()).toBe(true);
    const reimported = await import('../../src/services/devops-jobs-digest-lock');
    expect(reimported.tryAcquireDevopsJobsDigestLock()).toBe(false);
  });
});
