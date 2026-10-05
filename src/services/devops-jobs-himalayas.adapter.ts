import { DEVOPS_JOB_QUERIES, DEVOPS_JOB_SOURCE_URLS } from '../config/devops-jobs-sources';
import type { DevopsJob } from '../types/devops-jobs';
import { getDevopsJobsText } from './devops-jobs-http';
import { salaryRange, toDevopsJob } from './devops-jobs-record';
import { collectDevopsJobQueries } from './devops-jobs-search';

interface HimalayasJob {
  guid?: string;
  title?: string;
  companyName?: string;
  description?: string;
  applicationLink?: string;
  locationRestrictions?: string[];
  parentCategories?: string[];
  categories?: string[];
  minSalary?: number;
  maxSalary?: number;
  pubDate?: number | string;
}

export class HimalayasAdapter {
  readonly key = 'himalayas';

  constructor(private readonly getText: (url: string) => Promise<string> = getDevopsJobsText) {}

  collect(): Promise<DevopsJob[]> {
    return collectDevopsJobQueries(DEVOPS_JOB_QUERIES, (query) => this.one(query));
  }

  private async one(query: string): Promise<DevopsJob[]> {
    const url = `${DEVOPS_JOB_SOURCE_URLS.himalayas}?q=${encodeURIComponent(query)}&worldwide=true&sort=recent`;
    const parsed: unknown = JSON.parse(await this.getText(url));
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { jobs?: unknown }).jobs)) {
      throw new Error('Himalayas payload is not a job list');
    }
    return ((parsed as { jobs: HimalayasJob[] }).jobs).flatMap((row) => {
      const publishedAt = typeof row.pubDate === 'number'
        ? new Date(row.pubDate).toISOString()
        : row.pubDate;
      if (!row.guid || !row.title || !row.companyName || !row.applicationLink || !publishedAt) {
        return [];
      }
      const job = toDevopsJob({
        id: row.guid,
        sourceId: this.key,
        sourceName: 'Himalayas',
        title: row.title,
        company: row.companyName,
        url: row.applicationLink,
        location: (row.locationRestrictions ?? []).join(', '),
        description: row.description,
        tags: [...(row.parentCategories ?? []), ...(row.categories ?? [])],
        salary: salaryRange(row.minSalary, row.maxSalary),
        publishedAt,
      });
      return job ? [job] : [];
    });
  }
}
