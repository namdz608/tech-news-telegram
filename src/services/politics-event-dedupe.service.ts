import type { ClassifiedPoliticsItem, PoliticsEvent } from '../types/gold-politics';
import { normalizeUrl } from '../utils/normalize-url';
import { politicsCopySignature, politicsSignificantTokens } from './politics-classification.service';

export const EVENT_SIMILARITY_THRESHOLD = 0.72;

const TEXT_STATUS_RANK: Record<ClassifiedPoliticsItem['sourceTextStatus'], number> = {
  full: 0,
  'search-excerpt': 1,
  incomplete: 2,
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

export function canonicalPoliticsUrl(url: string): string {
  try {
    return normalizeUrl(url);
  } catch {
    return url.trim();
  }
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) {
    return 1;
  }
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }
  return intersection / (left.size + right.size - intersection);
}

function entitiesOverlap(left: ClassifiedPoliticsItem, right: ClassifiedPoliticsItem): boolean {
  const rightEntities = new Set(right.claimEntities);
  return left.claimEntities.some((entity) => rightEntities.has(entity));
}

function sameCategoryAndGeography(left: ClassifiedPoliticsItem, right: ClassifiedPoliticsItem): boolean {
  return left.primaryCategory === right.primaryCategory && left.geographicScope === right.geographicScope;
}

function semanticallyCompatible(left: ClassifiedPoliticsItem, right: ClassifiedPoliticsItem): boolean {
  return (
    sameCategoryAndGeography(left, right) &&
    entitiesOverlap(left, right) &&
    left.semanticClaimKey === right.semanticClaimKey
  );
}

function quotedRelationship(left: ClassifiedPoliticsItem, right: ClassifiedPoliticsItem): boolean {
  const leftQuoted = left.quotedOriginUrl ? canonicalPoliticsUrl(left.quotedOriginUrl) : undefined;
  const rightQuoted = right.quotedOriginUrl ? canonicalPoliticsUrl(right.quotedOriginUrl) : undefined;
  const leftOrigin = canonicalPoliticsUrl(left.originAttribution.url);
  const rightOrigin = canonicalPoliticsUrl(right.originAttribution.url);
  return leftQuoted === rightOrigin || rightQuoted === leftOrigin;
}

function gatedSyndication(left: ClassifiedPoliticsItem, right: ClassifiedPoliticsItem): boolean {
  return Boolean(left.syndicationKey) && left.syndicationKey === right.syndicationKey;
}

function isSocialOrigin(item: ClassifiedPoliticsItem): boolean {
  return (
    item.discoveryChannel === 'x' ||
    item.discoveryChannel === 'reddit' ||
    item.discoveryChannel === 'facebook' ||
    item.discoveryChannel === 'tiktok' ||
    item.discoveryChannel === 'telegram' ||
    item.evidenceKind === 'social-claim' ||
    item.evidenceKind === 'anonymous-rumor'
  );
}

function originTimestamp(item: ClassifiedPoliticsItem): number {
  const candidates = [item.originAttribution.publishedAt, item.publishedAt, item.originAttribution.discoveredAt, item.discoveredAt];
  for (const value of candidates) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return Number.POSITIVE_INFINITY;
}

function metadataScore(item: ClassifiedPoliticsItem): number {
  return [item.author, item.originalAccount, item.originAttribution.account, item.summary].filter(
    (value) => Boolean(value && value.trim()),
  ).length;
}

function sourceTextLength(item: ClassifiedPoliticsItem): number {
  return item.title.length + (item.summary?.length ?? 0);
}

function itemTokens(item: ClassifiedPoliticsItem): Set<string> {
  return politicsSignificantTokens(`${item.title} ${item.summary ?? ''}`);
}

function copySignature(item: ClassifiedPoliticsItem): string {
  return politicsCopySignature(`${item.title} ${item.summary ?? ''}`);
}

function collectedOriginalUrls(members: readonly ClassifiedPoliticsItem[]): Set<string> {
  const origins = new Set(members.map((member) => canonicalPoliticsUrl(member.originAttribution.url)));
  const resolved = new Set<string>();
  for (const member of members) {
    if (!member.quotedOriginUrl) {
      continue;
    }
    const quoted = canonicalPoliticsUrl(member.quotedOriginUrl);
    const original = members.find(
      (candidate) =>
        canonicalPoliticsUrl(candidate.originAttribution.url) === quoted && semanticallyCompatible(member, candidate),
    );
    if (original && origins.has(quoted)) {
      resolved.add(quoted);
    }
  }
  return resolved;
}

function compareRepresentatives(
  left: ClassifiedPoliticsItem,
  right: ClassifiedPoliticsItem,
  originals: ReadonlySet<string>,
): number {
  const leftOriginal = originals.has(canonicalPoliticsUrl(left.originAttribution.url)) ? 0 : 1;
  const rightOriginal = originals.has(canonicalPoliticsUrl(right.originAttribution.url)) ? 0 : 1;
  if (leftOriginal !== rightOriginal) {
    return leftOriginal - rightOriginal;
  }

  if (isSocialOrigin(left) && isSocialOrigin(right)) {
    const timeDiff = originTimestamp(left) - originTimestamp(right);
    if (timeDiff !== 0) {
      return timeDiff;
    }
  }

  const textDiff = TEXT_STATUS_RANK[left.sourceTextStatus] - TEXT_STATUS_RANK[right.sourceTextStatus];
  if (textDiff !== 0) {
    return textDiff;
  }

  const lengthDiff = sourceTextLength(right) - sourceTextLength(left);
  if (lengthDiff !== 0) {
    return lengthDiff;
  }

  const metaDiff = metadataScore(right) - metadataScore(left);
  if (metaDiff !== 0) {
    return metaDiff;
  }

  return canonicalPoliticsUrl(left.url).localeCompare(canonicalPoliticsUrl(right.url));
}

