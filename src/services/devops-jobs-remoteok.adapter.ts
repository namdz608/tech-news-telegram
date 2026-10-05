import { DEVOPS_JOB_SOURCE_URLS } from '../config/devops-jobs-sources';
import type { DevopsJob } from '../types/devops-jobs';
import { getDevopsJobsText } from './devops-jobs-http';
import { salaryRange, toDevopsJob } from './devops-jobs-record';

interface RemoteOkRow {
  id?: number | string;
  position?: string;
  company?: string;
  tags?: string[];
  location?: string;
  description?: string;
  url?: string;
  date?: string;
  salary_min?: number;
  salary_max?: number;
}

export class RemoteOkAdapter {
  readonly key = 'remoteok';

  constructor(private readonly getText: (url: string) => Promise<string> = getDevopsJobsText) {}

  async collect(): Promise<DevopsJob[]> {
    const parsed: unknown = JSON.parse(await this.getText(DEVOPS_JOB_SOURCE_URLS.remoteok));
    if (!Array.isArray(parsed)) throw new Error('Remote OK payload is not an array');
    return parsed.flatMap((row: RemoteOkRow) => {
      if (!row.position || row.id === undefined || !row.url || !row.date || !row.company) {
        return [];
      }
      const job = toDevopsJob({
        id: String(row.id),
        sourceId: this.key,
        sourceName: 'Remote OK',
        title: row.position,
        company: row.company,
        url: row.url,
        location: row.location,
        description: row.description,
        tags: row.tags,
        salary: salaryRange(row.salary_min, row.salary_max),
        publishedAt: row.date,
      });
      return job ? [job] : [];
    });
  }
}
