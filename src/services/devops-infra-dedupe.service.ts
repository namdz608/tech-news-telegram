import type {
  DevopsInfraCandidate,
  SolutionConfidence,
} from "../types/devops-infra";
import { normalizeUrl } from "../utils/normalize-url";

/** Token Jaccard on 3-character shingles of the compact fingerprint. */
export const FINGERPRINT_JACCARD_THRESHOLD = 0.85;

const CONFIDENCE_RANK: Record<SolutionConfidence, number> = {
  accepted: 0,
  "highly-voted": 1,
  "author-confirmed": 2,
  anecdotal: 3,
  none: 4,
};

class DisjointSet {
  private readonly parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
  }

  find(index: number): number {
    let current = index;
    while (this.parent[current] !== current) {
      this.parent[current] = this.parent[this.parent[current]!]!;
      current = this.parent[current]!;
    }
    return current;
  }

  union(left: number, right: number): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) {
      return;
    }
    if (leftRoot < rightRoot) {
      this.parent[rightRoot] = leftRoot;
    } else {
      this.parent[leftRoot] = rightRoot;
    }
  }
}

function canonicalUrl(url: string): string {
  try {
    return normalizeUrl(url);
  } catch {
    return url.trim();
  }
}

export function fingerprintTokens(fingerprint: string): Set<string> {
  const tokens = new Set<string>();
  if (fingerprint.length < 3) {
    if (fingerprint.length > 0) {
      tokens.add(fingerprint);
    }
    return tokens;
  }
  for (let index = 0; index <= fingerprint.length - 3; index += 1) {
    tokens.add(fingerprint.slice(index, index + 3));
  }
  return tokens;
}

export function fingerprintTokenJaccard(left: string, right: string): number {
  const leftTokens = fingerprintTokens(left);
  const rightTokens = fingerprintTokens(right);
  if (leftTokens.size === 0 && rightTokens.size === 0) {
    return 1;
  }
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }
  return intersection / (leftTokens.size + rightTokens.size - intersection);
}

function compareRepresentatives(
  left: DevopsInfraCandidate,
  right: DevopsInfraCandidate,
  leftIndex: number,
  rightIndex: number,
): number {
  if (canonicalUrl(left.item.url) === canonicalUrl(right.item.url)) {
    return leftIndex - rightIndex;
  }

  const confidenceDiff =
    CONFIDENCE_RANK[left.solutionConfidence] -
    CONFIDENCE_RANK[right.solutionConfidence];
  if (confidenceDiff !== 0) {
    return confidenceDiff;
  }

  const bodyDiff = right.item.body.length - left.item.body.length;
  if (bodyDiff !== 0) {
    return bodyDiff;
  }

  const leftPublished = Date.parse(left.item.publishedAt);
  const rightPublished = Date.parse(right.item.publishedAt);
  const timeDiff = leftPublished - rightPublished;
  if (Number.isFinite(timeDiff) && timeDiff !== 0) {
    return timeDiff;
  }

  return leftIndex - rightIndex;
}

export function dedupeDevopsInfraCandidates(
  candidates: readonly DevopsInfraCandidate[],
): DevopsInfraCandidate[] {
  if (candidates.length === 0) {
    return [];
  }

  const sets = new DisjointSet(candidates.length);
  const canonicalUrls = candidates.map((entry) => canonicalUrl(entry.item.url));

  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      if (canonicalUrls[left] === canonicalUrls[right]) {
        sets.union(left, right);
        continue;
      }
      const leftFingerprint = candidates[left]!.fingerprint;
      const rightFingerprint = candidates[right]!.fingerprint;
      if (leftFingerprint === rightFingerprint) {
        sets.union(left, right);
        continue;
      }
      if (
        fingerprintTokenJaccard(leftFingerprint, rightFingerprint) >=
        FINGERPRINT_JACCARD_THRESHOLD
      ) {
        sets.union(left, right);
      }
    }
  }

  const grouped = new Map<number, number[]>();
  candidates.forEach((_, index) => {
    const root = sets.find(index);
    const members = grouped.get(root) ?? [];
    members.push(index);
    grouped.set(root, members);
  });

  const survivors = [...grouped.values()].map((indices) => {
    const representativeIndex = [...indices].sort((left, right) =>
      compareRepresentatives(
        candidates[left]!,
        candidates[right]!,
        left,
        right,
      ),
    )[0]!;
    return { index: representativeIndex, candidate: candidates[representativeIndex]! };
  });

  return survivors
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.candidate);
}
