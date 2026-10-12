import axios from "axios";
import { env } from "../config/env";
import { compactText } from "../utils/text";
import { isPublicHttpUrl } from "./safe-web-retrieval.service";
import type { WebSearchProvider, WebSearchResult } from "./web-search.provider";

const SEARCH_URL = "https://api.exa.ai/search";
const MAX_BODY_BYTES = 512 * 1024;
const MAX_SNIPPET_CHARS = 2000;
const MAX_TITLE_CHARS = 2000;
const STABLE_ERROR = "exa-search";
const ISO_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

interface HttpClientLike {
  post(
    url: string,
    body: {
      query: string;
      type: string;
      numResults: number;
      contents: { text: { maxCharacters: number }; highlights: boolean };
    },
    config: {
      headers: Record<string, string>;
      timeout: number;
      maxRedirects: number;
      maxContentLength: number;
      maxBodyLength: number;
      responseType: "text";
    },
  ): Promise<{
    data: unknown;
    headers?: Readonly<Record<string, string | undefined>>;
    status?: number;
  }>;
}

export class ExaWebSearchProvider implements WebSearchProvider {
  readonly key = "exa-search";

  constructor(
    private readonly apiKey: string = process.env.EXA_API_KEY ?? "",
    private readonly http: HttpClientLike = axios.create(),
    private readonly searchUrl: string = SEARCH_URL,
  ) {}

  isEnabled(): boolean {
    return this.apiKey.trim() !== "";
  }

  async search(query: {
    key: string;
    text: string;
  }): Promise<WebSearchResult[]> {
    if (!this.isEnabled()) return [];
    try {
      const response = await this.http.post(
        this.searchUrl,
        {
          query: query.text,
          type: "auto",
          numResults: 10,
          contents: {
            text: { maxCharacters: MAX_SNIPPET_CHARS },
            highlights: true,
          },
        },
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
            "User-Agent": env.USER_AGENT,
          },
          timeout: env.REQUEST_TIMEOUT_MS,
          maxRedirects: 0,
          maxContentLength: MAX_BODY_BYTES,
          maxBodyLength: MAX_BODY_BYTES,
          responseType: "text",
        },
      );
      if (
        response.status !== undefined &&
        (response.status < 200 || response.status >= 300)
      ) {
        throw new Error(STABLE_ERROR);
      }
      assertJsonContentType(response.headers);
      const data = readJsonBody(response.data);
      const payload = asRecord(data);
      if (!Array.isArray(payload.results) || payload.error !== undefined)
        throw new Error(STABLE_ERROR);
      return payload.results.flatMap((entry) => {
        const mapped = mapResult(entry);
        return mapped ? [mapped] : [];
      });
    } catch {
      // Axios errors can retain request headers and response bodies containing secrets.
      throw new Error(STABLE_ERROR);
    }
  }
}

function assertJsonContentType(
  headers?: Readonly<Record<string, string | undefined>>,
): void {
  const contentType =
    headers &&
    Object.entries(headers).find(
      ([name]) => name.toLowerCase() === "content-type",
    )?.[1];
  if (
    typeof contentType !== "string" ||
    contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json"
  ) {
    throw new Error(STABLE_ERROR);
  }
}

function readJsonBody(data: unknown): unknown {
  if (typeof data !== "string") return data;
  if (Buffer.byteLength(data, "utf8") > MAX_BODY_BYTES)
    throw new Error(STABLE_ERROR);
  return JSON.parse(data) as unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(STABLE_ERROR);
  return value as Record<string, unknown>;
}

function mapResult(entry: unknown): WebSearchResult | undefined {
  const record = asRecord(entry);
  for (const field of ["title", "url", "publishedDate", "text"]) {
    if (record[field] != null && typeof record[field] !== "string")
      throw new Error(STABLE_ERROR);
  }
  if (
    record.highlights != null &&
    (!Array.isArray(record.highlights) ||
      record.highlights.some((value) => typeof value !== "string"))
  ) {
    throw new Error(STABLE_ERROR);
  }
  const title = cleanText(
    typeof record.title === "string" ? record.title : "",
  ).slice(0, MAX_TITLE_CHARS);
  const url = parsePublicUrl(typeof record.url === "string" ? record.url : "");
  const publishedAt = parsePublishedDate(record.publishedDate);
  const text = cleanText(typeof record.text === "string" ? record.text : "");
  const highlights = Array.isArray(record.highlights)
    ? cleanText(record.highlights.join(" "))
    : "";
  const snippet = (text || highlights).slice(0, MAX_SNIPPET_CHARS);
  return title && url && publishedAt && snippet
    ? { title, url, publishedAt, snippet }
    : undefined;
}

function parsePublishedDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const input = value.trim();
  const match = ISO_INSTANT.exec(input);
  if (!match) return undefined;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days[month - 1] ||
    Number(hourText) > 23 ||
    Number(minuteText) > 59 ||
    Number(secondText) > 59
  ) {
    return undefined;
  }
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function parsePublicUrl(value: string): string | undefined {
  try {
    if (!isPublicHttpUrl(value)) return undefined;
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function cleanText(value: string): string {
  return compactText(value.replace(/<[^>]*>/g, " ")).replace(
    /\s+([.,!?;:])/g,
    "$1",
  );
}
