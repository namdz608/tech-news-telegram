import { describe, expect, it } from 'vitest';
import { crawlItviec, enrichItviecJobDetails, parseItviecJobDetail } from '../../src/crawlers/vn-jobs/itviec.adapter';

const detailHtml = `
<html><body>
  <h2>Job description</h2>
  <p>Build and maintain CI/CD.</p>
  <ul><li>Operate Kubernetes</li><li>Improve monitoring</li></ul>
  <h2>Your skills and experience</h2>
  <ul><li>3 years DevOps</li><li>Docker</li></ul>
  <h2>Why you'll love working here</h2>
  <p>Benefits</p>
  <a class="itag">Kubernetes</a>
  <a class="itag">AWS</a>
</body></html>
`;

describe('parseItviecJobDetail', () => {
  it('extracts description, requirements and skill tags', () => {
    const details = parseItviecJobDetail(detailHtml);

    expect(details.description).toContain('Mô tả:');
    expect(details).toMatchObject({ sourceTextStatus: 'full' });
    expect(details).not.toHaveProperty('retrievalBackend');
    expect(details.description).toContain('Build and maintain CI/CD');
    expect(details.description).toContain('Yêu cầu:');
    expect(details.description).toContain('3 years DevOps');
    expect(details.skills).toEqual(expect.arrayContaining(['Kubernetes', 'AWS']));
  });
});

describe('ITviec native JD metadata', () => {
  const list = '<div class="job-card"><h3><a href="/it-jobs/native-company-devops">DevOps Engineer</a></h3><a class="logo-employer-card" title="Native Company"></a><div class="salary">USD 3000</div><ul><li>Listing excerpt</li></ul></div>';
  it('retains JD status while recording a Jina detail response', async () => {
    const jobs = await crawlItviec('devops', { get: async () => ({ data: list, status: 200 }) });
    await enrichItviecJobDetails(jobs, { get: async () => ({ data: detailHtml, status: 200, retrievalBackend: 'jina' as const }) });
    expect(jobs[0]).toMatchObject({ sourceTextStatus: 'full', retrievalBackend: 'jina', company: 'Native Company', salaryText: 'USD 3000' });
    expect(jobs[0].description).toContain('Build and maintain CI/CD');
  });


  it('distinguishes listing excerpts from native full descriptions without changing salary/company', async () => {
    const jobs = await crawlItviec('devops', { get: async () => ({ data: list, status: 200 }) });
    expect(jobs[0]).toMatchObject({ company: 'Native Company', salaryText: 'USD 3000', sourceTextStatus: 'search-excerpt' });
    expect(jobs[0].retrievalBackend).toBeUndefined();
    await enrichItviecJobDetails(jobs, { get: async () => ({ data: detailHtml, status: 200 }) });
    expect(jobs[0]).toMatchObject({ company: 'Native Company', salaryText: 'USD 3000', sourceTextStatus: 'full', retrievalBackend: 'direct' });
    expect(jobs[0].description).toContain('Build and maintain CI/CD');
  });

  it('marks section truncation incomplete while retaining trustworthy native provenance', async () => {
    const jobs = await crawlItviec('devops', { get: async () => ({ data: list, status: 200 }) });
    await enrichItviecJobDetails(jobs, { get: async () => ({ data: detailHtml.replace('Build and maintain CI/CD.', 'Native JD '.repeat(300)), status: 200 }) });
    expect(jobs[0]).toMatchObject({ sourceTextStatus: 'incomplete', retrievalBackend: 'direct', company: 'Native Company', salaryText: 'USD 3000' });
    expect(jobs[0].description!.length).toBeLessThanOrEqual(2800);
  });
});
