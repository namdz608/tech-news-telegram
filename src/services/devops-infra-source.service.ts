import { env } from '../config/env';
import type {
  DevopsInfraCollectionResult,
  DevopsInfraSourceItem,
} from '../types/devops-infra';
import { normalizeUrl } from '../utils/normalize-url';
import type { DevopsInfraSourceAdapter } from './devops-infra-source.adapter';

export class DevopsInfraSourceService {
  constructor(
    private readonly adapters: DevopsInfraSourceAdapter[],
    private readonly maxAgeHours = env.DEVOPS_INFRA_MAX_AGE_HOURS,
    private readonly now = () => new Date(),
  ) {}

  async collectLatest(): Promise<DevopsInfraCollectionResult> {
    const enabled = this.adapters.filter((adapter) => adapter.isEnabled());
    const settled = await Promise.allSettled(
      enabled.map((adapter) => adapter.collect()),
    );
    const collected: DevopsInfraSourceItem[] = [];
    const failedSources: string[] = [];
    let successfulSourceCount = 0;

    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        collected.push(...result.value.items);
        successfulSourceCount += result.value.successfulSourceCount;
        failedSources.push(...result.value.failedSources);
        return;
      }

      failedSources.push(enabled[index].key);
    });

    const items = this.normalizeFilterAndDedupe(collected);

    return {
      items,
      collectedCount: items.length,
      successfulSourceCount,
      failedSources: [...new Set(failedSources)],
    };
  }

  private normalizeFilterAndDedupe(
    collected: DevopsInfraSourceItem[],
  ): DevopsInfraSourceItem[] {
    const oldestAllowed =
      this.now().getTime() - this.maxAgeHours * 60 * 60 * 1000;
    const seenUrls = new Set<string>();
    const items: DevopsInfraSourceItem[] = [];

    for (const item of collected) {
      if (!item.title.trim() && !item.body.trim()) continue;

      const publishedAt = Date.parse(item.publishedAt);
      const discoveredAt = Date.parse(item.discoveredAt);
      const timestamp = Number.isFinite(publishedAt)
        ? publishedAt
        : discoveredAt;
      if (!Number.isFinite(timestamp) || timestamp < oldestAllowed) continue;

      let url: string;
      try {
        url = normalizeUrl(item.url);
        const protocol = new URL(url).protocol;
        if (protocol !== 'http:' && protocol !== 'https:') continue;
      } catch {
        continue;
      }

      if (seenUrls.has(url)) continue;
      seenUrls.add(url);
      items.push({ ...item, url });
    }

    return items;
  }
}
