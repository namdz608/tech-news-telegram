import Parser from 'rss-parser';
import { DEVOPS_JOB_SOURCE_URLS } from '../config/devops-jobs-sources';
import type { DevopsJob } from '../types/devops-jobs';
import { getDevopsJobsText } from './devops-jobs-http';
import { toDevopsJob } from './devops-jobs-record';

interface FeedItem {
  title?: string;
  link?: string;
  content?: string;
  isoDate?: string;
}

export class WeWorkRemotelyAdapter {
  readonly key = 'weworkremotely';

  constructor(
    private readonly load: () => Promise<{ items?: FeedItem[] }> = async () => {
      const xml = await getDevopsJobsText(DEVOPS_JOB_SOURCE_URLS.weworkremotely);
      return new Parser().parseString(xml);
    },
  ) {}

  async collect(): Promise<DevopsJob[]> {
    const feed = await this.load();
    if (!feed.items) throw new Error('We Work Remotely feed has no items');
    return feed.items.flatMap((item) => {
      const split = item.title?.split(':') ?? [];
      const company = split[0]?.trim();
      const title = split.slice(1).join(':').trim();
      if (!company || !title || !item.link || !item.isoDate) return [];
      const job = toDevopsJob({
        id: item.link,
        sourceId: this.key,
        sourceName: 'We Work Remotely',
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
