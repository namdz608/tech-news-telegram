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
  // Gán field `get(url` từ `string, config: { headers: Record<string, string>; params: Record<string, string | numb…` để object khớp contract.
  get(url: string, config: { headers: Record<string, string>; params: Record<string, string | number> }): Promise<{ data: XSearchResponse }>;
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
    // Gán field `private readonly http` từ `HttpClientLike = axios.create({` để object khớp contract.
    private readonly http: HttpClientLike = axios.create({
      // Gán field `timeout` từ `env.REQUEST_TIMEOUT_MS,` để object khớp contract.
      timeout: env.REQUEST_TIMEOUT_MS,
      // Gán field `headers` từ `{` để object khớp contract.
      headers: {
        // Gán field `User-Agent` từ `env.USER_AGENT,` để object khớp contract.
        'User-Agent': env.USER_AGENT,
      },
    }),
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

    // Tính `response` từ `await this.http.get('https://api.x.com/2/tweets/search/recent', {` và giữ bất biến trong phạm vi hiện tại.
    const response = await this.http.get('https://api.x.com/2/tweets/search/recent', {
      // Gán field `headers` từ `{` để object khớp contract.
      headers: {
        // Gán field `Authorization` từ ``Bearer ${source.bearerToken}`,` để object khớp contract.
        Authorization: `Bearer ${source.bearerToken}`,
      },
      // Gán field `params` từ `{` để object khớp contract.
      params: {
        // Gán field `query` từ `source.query,` để object khớp contract.
        query: source.query,
        // Gán field `max_results` từ `source.maxResults,` để object khớp contract.
        max_results: source.maxResults,
        // Gán field `expansions` từ `'author_id',` để object khớp contract.
        expansions: 'author_id',
        // Gán field `tweet.fields` từ `'author_id,created_at,public_metrics,lang',` để object khớp contract.
        'tweet.fields': 'author_id,created_at,public_metrics,lang',
        // Gán field `user.fields` từ `'name,username',` để object khớp contract.
        'user.fields': 'name,username',
      },
    });
    // Tính `usersById` từ `new Map((response.data.includes?.users ?? []).map((user) => [user.id, user]));` và giữ bất biến trong phạm vi hiện tại.
    const usersById = new Map((response.data.includes?.users ?? []).map((user) => [user.id, user]));

    // Trả `(response.data.data ?? [])` cho caller và kết thúc nhánh hiện tại.
    return (response.data.data ?? [])
      // Áp dụng `map` để tiếp tục biến đổi kết quả trung gian mà không đổi input gốc.
      .map((post) => {
        // Tính `text` từ `compactText(post.text);` và giữ bất biến trong phạm vi hiện tại.
        const text = compactText(post.text);
        // Tính `topics` từ `matchTopics({ title: text, summary: text });` và giữ bất biến trong phạm vi hiện tại.
        const topics = matchTopics({ title: text, summary: text });
        // Tính `user` từ `post.author_id ? usersById.get(post.author_id) : undefined;` và giữ bất biến trong phạm vi hiện tại.
        const user = post.author_id ? usersById.get(post.author_id) : undefined;
        // Tính `author` từ `formatAuthor(user);` và giữ bất biến trong phạm vi hiện tại.
        const author = formatAuthor(user);
        // Tính `url` từ ``https://x.com/i/web/status/${post.id}`;` và giữ bất biến trong phạm vi hiện tại.
        const url = `https://x.com/i/web/status/${post.id}`;

        // Trả `{` cho caller và kết thúc nhánh hiện tại.
        return {
          // Gán field `id` từ `url,` để object khớp contract.
          id: url,
          // Gán field `sourceId` từ `source.id,` để object khớp contract.
          sourceId: source.id,
          // Gán field `sourceName` từ `source.name,` để object khớp contract.
          sourceName: source.name,
          // Gán field `title` từ `truncateText(text, 160),` để object khớp contract.
          title: truncateText(text, 160),
          // Đưa giá trị `url` vào field cùng tên của object đang tạo.
          url,
          // Gán field `summary` từ `formatSummary(text, author, post.public_metrics),` để object khớp contract.
          summary: formatSummary(text, author, post.public_metrics),
          // Đưa giá trị `author` vào field cùng tên của object đang tạo.
          author,
          // Gán field `publishedAt` từ `post.created_at,` để object khớp contract.
          publishedAt: post.created_at,
          // Gán field `collectedAt` từ `new Date().toISOString(),` để object khớp contract.
          collectedAt: new Date().toISOString(),
          // Đưa giá trị `topics` vào field cùng tên của object đang tạo.
          topics,
        };
      })
      // Áp dụng `filter` để tiếp tục biến đổi kết quả trung gian mà không đổi input gốc.
      .filter((article) => article.topics.length > 0);
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
    // Gán field `parts.push(`Likes` từ `${metrics.like_count}`);` để object khớp contract.
    parts.push(`Likes: ${metrics.like_count}`);
  }

  // Nếu `typeof metrics?.retweet_count === 'number'` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (typeof metrics?.retweet_count === 'number') {
    // Gán field `parts.push(`Reposts` từ `${metrics.retweet_count}`);` để object khớp contract.
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
