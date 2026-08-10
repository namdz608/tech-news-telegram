/** Thu thập riêng các RSS gadget và giữ trạng thái lỗi theo từng nguồn. */
import { env } from '../config/env';
import { gadgetSources } from '../config/gadget-sources';
import type { NewsCrawler } from '../crawlers/crawler.types';
import { RssCrawler } from '../crawlers/rss.crawler';
import type { Article } from '../types/article';
import type { RssSourceConfig } from '../types/source';
import { dedupeArticles, isAllowedArticle } from './article.service';

export interface GadgetCollectionResult {
  articles: Article[];
  successfulSourceCount: number;
  failedSourceCount: number;
}

export class GadgetSourceService {
  constructor(
    private readonly sources: RssSourceConfig[] = gadgetSources,
    private readonly crawler: NewsCrawler<RssSourceConfig> = new RssCrawler(),
    private readonly maxArticleAgeDays = env.MAX_ARTICLE_AGE_DAYS,
    private readonly now = () => new Date(),
  ) {}

  async collectLatest(): Promise<GadgetCollectionResult> {
    const enabled = this.sources.filter((source) => source.enabled);
    const settled = await Promise.allSettled(enabled.map((source) => this.crawler.crawl(source)));
    const articles: Article[] = [];
    let successfulSourceCount = 0;
    let failedSourceCount = 0;

    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successfulSourceCount += 1;
        articles.push(...result.value);
        return;
      }

      failedSourceCount += 1;
      console.error(`Failed to crawl gadget source ${enabled[index].id}`, result.reason);
    });

    const oldestAllowed = this.now().getTime() - this.maxArticleAgeDays * 86_400_000;
    const fresh = articles.filter((article) => {
      const timestamp = new Date(article.publishedAt ?? article.collectedAt).getTime();
      return Number.isFinite(timestamp) && timestamp >= oldestAllowed;
    });
    fresh.sort(
      (left, right) =>
        new Date(right.publishedAt ?? right.collectedAt).getTime() -
        new Date(left.publishedAt ?? left.collectedAt).getTime(),
    );

    return {
      articles: dedupeArticles(fresh.filter(isAllowedArticle)),
      successfulSourceCount,
      failedSourceCount,
    };
  }
}
