import { describe, expect, it } from 'vitest';
import { crawlVietnamworks } from '../../src/crawlers/vn-jobs/vietnamworks.adapter';

function hit(jobDescription?: string) {
  return { jobTitle: 'DevOps Engineer', jobUrl: 'https://www.vietnamworks.com/native-devops-1-jv', companyName: 'Native Company', prettySalary: 'USD 3000', jobDescription };
}

async function collect(jobDescription?: string) {
  return crawlVietnamworks('devops', { get: async () => ({ data: '' }), post: async () => ({ data: { data: [hit(jobDescription)] }, status: 200 }) }, 5);
}

describe('VietnamWorks native JD metadata', () => {
  it('marks an untruncated API description full and retains company/salary', async () => {
    const jobs = await collect('<p>Operate Kubernetes and maintain native infrastructure</p>');
    expect(jobs[0]).toMatchObject({ description: 'Operate Kubernetes and maintain native infrastructure', company: 'Native Company', salaryText: 'USD 3000', sourceTextStatus: 'full', retrievalBackend: 'direct' });
  });

  it('marks native API truncation incomplete with direct provenance', async () => {
    const jobs = await collect('Native JD '.repeat(300));
    expect(jobs[0]).toMatchObject({ sourceTextStatus: 'incomplete', retrievalBackend: 'direct', company: 'Native Company', salaryText: 'USD 3000' });
    expect(jobs[0].description!.length).toBeLessThanOrEqual(1600);
  });

  it('does not claim a native JD was fetched when the API omits it', async () => {
    const jobs = await collect();
    expect(jobs[0].sourceTextStatus).toBe('incomplete');
    expect(jobs[0].retrievalBackend).toBeUndefined();
  });
});
