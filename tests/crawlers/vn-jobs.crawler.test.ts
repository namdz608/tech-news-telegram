import { describe, expect, it } from 'vitest';
import { VnJobsCrawler } from '../../src/crawlers/vn-jobs.crawler';
import type { VnJobsHttpClient } from '../../src/crawlers/vn-jobs/types';

const itviecHtml = `
<div class="job-card">
  <span class="small-text text-dark-grey">Posted 1 day ago</span>
  <h3><a href="https://itviec.com/it-jobs/mid-sr-devops-engineer-english-rakuten">Mid/Sr DevOps Engineer</a></h3>
  <a class="logo-employer-card" title="Rakuten Fintech Vietnam Co., Ltd." href="/companies/rakuten"></a>
  <div class="salary">Sign in to view salary</div>
  <div class="text-rich-grey text-truncate" title="Ho Chi Minh">Ho Chi Minh</div>
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
      jobUrl: 'https://www.vietnamworks.com/mlops-devops-engineer-2084513-jv',
      companyName: 'VINSMART FUTURE',
      prettySalary: 'Thương lượng',
      jobLevel: 'Experienced (non-manager)',
      companyLogo: 'https://images.vietnamworks.com/logo.jpg',
      workingLocations: [{ cityNameVI: 'Hồ Chí Minh' }],
    },
    {
      jobTitle: 'Fresher DevOps',
      jobUrl: 'https://www.vietnamworks.com/fresher-devops-1-jv',
      companyName: 'Startup',
      jobLevel: 'Fresher',
      workingLocations: [{ cityName: 'Ha Noi' }],
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
    const articles = await new VnJobsCrawler(createHttp()).crawl({
      role: 'devops',
      maxResults: 10,
    });

    expect(articles.length).toBeGreaterThanOrEqual(3);
    expect(articles.every((article) => article.topics.includes('devops'))).toBe(true);
    expect(articles.map((article) => article.sourceName).sort()).toEqual(
      expect.arrayContaining(['ITviec', 'TopCV', 'VietnamWorks']),
    );
  });

  it('dedupes by url and respects maxResults', async () => {
    const articles = await new VnJobsCrawler(createHttp()).crawl({
      role: 'devops',
      maxResults: 2,
    });

    expect(articles).toHaveLength(2);
    expect(new Set(articles.map((article) => article.url)).size).toBe(2);
  });

  it('filters experienceYears but keeps missing experience cards', async () => {
    const articles = await new VnJobsCrawler(createHttp()).crawl({
      role: 'devops',
      experienceYears: '1-2',
      maxResults: 10,
    });

    const titles = articles.map((article) => article.title);
    expect(titles).toContain('DevOps Engineer TopCV');
    expect(titles).toContain('Mid/Sr DevOps Engineer');
    expect(titles).not.toContain('Fresher DevOps');
    expect(titles).not.toContain('MLOps/ DevOps Engineer');
  });

  it('returns empty when boards fail or are blocked', async () => {
    const articles = await new VnJobsCrawler(
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
  });

  it('assigns jobs-english topic for english-teacher role', async () => {
    const articles = await new VnJobsCrawler(
      createHttp({
        async get(url: string) {
          if (url.includes('itviec.com')) {
            return {
              data: `
                <div class="job-card">
                  <h3><a href="https://itviec.com/it-jobs/english-teacher-abc">English Teacher Kindergarten</a></h3>
                  <a class="logo-employer-card" title="Sunshine School"></a>
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
    ).crawl({ role: 'english-teacher', maxResults: 5 });

    expect(articles).toHaveLength(1);
    expect(articles[0].topics).toEqual(['jobs-english']);
  });
});
