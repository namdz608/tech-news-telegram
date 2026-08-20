import { goldPoliticsRssSources } from '../config/gold-politics-sources';
import { RssCrawler } from '../crawlers/rss.crawler';
import type { NewsCrawler } from '../crawlers/crawler.types';
import type { Article } from '../types/article';
import type { PoliticsSourceItem } from '../types/gold-politics';
import type { RssSourceConfig } from '../types/source';
import { registrablePublisherKey } from '../utils/publisher-key';
import { compactText } from '../utils/text';
import type { PoliticsSourceAdapter, PoliticsSourceAdapterResult } from './politics-source.adapter';

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const ALLEGATION_OR_PROCEEDING =
  /cáo buộc|truy tố|khởi tố|allegation|alleged|indictment|proceeding|prosecution|lawsuit/i;

export function politicsRssSourceConfig(source: RssSourceConfig): RssSourceConfig {
  return {
    ...source,
    includeUnmatched: true,
    boundedFeedFetch: true,
    enrichArticlePage: false,
    maxItems: 20,
  };
}

export class PoliticsRssAdapter implements PoliticsSourceAdapter {
  readonly key: string;

  constructor(
    private readonly source: RssSourceConfig = goldPoliticsRssSources[0]!,
    private readonly crawler: NewsCrawler<RssSourceConfig> = new RssCrawler(),
    private readonly now: () => Date = () => new Date(),
  ) {
    this.key = source.id;
  }

  isEnabled(): boolean {
    return this.source.enabled;
  }

  async collect(): Promise<PoliticsSourceAdapterResult> {
    const discoveredAt = this.now().toISOString();
    const articles = await this.crawler.crawl(politicsRssSourceConfig(this.source));
    return {
      items: articles.flatMap((article) => {
        const item = mapRssArticle(article, discoveredAt);
        return item ? [item] : [];
      }),
      successfulSourceCount: 1,
      failedSources: [],
    };
  }
}

function mapRssArticle(article: Article, discoveredAt: string): PoliticsSourceItem | undefined {
  const publishedAt = parseIsoTimestamp(article.publishedAt);
  if (!publishedAt) {
    return undefined;
  }

  const url = article.url.trim();
  const publisherKey = registrablePublisherKey(url);
  if (!publisherKey) {
    return undefined;
  }

  const summary = compactText(article.summary ?? '');
  const title = compactText(article.title);
  const searchable = `${title} ${summary}`;

  return {
    id: url,
    sourceId: article.sourceId,
    sourceName: article.sourceName,
    title,
    url,
    summary: summary || undefined,
    imageUrl: article.imageUrl,
    author: article.author,
    publishedAt,
    collectedAt: discoveredAt,
    topics: article.topics,
    discoveryChannel: 'rss',
    discoveredAt,
    originalAuthor: article.author,
    originalUrl: url,
    sourceQuotaKey: publisherKey,
    sourceTextStatus: summary ? 'full' : 'incomplete',
    evidenceKind: 'identified-report',
    evidentiaryEffect: ALLEGATION_OR_PROCEEDING.test(searchable) ? 'records-claim' : 'mentions',
    evidenceOriginKey: publisherKey,
    originAttribution: {
      url,
      publishedAt,
      discoveredAt,
    },
  };
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
