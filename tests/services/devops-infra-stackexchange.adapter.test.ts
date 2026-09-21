import { afterEach, describe, expect, it, vi } from "vitest";
import { DEVOPS_INFRA_STACKEXCHANGE_SITES } from "../../src/config/devops-infra-sources";
import { env } from "../../src/config/env";
import { DevopsInfraStackExchangeAdapter } from "../../src/services/devops-infra-stackexchange.adapter";

const NOW = new Date("2026-09-21T03:00:00.000Z");
const CREATION_DATE = 1_757_905_200;
const JSON_HEADERS = { "content-type": "application/json" };
const originalKey = env.STACKEXCHANGE_KEY;

function response(items: unknown[] = []) {
  return { data: { items }, headers: JSON_HEADERS };
}

function question(overrides: Record<string, unknown> = {}) {
  return {
    question_id: 123,
    title: "Why does my Kubernetes pod keep restarting?",
    link: "https://serverfault.com/questions/123/pod-restarting",
    body: "<p>The pod enters CrashLoopBackOff.</p>",
    creation_date: CREATION_DATE,
    score: 8,
    answer_count: 2,
    owner: { display_name: "operator" },
    accepted_answer_id: 456,
    answers: [
      {
        answer_id: 789,
        body: "<p>Increase the memory limit.</p>",
        score: 10,
        is_accepted: false,
      },
      {
        answer_id: 456,
        body: "<p>Inspect previous container logs.</p>",
        score: 3,
        is_accepted: true,
      },
    ],
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

afterEach(() => {
  env.STACKEXCHANGE_KEY = originalKey;
  vi.restoreAllMocks();
});

describe("DevopsInfraStackExchangeAdapter", () => {
  it("is always enabled, including without an API key", () => {
    env.STACKEXCHANGE_KEY = "";
    const adapter = new DevopsInfraStackExchangeAdapter(
      createHttp(async () => response()),
    );

    expect(adapter.key).toBe("stackexchange");
    expect(adapter.isEnabled()).toBe(true);
  });

  it("requests recent serverfault questions without an empty key", async () => {
    env.STACKEXCHANGE_KEY = "";
    const http = createHttp(async () => response());

    await new DevopsInfraStackExchangeAdapter(http, () => NOW).collect();

    expect(http.get).toHaveBeenCalledWith(
      "https://api.stackexchange.com/2.3/questions",
      expect.objectContaining({
        params: {
          order: "desc",
          sort: "creation",
          site: "serverfault",
          fromdate:
            Math.floor(NOW.getTime() / 1000) -
            env.DEVOPS_INFRA_MAX_AGE_HOURS * 3600,
          filter: "withbody",
          answers: 1,
        },
      }),
    );
  });

  it("sends a configured API key without logging it", async () => {
    env.STACKEXCHANGE_KEY = "secret-stackexchange-key";
    const http = createHttp(async () => response());
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await new DevopsInfraStackExchangeAdapter(http, () => NOW).collect();

    expect(http.get).toHaveBeenCalledWith(
      "https://api.stackexchange.com/2.3/questions",
      expect.objectContaining({
        params: expect.objectContaining({
          site: "serverfault",
          key: env.STACKEXCHANGE_KEY,
        }),
      }),
    );
    expect(
      JSON.stringify([
        ...log.mock.calls,
        ...warn.mock.calls,
        ...error.mock.calls,
      ]),
    ).not.toContain(env.STACKEXCHANGE_KEY);
  });

  it("maps a question with its accepted answer", async () => {
    const http = createHttp(async (params) =>
      params.site === "serverfault" ? response([question()]) : response(),
    );

    const result = await new DevopsInfraStackExchangeAdapter(
      http,
      () => NOW,
    ).collect();

    expect(result.items).toEqual([
      {
        id: "https://serverfault.com/questions/123/pod-restarting",
        sourceId: "stackexchange",
        sourceName: "serverfault",
        title: "Why does my Kubernetes pod keep restarting?",
        url: "https://serverfault.com/questions/123/pod-restarting",
        summary: "<p>The pod enters CrashLoopBackOff.</p>",
        body: "<p>The pod enters CrashLoopBackOff.</p>",
        author: "operator",
        publishedAt: new Date(CREATION_DATE * 1000).toISOString(),
        collectedAt: NOW.toISOString(),
        discoveredAt: NOW.toISOString(),
        discoveryChannel: "stackexchange",
        communityKey: "stackexchange:serverfault",
        sourceQuotaKey: "stackexchange:serverfault",
        sourceTextStatus: "full",
        answers: [
          {
            body: "<p>Inspect previous container logs.</p>",
            score: 3,
            accepted: true,
          },
        ],
        engagement: { score: 8, comments: 2 },
      },
    ]);
  });

  it("uses the highest-scoring answer when none is accepted", async () => {
    const withoutAccepted = question({
      accepted_answer_id: undefined,
      answers: [
        {
          answer_id: 789,
          body: "<p>Increase the memory limit.</p>",
          score: 10,
          is_accepted: false,
        },
        {
          answer_id: 456,
          body: "<p>Inspect previous container logs.</p>",
          score: 3,
          is_accepted: false,
        },
      ],
    });
    const http = createHttp(async (params) =>
      params.site === "serverfault" ? response([withoutAccepted]) : response(),
    );

    const result = await new DevopsInfraStackExchangeAdapter(
      http,
      () => NOW,
    ).collect();

    expect(result.items[0]?.answers).toEqual([
      {
        body: "<p>Increase the memory limit.</p>",
        score: 10,
        accepted: false,
      },
    ]);
  });

  it("skips questions with zero answers", async () => {
    const http = createHttp(async (params) =>
      params.site === "serverfault"
        ? response([question({ answer_count: 0, answers: [] })])
        : response(),
    );

    const result = await new DevopsInfraStackExchangeAdapter(
      http,
      () => NOW,
    ).collect();

    expect(result.items).toEqual([]);
  });

  it("isolates a failed unix request and keeps serverfault items", async () => {
    const http = createHttp(async (params) => {
      if (params.site === "unix") {
        throw Object.assign(new Error("400"), { response: { status: 400 } });
      }
      return params.site === "serverfault"
        ? response([question()])
        : response();
    });

    const result = await new DevopsInfraStackExchangeAdapter(
      http,
      () => NOW,
    ).collect();

    expect(result.items).toHaveLength(1);
    expect(result.successfulSourceCount).toBe(
      DEVOPS_INFRA_STACKEXCHANGE_SITES.length - 1,
    );
    expect(result.failedSources).toEqual(["stackexchange:unix"]);
  });

  it("joins Stack Overflow tags with semicolons", async () => {
    const http = createHttp(async () => response());

    await new DevopsInfraStackExchangeAdapter(http, () => NOW).collect();

    const stackOverflow = DEVOPS_INFRA_STACKEXCHANGE_SITES.find(
      ({ site }) => site === "stackoverflow",
    );
    expect(http.get).toHaveBeenCalledWith(
      "https://api.stackexchange.com/2.3/questions",
      expect.objectContaining({
        params: expect.objectContaining({
          site: "stackoverflow",
          tagged: stackOverflow?.tags?.join(";"),
        }),
      }),
    );
  });
});
