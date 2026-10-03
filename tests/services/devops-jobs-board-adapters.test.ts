import { describe, expect, it } from 'vitest';
import { HimalayasAdapter } from '../../src/services/devops-jobs-himalayas.adapter';
import { RemotiveAdapter } from '../../src/services/devops-jobs-remotive.adapter';
import { WeWorkRemotelyAdapter } from '../../src/services/devops-jobs-weworkremotely.adapter';

describe('board adapters', () => {
  it('collects a Remotive job and ignores a failed sibling query', async () => {
    const adapter = new RemotiveAdapter(async (url) => {
      if (!url.includes('search=devops')) throw new Error('HTTP 429');
      return JSON.stringify({
        jobs: [{
          id: 7,
          title: 'SRE',
          company_name: 'Acme',
          candidate_required_location: 'Worldwide',
          url: 'https://remotive.com/remote-jobs/7',
          description: 'Remote',
          publication_date: '2026-10-02T00:00:00.000Z',
          salary: '$120k',
          tags: ['sre'],
        }],
      });
    });
    const jobs = await adapter.collect();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.salary).toBe('$120k');
    expect(jobs[0]?.sourceId).toBe('remotive');
  });

  it('reads the company from a We Work Remotely title', async () => {
    const adapter = new WeWorkRemotelyAdapter(async () => ({
      items: [{
        title: 'Acme: Platform Engineer',
        link: 'https://weworkremotely.com/remote-jobs/acme',
        content: '<p>Kubernetes</p>',
        isoDate: '2026-10-02T00:00:00.000Z',
      }],
    }));
    const jobs = await adapter.collect();
    expect(jobs[0]).toMatchObject({
      company: 'Acme',
      title: 'Platform Engineer',
      sourceId: 'weworkremotely',
    });
  });

  it('throws when every Himalayas query fails', async () => {
    const adapter = new HimalayasAdapter(async () => {
      throw new Error('HTTP 403');
    });
    await expect(adapter.collect()).rejects.toThrow(/queries failed/);
  });

  it('maps a Himalayas worldwide job', async () => {
    const adapter = new HimalayasAdapter(async (url) => {
      if (!url.includes('q=devops')) throw new Error('HTTP 429');
      return JSON.stringify({
        jobs: [{
          guid: 'abc',
          title: 'Cloud Engineer',
          companyName: 'Acme',
          description: 'Remote',
          applicationLink: 'https://himalayas.app/companies/acme/jobs/cloud',
          locationRestrictions: [],
          parentCategories: ['Engineering'],
          minSalary: 90,
          maxSalary: 120,
          pubDate: Date.parse('2026-10-02T00:00:00.000Z'),
        }],
      });
    });
    const jobs = await adapter.collect();
    expect(jobs[0]).toMatchObject({
      sourceId: 'himalayas',
      location: '',
      salary: '90-120',
      url: 'https://himalayas.app/companies/acme/jobs/cloud',
    });
  });
});
