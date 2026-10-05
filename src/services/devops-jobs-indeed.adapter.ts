import Parser from 'rss-parser';
import { DEVOPS_JOB_QUERIES, DEVOPS_JOB_SOURCE_URLS } from '../config/devops-jobs-sources';
import type { DevopsJob } from '../types/devops-jobs';
import { getDevopsJobsText } from './devops-jobs-http';
import { toDevopsJob } from './devops-jobs-record';
import { collectDevopsJobQueries } from './devops-jobs-search';

interface FeedItem {
  title?: string;
  link?: string;
  content?: string;
  isoDate?: string;
}

export class IndeedJobsAdapter {
  readonly key = 'indeed';

  constructor(
    private readonly load: (query: string) => Promise<{ items?: FeedItem[] }> = async (query) => {
      const url = `${DEVOPS_JOB_SOURCE_URLS.indeed}?q=${encodeURIComponent(query)}&l=Remote&fromage=3&sort=date`;
      return new Parser().parseString(await getDevopsJobsText(url));
    },
  ) {}

  collect(): Promise<DevopsJob[]> {
    return collectDevopsJobQueries(DEVOPS_JOB_QUERIES, (query) => this.one(query));
  }

  private async one(query: string): Promise<DevopsJob[]> {
    const feed = await this.load(query);
    if (!feed.items) throw new Error('Indeed feed has no items');
    return feed.items.flatMap((item) => {
      const split = item.title?.split(' - ') ?? [];
      const title = split[0]?.trim();
      const company = split.slice(1).join(' - ').trim();
      if (!title || !company || !item.link || !item.isoDate) return [];
      const job = toDevopsJob({
        id: item.link,
        sourceId: this.key,
        sourceName: 'Indeed',
        title,
        company,
        url: item.link,
        description: item.content,
        publishedAt: item.isoDate,
      });
      return job ? [job] : [];
    });
  }
}
