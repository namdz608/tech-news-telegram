import { describe, expect, it } from "vitest";
import { FallbackWebSearchProvider } from "../../src/services/fallback-web-search.provider";
import type {
  WebSearchProvider,
  WebSearchResult,
} from "../../src/services/web-search.provider";

const QUERY = { key: "devops", text: "Kubernetes incident" };
const RESULT: WebSearchResult = {
  title: "Incident",
  url: "https://example.com/incident",
  snippet: "Report",
  publishedAt: "2026-10-08T00:00:00.000Z",
};

function provider(
  key: string,
  enabled: boolean,
  response: WebSearchResult[] | Error,
  calls: string[],
): WebSearchProvider {
  return {
    key,
    isEnabled: () => enabled,
    search: async (query) => {
      expect(query).toBe(QUERY);
      calls.push(key);
      if (response instanceof Error) throw response;
      return response;
    },
  };
}

describe("FallbackWebSearchProvider", () => {
  it("disables an empty or fully disabled chain and skips searches", async () => {
    const calls: string[] = [];
    for (const providers of [
      [],
      [provider("disabled", false, new Error("secret"), calls)],
    ]) {
      const fallback = new FallbackWebSearchProvider(providers);
      expect(fallback.key).toBe("web-search");
      expect(fallback.isEnabled()).toBe(false);
      await expect(fallback.search(QUERY)).resolves.toEqual([]);
    }
    expect(calls).toEqual([]);
  });

  it("returns the first enabled provider with results and stops the chain", async () => {
    const calls: string[] = [];
    const fallback = new FallbackWebSearchProvider([
      provider("disabled", false, [RESULT], calls),
      provider("first", true, [RESULT], calls),
      provider("unused", true, [RESULT], calls),
    ]);
    expect(fallback.isEnabled()).toBe(true);
    await expect(fallback.search(QUERY)).resolves.toEqual([RESULT]);
    expect(calls).toEqual(["first"]);
  });

  it("tries providers in order after errors and valid empty results", async () => {
    const calls: string[] = [];
    const fallback = new FallbackWebSearchProvider([
      provider("quota", true, new Error("quota-secret"), calls),
      provider("empty", true, [], calls),
      provider("last", true, [RESULT], calls),
    ]);
    await expect(fallback.search(QUERY)).resolves.toEqual([RESULT]);
    expect(calls).toEqual(["quota", "empty", "last"]);
  });

  it("reports a stable error only when every enabled provider fails", async () => {
    const calls: string[] = [];
    const fallback = new FallbackWebSearchProvider([
      provider("disabled", false, [], calls),
      provider("first", true, new Error("credential-secret"), calls),
      provider("second", true, new Error("quota-secret"), calls),
    ]);
    await expect(fallback.search(QUERY)).rejects.toEqual(
      new Error("web-search"),
    );
    expect(calls).toEqual(["first", "second"]);
  });

  it.each([true, false])(
    "preserves a successful empty response when another provider errors (empty first: %s)",
    async (emptyFirst) => {
      const calls: string[] = [];
      const empty = provider("empty", true, [], calls);
      const failed = provider("failed", true, new Error("quota-secret"), calls);
      await expect(
        new FallbackWebSearchProvider(
          emptyFirst ? [empty, failed] : [failed, empty],
        ).search(QUERY),
      ).resolves.toEqual([]);
      expect(calls).toHaveLength(2);
    },
  );
});
