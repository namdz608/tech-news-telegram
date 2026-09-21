import { afterEach, describe, expect, it, vi } from "vitest";
import { DEVOPS_INFRA_STACKEXCHANGE_SITES } from "../../src/config/devops-infra-sources";
import { env } from "../../src/config/env";
import { DevopsInfraStackExchangeAdapter } from "../../src/services/devops-infra-stackexchange.adapter";

const NOW = new Date("2026-09-21T03:00:00.000Z");
const CREATION_DATE = 1_757_905_200;
const JSON_HEADERS = { "content-type": "application/json" };
const QUESTIONS_URL = "https://api.stackexchange.com/2.3/questions";
const ANSWERS_URL = `${QUESTIONS_URL}/123/answers`;
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
    ...overrides,
  };
}

function answer(overrides: Record<string, unknown> = {}) {
  return {
    question_id: 123,
    answer_id: 789,
    body: "<p>Increase the memory limit.</p>",
    score: 10,
    is_accepted: false,
    ...overrides,
  };
}

const acceptedAnswer = answer({
  answer_id: 456,
  body: "<p>Inspect previous container logs.</p>",
  score: 3,
  is_accepted: true,
});

/**
 * Serves the two documented hops: /questions then /questions/{ids}/answers.
 */
function createHttp(
  handle: (
    params: Record<string, string | number>,
    url: string,
  ) => Promise<{ data: unknown; headers?: Record<string, string> }>,
) {
  return {
    get: vi.fn(
      async (
        url: string,
        config: {
          headers: Record<string, string>;
          params: Record<string, string | number>;
        },
      ) => handle(config.params, url),
    ),
  };
}

