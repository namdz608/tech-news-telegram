import { env } from '../config/env';
import { XSearchCrawler } from '../crawlers/x-search.crawler';
import type { NewsCrawler } from '../crawlers/crawler.types';
import type { Article } from '../types/article';
import type { PoliticsSourceItem } from '../types/gold-politics';
import type { XSearchSourceConfig } from '../types/source';
import { compactText } from '../utils/text';
import type { PoliticsSourceAdapter, PoliticsSourceAdapterResult } from './politics-source.adapter';

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const X_USERNAME = /^[A-Za-z0-9_]{1,15}$/;
const DENIAL = /\bden(?:y|ies|ied)\b|phủ nhận|bác bỏ/i;

export const POLITICS_X_QUERY =
  '(chính trị OR "Quốc hội" OR "Chính phủ" OR "bầu cử" OR "chính sách" OR "xung đột" OR government OR parliament OR election OR policy OR conflict OR "tranh cãi" OR "tham nhũng" OR "cáo buộc" OR controversy OR corruption OR allegation OR "lãnh đạo" OR leader OR "giá vàng" OR gold OR "lãi suất" OR "central bank" OR USD) -is:retweet';

export class PoliticsXAdapter implements PoliticsSourceAdapter {
  readonly key = 'x-search';

  constructor(
    private readonly crawler: NewsCrawler<XSearchSourceConfig> = new XSearchCrawler(),
    private readonly bearerToken: string = env.X_BEARER_TOKEN,
    private readonly now: () => Date = () => new Date(),
  ) {}

  isEnabled(): boolean {
    return this.bearerToken.trim() !== '';
  }

  async collect(): Promise<PoliticsSourceAdapterResult> {
    const discoveredAt = this.now().toISOString();
    const articles = await this.crawler.crawl({
      id: 'x-search',
      name: 'X Search',
      kind: 'x-search',
      enabled: true,
      homepageUrl: 'https://x.com',
      bearerToken: this.bearerToken,
      query: POLITICS_X_QUERY,
      maxResults: 20,
      includeUnmatched: true,
    });
    return {
      items: articles.flatMap((article) => {
        const item = mapXArticle(article, discoveredAt);
        return item ? [item] : [];
      }),
      successfulSourceCount: 1,
      failedSources: [],
    };
  }
}

function mapXArticle(article: Article, discoveredAt: string): PoliticsSourceItem | undefined {
  const publishedAt = parseIsoTimestamp(article.publishedAt);
  if (!publishedAt) {
    return undefined;
  }

  const url = parsePublicHttpUrl(article.url);
  if (!url) {
    return undefined;
  }

  const account = parseXAccount(article.author);
  const identityKey = account ? `x:${account.toLowerCase()}` : 'x.com';
  const summary = compactText(article.summary ?? '');
  const title = compactText(article.title);
  const quotedOriginUrl = extractQuotedOriginUrl(`${title} ${summary}`, url);

  return {
    id: url,
    sourceId: 'x-search',
    sourceName: article.sourceName,
    title,
    url,
    summary: summary || undefined,
    author: article.author,
    publishedAt,
    collectedAt: discoveredAt,
    topics: article.topics,
    engagement: article.engagement,
    discoveryChannel: 'x',
    discoveredAt,
    originalAuthor: article.author,
    originalAccount: account,
    originalUrl: url,
    quotedOriginUrl,
    sourceQuotaKey: identityKey,
    sourceTextStatus: summary ? 'full' : 'incomplete',
    evidenceKind: account ? 'social-claim' : 'anonymous-rumor',
    evidentiaryEffect: DENIAL.test(`${title} ${summary}`) ? 'denies' : 'records-claim',
    evidenceOriginKey: identityKey,
    originAttribution: {
      url,
      account,
      publishedAt,
      discoveredAt,
    },
  };
}

function parseXAccount(author: string | undefined): string | undefined {
  if (!author) {
    return undefined;
  }
  const trimmed = author.trim();
  const handle = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  if (!X_USERNAME.test(handle)) {
    return undefined;
  }
  return handle;
}

function extractQuotedOriginUrl(text: string, originUrl: string): string | undefined {
  const matches = text.match(/https?:\/\/[^\s)]+/g) ?? [];
  for (const raw of matches) {
    const parsed = parsePublicHttpUrl(raw.replace(/[.,;]+$/g, ''));
    if (parsed && parsed !== originUrl && isXStatusUrl(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function isXStatusUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^www\./, '').toLowerCase();
    if (hostname !== 'x.com' && hostname !== 'twitter.com') {
      return false;
    }
    return /\/status\/\d+/i.test(url.pathname);
  } catch {
    return false;
  }
}

function parsePublicHttpUrl(value: string): string | undefined {
  if (!value.trim()) {
    return undefined;
  }
  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
      return undefined;
    }
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

function parseIsoTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string' || !ISO_INSTANT.test(value.trim())) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}
