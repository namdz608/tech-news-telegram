import { describe, expect, it } from 'vitest';
import { IndeedJobsAdapter } from '../../src/services/devops-jobs-indeed.adapter';
import { LinkedInJobsAdapter } from '../../src/services/devops-jobs-linkedin.adapter';

const card = `
  <li class="base-card">
    <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/15"></a>
    <h3 class="base-search-card__title">DevOps Engineer</h3>
    <h4 class="base-search-card__subtitle">Acme</h4>
    <span class="job-search-card__location">Worldwide</span>
    <time datetime="2026-10-02"></time>
  </li>`;

describe('public search adapters', () => {
  it('parses a LinkedIn guest card', async () => {
    const adapter = new LinkedInJobsAdapter(async (url) => {
      if (!url.includes('keywords=devops')) throw new Error('HTTP 403');
      return card;
    });
    const jobs = await adapter.collect();
    expect(jobs[0]).toMatchObject({
      sourceId: 'linkedin',
      company: 'Acme',
      title: 'DevOps Engineer',
      location: 'Worldwide',
      publishedAt: '2026-10-02T00:00:00.000Z',
    });
  });

  it('treats a LinkedIn auth wall on every query as failure', async () => {
    const adapter = new LinkedInJobsAdapter(async () => '<html>authwall login</html>');
    await expect(adapter.collect()).rejects.toThrow(/queries failed/);
  });

  it('treats a LinkedIn 200 with no cards as zero jobs', async () => {
    const adapter = new LinkedInJobsAdapter(async () => '<html><body>No matching jobs</body></html>');
    expect(await adapter.collect()).toEqual([]);
  });

  it('reads an Indeed RSS item', async () => {
    const adapter = new IndeedJobsAdapter(async (query) => {
      if (query !== 'devops') throw new Error('HTTP 403');
      return {
        items: [{
          title: 'DevOps Engineer - Acme',
          link: 'https://www.indeed.com/viewjob?jk=abc',
          content: 'Remote worldwide',
          isoDate: '2026-10-02T00:00:00.000Z',
        }],
      };
    });
    const jobs = await adapter.collect();
    expect(jobs[0]).toMatchObject({
      sourceId: 'indeed',
      title: 'DevOps Engineer',
      company: 'Acme',
    });
  });
});
