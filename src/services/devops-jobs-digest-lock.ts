const LOCK = Symbol.for('tech-news-telegram:devops-jobs-digest-running');

type LockSlot = typeof globalThis & { [LOCK]?: boolean };

export function tryAcquireDevopsJobsDigestLock(): boolean {
  const slots: LockSlot = globalThis;
  if (slots[LOCK]) return false;
  slots[LOCK] = true;
  return true;
}

export function releaseDevopsJobsDigestLock(): void {
  const slots: LockSlot = globalThis;
  slots[LOCK] = false;
}
