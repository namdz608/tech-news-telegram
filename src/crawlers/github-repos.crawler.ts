/**
 * Gọi GitHub Repository Search, loại trùng và chuẩn hóa repository thành Article.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp axios từ `axios` để dùng đúng dependency/type thay vì tự triển khai lại.
import axios from 'axios';
// Nạp { env } từ `../config/env` để dùng đúng dependency/type thay vì tự triển khai lại.
import { env } from '../config/env';
// Nạp { Article } từ `../types/article` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { Article } from '../types/article';
// Nạp { GitHubReposSourceConfig } từ `../types/source` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { GitHubReposSourceConfig } from '../types/source';
// Nạp { compactText } từ `../utils/text` để dùng đúng dependency/type thay vì tự triển khai lại.
import { compactText } from '../utils/text';
// Nạp { NewsCrawler } từ `./crawler.types` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { NewsCrawler } from './crawler.types';

/**
 * Interface `HttpClientLike` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts`
 */
// Mở khai báo `interface HttpClientLike` để compiler kiểm tra contract cho mọi consumer.
interface HttpClientLike {
  get(
    // Gán field `url` từ `string,` để object khớp contract.
    url: string,
    // Gán field `config` từ `{` để object khớp contract.
    config: {
      // Gán field `headers` từ `Record<string, string>;` để object khớp contract.
      headers: Record<string, string>;
      // Gán field `params` từ `Record<string, string | number>;` để object khớp contract.
      params: Record<string, string | number>;
    },
  ): Promise<{ data: GitHubSearchResponse }>;
}

/**
 * Interface `GitHubSearchResponse` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts`
 */
// Mở khai báo `interface GitHubSearchResponse` để compiler kiểm tra contract cho mọi consumer.
interface GitHubSearchResponse {
  // Gán field `items?` từ `unknown;` để object khớp contract.
  items?: unknown;
}

/**
 * Interface `GitHubRepository` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts`
 */
// Mở khai báo `interface GitHubRepository` để compiler kiểm tra contract cho mọi consumer.
interface GitHubRepository {
  // Gán field `html_url?` từ `string;` để object khớp contract.
  html_url?: string;
  // Gán field `full_name?` từ `string;` để object khớp contract.
  full_name?: string;
  // Gán field `description?` từ `string | null;` để object khớp contract.
  description?: string | null;
  // Gán field `stargazers_count?` từ `number;` để object khớp contract.
  stargazers_count?: number;
  // Gán field `language?` từ `string | null;` để object khớp contract.
  language?: string | null;
  // Gán field `created_at?` từ `string;` để object khớp contract.
  created_at?: string;
  // Gán field `updated_at?` từ `string;` để object khớp contract.
  updated_at?: string;
  // Gán field `pushed_at?` từ `string;` để object khớp contract.
  pushed_at?: string;
  // Gán field `owner?` từ `{` để object khớp contract.
  owner?: {
    // Gán field `login?` từ `string;` để object khớp contract.
    login?: string;
    // Gán field `avatar_url?` từ `string;` để object khớp contract.
    avatar_url?: string;
  };
}

// Tính `defaultAiTopics` từ `['llm', 'generative-ai', 'ai-agent', 'rag', 'machine-learning', 'artificial-intelligenc…` và giữ bất biến trong phạm vi hiện tại.
const defaultAiTopics = ['llm', 'generative-ai', 'ai-agent', 'rag', 'machine-learning', 'artificial-intelligence'];

/**
 * Class `GitHubReposCrawler` sở hữu vòng đời dependency và điều phối các bước git hub repos crawler.
 *
 * Được sử dụng tại:
 * - `src/crawlers/index.ts`
 * - `tests/crawlers/github-repos.crawler.test.ts`
 */