function serverfault(questions: unknown[], answers: unknown[] = []) {
  return async (params: Record<string, string | number>, url: string) => {
    if (params.site !== "serverfault") return response();
    return url === QUESTIONS_URL ? response(questions) : response(answers);
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
      QUESTIONS_URL,
      expect.objectContaining({
        params: {
          order: "desc",
          sort: "creation",
          site: "serverfault",
          fromdate:
            Math.floor(NOW.getTime() / 1000) -
            env.DEVOPS_INFRA_MAX_AGE_HOURS * 3600,
          filter: "withbody",
        },
      }),
    );
  });

  it("sends a configured API key on both hops without logging it", async () => {
    env.STACKEXCHANGE_KEY = "secret-stackexchange-key";
    const http = createHttp(serverfault([question()], [acceptedAnswer]));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await new DevopsInfraStackExchangeAdapter(http, () => NOW).collect();

    expect(http.get).toHaveBeenCalledWith(
      QUESTIONS_URL,
      expect.objectContaining({
        params: expect.objectContaining({
          site: "serverfault",
          key: env.STACKEXCHANGE_KEY,
        }),
      }),
    );
    expect(http.get).toHaveBeenCalledWith(
      ANSWERS_URL,
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

  it("fetches answer bodies from /questions/{ids}/answers and strips HTML", async () => {
    const http = createHttp(
      serverfault([question()], [answer(), acceptedAnswer]),
    );

    const result = await new DevopsInfraStackExchangeAdapter(
      http,
      () => NOW,
    ).collect();

    expect(http.get).toHaveBeenCalledWith(
      ANSWERS_URL,
      expect.objectContaining({
        params: expect.objectContaining({
          order: "desc",
          sort: "votes",
          site: "serverfault",
          filter: "withbody",
          pagesize: 100,
        }),
      }),
    );
    expect(result.items).toEqual([
      {
        id: "https://serverfault.com/questions/123/pod-restarting",
        sourceId: "stackexchange",
        sourceName: "serverfault",
        title: "Why does my Kubernetes pod keep restarting?",
        url: "https://serverfault.com/questions/123/pod-restarting",
        summary: "The pod enters CrashLoopBackOff.",
        body: "The pod enters CrashLoopBackOff.",
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
            body: "Inspect previous container logs.",
            score: 3,
            accepted: true,
          },
        ],
        engagement: { score: 8 },
      },
    ]);
  });

  it("requests every answered question id in one vectorized call", async () => {
    const second = question({
      question_id: 321,
      link: "https://serverfault.com/questions/321/dns-timeout",
      accepted_answer_id: undefined,
    });
    const http = createHttp(async (params, url) => {
      if (params.site !== "serverfault") return response();
      return url === QUESTIONS_URL
        ? response([question(), second])
        : response([
            acceptedAnswer,
            answer({ question_id: 321, answer_id: 654, score: 2 }),
          ]);
    });

    const result = await new DevopsInfraStackExchangeAdapter(
      http,
      () => NOW,
    ).collect();

    expect(http.get).toHaveBeenCalledWith(
      `${QUESTIONS_URL}/123;321/answers`,
      expect.anything(),
    );
    expect(result.items).toHaveLength(2);
    expect(result.items[1]?.answers[0]?.body).toBe("Increase the memory limit.");
  });

  it("keeps embedded answers without a second request when present", async () => {
    const embedded = question({
      answers: [
        { answer_id: 456, body: "<p>Rotate the node.</p>", is_accepted: true },
      ],
    });
    const http = createHttp(serverfault([embedded]));

    const result = await new DevopsInfraStackExchangeAdapter(
      http,
      () => NOW,
    ).collect();

    expect(
      http.get.mock.calls.filter(([url]) => url !== QUESTIONS_URL),
    ).toEqual([]);
    expect(result.items[0]?.answers).toEqual([
      { body: "Rotate the node.", accepted: true },
    ]);
  });

  it("uses the highest-scoring answer when none is accepted", async () => {
    const withoutAccepted = question({ accepted_answer_id: undefined });
    const http = createHttp(
      serverfault(
        [withoutAccepted],
        [answer({ ...acceptedAnswer, is_accepted: false }), answer()],
      ),
    );

    const result = await new DevopsInfraStackExchangeAdapter(
      http,
      () => NOW,
    ).collect();

    expect(result.items[0]?.answers).toEqual([
      {
        body: "Increase the memory limit.",
        score: 10,
        accepted: false,
      },
    ]);
  });

  it("drops a question whose answers never arrive", async () => {
    const http = createHttp(serverfault([question()]));

    const result = await new DevopsInfraStackExchangeAdapter(
      http,
      () => NOW,
    ).collect();

    expect(result.items).toEqual([]);
    expect(result.failedSources).toEqual([]);
  });

  it("fails the site when the answers request fails", async () => {
    const http = createHttp(async (params, url) => {
      if (params.site !== "serverfault") return response();
      if (url !== QUESTIONS_URL) throw new Error("500");
      return response([question()]);
    });

    const result = await new DevopsInfraStackExchangeAdapter(
      http,
      () => NOW,
    ).collect();

    expect(result.items).toEqual([]);
    expect(result.failedSources).toEqual(["stackexchange:serverfault"]);
  });

  it("skips questions with zero answers without asking for answers", async () => {
    const http = createHttp(serverfault([question({ answer_count: 0 })]));

    const result = await new DevopsInfraStackExchangeAdapter(
      http,
      () => NOW,
    ).collect();

    expect(result.items).toEqual([]);
    expect(
      http.get.mock.calls.filter(([url]) => url !== QUESTIONS_URL),
    ).toEqual([]);
  });

  it("isolates a failed unix request and keeps serverfault items", async () => {
    const http = createHttp(async (params, url) => {
      if (params.site === "unix") {
        throw Object.assign(new Error("400"), { response: { status: 400 } });
      }
      if (params.site !== "serverfault") return response();
      return url === QUESTIONS_URL
        ? response([question()])
        : response([acceptedAnswer]);
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
      QUESTIONS_URL,
      expect.objectContaining({
        params: expect.objectContaining({
          site: "stackoverflow",
          tagged: stackOverflow?.tags?.join(";"),
        }),
      }),
    );
  });
});
