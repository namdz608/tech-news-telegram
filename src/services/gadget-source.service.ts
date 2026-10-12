/** Thu thập riêng các RSS gadget và giữ trạng thái lỗi theo từng nguồn. */
import { env } from '../config/env';
import { gadgetSources } from '../config/gadget-sources';
import type { NewsCrawler } from '../crawlers/crawler.types';
import { RssCrawler } from '../crawlers/rss.crawler';
import type { CuratedCollectionResult } from '../types/curated';
import type { RssSourceConfig } from '../types/source';
import { CuratedRssSourceService } from './curated-rss-source.service';
import type { SourceContentEnrichmentService } from './source-content-enrichment.service';

export type GadgetCollectionResult = CuratedCollectionResult;

export class GadgetSourceService {
  private readonly source: CuratedRssSourceService;

  constructor(
    sources: RssSourceConfig[] = gadgetSources,
    crawler: NewsCrawler<RssSourceConfig> = new RssCrawler(),
    maxArticleAgeDays = env.MAX_ARTICLE_AGE_DAYS,
    now = () => new Date(),
    enrichment?: Pick<SourceContentEnrichmentService, 'enrich'>,
  ) {
    this.source = new CuratedRssSourceService({
      sources, crawler, maxArticleAgeDays, logLabel: 'gadget', now, enrichment,
    });
  }

  collectLatest() {
    return this.source.collectLatest();
  }
}
