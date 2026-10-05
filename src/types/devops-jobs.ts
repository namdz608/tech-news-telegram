export interface DevopsJob {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  company: string;
  url: string;
  location: string;
  description: string;
  tags: readonly string[];
  salary?: string;
  publishedAt: string;
}

export interface DevopsJobsMessage {
  text: string;
  url: string;
}

export interface DevopsJobsCollectionResult {
  items: DevopsJob[];
  collectedCount: number;
  successfulSourceCount: number;
  failedSources: string[];
}

export interface DevopsJobsSelectionResult {
  selected: DevopsJob[];
  eligibleCount: number;
  skippedSeenCount: number;
}

export interface DevopsJobsFlowResult {
  sent: boolean;
  reason?: 'no_new_articles';
  channel: 'telegram-devops-jobs';
  messageCount: number;
  collectedCount: number;
  eligibleCount: number;
  skippedSeenCount: number;
  partial: boolean;
  failedSources: string[];
  language: 'vi';
}
