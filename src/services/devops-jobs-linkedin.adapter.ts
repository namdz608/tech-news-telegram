import * as cheerio from 'cheerio';
import { DEVOPS_JOB_QUERIES, DEVOPS_JOB_SOURCE_URLS } from '../config/devops-jobs-sources';
import type { DevopsJob } from '../types/devops-jobs';
import { getDevopsJobsText } from './devops-jobs-http';
import { toDevopsJob } from './devops-jobs-record';
import { collectDevopsJobQueries } from './devops-jobs-search';

export class LinkedInJobsAdapter {
  readonly key = 'linkedin';

  constructor(private readonly getText: (url: string) => Promise<string> = getDevopsJobsText) {}

  collect(): Promise<DevopsJob[]> {
    return collectDevopsJobQueries(DEVOPS_JOB_QUERIES, (query) => this.one(query));
  }

  private async one(query: string): Promise<DevopsJob[]> {
    const url = `${DEVOPS_JOB_SOURCE_URLS.linkedin}?keywords=${encodeURIComponent(query)}&location=Worldwide&f_WT=2&start=0`;
    const html = await this.getText(url);
    if (/authwall/i.test(html) || /loginCsrfParam/.test(html)) {
      throw new Error('LinkedIn auth wall');
    }
    const $ = cheerio.load(html);
    const cards = $('.base-card, .job-search-card').toArray();
    return cards.flatMap((element) => {
      const card = $(element);
      const href = card.find('a.base-card__full-link, a[href*="/jobs/view/"]').attr('href') ?? '';
      const datetime = card.find('time').attr('datetime') ?? '';
      const job = toDevopsJob({
        id: href,
        sourceId: this.key,
        sourceName: 'LinkedIn',
        title: card.find('.base-search-card__title, h3').text(),
        company: card.find('.base-search-card__subtitle, h4').text(),
        url: href,
        location: card.find('.job-search-card__location').text(),
        publishedAt: datetime,
      });
      return job ? [job] : [];
    });
  }
}
