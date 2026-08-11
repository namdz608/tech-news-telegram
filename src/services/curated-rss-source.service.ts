import type { NewsCrawler } from '../crawlers/crawler.types';
import type { Article } from '../types/article';
import type { CuratedCollectionResult } from '../types/curated';
import type { RssSourceConfig } from '../types/source';
import { dedupeArticles, isAllowedArticle } from './article.service';

interface CuratedRssSourceOptions {
  sources: RssSourceConfig[];
  crawler: NewsCrawler<RssSourceConfig>;
  maxArticleAgeDays: number;
  logLabel: string;
  now?: () => Date;
}

export class CuratedRssSourceService {
  private readonly now: () => Date;

  constructor(private readonly options: CuratedRssSourceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async collectLatest(): Promise<CuratedCollectionResult> {
    const enabled = this.options.sources.filter((source) => source.enabled);
    const settled = await Promise.allSettled(
      enabled.map((source) => this.options.crawler.crawl(source)),
    );
    const articles: Article[] = [];
    let successfulSourceCount = 0;
    let failedSourceCount = 0;

    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successfulSourceCount += 1;
        articles.push(...result.value);
      } else {
        failedSourceCount += 1;
        console.error(
          `Failed to crawl ${this.options.logLabel} source ${enabled[index].id}`,
          result.reason,
        );
      }
    });

    const oldestAllowed = this.now().getTime() - this.options.maxArticleAgeDays * 86_400_000;
    const fresh = articles.filter((article) => {
      const timestamp = new Date(article.publishedAt ?? article.collectedAt).getTime();
      return Number.isFinite(timestamp) && timestamp >= oldestAllowed;
    });
    fresh.sort(
      (left, right) =>
        new Date(right.publishedAt ?? right.collectedAt).getTime()
        - new Date(left.publishedAt ?? left.collectedAt).getTime(),
    );

    return {
      articles: dedupeArticles(fresh.filter(isAllowedArticle)),
      successfulSourceCount,
      failedSourceCount,
    };
  }
}
