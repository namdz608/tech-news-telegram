import { DEVOPS_INFRA_X_QUERY } from "../config/devops-infra-sources";
import { env } from "../config/env";
import type { NewsCrawler } from "../crawlers/crawler.types";
import { XSearchCrawler } from "../crawlers/x-search.crawler";
import type { Article } from "../types/article";
import type { DevopsInfraSourceItem } from "../types/devops-infra";
import type { XSearchSourceConfig } from "../types/source";
import { compactText } from "../utils/text";
import type {
  DevopsInfraSourceAdapter,
  DevopsInfraSourceAdapterResult,
} from "./devops-infra-source.adapter";

const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const X_USERNAME = /^[A-Za-z0-9_]{1,15}$/;

export class DevopsInfraXAdapter implements DevopsInfraSourceAdapter {
  readonly key = "x-search";

  constructor(
    private readonly crawler: NewsCrawler<XSearchSourceConfig> = new XSearchCrawler(),
    private readonly bearerToken: string = env.X_BEARER_TOKEN,
    private readonly now: () => Date = () => new Date(),
  ) {}

  isEnabled(): boolean {
    return this.bearerToken.trim() !== "";
  }

  async collect(): Promise<DevopsInfraSourceAdapterResult> {
    if (!this.isEnabled()) {
      return { items: [], successfulSourceCount: 0, failedSources: [] };
    }

    try {
      const articles = await this.crawler.crawl({
        id: "x-search",
        name: "X Search",
        kind: "x-search",
        enabled: true,
        homepageUrl: "https://x.com",
        bearerToken: this.bearerToken,
        query: DEVOPS_INFRA_X_QUERY,
        includeUnmatched: true,
        maxResults: 20,
      });
      const discoveredAt = this.now().toISOString();
      return {
        items: articles.flatMap((article) => {
          const item = mapXArticle(article, discoveredAt);
          return item ? [item] : [];
        }),
        successfulSourceCount: 1,
        failedSources: [],
      };
    } catch {
      return {
        items: [],
        successfulSourceCount: 0,
        failedSources: ["x-search"],
      };
    }
  }
}

function mapXArticle(
  article: Article,
  discoveredAt: string,
): DevopsInfraSourceItem | undefined {
  const url = parsePublicHttpUrl(article.url);
  const publishedAt = parseIsoTimestamp(article.publishedAt);
  const title = compactText(article.title);
  if (!url || !publishedAt || !title) {
    return undefined;
  }

  const body = compactText(article.summary ?? "");
  const handle = parseXHandle(article.author);
  const identityKey = handle ? `x:${handle.toLowerCase()}` : "x.com";
  const score = article.engagement?.likes;
  const comments = article.engagement?.comments;
  const engagement =
    score === undefined && comments === undefined
      ? undefined
      : {
          ...(score === undefined ? {} : { score }),
          ...(comments === undefined ? {} : { comments }),
        };

  return {
    id: url,
    sourceId: "x-search",
    sourceName: article.sourceName,
    title,
    url,
    summary: body,
    body,
    ...(article.author ? { author: article.author } : {}),
    publishedAt,
    collectedAt: discoveredAt,
    discoveredAt,
    discoveryChannel: "x",
    communityKey: identityKey,
    sourceQuotaKey: identityKey,
    sourceTextStatus: body ? "full" : "incomplete",
    answers: [],
    ...(engagement ? { engagement } : {}),
  };
}

function parseXHandle(author: string | undefined): string | undefined {
  if (!author) return undefined;
  const trimmed = author.trim();
  const handle = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  return X_USERNAME.test(handle) ? handle : undefined;
}

function parsePublicHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password
    ) {
      return undefined;
    }
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function parseIsoTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || !ISO_INSTANT.test(value.trim())) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
