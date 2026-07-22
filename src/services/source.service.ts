import { sources as defaultSources } from '../config/sources';
import { env } from '../config/env';
import { createCrawlers } from '../crawlers';
import type { NewsCrawler } from '../crawlers/crawler.types';
import type { Article } from '../types/article';
import type { GitHubReposSourceConfig, HtmlSourceConfig, RssSourceConfig, SourceConfig, XSearchSourceConfig } from '../types/source';
import { dedupeArticles, isAllowedArticle } from './article.service';

interface SourceServiceCrawlers {
  rss: NewsCrawler<RssSourceConfig>;
  html: NewsCrawler<HtmlSourceConfig>;
  xSearch: NewsCrawler<XSearchSourceConfig>;
  githubRepos: NewsCrawler<GitHubReposSourceConfig>;
}

export class SourceService {
  constructor(
    private readonly sourceConfigs: SourceConfig[] = defaultSources,
    private readonly crawlers: SourceServiceCrawlers = createCrawlers(),
    private readonly maxArticleAgeDays = env.MAX_ARTICLE_AGE_DAYS,
  ) {}

  async collectLatest(): Promise<Article[]> {
    const enabledSources = this.sourceConfigs.filter((source) => source.enabled);
    const articleGroups = await Promise.all(
      enabledSources.map(async (source) => {
        try {
          if (source.kind === 'rss') {
            return await this.crawlers.rss.crawl(source);
          }

          if (source.kind === 'x-search') {
            return await this.crawlers.xSearch.crawl(source);
          }

          if (source.kind === 'github-repos') {
            return await this.crawlers.githubRepos.crawl(source);
          }

          return await this.crawlers.html.crawl(source);
        } catch (error) {
          console.error(`Failed to crawl source ${source.id}`, error);
          return [];
        }
      }),
    );

    const allArticles = articleGroups.flat();
    allArticles.sort((a, b) => {
      const dateA = new Date(a.publishedAt ?? a.collectedAt).getTime();
      const dateB = new Date(b.publishedAt ?? b.collectedAt).getTime();
      return dateB - dateA;
    });

    return dedupeArticles(allArticles.filter(isAllowedArticle).filter((article) => this.isFreshArticle(article)));
  }

  private isFreshArticle(article: Article): boolean {
    const articleTime = new Date(article.publishedAt ?? article.collectedAt).getTime();

    if (Number.isNaN(articleTime)) {
      return false;
    }

    const maxAgeMs = this.maxArticleAgeDays * 24 * 60 * 60 * 1000;
    return Date.now() - articleTime <= maxAgeMs;
  }
}
