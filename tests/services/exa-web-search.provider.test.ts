import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { env } from "../../src/config/env";
import { ExaWebSearchProvider } from "../../src/services/exa-web-search.provider";

const QUERY = { key: "devops", text: "Kubernetes incident report" };
const TOKEN = "test-exa-token";

function result(overrides: Record<string, unknown> = {}) {
  return {
    title: "Kubernetes <b>incident</b>",
    url: "https://example.com/report#section",
    publishedDate: "2026-10-08T03:00:00+07:00",
    text: " A detailed <b>incident</b> report. ",
    ...overrides,
  };
}

function client(data: unknown, contentType = "application/json", status = 200) {
  return {
    post: vi.fn().mockResolvedValue({
      data,
      headers: { "content-type": contentType },
      status,
    }),
  };
}

async function withServer(
  handler: (
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ) => void,
  run: (origin: string, requests: http.IncomingMessage[]) => Promise<void>,
) {
  const requests: http.IncomingMessage[] = [];
  const server = http.createServer((request, response) => {
    requests.push(request);
    handler(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      requests,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

describe("ExaWebSearchProvider", () => {
  it("bounds a long title to 2000 characters", async () => {
    const results = await new ExaWebSearchProvider(
      TOKEN,
      client({ results: [result({ title: "x".repeat(3000) })] }),
    ).search(QUERY);
    expect(results[0].title).toBe("x".repeat(2000));
  });

  it.each(["https://192.0.0.1/story", "https://198.18.0.1/story"])(
    "drops the non-public literal IP URL %s",
    async (url) => {
      await expect(
        new ExaWebSearchProvider(
          TOKEN,
          client({ results: [result({ url })] }),
        ).search(QUERY),
      ).resolves.toEqual([]);
    },
  );

  it("keeps a public IPv6 address", async () => {
    const url = "https://[2606:4700:4700::1111]/story";
    const results = await new ExaWebSearchProvider(
      TOKEN,
      client({ results: [result({ url })] }),
    ).search(QUERY);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe(url);
  });

  it("preserves a source path trailing slash while removing only its fragment", async () => {
    const results = await new ExaWebSearchProvider(
      TOKEN,
      client({
        results: [result({ url: "https://example.com/report/#section" })],
      }),
    ).search(QUERY);
    expect(results[0].url).toBe("https://example.com/report/");
  });

  it("disables empty credentials without calling HTTP", async () => {
    const httpClient = client({ results: [] });
    const provider = new ExaWebSearchProvider("  ", httpClient);
    expect(provider.key).toBe("exa-search");
    expect(provider.isEnabled()).toBe(false);
    await expect(provider.search(QUERY)).resolves.toEqual([]);
    expect(httpClient.post).not.toHaveBeenCalled();
  });

  it("uses the native HTTPS API and maps only documented result fields", async () => {
    const httpClient = client(
      JSON.stringify({
        results: [
          result({ author: "Ignored author", summary: "Ignored summary" }),
        ],
      }),
    );
    const provider = new ExaWebSearchProvider(TOKEN, httpClient);
    expect(provider.isEnabled()).toBe(true);
    await expect(provider.search(QUERY)).resolves.toEqual([
      {
        title: "Kubernetes incident",
        url: "https://example.com/report",
        snippet: "A detailed incident report.",
        publishedAt: "2026-10-07T20:00:00.000Z",
      },
    ]);
    expect(httpClient.post).toHaveBeenCalledWith(
      "https://api.exa.ai/search",
      {
        query: QUERY.text,
        type: "auto",
        numResults: 10,
        contents: { text: { maxCharacters: 2000 }, highlights: true },
      },
      expect.objectContaining({
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-api-key": TOKEN,
          "User-Agent": env.USER_AGENT,
        },
        timeout: env.REQUEST_TIMEOUT_MS,
        maxRedirects: 0,
        maxContentLength: 512 * 1024,
        maxBodyLength: 512 * 1024,
      }),
    );
    expect(JSON.stringify(httpClient.post.mock.calls[0][1])).not.toContain(
      TOKEN,
    );
  });

  it("uses highlights when text is absent and bounds snippets", async () => {
    const provider = new ExaWebSearchProvider(
      TOKEN,
      client({
        results: [
          result({
            text: undefined,
            highlights: [" First <b>highlight</b>. ", "Second highlight."],
          }),
          result({ text: "long ".repeat(1000) }),
        ],
      }),
    );
    const results = await provider.search(QUERY);
    expect(results[0].snippet).toBe("First highlight. Second highlight.");
    expect(results[1].snippet.length).toBe(2000);
  });

  it("drops undated, impossible dates, incomplete and non-public results", async () => {
    const entries = [
      result({ publishedDate: undefined, crawlDate: "2026-10-08T00:00:00Z" }),
      result({ publishedDate: "2026-02-30T00:00:00Z" }),
      result({ publishedDate: "2026-10-08" }),
      result({ publishedDate: "2026-10-08T24:00:00Z" }),
      result({ publishedDate: "yesterday" }),
      result({ title: " " }),
      result({ text: "", summary: "Summary is not an accepted source" }),
      ...[
        "ftp://example.com/file",
        "https://user:secret@example.com",
        "http://127.0.0.1/admin",
        "http://10.0.0.1/admin",
        "http://[::1]/admin",
        "http://localhost/admin",
        "http://service.local/admin",
      ].map((url) => result({ url })),
      result(),
    ];
    const results = await new ExaWebSearchProvider(
      TOKEN,
      client({ results: entries }),
    ).search(QUERY);
    expect(results).toHaveLength(1);
    expect(results[0].publishedAt).toBe("2026-10-07T20:00:00.000Z");
  });

  it.each([
    "{broken JSON",
    {},
    { results: {} },
    { results: [null] },
    { results: [result({ highlights: [4] })] },
    { results: [result({ text: {} })] },
    { results: [result({ title: 7 })] },
    { results: [], error: "quota-secret" },
  ])(
    "rejects malformed JSON and schema with a credential-free stable error: %j",
    async (payload) => {
      await expect(
        new ExaWebSearchProvider(TOKEN, client(payload)).search(QUERY),
      ).rejects.toEqual(new Error("exa-search"));
    },
  );

  it("accepts a valid empty result set", async () => {
    await expect(
      new ExaWebSearchProvider(TOKEN, client({ results: [] })).search(QUERY),
    ).resolves.toEqual([]);
  });

  it.each([402, 429, 503])(
    "stabilizes HTTP and quota failures without retaining secrets: %s",
    async (status) => {
      const failure = Object.assign(new Error(`secret-${TOKEN}`), {
        config: { headers: { "x-api-key": TOKEN } },
        response: { status, data: "quota-secret" },
      });
      const httpClient = { post: vi.fn().mockRejectedValue(failure) };
      try {
        await new ExaWebSearchProvider(TOKEN, httpClient).search(QUERY);
        throw new Error("Expected search failure");
      } catch (error) {
        expect(error).toEqual(new Error("exa-search"));
        expect(error).not.toHaveProperty("config");
        expect(error).not.toHaveProperty("cause");
      }
      await expect(
        new ExaWebSearchProvider(
          TOKEN,
          client({ results: [] }, "application/json", status),
        ).search(QUERY),
      ).rejects.toEqual(new Error("exa-search"));
    },
  );

  it("rejects wrong MIME and oversize responses", async () => {
    await expect(
      new ExaWebSearchProvider(
        TOKEN,
        client({ results: [] }, "text/html"),
      ).search(QUERY),
    ).rejects.toEqual(new Error("exa-search"));
    await withServer(
      (_request, response) => {
        const body = JSON.stringify({
          results: [result({ text: "x".repeat(512 * 1024) })],
        });
        response.writeHead(200, { "content-type": "application/json" });
        response.end(body);
      },
      async (origin) => {
        await expect(
          new ExaWebSearchProvider(TOKEN, undefined, `${origin}/search`).search(
            QUERY,
          ),
        ).rejects.toEqual(new Error("exa-search"));
      },
    );
  });

  it("does not follow redirects carrying the API key", async () => {
    await withServer(
      (_request, response) => {
        response.writeHead(302, { location: "/secret-target" });
        response.end("redirect secret");
      },
      async (origin, requests) => {
        await expect(
          new ExaWebSearchProvider(TOKEN, undefined, `${origin}/search`).search(
            QUERY,
          ),
        ).rejects.toEqual(new Error("exa-search"));
        expect(requests).toHaveLength(1);
        expect(requests[0].url).toBe("/search");
        expect(requests[0].headers["x-api-key"]).toBe(TOKEN);
      },
    );
  });
});
