/**
 * Điều phối crawl TopCV / ITviec / VietnamWorks và map sang Article[].
 */
import axios from 'axios';
import { env } from '../config/env';
import type { Article } from '../types/article';
import type { TopicKey } from '../types/topic';
import { compactText } from '../utils/text';
import { matchesExperience } from './vn-jobs/experience';
import { crawlItviec, enrichItviecJobDetails } from './vn-jobs/itviec.adapter';
import { matchesLocation } from './vn-jobs/location';
import { matchesRole } from './vn-jobs/role-match';
import { crawlTopcv, enrichTopcvJobDetails } from './vn-jobs/topcv.adapter';
import { crawlVietnamworks } from './vn-jobs/vietnamworks.adapter';
import type { JobRole, VnJobListing, VnJobsCrawlOptions, VnJobsHttpClient } from './vn-jobs/types';

// Board VN chặn bot UA (403); dùng browser UA riêng cho luồng jobs.
const VN_JOBS_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function createDefaultHttp(): VnJobsHttpClient {
  const client = axios.create({
    timeout: env.REQUEST_TIMEOUT_MS,
    headers: {
      'User-Agent': VN_JOBS_USER_AGENT,
      Accept: 'text/html,application/json',
    },
    validateStatus: () => true,
  });

  return {
    async get(url: string) {
      const response = await client.get<string>(url);
      return { data: typeof response.data === 'string' ? response.data : String(response.data ?? ''), status: response.status };
    },
    async post(url: string, body: unknown) {
      const response = await client.post(url, body, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Origin: 'https://www.vietnamworks.com',
          Referer: 'https://www.vietnamworks.com/',
        },
      });
      return { data: response.data, status: response.status };
    },
  };
}

export interface VnJobsCrawlResult {
  articles: Article[];
  /** Số job thô từng board ngay sau crawl (chưa lọc). */
  crawledCounts: {
    topcv: number;
    itviec: number;
    vietnamworks: number;
  };
  /** Số job còn lại từng board sau lọc role / địa điểm / kinh nghiệm (trước limit). */
  boardCounts: {
    topcv: number;
    itviec: number;
    vietnamworks: number;
  };
  /** Tổng job hợp lệ sau lọc + dedupe, trước khi cắt theo limit. */
  matchedCount: number;
}

export class VnJobsCrawler {
  constructor(private readonly http: VnJobsHttpClient = createDefaultHttp()) {}

  async crawl(options: VnJobsCrawlOptions): Promise<VnJobsCrawlResult> {
    const [topcvJobs, itviecJobs, vietnamworksJobs] = await Promise.all([
      this.safeCrawl('topcv', () => crawlTopcv(options.role, this.http)),
      this.safeCrawl('itviec', () => crawlItviec(options.role, this.http)),
      this.safeCrawl('vietnamworks', () => crawlVietnamworks(options.role, this.http, options.maxResults)),
    ]);

    const crawledCounts = {
      topcv: topcvJobs.length,
      itviec: itviecJobs.length,
      vietnamworks: vietnamworksJobs.length,
    };

    const locationFilter = options.location ?? 'hanoi';
    let listings = [...topcvJobs, ...itviecJobs, ...vietnamworksJobs]
      .filter((job) => matchesRole(job, options.role))
      .filter((job) => matchesLocation(job, locationFilter));

    if (options.experienceYears) {
      listings = listings.filter((job) => matchesExperience(job.experienceText, options.experienceYears!));
    }

    listings.sort((a, b) => {
      const dateA = new Date(a.publishedAt ?? 0).getTime();
      const dateB = new Date(b.publishedAt ?? 0).getTime();
      return dateB - dateA;
    });

    const boardCounts = {
      topcv: listings.filter((job) => job.sourceId === 'topcv').length,
      itviec: listings.filter((job) => job.sourceId === 'itviec').length,
      vietnamworks: listings.filter((job) => job.sourceId === 'vietnamworks').length,
    };

    // Dedupe theo URL trước enrich để không fetch JD thừa.
    const uniqueListings = dedupeListingsByUrl(listings);
    const candidates = uniqueListings.slice(0, options.maxResults);

    await Promise.all([
      enrichTopcvJobDetails(
        candidates.filter((job) => job.sourceId === 'topcv'),
        this.http,
      ),
      enrichItviecJobDetails(
        candidates.filter((job) => job.sourceId === 'itviec'),
        this.http,
      ),
    ]);

    const collectedAt = new Date().toISOString();
    const articles = candidates.map((job) => toArticle(job, options.role, collectedAt));

    return {
      articles,
      crawledCounts,
      boardCounts,
      matchedCount: uniqueListings.length,
    };
  }

  private async safeCrawl(board: string, run: () => Promise<VnJobListing[]>): Promise<VnJobListing[]> {
    try {
      return await run();
    } catch (error) {
      console.error(`Failed to crawl VN jobs board ${board}`, error);
      return [];
    }
  }
}

function dedupeListingsByUrl(listings: VnJobListing[]): VnJobListing[] {
  const seen = new Set<string>();
  const unique: VnJobListing[] = [];

  for (const job of listings) {
    if (seen.has(job.url)) {
      continue;
    }

    seen.add(job.url);
    unique.push(job);
  }

  return unique;
}

function toArticle(job: VnJobListing, role: JobRole, collectedAt: string): Article {
  const location = job.location ? compactText(job.location) : 'Hà Nội';
  const salary = job.salaryText ? compactText(job.salaryText) : 'Thương lượng';
  const skills = (job.skills ?? []).map((skill) => compactText(skill)).filter(Boolean);
  const description =
    normalizeJobDescription(job.description) ||
    normalizeJobDescription(job.summary) ||
    (job.experienceText ? `Yêu cầu kinh nghiệm: ${compactText(job.experienceText)}` : undefined) ||
    'Chưa có mô tả chi tiết từ nguồn.';

  return {
    id: job.url,
    sourceId: job.sourceId,
    sourceName: job.sourceName,
    title: job.title,
    url: job.url,
    summary: description,
    // Logo công ty dùng cho PDF; luồng jobs gửi email nên không phụ thuộc Telegram photo.
    imageUrl: job.imageUrl,
    author: job.company,
    publishedAt: job.publishedAt,
    collectedAt,
    topics: roleTopics(role),
    jobDetails: {
      description,
      skills,
      salary,
      location,
    },
  };
}

function normalizeJobDescription(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  return value
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function roleTopics(role: JobRole): TopicKey[] {
  return role === 'english-teacher' ? ['jobs-english'] : ['devops'];
}
