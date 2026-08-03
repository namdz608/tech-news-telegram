/**
 * Parse TopCV HTML fixture shaped like live SEO search results + detail pages.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  crawlTopcv,
  enrichTopcvJobDetails,
  inferSkillsFromText,
  parseJobDetail,
} from '../../src/crawlers/vn-jobs/topcv.adapter';
import type { VnJobListing } from '../../src/crawlers/vn-jobs/types';

const topcvSeoHtml = `
<html><body>
  <div class="job-item-search-result" data-job-id="2187900">
    <div class="avatar">
      <a href="https://www.topcv.vn/viec-lam/cloud-engineer/2187900.html">
        <img data-src="https://cdn.example/logo.jpg" alt="LG CNS" />
      </a>
    </div>
    <div class="body">
      <h3 class="title">
        <a href="https://www.topcv.vn/viec-lam/cloud-engineer/2187900.html?x=1">
          <span data-original-title="Cloud Engineer">Cloud Engineer</span>
        </a>
      </h3>
      <a class="company" href="/cong-ty/lg">Công Ty TNHH LG CNS VIỆT NAM</a>
      <label class="title-salary">Thoả thuận</label>
      <label class="salary"><span>Thoả thuận</span></label>
      <label class="exp"><span>1 năm</span></label>
      <div class="address"><span class="city-text">Hà Nội</span></div>
      <div class="address label-update">Đăng 5 ngày trước</div>
    </div>
  </div>
</body></html>
`;

const topcvDetailHtml = `
<html><body>
  <div class="box-job-information-detail-item">
    <h2 class="box-job-information-detail-item__title--title">Mô tả công việc</h2>
    <div class="box-job-information-detail-item__text">
      <ul><li>Design cloud architecture on AWS</li><li>Build CI/CD pipelines</li></ul>
    </div>
  </div>
  <div class="box-job-information-detail-item">
    <h2 class="box-job-information-detail-item__title--title">Yêu cầu ứng viên</h2>
    <div class="box-job-information-detail-item__text">
      <ul><li>3 years DevOps experience</li><li>Kubernetes</li></ul>
    </div>
  </div>
  <div class="required-tag__content">
    <h3 class="required-tag__content--title">Kỹ năng cần có</h3>
    <div class="required-tag__content--desc">AWS, Kubernetes, Terraform, Linux</div>
  </div>
</body></html>
`;

const topcvDetailWithoutSkillsHtml = `
<html><body>
  <div class="box-job-information-detail-item">
    <h2 class="box-job-information-detail-item__title--title">Mô tả công việc</h2>
    <div class="box-job-information-detail-item__text">
      <p>Vận hành On-premise, Prometheus, Grafana, CheckMK, OpenStack và CI/CD.</p>
    </div>
  </div>
</body></html>
`;

describe('parseJobDetail', () => {
  it('extracts description and skills from detail HTML', () => {
    const details = parseJobDetail(topcvDetailHtml);

    expect(details.description).toMatch(/-/);
    expect(details.description).toContain('Design cloud architecture on AWS');
    expect(details.description).toContain('3 years DevOps experience');
    expect(details.skills).toEqual(['AWS', 'Kubernetes', 'Terraform', 'Linux']);
  });
});

describe('inferSkillsFromText', () => {
  it('extracts tech keywords when TopCV omits skills section', () => {
    expect(inferSkillsFromText('Dùng Prometheus, Grafana, OpenStack và CI/CD trên Linux')).toEqual(
      expect.arrayContaining(['Prometheus', 'Grafana', 'OpenStack', 'CI/CD', 'Linux']),
    );
  });
});

describe('crawlTopcv', () => {
  it('parses list cards without fetching details yet', async () => {
    const jobs = await crawlTopcv('devops', {
      async get(url) {
        expect(url).toContain('tim-viec-lam-devops-tai-ha-noi');
        return { data: topcvSeoHtml, status: 200 };
      },
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      title: 'Cloud Engineer',
      url: 'https://www.topcv.vn/viec-lam/cloud-engineer/2187900.html',
      company: 'Công Ty TNHH LG CNS VIỆT NAM',
      location: 'Hà Nội',
      salaryText: 'Thoả thuận',
      experienceText: '1 năm',
      description: 'Yêu cầu kinh nghiệm: 1 năm',
      sourceId: 'topcv',
    });
  });

  it('returns empty when Cloudflare blocks and FlareSolverr is unset', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const jobs = await crawlTopcv('devops', {
      async get() {
        return { data: '<html>Attention Required! | Cloudflare</html>', status: 403 };
      },
    });
    expect(jobs).toEqual([]);
    warn.mockRestore();
  });
});

describe('enrichTopcvJobDetails', () => {
  it('fills description/skills from detail page', async () => {
    const jobs: VnJobListing[] = [
      {
        title: 'Cloud Engineer',
        url: 'https://www.topcv.vn/viec-lam/cloud-engineer/2187900.html',
        description: 'Yêu cầu kinh nghiệm: 1 năm',
        sourceId: 'topcv',
        sourceName: 'TopCV',
      },
    ];

    await enrichTopcvJobDetails(jobs, {
      async get(url) {
        expect(url).toContain('/viec-lam/cloud-engineer/');
        return { data: topcvDetailHtml, status: 200 };
      },
    });

    expect(jobs[0].description).toContain('Design cloud architecture on AWS');
    expect(jobs[0].skills).toEqual(['AWS', 'Kubernetes', 'Terraform', 'Linux']);
  });

  it('infers skills from description when page has no skills section', async () => {
    const jobs: VnJobListing[] = [
      {
        title: 'DevOps Engineer',
        url: 'https://www.topcv.vn/viec-lam/devops-engineer/2257231.html',
        description: 'Yêu cầu kinh nghiệm: 2 năm',
        sourceId: 'topcv',
        sourceName: 'TopCV',
      },
    ];

    await enrichTopcvJobDetails(jobs, {
      async get() {
        return { data: topcvDetailWithoutSkillsHtml, status: 200 };
      },
    });

    expect(jobs[0].description).toContain('Prometheus');
    expect(jobs[0].skills).toEqual(
      expect.arrayContaining(['Prometheus', 'Grafana', 'CheckMK', 'OpenStack', 'CI/CD']),
    );
  });
});
