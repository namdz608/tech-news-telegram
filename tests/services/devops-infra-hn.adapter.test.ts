import { describe, expect, it, vi } from "vitest";
import { devopsInfraHnQueries } from "../../src/config/devops-infra-sources";
import { env } from "../../src/config/env";
import { DevopsInfraHnAdapter } from "../../src/services/devops-infra-hn.adapter";

const NOW = new Date("2026-09-21T03:00:00.000Z");
const JSON_HEADERS = { "content-type": "application/json" };
const RECENT_UNIX = Math.floor(NOW.getTime() / 1000) - 3600;

function response(hits: unknown[] = []) {
  return { data: { hits }, headers: JSON_HEADERS };
}

function hit(overrides: Record<string, unknown> = {}) {
  return {
    objectID: "456",
    title: "Kubernetes pod outage postmortem",
    story_url: "https://example.com/kubernetes-postmortem",
    story_text: "<p>Pods restarted because memory limits were too low.</p>",
    author: "operator",
    created_at_i: RECENT_UNIX,
    points: 42,
    num_comments: 9,
    ...overrides,
  };
}

function createHttp(
  handle: (
    params: Record<string, string | number>,
  ) => Promise<{ data: unknown; headers?: Record<string, string> }>,
) {
  return {
    get: vi.fn(
      async (
        _url: string,
        config: {
          headers: Record<string, string>;
          params: Record<string, string | number>;
        },
      ) => handle(config.params),
    ),
  };
}

describe("DevopsInfraHnAdapter", () => {
  it("requests every catalog query with the age filter and limit", async () => {
    const http = createHttp(async () => response());
    const adapter = new DevopsInfraHnAdapter(http, () => NOW);

    expect(adapter.key).toBe("hn-search");
    expect(adapter.isEnabled()).toBe(true);

    const result = await adapter.collect();
    const fromUnix =
      Math.floor(NOW.getTime() / 1000) - env.DEVOPS_INFRA_MAX_AGE_HOURS * 3600;
    for (const query of devopsInfraHnQueries) {
      expect(http.get).toHaveBeenCalledWith(
        "https://hn.algolia.com/api/v1/search",
        expect.objectContaining({
          params: {
            query: query.text,
            numericFilters: `created_at_i>${fromUnix}`,
            hitsPerPage: 10,
          },
        }),
      );
    }
    expect(result).toEqual({
      items: [],
      successfulSourceCount: devopsInfraHnQueries.length,
      failedSources: [],
    });
  });

  it("maps story URLs, metadata, and story text", async () => {
    const firstQuery = devopsInfraHnQueries[0];
    const http = createHttp(async (params) =>
      params.query === firstQuery.text ? response([hit()]) : response(),
    );

    const result = await new DevopsInfraHnAdapter(http, () => NOW).collect();

    expect(result.items).toEqual([
      {
        id: "456",
        sourceId: "hn",
        sourceName: "Hacker News",
        title: "Kubernetes pod outage postmortem",
        url: "https://example.com/kubernetes-postmortem",
        summary: "Pods restarted because memory limits were too low.",
        body: "Pods restarted because memory limits were too low.",
        author: "operator",
        publishedAt: new Date(RECENT_UNIX * 1000).toISOString(),
        collectedAt: NOW.toISOString(),
        discoveredAt: NOW.toISOString(),
        discoveryChannel: "hn",
        communityKey: "hn",
        sourceQuotaKey: "hn",
        sourceTextStatus: "full",
        answers: [],
        engagement: { score: 42, comments: 9 },
      },
    ]);
  });

  it("uses the HN item URL and comment text when story_url is absent", async () => {
    const firstQuery = devopsInfraHnQueries[0];
    const http = createHttp(async (params) =>
      params.query === firstQuery.text
        ? response([
            hit({
              objectID: "789",
              title: undefined,
              story_title: "Ask HN: Terraform state lock failure",
              story_url: undefined,
              story_text: undefined,
              comment_text:
                "<p>Remove the stale lock after checking active runs.</p>"
                + "<p>Then run <code>terraform force-unlock</code>.</p>",
            }),
          ])
        : response(),
    );

    const result = await new DevopsInfraHnAdapter(http, () => NOW).collect();

    expect(result.items[0]).toMatchObject({
      id: "789",
      title: "Ask HN: Terraform state lock failure",
      url: "https://news.ycombinator.com/item?id=789",
      summary:
        "Remove the stale lock after checking active runs. "
        + "Then run terraform force-unlock.",
      body:
        "Remove the stale lock after checking active runs. "
        + "Then run terraform force-unlock.",
      sourceTextStatus: "full",
    });
  });

  it("rejects non-http story URLs", async () => {
    const firstQuery = devopsInfraHnQueries[0];
    const http = createHttp(async (params) =>
      params.query === firstQuery.text
        ? response([hit({ story_url: "javascript:alert(1)" })])
        : response(),
    );

    const result = await new DevopsInfraHnAdapter(http, () => NOW).collect();

    expect(result.items).toEqual([]);
  });

  it("isolates one failed query while other queries succeed", async () => {
    const failedQuery = devopsInfraHnQueries[0];
    const successfulQuery = devopsInfraHnQueries[1];
    const http = createHttp(async (params) => {
      if (params.query === failedQuery.text) {
        throw new Error("429");
      }
      return params.query === successfulQuery.text
        ? response([hit()])
        : response();
    });

    const result = await new DevopsInfraHnAdapter(http, () => NOW).collect();

    expect(result.items).toHaveLength(1);
    expect(result.successfulSourceCount).toBe(devopsInfraHnQueries.length - 1);
    expect(result.failedSources).toEqual([`hn:${failedQuery.key}`]);
  });

  it("reports every query when all requests fail", async () => {
    const http = createHttp(async () => {
      throw new Error("network");
    });

    const result = await new DevopsInfraHnAdapter(http, () => NOW).collect();

    expect(result).toEqual({
      items: [],
      successfulSourceCount: 0,
      failedSources: devopsInfraHnQueries.map(({ key }) => `hn:${key}`),
    });
  });

  it("drops hits older than the configured maximum age", async () => {
    const firstQuery = devopsInfraHnQueries[0];
    const cutoffUnix =
      Math.floor(NOW.getTime() / 1000) - env.DEVOPS_INFRA_MAX_AGE_HOURS * 3600;
    const http = createHttp(async (params) =>
      params.query === firstQuery.text
        ? response([hit({ created_at_i: cutoffUnix - 1 })])
        : response(),
    );

    const result = await new DevopsInfraHnAdapter(http, () => NOW).collect();

    expect(result.items).toEqual([]);
    expect(result.successfulSourceCount).toBe(devopsInfraHnQueries.length);
  });
});
