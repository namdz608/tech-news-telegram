const LOCK = Symbol.for('tech-news-telegram:devops-infra-digest-running');

type LockSlot = typeof globalThis & { [LOCK]?: boolean };

export function tryAcquireDevopsInfraDigestLock(): boolean {
  const slots: LockSlot = globalThis;
  if (slots[LOCK]) return false;
  slots[LOCK] = true;
  return true;
}

export function releaseDevopsInfraDigestLock(): void {
  const slots: LockSlot = globalThis;
  slots[LOCK] = false;
}
