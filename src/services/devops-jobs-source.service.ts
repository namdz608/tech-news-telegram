import type { DevopsJob, DevopsJobsCollectionResult } from '../types/devops-jobs';
import type { DevopsJobsSourceAdapter } from './devops-jobs-source.adapter';

export class DevopsJobsSourceService {
  constructor(private readonly adapters: readonly DevopsJobsSourceAdapter[]) {}

  async collectLatest(): Promise<DevopsJobsCollectionResult> {
    const settled = await Promise.allSettled(
      this.adapters.map((adapter) => adapter.collect()),
    );
    const items: DevopsJob[] = [];
    const failedSources: string[] = [];
    settled.forEach((result, index) => {
      const key = this.adapters[index]?.key ?? `source-${index}`;
      if (result.status === 'fulfilled') items.push(...result.value);
      else failedSources.push(key);
    });
    return {
      items,
      collectedCount: items.length,
      successfulSourceCount: this.adapters.length - failedSources.length,
      failedSources,
    };
  }
}
