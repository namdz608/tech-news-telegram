import type { DevopsJob } from '../types/devops-jobs';

export interface DevopsJobsSourceAdapter {
  readonly key: string;
  collect(): Promise<DevopsJob[]>;
}