function eventFingerprint(representative: ClassifiedPoliticsItem): string {
  const tokens = [...representative.claimEntities, ...representative.semanticClaimKey.split(/[|]+/)]
    .map((token) => politicsCopySignature(token))
    .filter((token) => token.length > 0)
    .sort();
  return [...new Set(tokens)].join('|');
}

function independentSourceIds(members: readonly ClassifiedPoliticsItem[]): string[] {
  const sets = new DisjointSet(members.length);
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      const left = members[i]!;
      const right = members[j]!;
      const copyMatch = copySignature(left) === copySignature(right);
      const quote = semanticallyCompatible(left, right) && quotedRelationship(left, right);
      const syndication = semanticallyCompatible(left, right) && gatedSyndication(left, right);
      if (left.evidenceOriginKey === right.evidenceOriginKey || copyMatch || quote || syndication) {
        sets.union(i, j);
      }
    }
  }

  const byRoot = new Map<number, string[]>();
  members.forEach((member, index) => {
    const root = sets.find(index);
    const keys = byRoot.get(root) ?? [];
    keys.push(member.evidenceOriginKey);
    byRoot.set(root, keys);
  });

  return [...byRoot.values()]
    .map((keys) => [...keys].sort()[0]!)
    .sort();
}

function resolveAttribution(members: readonly ClassifiedPoliticsItem[], representative: ClassifiedPoliticsItem): {
  claimOriginUrl: string;
  claimOriginResolution: PoliticsEvent['claimOriginResolution'];
} {
  const originals = collectedOriginalUrls(members);
  if (originals.size > 0) {
    const originalMember = members
      .filter((member) => originals.has(canonicalPoliticsUrl(member.originAttribution.url)))
      .sort((left, right) => compareRepresentatives(left, right, originals))[0]!;
    return {
      claimOriginUrl: canonicalPoliticsUrl(originalMember.originAttribution.url),
      claimOriginResolution: 'collected-original',
    };
  }
  return {
    claimOriginUrl: canonicalPoliticsUrl(representative.originAttribution.url),
    claimOriginResolution: 'representative-source',
  };
}

export class PoliticsEventDedupeService {
  cluster(candidates: readonly ClassifiedPoliticsItem[]): PoliticsEvent[] {
    if (candidates.length === 0) {
      return [];
    }

    const items = [...candidates];
    const sets = new DisjointSet(items.length);
    const tokens = items.map((item) => itemTokens(item));
    const canonicalUrls = items.map((item) => canonicalPoliticsUrl(item.url));

    const firstByUrl = new Map<string, number>();
    canonicalUrls.forEach((url, index) => {
      const previous = firstByUrl.get(url);
      if (previous === undefined) {
        firstByUrl.set(url, index);
      } else {
        sets.union(previous, index);
      }
    });

    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        if (sets.find(i) === sets.find(j)) {
          continue;
        }
        const left = items[i]!;
        const right = items[j]!;
        const compatible = semanticallyCompatible(left, right);
        if (compatible) {
          sets.union(i, j);
          continue;
        }
        if (
          sameCategoryAndGeography(left, right) &&
          entitiesOverlap(left, right) &&
          jaccard(tokens[i]!, tokens[j]!) >= EVENT_SIMILARITY_THRESHOLD
        ) {
          sets.union(i, j);
        }
      }
    }

    const grouped = new Map<number, ClassifiedPoliticsItem[]>();
    items.forEach((item, index) => {
      const root = sets.find(index);
      const members = grouped.get(root) ?? [];
      members.push(item);
      grouped.set(root, members);
    });

    const events = [...grouped.values()].map((members) => {
      const sortedMembers = [...members].sort((left, right) =>
        canonicalPoliticsUrl(left.url).localeCompare(canonicalPoliticsUrl(right.url)),
      );
      const originals = collectedOriginalUrls(sortedMembers);
      const representative = [...sortedMembers].sort((left, right) =>
        compareRepresentatives(left, right, originals),
      )[0]!;
      const attribution = resolveAttribution(sortedMembers, representative);
      return {
        fingerprint: eventFingerprint(representative),
        representative,
        members: sortedMembers,
        claimOriginUrl: attribution.claimOriginUrl,
        claimOriginResolution: attribution.claimOriginResolution,
        independentSourceIds: independentSourceIds(sortedMembers),
      } satisfies PoliticsEvent;
    });

    return events.sort((left, right) => {
      const fingerprintOrder = left.fingerprint.localeCompare(right.fingerprint);
      if (fingerprintOrder !== 0) {
        return fingerprintOrder;
      }
      return left.claimOriginUrl.localeCompare(right.claimOriginUrl);
    });
  }
}
