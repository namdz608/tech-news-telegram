import { env } from '../config/env';
import type {
  DevopsInfraCollectionResult,
  DevopsInfraSourceItem,
} from '../types/devops-infra';
import { normalizeUrl } from '../utils/normalize-url';
import type {
  DevopsInfraSourceAdapter,
  DevopsInfraSourceAdapterResult,
} from './devops-infra-source.adapter';

const DEFAULT_ADAPTER_TIMEOUT_MS = 60_000;

export class DevopsInfraSourceService {
  constructor(
    private readonly adapters: DevopsInfraSourceAdapter[],
    private readonly maxAgeHours = env.DEVOPS_INFRA_MAX_AGE_HOURS,
    private readonly now = () => new Date(),
    private readonly adapterTimeoutMs = DEFAULT_ADAPTER_TIMEOUT_MS,
  ) {}

  async collectLatest(): Promise<DevopsInfraCollectionResult> {
    const enabled = this.adapters.filter((adapter) => adapter.isEnabled());
    const settled = await Promise.allSettled(
      enabled.map((adapter) => this.collectAdapter(adapter)),
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

  private collectAdapter(
    adapter: DevopsInfraSourceAdapter,
  ): Promise<DevopsInfraSourceAdapterResult> {
    const started = Date.now();
    console.warn('devops-infra collect start', adapter.key);
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        console.warn(
          'devops-infra collect timeout',
          adapter.key,
          `${Date.now() - started}ms`,
        );
        reject(new Error(`adapter-timeout:${adapter.key}`));
      }, this.adapterTimeoutMs);

      adapter.collect().then(
        (result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          console.warn(
            'devops-infra collect done',
            adapter.key,
            result.items.length,
            `${Date.now() - started}ms`,
          );
          resolve(result);
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          console.warn(
            'devops-infra collect failed',
            adapter.key,
            `${Date.now() - started}ms`,
          );
          reject(error);
        },
      );
    });
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
