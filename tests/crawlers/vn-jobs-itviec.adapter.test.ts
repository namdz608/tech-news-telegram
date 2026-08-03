import { describe, expect, it } from 'vitest';
import { parseItviecJobDetail } from '../../src/crawlers/vn-jobs/itviec.adapter';

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
    expect(details.description).toContain('Build and maintain CI/CD');
    expect(details.description).toContain('Yêu cầu:');
    expect(details.description).toContain('3 years DevOps');
    expect(details.skills).toEqual(expect.arrayContaining(['Kubernetes', 'AWS']));
  });
});
