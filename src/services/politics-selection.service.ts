import { env } from '../config/env';
import type {
  PoliticsCandidate,
  PoliticsCategory,
  PoliticsEvent,
  PoliticsSelectionResult,
  PoliticsSourceItem,
  SourceTextStatus,
  VerificationState,
} from '../types/gold-politics';
import { PoliticsClassificationService, politicsCopySignature } from './politics-classification.service';
import { canonicalPoliticsUrl, PoliticsEventDedupeService } from './politics-event-dedupe.service';
import { PoliticsVerificationService } from './politics-verification.service';

export interface PoliticsSelectionOptions {
  maxArticles: number;
  maxGoldNews: number;
  maxPerSource: number;
}

const REASON_ORDER = [
  'leader-controversy',
  'high-impact-politics',
  'other-politics',
  'gold-market',
  'named-leader',
  'relevance',
  'age',
  'source-text',
  'verification',
  'independent-origins',
  'engagement',
] as const;

const HIGH_IMPACT_TERMS = [
  'election',
  'bau cu',
  'war',
  'chien tranh',
  'ceasefire',
  'ngung ban',
  'sanction',
  'trung phat',
  'corruption',
  'tham nhung',
  'indictment',
  'truy to',
  'arrest',
  'bat giu',
  'court',
  'toa an',
  'resignation',
  'tu chuc',
  'impeachment',
  'luan toi',
  'state of emergency',
  'tinh trang khan cap',
  'major policy',
  'chinh sach lon',
] as const;

const RELEVANCE_TERMS = [
  'controversy',
  'scandal',
  'allegation',
  'bribery',
  'corruption',
  'fraud',
  'abuse-of-power',
  'leak',
  'resignation',
  'indictment',
  'impeachment',
  'arrest',
  'pham-minh-chinh',
  'elon-musk',
  'dalai-lama',
  'trump',
  'prime-minister',
  'president',
  'minister',
  'chief-justice',
  'secretary-general',
  'ceo',
  'executive',
  'quan chuc',
  'public official',
  'public figure',
  'politician',
  'chinh tri gia',
  'tesla',
  'vingroup',
  'vietnam-parliament',
  'parliament',
  'government',
  'policy',
  'diplomacy',
  'election',
  'defense',
  'investigation',
  'dang cong san',
  'cong quyen',
  'supreme-court',
  'uk',
  'britain',
  'british',
  'nato',
  'un',
  'imf',
  'world-bank',
  'eu',
  'ukraine',
  'war',
  'conflict',
  'ceasefire',
  'sanction',
  'united-states',
  'china',
  'russia',
  'gold-price',
  'sjc',
  'doji',
  'pnj',
  'xau',
  'bullion',
  'usd',
  'central-bank',
  'interest-rate',
  'rates',
  'vietnam',
  'hanoi',
  'ho chi minh',
  'us',
  'usa',
  'london',
  'fed',
] as const;

const SOURCE_TEXT_POINTS: Record<SourceTextStatus, number> = {
  full: 6,
  'search-excerpt': 2,
  incomplete: 0,
};

const VERIFICATION_POINTS: Record<VerificationState, number> = {
  confirmed: 6,
  reported: 3,
  unverified: -6,
};

