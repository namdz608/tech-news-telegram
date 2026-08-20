# Politics Anchor Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every Gold/Politics run contains a Vietnamese and an international political anchor when current candidates for those scopes exist, replaying at most one seen event per missing scope.

**Architecture:** Partition clustered events into unseen and seen groups, rank both with the existing materialization logic, and select unseen candidates first. If that result lacks a scope anchor, expose only the best distinct seen anchor for that scope to the existing picker and rerun it so all current caps and ordering remain authoritative.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Replay only missing political anchors

**Files:**
- Modify: `src/services/politics-selection.service.ts:362-405`
- Test: `tests/services/politics-selection.service.test.ts:338-425`

- [ ] **Step 1: Write the failing replay tests**

Add a focused test that marks Vietnamese, international, and gold events as seen:

```ts
it('replays one seen Vietnamese and one seen international anchor but never seen gold', () => {
  const vietnam = vnControversy();
  const international = intControversy();
  const gold = goldVietnam();
  const result = createService({ maxArticles: 3, maxGoldNews: 1, maxPerSource: 3 }).select(
    [vietnam, international, gold],
    new Set([vietnam.url, international.url, gold.url]),
  );

  expect(result.eligibleCount).toBe(0);
  expect(result.skippedSeenCount).toBe(3);
  expect(result.selected).toHaveLength(2);
  expect(result.selected.some(vnAnchor)).toBe(true);
  expect(result.selected.some(intAnchor)).toBe(true);
  expect(result.selected.some((candidate) => candidate.primaryCategory === 'gold-market')).toBe(false);
});
```

Add a second test proving a fresh Vietnamese anchor wins while only international is replayed:

```ts
it('keeps a fresh Vietnamese anchor and replays only the missing international scope', () => {
  const vietnam = vnControversy();
  const international = intControversy();
  const result = createService({ maxArticles: 2, maxGoldNews: 0, maxPerSource: 3 }).select(
    [vietnam, international],
    new Set([international.url]),
  );

  expect(result.eligibleCount).toBe(1);
  expect(result.skippedSeenCount).toBe(1);
  expect(result.selected.map((candidate) => candidate.claimOriginUrl)).toEqual([
    vietnam.url,
    international.url,
  ]);
});
```

Update the three existing history tests so their seen political event is present as an anchor replay while `eligibleCount` and `skippedSeenCount` retain their prior unseen/seen meanings. Continue asserting that a seen repost cluster resolves to the collected original rather than an X repost.

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- tests/services/politics-selection.service.test.ts
```

Expected: the new tests fail because all seen events are currently removed before ranking.

- [ ] **Step 3: Preserve ranked seen candidates and choose replay fallbacks**

Change `select` to retain seen events, materialize both partitions once, and run the existing picker first on unseen candidates:

```ts
const skippedFingerprints = new Set<string>();
const seenEvents: PoliticsEvent[] = [];
const unseenEvents: PoliticsEvent[] = [];
for (const event of events) {
  if (eventIsSeen(event, seen)) {
    skippedFingerprints.add(event.fingerprint);
    seenEvents.push(event);
    continue;
  }
  unseenEvents.push(event);
}

const unseenCandidates = unseenEvents
  .map((event) => this.materialize(event, now))
  .sort(compareCandidates);
const seenCandidates = seenEvents
  .map((event) => this.materialize(event, now))
  .sort(compareCandidates);
let selected = this.pick(unseenCandidates);
```

Add a helper that returns at most one replay per missing scope and avoids using one mixed event twice:

```ts
private replayAnchors(
  selected: readonly PoliticsCandidate[],
  seenCandidates: readonly PoliticsCandidate[],
): PoliticsCandidate[] {
  const replay: PoliticsCandidate[] = [];
  if (!selected.some(isVnAnchor)) {
    const vietnam = seenCandidates.find(isVnAnchor);
    if (vietnam) replay.push(vietnam);
  }
  if (!selected.some(isIntAnchor)) {
    const fingerprints = new Set(replay.map((candidate) => candidate.eventFingerprint));
    const international = seenCandidates.find(
      (candidate) => isIntAnchor(candidate) && !fingerprints.has(candidate.eventFingerprint),
    );
    if (international) replay.push(international);
  }
  return replay;
}
```

Rerun the deterministic picker only when a replay is needed:

```ts
const replay = this.replayAnchors(selected, seenCandidates);
if (replay.length > 0) {
  selected = this.pick([...unseenCandidates, ...replay].sort(compareCandidates));
}
return {
  selected,
  eligibleCount: unseenCandidates.length,
  skippedSeenCount: skippedFingerprints.size,
};
```

- [ ] **Step 4: Verify GREEN and repository safety**

Run:

```bash
npm test -- tests/services/politics-selection.service.test.ts
npm test
npm run lint
npm run build
git diff --check
```

Expected: all commands exit successfully; selection returns political anchors under exhausted history without replaying gold.

- [ ] **Step 5: Run the current read-only RSS/history diagnostic**

Collect the current RSS candidates, load `GOLD_POLITICS_HISTORY_PATH`, and call `PoliticsSelectionService.select`. Print only category counts and assert the selected categories include at least one Vietnamese anchor and one international anchor when both candidate scopes exist.

- [ ] **Step 6: Commit**

```bash
git add src/services/politics-selection.service.ts tests/services/politics-selection.service.test.ts
git commit -m "fix: replay missing politics anchors"
```
