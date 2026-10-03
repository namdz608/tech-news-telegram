import type { DevopsJob, DevopsJobsSelectionResult } from '../types/devops-jobs';
import { normalizeUrl } from '../utils/normalize-url';
import { isEligibleDevopsJob } from './devops-jobs-filter';

const SOURCE_ORDER = [
  'remoteok',
  'remotive',
  'weworkremotely',
  'himalayas',
  'hn',
  'linkedin',
  'indeed',
];
const HOUR_MS = 36e5;

export class DevopsJobsSelectionService {
  constructor(
    private readonly maxJobs: number,
    private readonly maxPerSource: number,
    private readonly maxAgeHours: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  select(
    jobs: readonly DevopsJob[],
    seenUrls: ReadonlySet<string>,
  ): DevopsJobsSelectionResult {
    const fresh = jobs.filter((job) => this.freshEnough(job));
    const seen = new Set([...seenUrls].map((url) => normalizeUrl(url)));
    let skippedSeenCount = 0;
    const unseen = fresh.filter((job) => {
      if (!seen.has(normalizeUrl(job.url))) return true;
      skippedSeenCount += 1;
      return false;
    });
    const ranked = [...unseen].sort((left, right) => this.compare(left, right));
    const selected: DevopsJob[] = [];
    const perSource = new Map<string, number>();
    for (const job of ranked) {
      if (selected.length >= this.maxJobs) break;
      const used = perSource.get(job.sourceId) ?? 0;
      if (used >= this.maxPerSource) continue;
      perSource.set(job.sourceId, used + 1);
      selected.push(job);
    }
    return {
      selected,
      eligibleCount: unseen.length,
      skippedSeenCount,
    };
  }

  private freshEnough(job: DevopsJob): boolean {
    if (!isEligibleDevopsJob(job)) return false;
    if (job.sourceId === 'hn') return true;
    const publishedAt = Date.parse(job.publishedAt);
    if (!Number.isFinite(publishedAt)) return false;
    return this.now().getTime() - publishedAt <= this.maxAgeHours * HOUR_MS;
  }

  private compare(left: DevopsJob, right: DevopsJob): number {
    const age = Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
    if (age !== 0) return age;
    const source = SOURCE_ORDER.indexOf(left.sourceId) - SOURCE_ORDER.indexOf(right.sourceId);
    if (source !== 0) return source;
    return left.url.localeCompare(right.url);
  }
}
