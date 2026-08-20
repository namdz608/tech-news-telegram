/**
 * Gọi X Recent Search API, ghép author/media và chuẩn hóa tweet thành Article.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp axios từ `axios` để dùng đúng dependency/type thay vì tự triển khai lại.
import axios from 'axios';
// Nạp { env } từ `../config/env` để dùng đúng dependency/type thay vì tự triển khai lại.
import { env } from '../config/env';
// Nạp { matchTopics } từ `../services/article.service` để dùng đúng dependency/type thay vì tự triển khai lại.
import { matchTopics } from '../services/article.service';
// Nạp { Article } từ `../types/article` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { Article } from '../types/article';
// Nạp { XSearchSourceConfig } từ `../types/source` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { XSearchSourceConfig } from '../types/source';
// Nạp { compactText } từ `../utils/text` để dùng đúng dependency/type thay vì tự triển khai lại.
import { compactText } from '../utils/text';
// Nạp { NewsCrawler } từ `./crawler.types` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { NewsCrawler } from './crawler.types';

/**
 * Interface `HttpClientLike` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/crawlers/x-search.crawler.ts`
 */
// Mở khai báo `interface HttpClientLike` để compiler kiểm tra contract cho mọi consumer.
interface HttpClientLike {
  get(
    url: string,
    config: { headers: Record<string, string>; params: Record<string, string | number> },
  ): Promise<{
    data: unknown;
    headers?: Readonly<Record<string, string | undefined>>;
  }>;
}

const X_SEARCH_URL = 'https://api.x.com/2/tweets/search/recent';
const MAX_BODY_BYTES = 512 * 1024;
const STABLE_ERROR = 'x-search';

function createDefaultHttpClient(): HttpClientLike {
  return axios.create({
    timeout: env.REQUEST_TIMEOUT_MS,
    maxRedirects: 0,
    maxContentLength: MAX_BODY_BYTES,
    maxBodyLength: MAX_BODY_BYTES,
    headers: {
      'User-Agent': env.USER_AGENT,
    },
  }) as HttpClientLike;
}

/**
 * Interface `XSearchResponse` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/crawlers/x-search.crawler.ts`
 */
// Mở khai báo `interface XSearchResponse` để compiler kiểm tra contract cho mọi consumer.
interface XSearchResponse {
  // Gán field `data?` từ `XPost[];` để object khớp contract.
  data?: XPost[];
  // Gán field `includes?` từ `{` để object khớp contract.
  includes?: {
    // Gán field `users?` từ `XUser[];` để object khớp contract.
    users?: XUser[];
  };
}

/**
 * Interface `XPost` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/crawlers/x-search.crawler.ts`
 */
// Mở khai báo `interface XPost` để compiler kiểm tra contract cho mọi consumer.
interface XPost {
  // Gán field `id` từ `string;` để object khớp contract.
  id: string;
  // Gán field `text` từ `string;` để object khớp contract.
  text: string;
  // Gán field `author_id?` từ `string;` để object khớp contract.
  author_id?: string;
  // Gán field `created_at?` từ `string;` để object khớp contract.
  created_at?: string;
  // Gán field `public_metrics?` từ `{` để object khớp contract.
  public_metrics?: {
    // Gán field `like_count?` từ `number;` để object khớp contract.
    like_count?: number;
    // Gán field `retweet_count?` từ `number;` để object khớp contract.
    retweet_count?: number;
  };
}

/**
 * Interface `XUser` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/crawlers/x-search.crawler.ts`
 */
// Mở khai báo `interface XUser` để compiler kiểm tra contract cho mọi consumer.
interface XUser {
  // Gán field `id` từ `string;` để object khớp contract.
  id: string;
  // Gán field `name?` từ `string;` để object khớp contract.
  name?: string;
  // Gán field `username?` từ `string;` để object khớp contract.
  username?: string;
}

/**
 * Class `XSearchCrawler` sở hữu vòng đời dependency và điều phối các bước xsearch crawler.
 *
 * Được sử dụng tại:
 * - `src/crawlers/index.ts`
 * - `tests/crawlers/x-search.crawler.test.ts`
 */
// Mở khai báo `export class XSearchCrawler implements NewsCrawler<XSearchSourceConfig>` để compiler kiểm tra contract cho mọi consumer.
export class XSearchCrawler implements NewsCrawler<XSearchSourceConfig> {
  constructor(
    private readonly http: HttpClientLike = createDefaultHttpClient(),
    private readonly searchUrl = X_SEARCH_URL,
  ) {}

  /**
   * Hàm `crawl` tải dữ liệu nguồn và chuẩn hóa thành Article[]; kết quả được trả cho caller theo kiểu khai báo.
   *
   * Được sử dụng tại:
   * - `tests/crawlers/x-search.crawler.test.ts`
   * - `src/services/source.service.ts`
   */
  // Mở method `crawl` để tải dữ liệu nguồn và chuẩn hóa thành Article[].
  async crawl(source: XSearchSourceConfig): Promise<Article[]> {
    // Nếu `!source.bearerToken.trim()` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (!source.bearerToken.trim()) {
      // Trả `[];` cho caller và kết thúc nhánh hiện tại.
      return [];
    }

