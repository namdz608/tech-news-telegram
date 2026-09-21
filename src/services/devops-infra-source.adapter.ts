import type { DevopsInfraSourceItem } from '../types/devops-infra';

export interface DevopsInfraSourceAdapterResult {
  items: DevopsInfraSourceItem[];
  successfulSourceCount: number;
  failedSources: string[];
}

export interface DevopsInfraSourceAdapter {
  readonly key: string;
  isEnabled(): boolean;
  collect(): Promise<DevopsInfraSourceAdapterResult>;
}
