import { env } from '../config/env';
import { healthSources } from '../config/health-sources';
import type { NewsCrawler } from '../crawlers/crawler.types';
import { RssCrawler } from '../crawlers/rss.crawler';
import type { CuratedCollectionResult } from '../types/curated';
import type { RssSourceConfig } from '../types/source';
import { CuratedRssSourceService } from './curated-rss-source.service';

export type HealthCollectionResult = CuratedCollectionResult;

export class HealthSourceService {
  private readonly source: CuratedRssSourceService;

  constructor(
    sources: RssSourceConfig[] = healthSources,
    crawler: NewsCrawler<RssSourceConfig> = new RssCrawler(),
    maxArticleAgeDays = env.MAX_ARTICLE_AGE_DAYS,
    now = () => new Date(),
  ) {
    this.source = new CuratedRssSourceService({
      sources, crawler, maxArticleAgeDays, logLabel: 'health', now,
    });
  }

  collectLatest() {
    return this.source.collectLatest();
  }
}
