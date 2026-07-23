import axios from 'axios';
import * as cheerio from 'cheerio';
import { env } from '../config/env';
import { matchTopics } from '../services/article.service';
import type { Article } from '../types/article';
import type { HtmlSourceConfig } from '../types/source';
import { normalizeUrl } from '../utils/normalize-url';
import { compactText } from '../utils/text';
import type { NewsCrawler } from './crawler.types';

interface HttpClientLike {
  get(url: string): Promise<{ data: string }>;
}

export class HtmlCrawler implements NewsCrawler<HtmlSourceConfig> {
  constructor(
    private readonly http: HttpClientLike = axios.create({
      timeout: env.REQUEST_TIMEOUT_MS,
      headers: {
        'User-Agent': env.USER_AGENT,
      },
    }),
  ) {}

  async crawl(source: HtmlSourceConfig): Promise<Article[]> {
    const response = await this.http.get(source.listUrl);
    const $ = cheerio.load(response.data);
    const articles: Article[] = [];

    $(source.selectors.item).each((_index, element) => {
      const item = $(element);
      const title = compactText(item.find(source.selectors.title).first().text());
      const href = item.find(source.selectors.url).first().attr('href');

      if (!title || !href) {
        return;
      }

      const absoluteUrl = new URL(href, source.homepageUrl).toString();
      const url = normalizeUrl(absoluteUrl);
      const summary = source.selectors.summary
        ? compactText(item.find(source.selectors.summary).first().text())
        : undefined;
      const imageUrl = source.selectors.image
        ? normalizeImageUrl(item.find(source.selectors.image).first().attr('src'), source.homepageUrl)
        : undefined;
      const publishedAt = source.selectors.publishedAt
        ? item.find(source.selectors.publishedAt).first().attr('datetime') ??
          compactText(item.find(source.selectors.publishedAt).first().text())
        : undefined;
      const topics = matchTopics({ title, summary });

      if (topics.length === 0) {
        return;
      }

      articles.push({
        id: url,
        sourceId: source.id,
        sourceName: source.name,
        title,
        url,
        summary,
        imageUrl,
        publishedAt,
        collectedAt: new Date().toISOString(),
        topics,
      });
    });

    return articles;
  }
}

function normalizeImageUrl(imageUrl: string | undefined, baseUrl: string): string | undefined {
  const trimmed = imageUrl?.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(trimmed, baseUrl);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
