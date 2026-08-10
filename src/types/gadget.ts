import type { Article } from './article';

export type GadgetTopicKey =
  | 'mobile'
  | 'apple'
  | 'computers'
  | 'components'
  | 'av-accessories'
  | 'smart-devices';

export interface GadgetTopicDefinition {
  key: GadgetTopicKey;
  label: string;
  icon: string;
  keywords: string[];
  fallbackImageUrl: string;
  fallbackWhyImportant: string;
}

export interface GadgetDigestEntry {
  article: Article;
  topic: GadgetTopicKey;
  score: number;
}

export interface GadgetSelectionResult {
  selected: GadgetDigestEntry[];
  eligibleCount: number;
  skippedSeenCount: number;
}

export interface GadgetMessage {
  text: string;
  url: string;
  imageUrl?: string;
  article: Article;
  topic: GadgetTopicKey;
}
