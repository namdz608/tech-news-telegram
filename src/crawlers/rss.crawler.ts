import axios from 'axios';
import * as cheerio from 'cheerio';
import Parser from 'rss-parser';
import { env } from '../config/env';
import { matchTopics } from '../services/article.service';
import type { Article } from '../types/article';
import type { RssSourceConfig } from '../types/source';
import { normalizeUrl } from '../utils/normalize-url';
import { createRedditAwareLookup, redditHttpsAgent } from '../utils/reddit-dns';
import { compactText } from '../utils/text';
import type { NewsCrawler } from './crawler.types';

interface RssItemLike {
  title?: string;
  link?: string;
  contentSnippet?: string;
  content?: string;
  isoDate?: string;
  creator?: string;
  enclosure?: {
    url?: string;
    type?: string;
  };
  mediaContent?: {
    $?: {
      url?: string;
      medium?: string;
      type?: string;
    };
  }[];
}

interface RssParserLike {
  parseURL(url: string): Promise<{ items: RssItemLike[] }>;
}

interface HttpClientLike {
  get(url: string): Promise<{ data: string }>;
}

export class RssCrawler implements NewsCrawler<RssSourceConfig> {
  constructor(
    private readonly parser: RssParserLike = new Parser({
      headers: {
        'User-Agent': env.USER_AGENT,
        Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
      },
      requestOptions: {
        lookup: createRedditAwareLookup(),
      },
      timeout: env.REQUEST_TIMEOUT_MS,
    }),
    private readonly http: HttpClientLike = axios.create({
      timeout: env.REQUEST_TIMEOUT_MS,
      headers: {
        'User-Agent': env.USER_AGENT,
      },
      httpsAgent: redditHttpsAgent,
    }),
  ) {}

  async crawl(source: RssSourceConfig): Promise<Article[]> {
    const feed = await this.parser.parseURL(source.feedUrl);

    const articles = feed.items
      .filter((item) => item.title && item.link)
      .map((item) => {
        const title = compactText(item.title ?? '');
        const summary = compactText(item.contentSnippet ?? item.content ?? '');
        const url = normalizeUrl(item.link ?? '');
        const topics = [...new Set([...(source.defaultTopics ?? []), ...matchTopics({ title, summary })])];

        return {
          article: {
            id: url,
            sourceId: source.id,
            sourceName: source.name,
            title,
            url,
            summary,
            imageUrl: extractImageUrl(item),
            author: item.creator,
            publishedAt: item.isoDate,
            collectedAt: new Date().toISOString(),
            topics,
          },
          item,
        };
      })
      .filter(({ article }) => article.topics.length > 0);

    return Promise.all(articles.map(({ article, item }) => this.withArticlePageImage(article, item)));
  }

  private async withArticlePageImage(article: Article, item: RssItemLike): Promise<Article> {
    if (article.imageUrl) {
      return article;
    }

    const imageLookupUrl = getImageLookupUrl(article, item);
    const imageUrl = await this.fetchArticleImageUrl(imageLookupUrl);

    return imageUrl ? { ...article, imageUrl } : article;
  }

  private async fetchArticleImageUrl(articleUrl: string): Promise<string | undefined> {
    try {
      const response = await this.http.get(articleUrl);
      return extractImageUrlFromHtml(response.data, articleUrl);
    } catch {
      return undefined;
    }
  }
}

function extractImageUrl(item: RssItemLike): string | undefined {
  const candidates = [
    item.enclosure?.type?.startsWith('image/') ? item.enclosure.url : undefined,
    ...(item.mediaContent ?? []).map((media) =>
      media.$?.medium === 'image' || media.$?.type?.startsWith('image/') ? media.$.url : undefined,
    ),
    extractFirstImageFromHtml(item.content),
  ];

  return candidates.map((candidate) => normalizeImageUrl(candidate)).find(Boolean);
}

function extractFirstImageFromHtml(html?: string): string | undefined {
  if (!html) {
    return undefined;
  }

  const $ = cheerio.load(html);
  return $('img').first().attr('src');
}

function extractImageUrlFromHtml(html: string, baseUrl: string): string | undefined {
  const $ = cheerio.load(html);
  const candidates = [
    $('meta[property="og:image"]').attr('content'),
    $('meta[name="twitter:image"]').attr('content'),
    $('article img').first().attr('src'),
    $('main img').first().attr('src'),
  ];

  return candidates.map((candidate) => normalizeImageUrl(candidate, baseUrl)).find(Boolean);
}

function getImageLookupUrl(article: Article, item: RssItemLike): string {
  if (!article.sourceId.startsWith('reddit-')) {
    return article.url;
  }

  return extractExternalRedditLink(item.content) ?? article.url;
}

function extractExternalRedditLink(html?: string): string | undefined {
  if (!html) {
    return undefined;
  }

  const $ = cheerio.load(html);
  const candidates: string[] = [];

  $('a[href]').each((_index, element) => {
    const href = $(element).attr('href');

    if (href) {
      candidates.push(href);
    }
  });

  return candidates.map(normalizeExternalRedditLink).find(Boolean);
}

function normalizeExternalRedditLink(href: string): string | undefined {
  try {
    const url = new URL(href.trim());

    if (url.protocol !== 'https:') {
      return undefined;
    }

    if (isRedditHostname(url.hostname)) {
      return undefined;
    }

    return url.toString();
  } catch {
    return undefined;
  }
}

function isRedditHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'reddit.com' ||
    normalized.endsWith('.reddit.com') ||
    normalized === 'redd.it' ||
    normalized.endsWith('.redd.it')
  );
}

function normalizeImageUrl(imageUrl?: string, baseUrl?: string): string | undefined {
  const trimmed = imageUrl?.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    const url = baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
