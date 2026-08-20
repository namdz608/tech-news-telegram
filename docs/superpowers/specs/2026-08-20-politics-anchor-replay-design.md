# Politics Anchor Replay Design

## Goal

Every Gold/Politics run should include up to one Vietnamese-politics anchor and one international-politics anchor even when all current political stories are already in sent history.

## Context

The price message is intentionally sent every run, while news events are suppressed for seven days after delivery. Current diagnostics found 45 political URLs already sent in the previous hour, leaving only unseen gold-market stories. Classification and source collection were healthy.

## Approaches Considered

1. **Replay only missing political anchors (selected):** keep unseen stories first, then reuse the highest-ranked seen Vietnamese or international anchor only when that scope is absent. This guarantees political coverage with at most two controlled repeats.
2. **Shorten history retention:** permits broad repeats across every category but does not guarantee one story per political scope.
3. **Ignore or clear history:** restores the full backlog on every run and would create heavy duplicate spam.

## Design

`PoliticsSelectionService` continues to classify and cluster all source items before consulting history. It partitions events into unseen and seen groups, materializes and ranks both groups, and first selects only unseen candidates using the existing caps and diversity rules.

If the first selection lacks a Vietnamese anchor, add the highest-ranked seen Vietnamese anchor to a small replay pool. If it lacks an international anchor, add the highest-ranked seen international anchor whose fingerprint is different from the Vietnamese replay when possible. Run the existing deterministic picker again with unseen candidates plus only these replay candidates.

The existing picker remains responsible for maximum articles, maximum gold news, per-source caps, unique claim origins, distinct fingerprints, and final ordering. Seen gold-market stories are never replayed. Fresh political anchors always take precedence over replayed anchors.

`eligibleCount` remains the number of unseen eligible events, and `skippedSeenCount` continues to count seen event fingerprints. Replayed anchors may therefore make `selected.length` greater than `eligibleCount`; these metrics retain their existing meanings.

## Failure and Edge Cases

- If no current candidate exists for a political scope, that scope is omitted.
- One mixed-scope event cannot fill both anchor positions by itself; a distinct event is used when available.
- If caps prevent a replay candidate, the existing constraints win.
- Delivery and history marking remain unchanged; replaying the same URL refreshes its sent timestamp.

## Tests

- With all Vietnamese and international candidates marked seen, selection returns one anchor for each scope and no seen gold story.
- If a fresh Vietnamese anchor exists but international candidates are seen, only the international anchor is replayed.
- Replays still obey article, source, origin, fingerprint, and gold caps.
- Existing deterministic ordering and unseen-selection tests remain green.
