import type { Article } from './article';

export type GoldProviderKey = 'sjc' | 'doji' | 'pnj' | 'xau-usd';
export type GoldDisplayUnit = 'million-vnd-per-tael' | 'usd-per-troy-ounce';
export type GoldSourceUnit =
  | 'thousand-vnd-per-tael'
  | 'thousand-vnd-per-chi'
  | 'vnd-per-tael'
  | 'vnd-per-chi'
  | 'usd-per-troy-ounce';
export type GoldQuoteFailureCode =
  | 'fetch-failed'
  | 'invalid-payload'
  | 'ambiguous-unit'
  | 'invalid-timestamp';

export class GoldPriceAdapterError extends Error {
  constructor(readonly code: GoldQuoteFailureCode) {
    super(code);
    this.name = 'GoldPriceAdapterError';
  }
}

export function isGoldPriceAdapterError(error: unknown): error is GoldPriceAdapterError {
  const code = error instanceof Error && 'code' in error ? error.code : undefined;
  return (
    (error instanceof GoldPriceAdapterError ||
      (error instanceof Error && error.name === 'GoldPriceAdapterError')) &&
    (code === 'fetch-failed' ||
      code === 'invalid-payload' ||
      code === 'ambiguous-unit' ||
      code === 'invalid-timestamp')
  );
}

export function normalizeGoldPriceAdapterError(error: unknown): GoldQuoteFailureCode {
  return isGoldPriceAdapterError(error) ? error.code : 'fetch-failed';
}

export interface GoldPriceSource {
  providerKey: GoldProviderKey;
  providerName: string;
  instrumentKey: string;
  instrumentName: string;
  sourceUrl: string;
  displayUnit: GoldDisplayUnit;
}

export type ParsedGoldQuote =
  | {
      quoteKind: 'buy-sell';
      buy: number;
      sell: number;
      sourceUnit: Exclude<GoldSourceUnit, 'usd-per-troy-ounce'>;
      sourceTimestamp: string;
    }
  | {
      quoteKind: 'spot';
      spot: number;
      sourceUnit: 'usd-per-troy-ounce';
      sourceTimestamp: string;
    };

export type GoldMovementUnavailable = {
  status: 'not-available';
  reason: 'no-previous-quote' | 'unit-mismatch' | 'source-regression' | 'history-unavailable';
};
export type BuySellMovement =
  | {
      status: 'available';
      previousSourceTimestamp: string;
      buyDelta: number;
      sellDelta: number;
    }
  | GoldMovementUnavailable;
export type SpotMovement =
  | { status: 'available'; previousSourceTimestamp: string; spotDelta: number }
  | GoldMovementUnavailable;

export type GoldQuote =
  | (GoldPriceSource & {
      status: 'fresh' | 'stale';
      collectedAt: string;
      sourceUnit: Exclude<GoldSourceUnit, 'usd-per-troy-ounce'>;
      sourceTimestamp: string;
      quoteKind: 'buy-sell';
      buy: number;
      sell: number;
      movement: BuySellMovement;
    })
  | (GoldPriceSource & {
      status: 'fresh' | 'stale';
      collectedAt: string;
      sourceUnit: 'usd-per-troy-ounce';
      sourceTimestamp: string;
      quoteKind: 'spot';
      spot: number;
      movement: SpotMovement;
    })
  | (GoldPriceSource & {
      status: 'unavailable';
      collectedAt: string;
      failureReason: GoldQuoteFailureCode;
    });

export interface GoldPriceAdapter {
  readonly source: GoldPriceSource;
  fetch(): Promise<ParsedGoldQuote>;
}

export type NormalizedGoldObservation =
  | (GoldPriceSource & {
      status: 'fresh' | 'stale';
      collectedAt: string;
      sourceUnit: Exclude<GoldSourceUnit, 'usd-per-troy-ounce'>;
      sourceTimestamp: string;
      quoteKind: 'buy-sell';
      buy: number;
      sell: number;
    })
  | (GoldPriceSource & {
      status: 'fresh' | 'stale';
      collectedAt: string;
      sourceUnit: 'usd-per-troy-ounce';
      sourceTimestamp: string;
      quoteKind: 'spot';
      spot: number;
    });

export type StoredGoldQuote =
  | (GoldPriceSource & {
      sourceUnit: Exclude<GoldSourceUnit, 'usd-per-troy-ounce'>;
      sourceTimestamp: string;
      quoteKind: 'buy-sell';
      buy: number;
      sell: number;
      recordedAt: string;
    })
  | (GoldPriceSource & {
      sourceUnit: 'usd-per-troy-ounce';
      sourceTimestamp: string;
      quoteKind: 'spot';
      spot: number;
      recordedAt: string;
    });

