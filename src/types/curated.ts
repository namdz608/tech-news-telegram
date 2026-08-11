import type { Article } from './article';

export interface CuratedCollectionResult {
  articles: Article[];
  successfulSourceCount: number;
  failedSourceCount: number;
}

export interface CuratedEntry {
  article: Article;
  topic: string;
  score: number;
}

export interface CuratedSelectionResult<TEntry extends CuratedEntry> {
  selected: TEntry[];
  eligibleCount: number;
  skippedSeenCount: number;
}

export interface CuratedMessage {
  text: string;
  url: string;
  imageUrl?: string;
}

export interface CuratedFlowDependencies<
  TEntry extends CuratedEntry,
  TMessage extends CuratedMessage,
> {
  collector: { collectLatest(): Promise<CuratedCollectionResult> };
  history: { seenUrls(): Promise<Set<string>> };
  selector: {
    select(articles: Article[], seen: ReadonlySet<string>): CuratedSelectionResult<TEntry>;
  };
  messageBuilder: { buildMessages(entries: TEntry[]): Promise<TMessage[]> };
  delivery: { send(messages: TMessage[]): Promise<void> };
}

export interface CuratedFlowOptions<TChannel extends string> {
  channel: TChannel;
  createAllSourcesFailedError(): Error;
}