// Mở khai báo `export class GitHubReposCrawler implements NewsCrawler<GitHubReposSourceConfig>` để compiler kiểm tra contract cho mọi consumer.
export class GitHubReposCrawler implements NewsCrawler<GitHubReposSourceConfig> {
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
   * - `src/crawlers/github-repos.crawler.ts`
   * - `tests/crawlers/github-repos.crawler.test.ts`
   * - `src/services/source.service.ts`
   */
  // Mở method `crawl` để tải dữ liệu nguồn và chuẩn hóa thành Article[].
  async crawl(source: GitHubReposSourceConfig): Promise<Article[]> {
    // Cô lập thao tác có thể lỗi để module còn cơ hội log và trả fallback an toàn.
    try {
      // Tính `repositories` từ `await this.fetchRepositories(source);` và giữ bất biến trong phạm vi hiện tại.
      const repositories = await this.fetchRepositories(source);

      // Trả `repositories` cho caller và kết thúc nhánh hiện tại.
      return repositories
        // Áp dụng `map` để tiếp tục biến đổi kết quả trung gian mà không đổi input gốc.
        .map((repo) => mapRepositoryToArticle(repo as GitHubRepository, source))
        // Áp dụng `filter` để tiếp tục biến đổi kết quả trung gian mà không đổi input gốc.
        .filter((article): article is Article => Boolean(article));
    // Bắt lỗi từ khối try, không để một dependency ngoài làm hỏng toàn bộ đợt xử lý.
    } catch (error) {
      // Ghi sự kiện `console.error(`Failed to crawl GitHub repositories from source ${source.id}: ${formatEr…` phục vụ chẩn đoán mà không đổi kết quả nghiệp vụ.
      console.error(`Failed to crawl GitHub repositories from source ${source.id}: ${formatErrorMessage(error)}`);
      // Trả `[];` cho caller và kết thúc nhánh hiện tại.
      return [];
    }
  }

  /**
   * Hàm `fetchRepositories` lấy dữ liệu từ dependency bên ngoài; kết quả được trả cho caller theo kiểu khai báo.
   *
   * Được sử dụng tại:
   * - `src/crawlers/github-repos.crawler.ts`
   */
  // Mở method `fetchRepositories` để lấy dữ liệu từ dependency bên ngoài.
  private async fetchRepositories(source: GitHubReposSourceConfig): Promise<GitHubRepository[]> {
    // Tính `queries` từ `buildQueries(source);` và giữ bất biến trong phạm vi hiện tại.
    const queries = buildQueries(source);
    // Tính `repositoryGroups` từ `await Promise.all(` và giữ bất biến trong phạm vi hiện tại.
    const repositoryGroups = await Promise.all(
      // Tạo callback nhận `queries.map(async (query)` để xử lý từng kết quả trong collection/promise.
      queries.map(async (query) => {
        // Tính `response` từ `await this.http.get('https://api.github.com/search/repositories', {` và giữ bất biến trong phạm vi hiện tại.
        const response = await this.http.get('https://api.github.com/search/repositories', {
          // Gán field `headers` từ `buildHeaders(source.token),` để object khớp contract.
          headers: buildHeaders(source.token),
          // Gán field `params` từ `{` để object khớp contract.
          params: {
            // Gán field `q` từ `query,` để object khớp contract.
            q: query,
            // Gán field `sort` từ `'stars',` để object khớp contract.
            sort: 'stars',
            // Gán field `order` từ `'desc',` để object khớp contract.
            order: 'desc',
            // Gán field `per_page` từ `source.maxResults,` để object khớp contract.
            per_page: source.maxResults,
          },
        });

        // Nếu `!Array.isArray(response.data.items)` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
        if (!Array.isArray(response.data.items)) {
          // Trả `[];` cho caller và kết thúc nhánh hiện tại.
          return [];
        }

        // Trả `response.data.items as GitHubRepository[];` cho caller và kết thúc nhánh hiện tại.
        return response.data.items as GitHubRepository[];
      }),
    );

    // Trả `dedupeRepositories(repositoryGroups.flat())` cho caller và kết thúc nhánh hiện tại.
    return dedupeRepositories(repositoryGroups.flat())
      // Áp dụng `sort` để tiếp tục biến đổi kết quả trung gian mà không đổi input gốc.
      .sort((left, right) => (right.stargazers_count ?? 0) - (left.stargazers_count ?? 0))
      // Áp dụng `slice` để tiếp tục biến đổi kết quả trung gian mà không đổi input gốc.
      .slice(0, source.maxResults);
  }
}

/**
 * Hàm `buildHeaders` tạo cấu trúc đầu ra từ cấu hình/dữ liệu đầu vào; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts`
 */
// Mở thân hàm `buildHeaders` với input/output được TypeScript kiểm tra.
function buildHeaders(token: string): Record<string, string> {
  // Gán field `const headers` từ `Record<string, string> = {` để object khớp contract.
  const headers: Record<string, string> = {
    // Gán field `Accept` từ `'application/vnd.github+json',` để object khớp contract.
    Accept: 'application/vnd.github+json',
    // Gán field `X-GitHub-Api-Version` từ `'2022-11-28',` để object khớp contract.
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // Nếu `token.trim()` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (token.trim()) {
    // Cập nhật `headers.Authorization` bằng ``Bearer ${token}`;` cho bước kế tiếp.
    headers.Authorization = `Bearer ${token}`;
  }

  // Trả `headers;` cho caller và kết thúc nhánh hiện tại.
  return headers;
}