export interface GoldPriceSnapshot {
  collectedAt: string;
  quotes: GoldQuote[];
  successfulProviderCount: number;
  failedSources: string[];
}

export type DiscoveryChannel =
  | 'rss'
  | 'web'
  | 'x'
  | 'reddit'
  | 'facebook'
  | 'tiktok'
  | 'telegram';
export type PoliticsCategory =
  | 'gold-market'
  | 'vietnam-politics'
  | 'international-politics'
  | 'leader-controversy';
export type GeographicScope = 'vietnam' | 'international' | 'mixed';
// `confirmed` is reserved for a future vetted final-record adapter; current V1 live adapters cannot emit it.
export type VerificationState = 'confirmed' | 'reported' | 'unverified';
export type SourceTextStatus = 'full' | 'search-excerpt' | 'incomplete';
export type EvidenceKind =
  | 'official-final'
  | 'primary-document'
  | 'identified-report'
  | 'social-claim'
  | 'anonymous-rumor';
export type ClaimStance = 'supports' | 'denies' | 'neutral';
export type ClaimModality = 'established' | 'reported' | 'alleged' | 'possible';
export type EvidentiaryEffect = 'establishes' | 'records-claim' | 'denies' | 'mentions';

export interface EvidenceAssertion {
  semanticClaimKey: string;
  claimText: string;
  stance: ClaimStance;
  modality: ClaimModality;
  effect: EvidentiaryEffect;
  kind: EvidenceKind;
  sourceId: string;
  sourceUrl: string;
  evidenceOriginKey: string; // stable publisher/account identity, never a per-document URL
}

export interface PoliticsSearchQuery {
  key: string;
  text: string;
  discoveryHint?: 'facebook' | 'tiktok' | 'telegram';
}

export interface PoliticsSourceItem extends Article {
  publishedAt: string;
  discoveryChannel: DiscoveryChannel;
  discoveredAt: string;
  originalAuthor?: string;
  originalAccount?: string;
  originalUrl?: string;
  quotedOriginUrl?: string;
  syndicationKey?: string;
  sourceQuotaKey: string;
  sourceTextStatus: SourceTextStatus;
  evidenceKind: EvidenceKind;
  evidentiaryEffect: EvidentiaryEffect;
  evidenceOriginKey: string; // stable publisher/account identity for independence accounting
  originAttribution: {
    url: string;
    account?: string;
    publishedAt: string;
    discoveredAt: string;
  };
}

export interface ClassifiedPoliticsItem extends PoliticsSourceItem {
  primaryCategory: PoliticsCategory;
  geographicScope: GeographicScope;
  semanticClaimKey: string;
  claimEntities: string[];
  claimStance: ClaimStance;
  claimModality: ClaimModality;
  evidenceAssertions: EvidenceAssertion[];
}

export interface PoliticsCandidate extends ClassifiedPoliticsItem {
  verificationState: VerificationState;
  eventFingerprint: string;
  claimOriginUrl: string;
  claimOriginResolution: 'collected-original' | 'representative-source';
  priorityTier: 0 | 1 | 2 | 3;
  independentSourceIds: string[];
  score: number;
  scoringReasons: string[];
  corroborationNote: string;
  conflictNote?: string;
}

export interface PoliticsEvent {
  fingerprint: string;
  representative: ClassifiedPoliticsItem;
  members: ClassifiedPoliticsItem[];
  claimOriginUrl: string;
  claimOriginResolution: 'collected-original' | 'representative-source';
  independentSourceIds: string[];
}

export interface PoliticsCollectionResult {
  items: PoliticsSourceItem[];
  collectedCount: number;
  successfulSourceCount: number;
  failedSourceCount: number;
  failedSources: string[];
}

export interface PoliticsSelectionResult {
  selected: PoliticsCandidate[];
  eligibleCount: number;
  skippedSeenCount: number;
}

export interface PoliticsMessage {
  text: string;
  url: string;
  candidate: PoliticsCandidate;
}

export interface GoldPoliticsFlowResult {
  sent: true;
  channel: 'telegram-gold-politics';
  priceMessageCount: 1;
  newsMessageCount: number;
  collectedCount: number;
  eligibleCount: number;
  skippedSeenCount: number;
  partial: boolean;
  failedSources: string[];
  language: 'vi';
}
