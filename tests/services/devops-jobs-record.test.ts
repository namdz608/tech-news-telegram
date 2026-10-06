import { describe, expect, it } from 'vitest';
import { dedupeDevopsJobs, toDevopsJob } from '../../src/services/devops-jobs-record';

describe('dedupeDevopsJobs', () => {
  it('deduplicates tracking variants while retaining distinct job identifiers', () => {
    const urls = [
      'https://example.com/viewjob?jk=first&utm_source=devops',
      'https://example.com/viewjob?jk=first&utm_source=sre#details',
      'https://example.com/viewjob?jk=second',
    ];
    const jobs = urls.map((url) => toDevopsJob({
      id: url,
      sourceId: 'indeed',
      sourceName: 'Indeed',
      title: 'DevOps Engineer',
      company: 'Acme',
      url,
      publishedAt: '2026-10-06T00:00:00.000Z',
    })!);

    expect(dedupeDevopsJobs(jobs)).toEqual([jobs[0], jobs[2]]);
    expect(jobs.map((job) => job.url)).toEqual(urls);
  });
});
