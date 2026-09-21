import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../src/config/env";
import { DevopsInfraFacebookAdapter } from "../../src/services/devops-infra-facebook.adapter";
import { parseFacebookPageAllowlist } from "../../src/utils/devops-infra-allowlist";

const NOW = new Date("2026-09-21T03:00:00.000Z");
const TOKEN = "test-facebook-token";
const originalToken = env.FACEBOOK_ACCESS_TOKEN;
const originalAllowlist = env.FACEBOOK_PAGE_ALLOWLIST;

function http(
  handle: (url: string) => Promise<{ data: unknown }> = async () => ({
    data: { data: [] },
  }),
) {
  return {
    get: vi.fn(
      async (
        url: string,
        _config: { headers: Record<string, string>; params: Record<string, string> },
      ) => handle(url),
    ),
  };
}

describe("parseFacebookPageAllowlist", () => {
  it("parses page IDs and ignores malformed values", () => {
    expect(parseFacebookPageAllowlist("123, 456")).toEqual(["123", "456"]);
    expect(parseFacebookPageAllowlist("abc,12:34,,  ")).toEqual([]);
    expect(parseFacebookPageAllowlist(" \t ")).toEqual([]);
  });
});

describe("DevopsInfraFacebookAdapter", () => {
  beforeEach(() => {
    env.FACEBOOK_ACCESS_TOKEN = TOKEN;
    env.FACEBOOK_PAGE_ALLOWLIST = "123,456";
  });

  afterEach(() => {
    env.FACEBOOK_ACCESS_TOKEN = originalToken;
    env.FACEBOOK_PAGE_ALLOWLIST = originalAllowlist;
  });

  it.each([
    ["", "123"],
    [TOKEN, ""],
    [TOKEN, "not-a-page"],
  ])("is disabled for incomplete configuration", async (token, allowlist) => {
    env.FACEBOOK_ACCESS_TOKEN = token;
    env.FACEBOOK_PAGE_ALLOWLIST = allowlist;
    const client = http();
    const adapter = new DevopsInfraFacebookAdapter(client, () => NOW);

    expect(adapter.isEnabled()).toBe(false);
    await expect(adapter.collect()).resolves.toEqual({
      items: [],
      successfulSourceCount: 0,
      failedSources: [],
    });
    expect(client.get).not.toHaveBeenCalled();
  });

  it("requests only allowlisted Page feeds with the exact Graph fields", async () => {
    const client = http();

    const result = await new DevopsInfraFacebookAdapter(client, () => NOW).collect();

    expect(client.get).toHaveBeenCalledTimes(2);
    for (const pageId of ["123", "456"]) {
      expect(client.get).toHaveBeenCalledWith(
        `https://graph.facebook.com/v21.0/${pageId}/feed`,
        {
          headers: { Accept: "application/json" },
          params: {
            fields: "message,created_time,permalink_url",
            access_token: TOKEN,
          },
        },
      );
    }
    expect(
      client.get.mock.calls.every(
        ([url]) =>
          /^https:\/\/graph\.facebook\.com\/v21\.0\/(123|456)\/feed$/.test(
            String(url),
          ),
      ),
    ).toBe(true);
    expect(result.successfulSourceCount).toBe(2);
  });

  it("maps valid posts and skips posts missing message or permalink", async () => {
    env.FACEBOOK_PAGE_ALLOWLIST = "123";
    const client = http(async () => ({
      data: {
        data: [
          {
            id: "123_789",
            message: "  Replacing the failed node restored the cluster.  ",
            created_time: "2026-09-21T01:00:00+0000",
            permalink_url: "https://www.facebook.com/123/posts/789",
          },
          {
            id: "123_790",
            created_time: "2026-09-21T01:01:00+0000",
            permalink_url: "https://www.facebook.com/123/posts/790",
          },
          {
            id: "123_791",
            message: "No link",
            created_time: "2026-09-21T01:02:00+0000",
          },
        ],
      },
    }));

    const result = await new DevopsInfraFacebookAdapter(client, () => NOW).collect();

    expect(result).toEqual({
      items: [
        {
          id: "123_789",
          sourceId: "facebook",
          sourceName: "Facebook Page 123",
          title: "Replacing the failed node restored the cluster.",
          url: "https://www.facebook.com/123/posts/789",
          summary: "Replacing the failed node restored the cluster.",
          body: "Replacing the failed node restored the cluster.",
          publishedAt: "2026-09-21T01:00:00.000Z",
          collectedAt: NOW.toISOString(),
          discoveredAt: NOW.toISOString(),
          discoveryChannel: "facebook",
          communityKey: "facebook:123",
          sourceQuotaKey: "facebook:123",
          sourceTextStatus: "full",
          answers: [],
        },
      ],
      successfulSourceCount: 1,
      failedSources: [],
    });
  });

  it("uses env allowlist only and isolates one failed page", async () => {
    const client = http(async (url) => {
      if (url.includes("/123/feed")) {
        throw Object.assign(new Error("bad request"), { response: { status: 400 } });
      }
      return { data: { data: [] } };
    });
    const Adapter = DevopsInfraFacebookAdapter as unknown as new (
      client: ReturnType<typeof http>,
      now: () => Date,
      maliciousPageIds: string[],
    ) => DevopsInfraFacebookAdapter;

    const result = await new Adapter(client, () => NOW, ["999"]).collect();

    expect(result).toEqual({
      items: [],
      successfulSourceCount: 1,
      failedSources: ["facebook:123"],
    });
    expect(client.get.mock.calls.some(([url]) => String(url).includes("/999/"))).toBe(
      false,
    );
    expect(JSON.stringify(client.get.mock.calls)).toContain(TOKEN);
  });
});
