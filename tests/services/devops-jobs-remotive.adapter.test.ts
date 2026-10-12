import { describe, expect, it } from 'vitest';
import { RemotiveAdapter } from '../../src/services/devops-jobs-remotive.adapter';

function row(description?: string) {
  return { id: 1, title: 'DevOps Engineer', company_name: 'Native Company', url: 'https://remotive.com/jobs/1', publication_date: '2026-10-06T00:00:00Z', salary: 'USD 100k', description };
}

describe('RemotiveAdapter native JD', () => {
  it('preserves API company, salary, description and provenance', async () => {
    const jobs = await new RemotiveAdapter(async () => JSON.stringify({ jobs: [row('<p>Operate Kubernetes at Native Company</p>')] })).collect();
    expect(jobs[0]).toMatchObject({ company: 'Native Company', salary: 'USD 100k', description: '<p>Operate Kubernetes at Native Company</p>', sourceTextStatus: 'full', retrievalBackend: 'direct' });
  });

  it('marks a job without an API description incomplete', async () => {
    const jobs = await new RemotiveAdapter(async () => JSON.stringify({ jobs: [row()] })).collect();
    expect(jobs[0]).toMatchObject({ company: 'Native Company', salary: 'USD 100k', description: '', sourceTextStatus: 'incomplete' });
    expect(jobs[0].retrievalBackend).toBeUndefined();
  });
});
