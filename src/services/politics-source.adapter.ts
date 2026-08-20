import type { PoliticsSourceItem } from '../types/gold-politics';

export interface PoliticsSourceAdapterResult {
  items: PoliticsSourceItem[];
  successfulSourceCount: number;
  failedSources: string[];
}

export interface PoliticsSourceAdapter {
  readonly key: string;
  isEnabled(): boolean;
  collect(): Promise<PoliticsSourceAdapterResult>;
}
