import { describe, expect, it, vi } from "vitest";
import { buildDevopsInfraWebSearchQueries } from "../../src/config/devops-infra-sources";
import { env } from "../../src/config/env";
import { DevopsInfraWebSearchAdapter } from "../../src/services/devops-infra-web-search.adapter";
import type {
  WebSearchProvider,
  WebSearchResult,
} from "../../src/services/web-search.provider";

const NOW = new Date("2026-09-21T03:00:00.000Z");
const PUBLISHED_AT = "2026-09-21T01:00:00.000Z";
const LONG_SNIPPET =
  "A detailed Kubernetes incident report explains the root cause and the exact recovery steps operators used.";

function result(overrides: Partial<WebSearchResult> = {}): WebSearchResult {
  return {
    title: "Kubernetes outage fixed",
    url: "https://news.example.com/incidents/kubernetes",
    snippet: LONG_SNIPPET,
    publishedAt: PUBLISHED_AT,
    sourceName: "Example News",
    ...overrides,
  };
}

function provider(enabled: boolean, searchResult: WebSearchResult[] = []) {
  return {
    key: "brave-search",
    isEnabled: vi.fn(() => enabled),
    search: vi.fn(async () => searchResult),
  } satisfies WebSearchProvider;
}

function retrieval(
  text = `<article>${LONG_SNIPPET} ${LONG_SNIPPET}</article>`,
) {
  return {
    retrieve: vi.fn(async (url: string) => ({
      finalUrl: url,
      contentType: "text/html",
      text,
    })),
  };
}

describe("DevopsInfraWebSearchAdapter", () => {
  it("returns an empty result without searching when Brave is disabled", async () => {
    const search = provider(false);
    const adapter = new DevopsInfraWebSearchAdapter(
      search,
      retrieval(),
      () => NOW,
      8,
    );

    expect(adapter.key).toBe("web-search");
    expect(adapter.isEnabled()).toBe(false);
    await expect(adapter.collect()).resolves.toEqual({
      items: [],
      successfulSourceCount: 0,
      failedSources: [],
    });
    expect(search.search).not.toHaveBeenCalled();
  });

  it("is disabled when maxQueries is zero", async () => {
    const search = provider(true);
    const adapter = new DevopsInfraWebSearchAdapter(
      search,
      retrieval(),
      () => NOW,
      0,
    );

    expect(adapter.isEnabled()).toBe(false);
    await adapter.collect();
    expect(search.search).not.toHaveBeenCalled();
  });

  it("searches only the capped devops query catalog", async () => {
    const search = provider(true);
    const maxQueries = Math.min(3, env.DEVOPS_INFRA_WEB_SEARCH_MAX_QUERIES);
    const adapter = new DevopsInfraWebSearchAdapter(
      search,
      retrieval(),
      () => NOW,
      maxQueries,
    );

    const collected = await adapter.collect();
    expect(search.search).toHaveBeenCalledTimes(maxQueries);
    expect(search.search.mock.calls.map(([query]) => query)).toEqual(
      buildDevopsInfraWebSearchQueries(maxQueries),
    );
    expect(
      search.search.mock.calls.map(([query]) => query.text).join(" "),
    ).not.toMatch(/Quốc hội|giá vàng|gold/i);
    expect(collected.successfulSourceCount).toBe(maxQueries);
  });

  it("enriches a recent result and strips HTML from its capped body", async () => {
    const html = `<html><body><article><h1>Root cause</h1>${" recovery step ".repeat(180)}</article><script>ignored()</script></body></html>`;
    const search = provider(true, [result()]);
    const webRetrieval = retrieval(html);

    const collected = await new DevopsInfraWebSearchAdapter(
      search,
      webRetrieval,
      () => NOW,
      1,
    ).collect();

    expect(webRetrieval.retrieve).toHaveBeenCalledWith(result().url);
    expect(collected.items).toHaveLength(1);
    expect(collected.items[0]).toMatchObject({
      body: expect.stringContaining("Root cause recovery step"),
      summary: LONG_SNIPPET,
      sourceTextStatus: "full",
      publishedAt: PUBLISHED_AT,
      discoveryChannel: "web",
      sourceQuotaKey: "example.com",
      communityKey: "example.com",
    });
    expect(collected.items[0]?.body.length).toBe(2000);
    expect(collected.items[0]).not.toHaveProperty("imageUrl");
  });

  it("falls back to a valid snippet when retrieval fails and drops incomplete results", async () => {
    const search = provider(true, [
      result(),
      result({ url: "https://example.org/short", snippet: "too short" }),
      result({ url: "https://example.org/undated", publishedAt: "" }),
      result({
        url: "https://example.org/old",
        publishedAt: "2026-09-17T00:00:00.000Z",
      }),
    ]);
    const webRetrieval = {
      retrieve: vi.fn(async () => {
        throw new Error("network");
      }),
    };

    const collected = await new DevopsInfraWebSearchAdapter(
      search,
      webRetrieval,
      () => NOW,
      1,
    ).collect();

    expect(collected.items).toHaveLength(1);
    expect(collected.items[0]).toMatchObject({
      body: LONG_SNIPPET,
      summary: LONG_SNIPPET,
      sourceTextStatus: "search-excerpt",
    });
  });

  it.each([
    ["https://facebook.com/groups/devops/posts/1", "facebook", "facebook.com"],
    ["https://t.me/devops_channel/42", "telegram", "t.me"],
    ["https://telegram.me/devops_channel/42", "telegram", "telegram.me"],
    ["https://discord.com/channels/1/2", "discord", "discord.com"],
    ["https://discord.gg/devops", "discord", "discord.gg"],
    ["https://blog.example.co.uk/post", "web", "example.co.uk"],
  ] as const)("infers %s as %s", async (url, channel, quotaKey) => {
    const collected = await new DevopsInfraWebSearchAdapter(
      provider(true, [result({ url })]),
      retrieval(),
      () => NOW,
      1,
    ).collect();

    expect(collected.items[0]).toMatchObject({
      discoveryChannel: channel,
      sourceQuotaKey: quotaKey,
    });
  });

  it("isolates a failed query and continues collecting other query results", async () => {
    const failed = buildDevopsInfraWebSearchQueries(1)[0]!;
    const search = provider(true);
    search.search.mockImplementation(async (query) => {
      if (query.key === failed.key) throw new Error("429");
      return [result()];
    });

    const collected = await new DevopsInfraWebSearchAdapter(
      search,
      retrieval(),
      () => NOW,
      2,
    ).collect();

    expect(collected.items).toHaveLength(1);
    expect(collected.successfulSourceCount).toBe(1);
    expect(collected.failedSources).toEqual([`web:${failed.key}`]);
  });

  it("rejects unsafe URLs before retrieval", async () => {
    const webRetrieval = retrieval();
    const collected = await new DevopsInfraWebSearchAdapter(
      provider(true, [
        result({ url: "javascript:alert(1)" }),
        result({ url: "http://127.0.0.1/admin" }),
      ]),
      webRetrieval,
      () => NOW,
      1,
    ).collect();

    expect(collected.items).toEqual([]);
    expect(webRetrieval.retrieve).not.toHaveBeenCalled();
  });
});
