import type { Article } from './article';

export type HealthTopicKey =
  | 'sleep-recovery'
  | 'nutrition-metabolism'
  | 'movement-musculoskeletal'
  | 'mental-wellbeing'
  | 'prevention-daily-life'
  | 'conditions-medicine-research';

export type HealthEvidenceKind =
  | 'guidance'
  | 'public-health-alert'
  | 'drug-safety'
  | 'research'
  | 'medical-news';

export interface HealthTopicDefinition {
  key: HealthTopicKey;
  label: string;
  icon: string;
  keywords: string[];
  fallbackImageUrl: string;
  fallbackSafeTakeaway: string;
  fallbackEvidenceNote: string;
}

export interface HealthDigestEntry {
  article: Article;
  topic: HealthTopicKey;
  evidence: HealthEvidenceKind;
  score: number;
}

export interface HealthSelectionResult {
  selected: HealthDigestEntry[];
  eligibleCount: number;
  skippedSeenCount: number;
}

export interface HealthMessage {
  text: string;
  url: string;
  imageUrl?: string;
  article: Article;
  topic: HealthTopicKey;
  evidence: HealthEvidenceKind;
}
