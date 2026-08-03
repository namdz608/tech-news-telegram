import { describe, expect, it, vi } from 'vitest';
import { VnJobsCrawler } from '../../src/crawlers/vn-jobs.crawler';
import type { VnJobsHttpClient } from '../../src/crawlers/vn-jobs/types';

const itviecHtml = `
<div class="job-card">
  <span class="small-text text-dark-grey">Posted 1 day ago</span>
  <h3><a href="https://itviec.com/it-jobs/mid-sr-devops-engineer-english-rakuten">Mid/Sr DevOps Engineer</a></h3>
  <a class="logo-employer-card" title="Rakuten Fintech Vietnam Co., Ltd." href="/companies/rakuten"></a>
  <div class="salary">Sign in to view salary</div>
  <div class="text-rich-grey text-truncate" title="Ha Noi">Ha Noi</div>
  <ul><li>Hybrid working</li></ul>
</div>
`;

const topcvHtml = `
<div class="job-item">
  <h3 class="title"><a href="/viec-lam/devops-engineer-123.html">DevOps Engineer TopCV</a></h3>
  <div class="company-name">Acme VN</div>
  <div class="address">Hà Nội</div>
  <div class="salary">20-30 triệu</div>
  <div class="experience">1-2 năm</div>
</div>
`;

const vietnamworksPayload = {
  data: [
    {
      jobTitle: 'MLOps/ DevOps Engineer',
      jobUrl: '',
      jobId: 2084513,
      alias: 'mlops-devops-engineer',
      companyName: 'VINSMART FUTURE',
      prettySalary: 'Thương lượng',
      jobLevel: 'Experienced (non-manager)',
      companyLogo: 'https://images.vietnamworks.com/logo.jpg',
      workingLocations: [{ cityNameVI: 'Hà Nội' }],
      jobDescription: '<p>Operate cloud infrastructure and CI/CD</p>',
      skills: [{ skillName: 'Kubernetes' }, { skillName: 'AWS' }],
    },
    {
      jobTitle: 'Fresher DevOps',
      jobUrl: '',
      jobId: 1,
      alias: 'fresher-devops',
      companyName: 'Startup',
      jobLevel: 'Fresher',
      workingLocations: [{ cityName: 'Ha Noi' }],
      jobRequirement: '<p>Basic Linux knowledge</p>',
    },
    {
      jobTitle: 'DevOps Engineer HCMC',
      jobUrl: '',
      jobId: 2,
      alias: 'devops-hcmc',
      companyName: 'South Co',
      jobLevel: 'Experienced (non-manager)',
      workingLocations: [{ cityNameVI: 'Hồ Chí Minh' }],
    },
  ],
};

function createHttp(overrides?: Partial<VnJobsHttpClient>): VnJobsHttpClient {
  return {
    async get(url: string) {
      if (url.includes('itviec.com')) {
        return { data: itviecHtml, status: 200 };
      }

      if (url.includes('topcv.vn')) {
        return { data: topcvHtml, status: 200 };
      }

      return { data: '', status: 404 };
    },
    async post() {
      return { data: vietnamworksPayload, status: 200 };
    },
    ...overrides,
  };
}

