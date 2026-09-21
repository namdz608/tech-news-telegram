import { env } from "../config/env";
import { devopsInfraCategoryKeywords } from "../config/devops-infra-topics";
import type {
  DevopsInfraCandidate,
  DevopsInfraCategory,
  DevopsInfraSelectionResult,
  DevopsInfraSourceItem,
  SolutionConfidence,
} from "../types/devops-infra";
import { normalizeUrl } from "../utils/normalize-url";
import { classifyDevopsInfraItem } from "./devops-infra-classification.service";
import { dedupeDevopsInfraCandidates } from "./devops-infra-dedupe.service";

const HOUR_MS = 36e5;
const MAX_AGE_HOURS = 72;
const MAX_PER_CATEGORY = 2;
const MAX_CLOUD_FAMILY = 4;
const MAX_PER_SOURCE = 2;
const CLOUD_FAMILY = new Set<DevopsInfraCategory>([
  "cloud-aws",
  "cloud-gcp",
  "cloud-azure",
]);

const SOLUTION_POINTS: Record<SolutionConfidence, number> = {
  accepted: 40,
  "highly-voted": 30,
  "author-confirmed": 25,
  anecdotal: 10,
  none: 0,
};

type SelectionInput = DevopsInfraSourceItem | DevopsInfraCandidate;

function isCandidate(item: SelectionInput): item is DevopsInfraCandidate {
  return "item" in item && "category" in item && "fingerprint" in item;
}

function canonicalUrl(url: string): string {
  try {
    return normalizeUrl(url);
  } catch {
    return url.trim();
  }
}

function validCandidate(
  candidate: DevopsInfraCandidate,
  now: Date,
): boolean {
  const publishedAt = Date.parse(candidate.item.publishedAt);
  if (!Number.isFinite(publishedAt)) return false;

  try {
    const protocol = new URL(candidate.item.url).protocol;
    if (protocol !== "http:" && protocol !== "https:") return false;
  } catch {
    return false;
  }

  return now.getTime() - publishedAt <= MAX_AGE_HOURS * HOUR_MS;
}

function includesKeyword(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`,
    "iu",
  ).test(text);
}

function categoryKeywordHits(candidate: DevopsInfraCandidate): number {
  const text = [
    candidate.item.title,
    candidate.item.summary,
    candidate.item.body,
  ].join(" ");
  return devopsInfraCategoryKeywords[candidate.category].filter((keyword) =>
    includesKeyword(text, keyword),
  ).length;
}

function scoreCandidate(
  candidate: DevopsInfraCandidate,
  now: Date,
): DevopsInfraCandidate {
  const publishedAt = Date.parse(candidate.item.publishedAt);
  const ageHours = Math.max(0, (now.getTime() - publishedAt) / HOUR_MS);
  const freshness = Math.max(0, 72 - Math.floor(ageHours));
  const relevance = categoryKeywordHits(candidate);
  const solution = SOLUTION_POINTS[candidate.solutionConfidence];
  const completeness =
    (candidate.environment !== "unknown" ? 8 : 0) +
    (candidate.rootCause ? 5 : 0) +
    Math.min(10, candidate.solutionSteps.length * 2);
  const rawEngagement = candidate.item.engagement?.score ?? 0;
  const engagementScore = Number.isFinite(rawEngagement)
    ? Math.max(0, rawEngagement)
    : 0;
  const engagement = Math.min(
    20,
    Math.floor(Math.log2(1 + engagementScore)),
  );
  const score = freshness + relevance + solution + completeness + engagement;
  const scoreReasons: string[] = [];

  if (freshness > 0) scoreReasons.push(`freshness:${freshness}`);
  if (relevance > 0) scoreReasons.push(`relevance:${relevance}`);
  if (solution > 0)
    scoreReasons.push(`solution:${candidate.solutionConfidence}`);
  if (completeness > 0) scoreReasons.push(`completeness:${completeness}`);
  if (engagement > 0) scoreReasons.push(`engagement:${engagement}`);

  return { ...candidate, score, scoreReasons };
}

function compareCandidates(
  left: DevopsInfraCandidate,
  right: DevopsInfraCandidate,
): number {
  return (
    right.score - left.score ||
    left.item.url.localeCompare(right.item.url)
  );
}

export class DevopsInfraSelectionService {
  constructor(
    private readonly maxArticles = env.DEVOPS_INFRA_MAX_ARTICLES,
    private readonly maxIncidents = env.DEVOPS_INFRA_MAX_INCIDENTS,
    private readonly now: () => Date = () => new Date(),
  ) {}

  select(
    items: readonly SelectionInput[],
    seenUrls: ReadonlySet<string>,
  ): DevopsInfraSelectionResult {
    const now = this.now();

    // 1. Classify each item; drop undefined.
    const classified = items
      .map((item) =>
        isCandidate(item) ? item : classifyDevopsInfraItem(item),
      )
      .filter(
        (candidate): candidate is DevopsInfraCandidate =>
          candidate !== undefined && validCandidate(candidate, now),
      );

    // 2. Drop seen URLs; count skips.
    const canonicalSeen = new Set(
      [...seenUrls].map((url) => canonicalUrl(url)),
    );
    let skippedSeenCount = 0;
    const unseen = classified.filter((candidate) => {
      if (!canonicalSeen.has(canonicalUrl(candidate.item.url))) return true;
      skippedSeenCount += 1;
      return false;
    });

    // 3. Dedupe.
    const deduped = dedupeDevopsInfraCandidates(unseen);

    // 4. Score remaining.
    const scored = deduped.map((candidate) => scoreCandidate(candidate, now));
    const ranked = [...scored].sort(compareCandidates);
    const selected: DevopsInfraCandidate[] = [];
    const selectedUrls = new Set<string>();

    const canTake = (candidate: DevopsInfraCandidate): boolean => {
      if (selected.length >= this.maxArticles) return false;
      if (
        candidate.kind === "incident" &&
        selected.filter((entry) => entry.kind === "incident").length >=
          this.maxIncidents
      )
        return false;
      if (
        selected.filter((entry) => entry.category === candidate.category)
          .length >= MAX_PER_CATEGORY
      )
        return false;
      if (
        CLOUD_FAMILY.has(candidate.category) &&
        selected.filter((entry) => CLOUD_FAMILY.has(entry.category)).length >=
          MAX_CLOUD_FAMILY
      )
        return false;
      if (
        selected.filter(
          (entry) =>
            entry.item.sourceQuotaKey === candidate.item.sourceQuotaKey,
        ).length >= MAX_PER_SOURCE
      )
        return false;
      return true;
    };

    const take = (candidate: DevopsInfraCandidate | undefined): void => {
      if (
        !candidate ||
        selectedUrls.has(candidate.item.url) ||
        !canTake(candidate)
      )
        return;
      selected.push(candidate);
      selectedUrls.add(candidate.item.url);
    };

    // 5. Seed deterministic cloud and on-prem coverage anchors.
    take(ranked.find((candidate) => candidate.environment === "cloud"));
    take(ranked.find((candidate) => candidate.environment === "onprem"));

    // 6–7. Backfill by score while enforcing every cap, then stop at max.
    for (const candidate of ranked) {
      if (selected.length >= this.maxArticles) break;
      take(candidate);
    }

    return {
      selected,
      eligibleCount: scored.length,
      skippedSeenCount,
    };
  }
}
