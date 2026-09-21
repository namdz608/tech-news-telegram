import { describe, expect, it, vi } from "vitest";
import { DEVOPS_INFRA_X_QUERY } from "../../src/config/devops-infra-sources";
import { DevopsInfraXAdapter } from "../../src/services/devops-infra-x.adapter";
import type { Article } from "../../src/types/article";
import type { XSearchSourceConfig } from "../../src/types/source";

const NOW = new Date("2026-09-21T03:00:00.000Z");
const PUBLISHED_AT = "2026-09-21T01:00:00.000Z";
const TOKEN = "test-x-token";

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: "123",
    sourceId: "x-search",
    sourceName: "X Search",
    title: "Kubernetes CrashLoopBackOff resolved",
    url: "https://x.com/i/web/status/123",
    summary: "The deployment recovered after correcting its memory limit.",
    author: "@platform_team",
    publishedAt: PUBLISHED_AT,
    collectedAt: PUBLISHED_AT,
    topics: [],
    engagement: { likes: 8, comments: 2 },
    imageUrl: "https://images.example/x-post.png",
    ...overrides,
  };
}

function crawler(value: Article[] | Error) {
  return {
    crawl: vi.fn(async () => {
      if (value instanceof Error) throw value;
      return value;
    }),
  };
}

describe("DevopsInfraXAdapter", () => {
  it("is disabled without a bearer token and does not crawl", async () => {
    const xCrawler = crawler([]);
    const adapter = new DevopsInfraXAdapter(xCrawler, "", () => NOW);

    expect(adapter.key).toBe("x-search");
    expect(adapter.isEnabled()).toBe(false);
    await expect(adapter.collect()).resolves.toEqual({
      items: [],
      successfulSourceCount: 0,
      failedSources: [],
    });
    expect(xCrawler.crawl).not.toHaveBeenCalled();
  });

  it("crawls with the exact devops query and configured limits", async () => {
    const xCrawler = crawler([]);
    const collected = await new DevopsInfraXAdapter(
      xCrawler,
      TOKEN,
      () => NOW,
    ).collect();

    expect(xCrawler.crawl).toHaveBeenCalledTimes(1);
    expect(xCrawler.crawl.mock.calls[0]?.[0] as XSearchSourceConfig).toEqual(
      expect.objectContaining({
        query: DEVOPS_INFRA_X_QUERY,
        includeUnmatched: true,
        maxResults: 20,
        bearerToken: TOKEN,
      }),
    );
    expect(collected).toEqual({
      items: [],
      successfulSourceCount: 1,
      failedSources: [],
    });
  });

  it("maps an X article and uses the author handle for both keys", async () => {
    const collected = await new DevopsInfraXAdapter(
      crawler([article()]),
      TOKEN,
      () => NOW,
    ).collect();

    expect(collected.items).toEqual([
      {
        id: "https://x.com/i/web/status/123",
        sourceId: "x-search",
        sourceName: "X Search",
        title: "Kubernetes CrashLoopBackOff resolved",
        url: "https://x.com/i/web/status/123",
        summary: "The deployment recovered after correcting its memory limit.",
        body: "The deployment recovered after correcting its memory limit.",
        author: "@platform_team",
        publishedAt: PUBLISHED_AT,
        collectedAt: NOW.toISOString(),
        discoveredAt: NOW.toISOString(),
        discoveryChannel: "x",
        communityKey: "x:platform_team",
        sourceQuotaKey: "x:platform_team",
        sourceTextStatus: "full",
        answers: [],
        engagement: { score: 8, comments: 2 },
      },
    ]);
    expect(collected.items[0]).not.toHaveProperty("imageUrl");
  });

  it("falls back to x.com keys when no valid handle exists", async () => {
    const collected = await new DevopsInfraXAdapter(
      crawler([article({ author: "Display Name" })]),
      TOKEN,
      () => NOW,
    ).collect();

    expect(collected.items[0]).toMatchObject({
      communityKey: "x.com",
      sourceQuotaKey: "x.com",
    });
  });

  it("turns a crawler failure into a failed source result", async () => {
    const collected = await new DevopsInfraXAdapter(
      crawler(new Error("x-search")),
      TOKEN,
      () => NOW,
    ).collect();

    expect(collected).toEqual({
      items: [],
      successfulSourceCount: 0,
      failedSources: ["x-search"],
    });
  });
});
