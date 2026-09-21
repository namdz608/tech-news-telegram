export type DevopsDiscoveryChannel =
  | 'reddit'
  | 'stackexchange'
  | 'hn'
  | 'web'
  | 'x'
  | 'discord'
  | 'facebook'
  | 'telegram';

export type DevopsInfraCategory =
  | 'k8s-containers'
  | 'cloud-aws'
  | 'cloud-gcp'
  | 'cloud-azure'
  | 'onprem-selfhosted'
  | 'networking'
  | 'observability-sre'
  | 'cicd'
  | 'db-storage'
  | 'iam-secrets';

export type DevopsEnvironment = 'cloud' | 'onprem' | 'hybrid' | 'unknown';
export type DevopsInfraKind = 'problem-solution' | 'incident';
export type SolutionConfidence =
  | 'accepted'
  | 'highly-voted'
  | 'author-confirmed'
  | 'anecdotal'
  | 'none';
export type IncidentVerification = 'confirmed' | 'reported' | 'unverified';
export type SourceTextStatus = 'full' | 'search-excerpt' | 'incomplete';

export interface DevopsInfraSearchQuery {
  key: string;
  text: string;
  discoveryHint?: 'facebook' | 'telegram' | 'discord';
}

export interface DevopsInfraSourceItem {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  summary: string;
  body: string;
  imageUrl?: string;
  author?: string;
  publishedAt: string;
  collectedAt: string;
  discoveredAt: string;
  discoveryChannel: DevopsDiscoveryChannel;
  communityKey: string;
  sourceQuotaKey: string;
  sourceTextStatus: SourceTextStatus;
  answers: readonly DevopsInfraAnswer[];
  engagement?: { score?: number; comments?: number };
}

export interface DevopsInfraAnswer {
  body: string;
  score?: number;
  accepted?: boolean;
  authorConfirmed?: boolean;
}

export interface DevopsInfraCandidate {
  item: DevopsInfraSourceItem;
  kind: DevopsInfraKind;
  category: DevopsInfraCategory;
  environment: DevopsEnvironment;
  problem: string;
  rootCause?: string;
  solutionSteps: readonly string[];
  solutionConfidence: SolutionConfidence;
  verification?: IncidentVerification;
  fingerprint: string;
  score: number;
  scoreReasons: readonly string[];
}

export interface DevopsInfraMessage {
  text: string;
  url: string;
  imageUrl?: string;
}

export interface DevopsInfraSelectionResult {
  selected: DevopsInfraCandidate[];
  eligibleCount: number;
  skippedSeenCount: number;
}

export interface DevopsInfraCollectionResult {
  items: DevopsInfraSourceItem[];
  collectedCount: number;
  successfulSourceCount: number;
  failedSources: string[];
}

export interface DevopsInfraFlowResult {
  sent: true | false;
  reason?: 'no_new_articles';
  channel: 'telegram-devops-infra';
  messageCount: number;
  collectedCount: number;
  eligibleCount: number;
  skippedSeenCount: number;
  partial: boolean;
  failedSources: string[];
  language: 'vi';
}