    try {
      const response = await this.http.get(this.searchUrl, {
        headers: {
          Authorization: `Bearer ${source.bearerToken}`,
        },
        params: {
          query: source.query,
          max_results: source.maxResults,
          expansions: 'author_id',
          'tweet.fields': 'author_id,created_at,public_metrics,lang',
          'user.fields': 'name,username',
        },
      });
      assertJsonContentType(response.headers);
      const payload = parseXSearchResponse(readJsonBody(response.data));
      const usersById = new Map((payload.includes?.users ?? []).map((user) => [user.id, user]));

      return (payload.data ?? [])
        .map((post) => {
          const text = compactText(post.text);
          const topics = matchTopics({ title: text, summary: text });
          const user = post.author_id ? usersById.get(post.author_id) : undefined;
          const author = formatAuthor(user);
          const url = `https://x.com/i/web/status/${post.id}`;
          const engagement = mapEngagement(post.public_metrics);

          return {
            id: url,
            sourceId: source.id,
            sourceName: source.name,
            title: truncateText(text, 160),
            url,
            summary: formatSummary(text, author, post.public_metrics),
            author,
            publishedAt: post.created_at,
            collectedAt: new Date().toISOString(),
            topics,
            ...(engagement ? { engagement } : {}),
          };
        })
        .filter((article) => source.includeUnmatched || article.topics.length > 0);
    } catch (error) {
      throw stabilizeXSearchError(error);
    }
  }
}

/**
 * Hàm `formatAuthor` định dạng dữ liệu thành chuỗi hiển thị ổn định; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/crawlers/x-search.crawler.ts`
 */
// Mở thân hàm `formatAuthor` với input/output được TypeScript kiểm tra.
function formatAuthor(user?: XUser): string | undefined {
  // Nếu `user?.username` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (user?.username) {
    // Trả ``@${user.username}`;` cho caller và kết thúc nhánh hiện tại.
    return `@${user.username}`;
  }

  // Trả `user?.name;` cho caller và kết thúc nhánh hiện tại.
  return user?.name;
}

/**
 * Hàm `formatSummary` định dạng dữ liệu thành chuỗi hiển thị ổn định; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/crawlers/x-search.crawler.ts`
 */
// Mở thân hàm `formatSummary` với input/output được TypeScript kiểm tra.
function formatSummary(text: string, author?: string, metrics?: XPost['public_metrics']): string {
  // Tính `parts` từ `[author ? `${author}: ${text}` : text];` và giữ bất biến trong phạm vi hiện tại.
  const parts = [author ? `${author}: ${text}` : text];

  // Nếu `typeof metrics?.like_count === 'number'` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (typeof metrics?.like_count === 'number') {
    // Gọi `parts.push` với ``Likes: ${metrics.like_count}`` để hoàn tất side effect/bước xử lý hiện tại.
    parts.push(`Likes: ${metrics.like_count}`);
  }

  // Nếu `typeof metrics?.retweet_count === 'number'` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (typeof metrics?.retweet_count === 'number') {
    // Gọi `parts.push` với ``Reposts: ${metrics.retweet_count}`` để hoàn tất side effect/bước xử lý hiện tại.
    parts.push(`Reposts: ${metrics.retweet_count}`);
  }

  // Trả `parts.join(' | ');` cho caller và kết thúc nhánh hiện tại.
  return parts.join(' | ');
}

/**
 * Hàm `truncateText` cắt chuỗi mà không vượt giới hạn hiển thị; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/crawlers/x-search.crawler.ts`
 */
// Mở thân hàm `truncateText` với input/output được TypeScript kiểm tra.
function truncateText(value: string, maxLength: number): string {
  // Nếu `value.length <= maxLength` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (value.length <= maxLength) {
    // Trả `value;` cho caller và kết thúc nhánh hiện tại.
    return value;
  }

  // Trả ``${value.slice(0, maxLength - 1).trimEnd()}…`;` cho caller và kết thúc nhánh hiện tại.
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function mapEngagement(metrics?: XPost['public_metrics']): Article['engagement'] | undefined {
  const likes = typeof metrics?.like_count === 'number' ? metrics.like_count : undefined;
  const shares = typeof metrics?.retweet_count === 'number' ? metrics.retweet_count : undefined;
  if (likes === undefined && shares === undefined) {
    return undefined;
  }
  return {
    ...(likes !== undefined ? { likes } : {}),
    ...(shares !== undefined ? { shares } : {}),
  };
}

function headerValue(
  headers: Readonly<Record<string, string | undefined>>,
  name: string,
): string {
  const record = headers as Record<string, unknown>;
  const direct = record[name] ?? record[name.toLowerCase()];
  if (typeof direct === 'string') {
    return direct;
  }
  const getter = (headers as { get?: (headerName: string) => unknown }).get;
  if (typeof getter === 'function') {
    const value = getter.call(headers, name);
    if (typeof value === 'string') {
      return value;
    }
  }
  return '';
}

function assertJsonContentType(headers?: Readonly<Record<string, string | undefined>>): void {
  if (!headers) {
    return;
  }
  const mime = headerValue(headers, 'content-type').split(';', 1)[0].trim().toLowerCase();
  if (mime !== 'application/json') {
    throw new Error(STABLE_ERROR);
  }
}

function readJsonBody(data: unknown): unknown {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as unknown;
    } catch {
      throw new Error(STABLE_ERROR);
    }
  }
  return data;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(STABLE_ERROR);
  }
  return value as Record<string, unknown>;
}

function parseXSearchResponse(payload: unknown): XSearchResponse {
  const record = asRecord(payload);
  if (record.data !== undefined && !Array.isArray(record.data)) {
    throw new Error(STABLE_ERROR);
  }
  if (record.includes !== undefined) {
    asRecord(record.includes);
  }
  return record as XSearchResponse;
}

function stabilizeXSearchError(error: unknown): Error {
  return error instanceof Error && error.message === STABLE_ERROR
    ? error
    : new Error(STABLE_ERROR);
}