function validateOptions(options: PoliticsSelectionOptions): void {
  const { maxArticles, maxGoldNews, maxPerSource } = options;
  const goldCap = Number.isInteger(maxArticles) ? Math.min(3, maxArticles) : Number.NaN;
  const valid =
    Number.isInteger(maxArticles) &&
    Number.isInteger(maxGoldNews) &&
    Number.isInteger(maxPerSource) &&
    maxArticles >= 2 &&
    maxArticles <= 15 &&
    maxGoldNews >= 0 &&
    maxGoldNews <= goldCap &&
    maxPerSource >= 1 &&
    maxPerSource <= 3;
  if (!valid) {
    throw new RangeError('invalid-politics-selection-options');
  }
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function foldText(value: string): string {
  return compactWhitespace(
    value
      .normalize('NFKC')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}+/gu, '')
      .replace(/đ/g, 'd'),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasTerm(text: string, term: string): boolean {
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}-])${escapeRegExp(term)}(?![\\p{L}\\p{N}-])`, 'u');
  return pattern.test(text);
}

function eventText(event: PoliticsEvent): string {
  const representative = event.representative;
  return compactWhitespace(`${representative.title} ${representative.summary ?? ''}`);
}

function isHighImpact(text: string): boolean {
  const folded = foldText(text);
  const synonymized = politicsCopySignature(text);
  return HIGH_IMPACT_TERMS.some((term) => hasTerm(folded, term) || hasTerm(synonymized, term));
}

function relevancePoints(text: string): number {
  const synonymized = politicsCopySignature(text);
  const folded = foldText(text);
  const matched = new Set<string>();
  for (const term of RELEVANCE_TERMS) {
    if (hasTerm(synonymized, term) || hasTerm(folded, term)) {
      matched.add(term);
    }
  }
  return Math.min(10, matched.size);
}

function agePoints(publishedAt: string, now: Date): number {
  const published = Date.parse(publishedAt);
  if (!Number.isFinite(published)) {
    return 0;
  }
  const ageMs = now.getTime() - published;
  if (ageMs <= 6 * 3_600_000) {
    return 12;
  }
  if (ageMs <= 24 * 3_600_000) {
    return 8;
  }
  if (ageMs <= 48 * 3_600_000) {
    return 4;
  }
  return 0;
}

function engagementPoints(engagement: PoliticsSourceItem['engagement']): number {
  if (!engagement) {
    return 0;
  }
  let points = 0;
  if (Number.isFinite(engagement.likes) && (engagement.likes ?? 0) >= 100) {
    points += 1;
  }
  if (Number.isFinite(engagement.shares) && (engagement.shares ?? 0) >= 25) {
    points += 1;
  }
  if (Number.isFinite(engagement.comments) && (engagement.comments ?? 0) >= 50) {
    points += 1;
  }
  return Math.min(3, points);
}

function categoryScore(category: PoliticsCategory, highImpact: boolean): {
  tier: PoliticsCandidate['priorityTier'];
  key: (typeof REASON_ORDER)[number];
  points: number;
} {
  if (category === 'leader-controversy') {
    return { tier: 3, key: 'leader-controversy', points: 30 };
  }
  if (category === 'gold-market') {
    return { tier: 0, key: 'gold-market', points: 8 };
  }
  if (highImpact) {
    return { tier: 2, key: 'high-impact-politics', points: 24 };
  }
  return { tier: 1, key: 'other-politics', points: 15 };
}

function pushReason(
  reasons: string[],
  key: (typeof REASON_ORDER)[number],
  points: number,
): number {
  if (points === 0) {
    return 0;
  }
  const sign = points > 0 ? '+' : '';
  reasons.push(`${key}:${sign}${points}`);
  return points;
}

function historyUrls(event: PoliticsEvent): string[] {
  const urls = [
    event.claimOriginUrl,
    ...event.members.map((member) => member.url),
    ...event.members.map((member) => member.originAttribution.url),
    ...event.members.flatMap((member) => (member.quotedOriginUrl ? [member.quotedOriginUrl] : [])),
  ];
  return urls.map((url) => canonicalPoliticsUrl(url));
}

function canonicalizeSeen(seenUrls: ReadonlySet<string>): Set<string> {
  const seen = new Set<string>();
  for (const url of seenUrls) {
    seen.add(canonicalPoliticsUrl(url));
  }
  return seen;
}

function eventIsSeen(event: PoliticsEvent, seen: ReadonlySet<string>): boolean {
  return historyUrls(event).some((url) => seen.has(url));
}

function isVnAnchor(candidate: PoliticsCandidate): boolean {
  return (
    (candidate.primaryCategory === 'vietnam-politics' || candidate.primaryCategory === 'leader-controversy') &&
    (candidate.geographicScope === 'vietnam' || candidate.geographicScope === 'mixed')
  );
}

function isIntAnchor(candidate: PoliticsCandidate): boolean {
  return (
    (candidate.primaryCategory === 'international-politics' || candidate.primaryCategory === 'leader-controversy') &&
    (candidate.geographicScope === 'international' || candidate.geographicScope === 'mixed')
  );
}

function findDistinctAnchorPair(
  candidates: readonly PoliticsCandidate[],
): readonly [PoliticsCandidate, PoliticsCandidate] | undefined {
  for (const vietnam of candidates) {
    if (!isVnAnchor(vietnam)) continue;
    const international = candidates.find(
      (candidate) =>
        isIntAnchor(candidate) && candidate.eventFingerprint !== vietnam.eventFingerprint,
    );
    if (international) return [vietnam, international];
  }
  return undefined;
}

function compareCandidates(left: PoliticsCandidate, right: PoliticsCandidate): number {
  if (left.priorityTier !== right.priorityTier) {
    return right.priorityTier - left.priorityTier;
  }
  if (left.score !== right.score) {
    return right.score - left.score;
  }
  const fingerprintOrder = left.eventFingerprint.localeCompare(right.eventFingerprint);
  if (fingerprintOrder !== 0) {
    return fingerprintOrder;
  }
  return left.claimOriginUrl.localeCompare(right.claimOriginUrl);
}

function goldCount(selected: readonly PoliticsCandidate[]): number {
  return selected.filter((candidate) => candidate.primaryCategory === 'gold-market').length;
}

function sourceCount(selected: readonly PoliticsCandidate[], sourceQuotaKey: string): number {
  return selected.filter((candidate) => candidate.sourceQuotaKey === sourceQuotaKey).length;
}

export class PoliticsSelectionService {
  private readonly options: PoliticsSelectionOptions;

  constructor(
    private readonly classifier = new PoliticsClassificationService(),
    private readonly deduper = new PoliticsEventDedupeService(),
    private readonly verifier = new PoliticsVerificationService(),
    options: PoliticsSelectionOptions = {
      maxArticles: env.GOLD_POLITICS_MAX_ARTICLES,
      maxGoldNews: Math.min(env.GOLD_POLITICS_MAX_GOLD_NEWS, env.GOLD_POLITICS_MAX_ARTICLES),
      maxPerSource: 3,
    },
    private readonly now: () => Date = () => new Date(),
  ) {
    const copied: PoliticsSelectionOptions = {
      maxArticles: options.maxArticles,
      maxGoldNews: options.maxGoldNews,
      maxPerSource: options.maxPerSource,
    };
    validateOptions(copied);
    this.options = Object.freeze(copied);
  }

  select(items: readonly PoliticsSourceItem[], seenUrls: ReadonlySet<string>): PoliticsSelectionResult {
    const now = this.now();
    const classified = items.flatMap((item) => {
      const result = this.classifier.classify(item);
      return result ? [result] : [];
    });
    const events = this.deduper.cluster(classified);
    const seen = canonicalizeSeen(seenUrls);

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
    const skippedSeenCount = skippedFingerprints.size;

    const unseenCandidates = unseenEvents
      .map((event) => this.materialize(event, now))
      .sort(compareCandidates);
    const seenCandidates = seenEvents
      .map((event) => this.materialize(event, now))
      .sort(compareCandidates);
    let selected = this.pick(unseenCandidates);
    const replay = this.replayAnchors(selected, seenCandidates);
    if (replay.length > 0) {
      selected = this.pick([...unseenCandidates, ...replay].sort(compareCandidates));
    }
    return {
      selected,
      eligibleCount: unseenCandidates.length,
      skippedSeenCount,
    };
  }

  private replayAnchors(
    selected: readonly PoliticsCandidate[],
    seenCandidates: readonly PoliticsCandidate[],
  ): PoliticsCandidate[] {
    if (findDistinctAnchorPair(selected)) return [];

    const selectedFingerprints = new Set(selected.map((candidate) => candidate.eventFingerprint));
    const completingAnchor = seenCandidates.find(
      (candidate) =>
        !selectedFingerprints.has(candidate.eventFingerprint) &&
        findDistinctAnchorPair([...selected, candidate]) !== undefined,
    );
    if (completingAnchor) return [completingAnchor];

    if (!selected.some((candidate) => isVnAnchor(candidate) || isIntAnchor(candidate))) {
      const pair = findDistinctAnchorPair(seenCandidates);
      if (pair) return [...pair];
    }

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

  private materialize(event: PoliticsEvent, now: Date): PoliticsCandidate {
    const assessment = this.verifier.assess(event);
    const representative = event.representative;
    const text = eventText(event);
    const highImpact = isHighImpact(text);
    const category = categoryScore(representative.primaryCategory, highImpact);
    const reasons: string[] = [];
    let score = 0;

    score += pushReason(reasons, category.key, category.points);
    score += pushReason(reasons, 'named-leader', representative.claimEntities.length > 0 ? 12 : 0);
    score += pushReason(reasons, 'relevance', relevancePoints(text));
    score += pushReason(reasons, 'age', agePoints(representative.publishedAt, now));
    score += pushReason(reasons, 'source-text', SOURCE_TEXT_POINTS[representative.sourceTextStatus]);
    score += pushReason(reasons, 'verification', VERIFICATION_POINTS[assessment.state]);
    const additionalOrigins = Math.max(0, assessment.independentSourceIds.length - 1);
    score += pushReason(reasons, 'independent-origins', Math.min(8, additionalOrigins * 4));
    score += pushReason(reasons, 'engagement', engagementPoints(representative.engagement));

    const orderedReasons = [...reasons].sort(
      (left, right) =>
        REASON_ORDER.indexOf(left.slice(0, left.lastIndexOf(':')) as (typeof REASON_ORDER)[number]) -
        REASON_ORDER.indexOf(right.slice(0, right.lastIndexOf(':')) as (typeof REASON_ORDER)[number]),
    );

    const candidate: PoliticsCandidate = {
      ...representative,
      verificationState: assessment.state,
      eventFingerprint: event.fingerprint,
      claimOriginUrl: event.claimOriginUrl,
      claimOriginResolution: event.claimOriginResolution,
      priorityTier: category.tier,
      independentSourceIds: assessment.independentSourceIds,
      score,
      scoringReasons: orderedReasons,
      corroborationNote: assessment.corroborationNote,
    };
    if (assessment.conflictNote) {
      candidate.conflictNote = assessment.conflictNote;
    }
    return candidate;
  }

  private canTake(candidate: PoliticsCandidate, selected: readonly PoliticsCandidate[]): boolean {
    if (selected.length >= this.options.maxArticles) {
      return false;
    }
    if (candidate.primaryCategory === 'gold-market' && goldCount(selected) >= this.options.maxGoldNews) {
      return false;
    }
    if (sourceCount(selected, candidate.sourceQuotaKey) >= this.options.maxPerSource) {
      return false;
    }
    return true;
  }

  private pick(eligible: readonly PoliticsCandidate[]): PoliticsCandidate[] {
    const selected: PoliticsCandidate[] = [];
    const pickedOrigins = new Set<string>();
    const pickedFingerprints = new Set<string>();

    const take = (candidate: PoliticsCandidate | undefined): void => {
      if (
        !candidate ||
        pickedOrigins.has(candidate.claimOriginUrl) ||
        !this.canTake(candidate, selected)
      ) {
        return;
      }
      selected.push(candidate);
      pickedOrigins.add(candidate.claimOriginUrl);
      pickedFingerprints.add(candidate.eventFingerprint);
    };

    take(eligible.find((candidate) => isVnAnchor(candidate) && this.canTake(candidate, selected)));
    take(
      eligible.find(
        (candidate) =>
          isIntAnchor(candidate) &&
          !pickedFingerprints.has(candidate.eventFingerprint) &&
          this.canTake(candidate, selected),
      ),
    );

    for (const candidate of eligible) {
      take(candidate);
    }

    return selected.sort(compareCandidates);
  }
}