/**
 * Hàm `buildQueries` tạo cấu trúc đầu ra từ cấu hình/dữ liệu đầu vào; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts`
 */
// Mở thân hàm `buildQueries` với input/output được TypeScript kiểm tra.
function buildQueries(source: GitHubReposSourceConfig): string[] {
  // Tính `customQuery` từ `source.query.trim();` và giữ bất biến trong phạm vi hiện tại.
  const customQuery = source.query.trim();

  // Nếu `customQuery` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (customQuery) {
    // Trả `[customQuery];` cho caller và kết thúc nhánh hiện tại.
    return [customQuery];
  }

  // Trả `buildDefaultQueries(source.lookbackDays);` cho caller và kết thúc nhánh hiện tại.
  return buildDefaultQueries(source.lookbackDays);
}

/**
 * Hàm `buildDefaultQueries` tạo cấu trúc đầu ra từ cấu hình/dữ liệu đầu vào; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts`
 */
// Mở thân hàm `buildDefaultQueries` với input/output được TypeScript kiểm tra.
function buildDefaultQueries(lookbackDays: number): string[] {
  // Tính `fromDate` từ `new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);` và giữ bất biến trong phạm vi hiện tại.
  const fromDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // Trả `defaultAiTopics.map((topic) => `topic:${topic} pushed:>=${fromDate}`);` cho caller và kết thúc nhánh hiện tại.
  return defaultAiTopics.map((topic) => `topic:${topic} pushed:>=${fromDate}`);
}

/**
 * Hàm `dedupeRepositories` loại phần tử trùng nhưng giữ thứ tự ưu tiên; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts`
 */
// Mở thân hàm `dedupeRepositories` với input/output được TypeScript kiểm tra.
function dedupeRepositories(repositories: GitHubRepository[]): GitHubRepository[] {
  // Tính `seenUrls` từ `new Set<string>();` và giữ bất biến trong phạm vi hiện tại.
  const seenUrls = new Set<string>();
  // Gán field `const result` từ `GitHubRepository[] = [];` để object khớp contract.
  const result: GitHubRepository[] = [];

  // Lặp theo `const repository of repositories` để xử lý đủ từng phần tử/trạng thái.
  for (const repository of repositories) {
    // Nếu `!repository.html_url || seenUrls.has(repository.html_url)` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (!repository.html_url || seenUrls.has(repository.html_url)) {
      // Dùng `continue;` để bỏ qua/kết thúc vòng lặp sau khi điều kiện hiện tại đã rõ.
      continue;
    }

    // Gọi `seenUrls.add` với `repository.html_url` để hoàn tất side effect/bước xử lý hiện tại.
    seenUrls.add(repository.html_url);
    // Gọi `result.push` với `repository` để hoàn tất side effect/bước xử lý hiện tại.
    result.push(repository);
  }

  // Trả `result;` cho caller và kết thúc nhánh hiện tại.
  return result;
}

/**
 * Hàm `mapRepositoryToArticle` thực hiện trách nhiệm `map repository to article` của module; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts`
 */
// Mở thân hàm `mapRepositoryToArticle` với input/output được TypeScript kiểm tra.
function mapRepositoryToArticle(repo: GitHubRepository, source: GitHubReposSourceConfig): Article | undefined {
  // Nếu `!repo.html_url || !repo.full_name` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (!repo.html_url || !repo.full_name) {
    // Trả `undefined;` cho caller và kết thúc nhánh hiện tại.
    return undefined;
  }

  // Trả `{` cho caller và kết thúc nhánh hiện tại.
  return {
    // Gán field `id` từ `repo.html_url,` để object khớp contract.
    id: repo.html_url,
    // Gán field `sourceId` từ `source.id,` để object khớp contract.
    sourceId: source.id,
    // Gán field `sourceName` từ `source.name,` để object khớp contract.
    sourceName: source.name,
    // Gán field `title` từ `repo.full_name,` để object khớp contract.
    title: repo.full_name,
    // Gán field `url` từ `repo.html_url,` để object khớp contract.
    url: repo.html_url,
    // Gán field `summary` từ `formatSummary(repo),` để object khớp contract.
    summary: formatSummary(repo),
    // Gán field `imageUrl` từ `normalizeImageUrl(repo.owner?.avatar_url),` để object khớp contract.
    imageUrl: normalizeImageUrl(repo.owner?.avatar_url),
    // Gán field `author` từ `repo.owner?.login,` để object khớp contract.
    author: repo.owner?.login,
    // Gán field `publishedAt` từ `repo.pushed_at ?? repo.updated_at ?? repo.created_at,` để object khớp contract.
    publishedAt: repo.pushed_at ?? repo.updated_at ?? repo.created_at,
    // Gán field `collectedAt` từ `new Date().toISOString(),` để object khớp contract.
    collectedAt: new Date().toISOString(),
    // Gán field `topics` từ `['ai'],` để object khớp contract.
    topics: ['ai'],
  };
}

