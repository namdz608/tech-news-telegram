import type { TopicKey } from './topic';

export interface Article {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  summary?: string;
  imageUrl?: string;
  author?: string;
  publishedAt?: string;
  collectedAt: string;
  topics: TopicKey[];
}
