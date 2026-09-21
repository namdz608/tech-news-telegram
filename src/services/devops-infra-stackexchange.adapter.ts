import axios from "axios";
import { DEVOPS_INFRA_STACKEXCHANGE_SITES } from "../config/devops-infra-sources";
import { env } from "../config/env";
import type {
  DevopsInfraAnswer,
  DevopsInfraSourceItem,
} from "../types/devops-infra";
import { compactText } from "../utils/text";
import type {
  DevopsInfraSourceAdapter,
  DevopsInfraSourceAdapterResult,
} from "./devops-infra-source.adapter";

const QUESTIONS_URL = "https://api.stackexchange.com/2.3/questions";
const MAX_BODY_BYTES = 512 * 1024;

interface HttpResponse {
  data: unknown;
  headers?: Readonly<Record<string, string | undefined>>;
}

interface HttpClientLike {
  get(
    url: string,
    config: {
      headers: Record<string, string>;
      params: Record<string, string | number>;
    },
  ): Promise<HttpResponse>;
}

function createDefaultHttpClient(): HttpClientLike {
  return axios.create({
    timeout: env.REQUEST_TIMEOUT_MS,
    maxRedirects: 0,
    maxContentLength: MAX_BODY_BYTES,
    maxBodyLength: MAX_BODY_BYTES,
    headers: { "User-Agent": env.USER_AGENT },
  }) as HttpClientLike;
}

export class DevopsInfraStackExchangeAdapter implements DevopsInfraSourceAdapter {
  readonly key = "stackexchange";

  constructor(
    private readonly http: HttpClientLike = createDefaultHttpClient(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  isEnabled(): boolean {
    return true;
  }

  async collect(): Promise<DevopsInfraSourceAdapterResult> {
    const collectedAt = this.now();
    const settled = await Promise.all(
      DEVOPS_INFRA_STACKEXCHANGE_SITES.map(async ({ site, tags }) => {
        const sourceKey = `stackexchange:${site}`;
        try {
          const params: Record<string, string | number> = {
            order: "desc",
            sort: "creation",
            site,
            fromdate:
              Math.floor(collectedAt.getTime() / 1000) -
              env.DEVOPS_INFRA_MAX_AGE_HOURS * 3600,
            filter: "withbody",
            answers: 1,
          };
          if (tags?.length) {
            params.tagged = tags.join(";");
          }
          if (env.STACKEXCHANGE_KEY) {
            params.key = env.STACKEXCHANGE_KEY;
          }

          const response = await this.http.get(QUESTIONS_URL, {
            headers: {
              Accept: "application/json",
              "User-Agent": env.USER_AGENT,
            },
            params,
          });
          assertJsonContentType(response.headers);
          const items = parseItems(readJsonBody(response.data)).flatMap(
            (question) => {
              const item = mapQuestion(
                question,
                site,
                collectedAt.toISOString(),
              );
              return item ? [item] : [];
            },
          );
          return { ok: true as const, items };
        } catch {
          return { ok: false as const, sourceKey };
        }
      }),
    );

    const items: DevopsInfraSourceItem[] = [];
    const failedSources: string[] = [];
    let successfulSourceCount = 0;
    for (const result of settled) {
      if (result.ok) {
        successfulSourceCount += 1;
        items.push(...result.items);
      } else {
        failedSources.push(result.sourceKey);
      }
    }

    return { items, successfulSourceCount, failedSources };
  }
}

function mapQuestion(
  value: unknown,
  site: string,
  discoveredAt: string,
): DevopsInfraSourceItem | undefined {
  const question = asRecord(value);
  if (!question || finiteNumber(question.answer_count) === 0) {
    return undefined;
  }

  const title = readText(question.title);
  const url = readPublicHttpUrl(question.link);
  const body = readText(question.body);
  const publishedAt = unixSecondsToIso(question.creation_date);
  const selectedAnswer = selectAnswer(question);
  if (!title || !url || !body || !publishedAt || !selectedAnswer) {
    return undefined;
  }

  const communityKey = `stackexchange:${site}`;
  const author = readText(asRecord(question.owner)?.display_name) || undefined;
  const score = finiteNumber(question.score);

  return {
    id: url,
    sourceId: "stackexchange",
    sourceName: site,
    title,
    url,
    summary: body,
    body,
    ...(author ? { author } : {}),
    publishedAt,
    collectedAt: discoveredAt,
    discoveredAt,
    discoveryChannel: "stackexchange",
    communityKey,
    sourceQuotaKey: communityKey,
    sourceTextStatus: "full",
    answers: [selectedAnswer],
    ...(score === undefined ? {} : { engagement: { score } }),
  };
}

function selectAnswer(
  question: Record<string, unknown>,
): DevopsInfraAnswer | undefined {
  if (!Array.isArray(question.answers)) {
    return undefined;
  }
  const acceptedAnswerId = finiteNumber(question.accepted_answer_id);
  const candidates = question.answers.flatMap((value) => {
    const answer = asRecord(value);
    const body = readText(answer?.body);
    if (!answer || !body) {
      return [];
    }
    const answerId = finiteNumber(answer.answer_id);
    const score = finiteNumber(answer.score);
    return [{ answerId, body, score, isAccepted: answer.is_accepted === true }];
  });
  const accepted = candidates.find(
    ({ answerId, isAccepted }) =>
      isAccepted ||
      (acceptedAnswerId !== undefined && answerId === acceptedAnswerId),
  );
  const selected =
    accepted ??
    candidates.reduce<(typeof candidates)[number] | undefined>(
      (highest, candidate) =>
        !highest || (candidate.score ?? 0) > (highest.score ?? 0)
          ? candidate
          : highest,
      undefined,
    );
  if (!selected) {
    return undefined;
  }
  return {
    body: selected.body,
    ...(selected.score === undefined ? {} : { score: selected.score }),
    accepted: Boolean(accepted),
  };
}

function parseItems(payload: unknown): unknown[] {
  const items = asRecord(payload)?.items;
  if (!Array.isArray(items)) {
    throw new Error("stackexchange-items");
  }
  return items;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readText(value: unknown): string {
  return typeof value === "string" ? compactText(value) : "";
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function unixSecondsToIso(value: unknown): string | undefined {
  const seconds = finiteNumber(value);
  if (seconds === undefined || seconds <= 0) {
    return undefined;
  }
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function readPublicHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
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

function readJsonBody(data: unknown): unknown {
  if (typeof data !== "string") {
    return data;
  }
  try {
    return JSON.parse(data) as unknown;
  } catch {
    throw new Error("stackexchange-json");
  }
}

function assertJsonContentType(
  headers?: Readonly<Record<string, string | undefined>>,
): void {
  if (!headers) {
    throw new Error("stackexchange-content-type");
  }
  const record = headers as Record<string, unknown>;
  const direct = record["content-type"] ?? record["Content-Type"];
  const getter = (headers as { get?: (name: string) => unknown }).get;
  const value =
    typeof direct === "string"
      ? direct
      : typeof getter === "function"
        ? getter.call(headers, "content-type")
        : undefined;
  if (
    typeof value !== "string" ||
    value.split(";", 1)[0].trim().toLowerCase() !== "application/json"
  ) {
    throw new Error("stackexchange-content-type");
  }
}