/**
 * Hàm `formatSummary` định dạng dữ liệu thành chuỗi hiển thị ổn định; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts`
 */
// Mở thân hàm `formatSummary` với input/output được TypeScript kiểm tra.
function formatSummary(repo: GitHubRepository): string {
  // Tính `parts` từ `[` và giữ bất biến trong phạm vi hiện tại.
  const parts = [
    compactText(repo.description ?? ''),
    // Gán field `typeof repo.stargazers_count === number ? `Stars` từ `${repo.stargazers_count}` : '',` để object khớp contract.
    typeof repo.stargazers_count === 'number' ? `Stars: ${repo.stargazers_count}` : '',
    // Gán field `repo.language ? `Language` từ `${repo.language}` : '',` để object khớp contract.
    repo.language ? `Language: ${repo.language}` : '',
    // Gán field `repo.created_at ? `Created` từ `${formatDate(repo.created_at)}` : '',` để object khớp contract.
    repo.created_at ? `Created: ${formatDate(repo.created_at)}` : '',
    // Gán field `repo.updated_at ? `Updated` từ `${formatDate(repo.updated_at)}` : '',` để object khớp contract.
    repo.updated_at ? `Updated: ${formatDate(repo.updated_at)}` : '',
    // Gán field `repo.pushed_at ? `Pushed` từ `${formatDate(repo.pushed_at)}` : '',` để object khớp contract.
    repo.pushed_at ? `Pushed: ${formatDate(repo.pushed_at)}` : '',
  ];

  // Trả `parts.filter(Boolean).join(' | ');` cho caller và kết thúc nhánh hiện tại.
  return parts.filter(Boolean).join(' | ');
}

/**
 * Hàm `formatDate` định dạng dữ liệu thành chuỗi hiển thị ổn định; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts`
 */
// Mở thân hàm `formatDate` với input/output được TypeScript kiểm tra.
function formatDate(value: string): string {
  // Trả `value.slice(0, 10);` cho caller và kết thúc nhánh hiện tại.
  return value.slice(0, 10);
}

/**
 * Hàm `normalizeImageUrl` chuẩn hóa giá trị theo rule của hàm; input sai được giữ nguyên, bỏ qua hoặc throw đúng như implementation; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts`
 */
// Mở thân hàm `normalizeImageUrl` với input/output được TypeScript kiểm tra.
function normalizeImageUrl(imageUrl?: string): string | undefined {
  // Tính `trimmed` từ `imageUrl?.trim();` và giữ bất biến trong phạm vi hiện tại.
  const trimmed = imageUrl?.trim();

  // Nếu `!trimmed` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (!trimmed) {
    // Trả `undefined;` cho caller và kết thúc nhánh hiện tại.
    return undefined;
  }

  // Cô lập thao tác có thể lỗi để module còn cơ hội log và trả fallback an toàn.
  try {
    // Tính `url` từ `new URL(trimmed);` và giữ bất biến trong phạm vi hiện tại.
    const url = new URL(trimmed);
    // Trả `url.protocol === 'https:' ? url.toString() : undefined;` cho caller và kết thúc nhánh hiện tại.
    return url.protocol === 'https:' ? url.toString() : undefined;
  // Bắt lỗi từ khối try, không để một dependency ngoài làm hỏng toàn bộ đợt xử lý.
  } catch {
    // Trả `undefined;` cho caller và kết thúc nhánh hiện tại.
    return undefined;
  }
}

/**
 * Hàm `formatErrorMessage` định dạng dữ liệu thành chuỗi hiển thị ổn định; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts`
 */
// Mở thân hàm `formatErrorMessage` với input/output được TypeScript kiểm tra.
function formatErrorMessage(error: unknown): string {
  // Nếu `error instanceof Error` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (error instanceof Error) {
    // Trả `error.message;` cho caller và kết thúc nhánh hiện tại.
    return error.message;
  }

  // Trả `'unknown error';` cho caller và kết thúc nhánh hiện tại.
  return 'unknown error';
}
