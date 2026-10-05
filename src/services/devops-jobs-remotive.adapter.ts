import { DEVOPS_JOB_QUERIES, DEVOPS_JOB_SOURCE_URLS } from '../config/devops-jobs-sources';
import type { DevopsJob } from '../types/devops-jobs';
import { getDevopsJobsText } from './devops-jobs-http';
import { toDevopsJob } from './devops-jobs-record';
import { collectDevopsJobQueries } from './devops-jobs-search';

interface RemotiveJob {
  id?: number | string;
  title?: string;
  company_name?: string;
  candidate_required_location?: string;
  url?: string;
  description?: string;
  publication_date?: string;
  salary?: string;
  tags?: string[];
}

export class RemotiveAdapter {
  readonly key = 'remotive';

  constructor(private readonly getText: (url: string) => Promise<string> = getDevopsJobsText) {}

  collect(): Promise<DevopsJob[]> {
    return collectDevopsJobQueries(DEVOPS_JOB_QUERIES, (query) => this.one(query));
  }

  private async one(query: string): Promise<DevopsJob[]> {
    const url = `${DEVOPS_JOB_SOURCE_URLS.remotive}?search=${encodeURIComponent(query)}&limit=50`;
    const parsed: unknown = JSON.parse(await this.getText(url));
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { jobs?: unknown }).jobs)) {
      throw new Error('Remotive payload is not a job list');
    }
    return ((parsed as { jobs: RemotiveJob[] }).jobs).flatMap((row) => {
      if (row.id === undefined || !row.title || !row.company_name || !row.url || !row.publication_date) {
        return [];
      }
      const job = toDevopsJob({
        id: String(row.id),
        sourceId: this.key,
        sourceName: 'Remotive',
        title: row.title,
        company: row.company_name,
        url: row.url,
        location: row.candidate_required_location,
        description: row.description,
        tags: row.tags,
        salary: row.salary,
        publishedAt: row.publication_date,
      });
      return job ? [job] : [];
    });
  }
}