describe('VnJobsCrawler', () => {
  it('merges boards, maps articles, and assigns devops topic', async () => {
    const { articles, boardCounts, crawledCounts, matchedCount } = await new VnJobsCrawler(createHttp()).crawl({
      role: 'devops',
      maxResults: 10,
    });

    expect(articles.length).toBeGreaterThanOrEqual(3);
    expect(crawledCounts).toEqual({ topcv: 1, itviec: 1, vietnamworks: 3 });
    expect(boardCounts).toEqual({ topcv: 1, itviec: 1, vietnamworks: 2 });
    expect(matchedCount).toBeGreaterThanOrEqual(articles.length);
    expect(articles.every((article) => article.topics.includes('devops'))).toBe(true);
    expect(articles.map((article) => article.sourceName).sort()).toEqual(
      expect.arrayContaining(['ITviec', 'TopCV', 'VietnamWorks']),
    );
    expect(articles.every((article) => article.jobDetails?.location?.includes('Hà Nội') || article.jobDetails?.location?.includes('Ha Noi'))).toBe(true);
    expect(articles.every((article) => Boolean(article.jobDetails?.description))).toBe(true);
    expect(articles.some((article) => article.imageUrl === 'https://images.vietnamworks.com/logo.jpg')).toBe(true);
    expect(articles.map((article) => article.title)).not.toContain('DevOps Engineer HCMC');
  });

  it('dedupes by url and respects maxResults', async () => {
    const { articles } = await new VnJobsCrawler(createHttp()).crawl({
      role: 'devops',
      maxResults: 2,
    });

    expect(articles).toHaveLength(2);
    expect(new Set(articles.map((article) => article.url)).size).toBe(2);
  });

  it('filters experienceYears but keeps missing experience cards', async () => {
    const { articles } = await new VnJobsCrawler(createHttp()).crawl({
      role: 'devops',
      experienceYears: '1-2',
      maxResults: 10,
    });

    const titles = articles.map((article) => article.title);
    expect(titles).toContain('DevOps Engineer TopCV');
    expect(titles).toContain('Mid/Sr DevOps Engineer');
    expect(titles).toContain('MLOps/ DevOps Engineer');
    expect(titles).not.toContain('Fresher DevOps');
  });

  it('drops irrelevant titles that do not match the requested role', async () => {
    const { articles } = await new VnJobsCrawler(
      createHttp({
        async get(url: string) {
          if (url.includes('itviec.com')) {
            return {
              data: `
                <div class="job-card">
                  <h3><a href="https://itviec.com/it-jobs/manual-qa-qc">Máy kiểm tra thủ công (QA QC)</a></h3>
                  <a class="logo-employer-card" title="QI GROUP"></a>
                  <div class="text-rich-grey text-truncate" title="Ha Noi">Ha Noi</div>
                </div>
                <div class="job-card">
                  <h3><a href="https://itviec.com/it-jobs/devops-ok">DevOps Engineer</a></h3>
                  <a class="logo-employer-card" title="Acme"></a>
                  <div class="text-rich-grey text-truncate" title="Ha Noi">Ha Noi</div>
                </div>
              `,
              status: 200,
            };
          }

          return { data: '<html>Attention Required! | Cloudflare</html>', status: 403 };
        },
        async post() {
          return { data: { data: [] }, status: 200 };
        },
      }),
    ).crawl({ role: 'devops', maxResults: 10 });

    expect(articles.map((article) => article.title)).toEqual(['DevOps Engineer']);
  });

  it('returns empty when boards fail or are blocked', async () => {
    const { articles, boardCounts } = await new VnJobsCrawler(
      createHttp({
        async get() {
          return { data: '<html>Attention Required! Cloudflare</html>', status: 403 };
        },
        async post() {
          throw new Error('network down');
        },
      }),
    ).crawl({ role: 'devops', maxResults: 5 });

    expect(articles).toEqual([]);
    expect(boardCounts).toEqual({ topcv: 0, itviec: 0, vietnamworks: 0 });
  });

  it('assigns jobs-english topic and skips ITviec for english-teacher', async () => {
    const getMock = vi.fn(async (url: string) => {
      if (url.includes('topcv.vn')) {
        return {
          data: `
            <div class="job-item">
              <h3 class="title"><a href="/viec-lam/giao-vien-tieng-anh-1.html">Giáo viên tiếng Anh mầm non</a></h3>
              <div class="company-name">Sunshine School</div>
              <div class="address">Hà Nội</div>
            </div>
          `,
          status: 200,
        };
      }

      return { data: '<html>Attention Required! | Cloudflare</html>', status: 403 };
    });

    const { articles, boardCounts } = await new VnJobsCrawler({
      get: getMock,
      async post() {
        return { data: { data: [] }, status: 200 };
      },
    }).crawl({ role: 'english-teacher', maxResults: 5 });

    expect(articles).toHaveLength(1);
    expect(boardCounts.topcv).toBe(1);
    expect(articles[0].topics).toEqual(['jobs-english']);
    expect(getMock.mock.calls.every(([url]) => !String(url).includes('itviec.com'))).toBe(true);
  });
});
