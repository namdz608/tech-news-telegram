import type { Article } from '../types/article';
import type { SourceConfig } from '../types/source';

export interface NewsCrawler<TSource extends SourceConfig = SourceConfig> {
  crawl(source: TSource): Promise<Article[]>;
}
