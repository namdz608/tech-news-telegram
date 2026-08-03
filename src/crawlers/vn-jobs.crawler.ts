/**
 * Điều phối crawl TopCV / ITviec / VietnamWorks và map sang Article[].
 */
import axios from 'axios';
import { env } from '../config/env';
import { dedupeArticles } from '../services/article.service';
import type { Article } from '../types/article';
import type { TopicKey } from '../types/topic';
import { compactText } from '../utils/text';
import { matchesExperience } from './vn-jobs/experience';
import { crawlItviec } from './vn-jobs/itviec.adapter';
import { matchesLocation } from './vn-jobs/location';
import { matchesRole } from './vn-jobs/role-match';
import { crawlTopcv } from './vn-jobs/topcv.adapter';
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

export class VnJobsCrawler {
  constructor(private readonly http: VnJobsHttpClient = createDefaultHttp()) {}

  async crawl(options: VnJobsCrawlOptions): Promise<Article[]> {
    const groups = await Promise.all([
      this.safeCrawl('topcv', () => crawlTopcv(options.role, this.http)),
      this.safeCrawl('itviec', () => crawlItviec(options.role, this.http)),
      this.safeCrawl('vietnamworks', () => crawlVietnamworks(options.role, this.http, options.maxResults)),
    ]);

    const locationFilter = options.location ?? 'hanoi';
    let listings = groups
      .flat()
      .filter((job) => matchesRole(job, options.role))
      .filter((job) => matchesLocation(job, locationFilter));

    if (options.experienceYears) {
      listings = listings.filter((job) => matchesExperience(job.experienceText, options.experienceYears!));
    }

    const collectedAt = new Date().toISOString();
    const articles = listings.map((job) => toArticle(job, options.role, collectedAt));

    articles.sort((a, b) => {
      const dateA = new Date(a.publishedAt ?? a.collectedAt).getTime();
      const dateB = new Date(b.publishedAt ?? b.collectedAt).getTime();
      return dateB - dateA;
    });

    return dedupeArticles(articles).slice(0, options.maxResults);
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

function toArticle(job: VnJobListing, role: JobRole, collectedAt: string): Article {
  const locationLabel = job.location ? `Địa điểm: ${compactText(job.location)}` : 'Địa điểm: Hà Nội';
  const summaryParts = [job.company, locationLabel, job.salaryText, job.experienceText, job.summary]
    .map((part) => (part ? compactText(part) : ''))
    .filter(Boolean);

  return {
    id: job.url,
    sourceId: job.sourceId,
    sourceName: job.sourceName,
    title: job.title,
    url: job.url,
    summary: summaryParts.join(' · ') || undefined,
    // Logo công ty thường quá nhỏ → Telegram sendPhoto fail rồi rơi về text.
    // Để trống để DigestService dùng ảnh fallback topic (1200x630).
    imageUrl: undefined,
    author: job.company,
    publishedAt: job.publishedAt,
    collectedAt,
    topics: roleTopics(role),
  };
}

function roleTopics(role: JobRole): TopicKey[] {
  return role === 'english-teacher' ? ['jobs-english'] : ['devops'];
}
