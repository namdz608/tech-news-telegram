import { describe, expect, it } from 'vitest';
import { RemoteOkAdapter } from '../../src/services/devops-jobs-remoteok.adapter';

const body = JSON.stringify([
  { legal: 'please link back' },
  {
    id: 10,
    position: 'DevOps Engineer',
    company: 'Acme',
    tags: ['devops'],
    location: 'Worldwide',
    description: '<p>Remote</p>',
    url: 'https://remoteok.com/remote-jobs/10',
    date: '2026-10-02T00:00:00.000Z',
    salary_min: 100000,
    salary_max: 140000,
  },
  { id: 11, company: 'Missing title' },
]);

describe('RemoteOkAdapter', () => {
  it('skips the legal object and incomplete rows', async () => {
    const adapter = new RemoteOkAdapter(async () => body);
    const jobs = await adapter.collect();
    expect(jobs).toEqual([{
      id: '10',
      sourceId: 'remoteok',
      sourceName: 'Remote OK',
      title: 'DevOps Engineer',
      company: 'Acme',
      url: 'https://remoteok.com/remote-jobs/10',
      location: 'Worldwide',
      description: '<p>Remote</p>',
      tags: ['devops'],
      salary: '100000-140000',
      publishedAt: '2026-10-02T00:00:00.000Z',
    }]);
  });

  it('throws when the body is not JSON', async () => {
    const adapter = new RemoteOkAdapter(async () => '<html></html>');
    await expect(adapter.collect()).rejects.toThrow();
  });
});
