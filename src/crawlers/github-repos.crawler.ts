/**
 * Gọi GitHub Repository Search, loại trùng và chuẩn hóa repository thành Article.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import axios from 'axios';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { env } from '../config/env';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { Article } from '../types/article';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { GitHubReposSourceConfig } from '../types/source';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { compactText } from '../utils/text';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { NewsCrawler } from './crawler.types';

/**
 * Interface `HttpClientLike` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts:41`
 * - `src/crawlers/html.crawler.ts:41`
 * - `src/crawlers/html.crawler.ts:112`
 * - `src/crawlers/rss.crawler.ts:117`
 * - `src/crawlers/rss.crawler.ts:213`
 * - `src/crawlers/x-search.crawler.ts:37`
 * - `src/crawlers/x-search.crawler.ts:168`
 * - `src/services/telegram.service.ts:44`
 * - `src/services/telegram.service.ts:57`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface HttpClientLike {
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  get(
    // Gán field cấu trúc để tạo object đúng contract.
    url: string,
    // Gán field cấu trúc để tạo object đúng contract.
    config: {
      // Gán field cấu trúc để tạo object đúng contract.
      headers: Record<string, string>;
      // Gán field cấu trúc để tạo object đúng contract.
      params: Record<string, string | number>;
    },
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  ): Promise<{ data: GitHubSearchResponse }>;
}

/**
 * Interface `GitHubSearchResponse` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts:15`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface GitHubSearchResponse {
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  items?: unknown;
}

/**
 * Interface `GitHubRepository` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts:54`
 * - `src/crawlers/github-repos.crawler.ts:62`
 * - `src/crawlers/github-repos.crawler.ts:80`
 * - `src/crawlers/github-repos.crawler.ts:118`
 * - `src/crawlers/github-repos.crawler.ts:120`
 * - `src/crawlers/github-repos.crawler.ts:134`
 * - `src/crawlers/github-repos.crawler.ts:154`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface GitHubRepository {
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  html_url?: string;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  full_name?: string;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  description?: string | null;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  stargazers_count?: number;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  language?: string | null;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  created_at?: string;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  updated_at?: string;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  pushed_at?: string;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  owner?: {
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    login?: string;
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    avatar_url?: string;
  };
}

// Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
const defaultAiTopics = ['llm', 'generative-ai', 'ai-agent', 'rag', 'machine-learning', 'artificial-intelligence'];

/**
 * Class `GitHubReposCrawler` đóng gói trách nhiệm chính của module.
 *
 * Được sử dụng tại:
 * - `src/crawlers/index.ts:8`
 * - `src/crawlers/index.ts:34`
 * - `tests/crawlers/github-repos.crawler.test.ts:2`
 * - `tests/crawlers/github-repos.crawler.test.ts:20`
 * - `tests/crawlers/github-repos.crawler.test.ts:90`
 * - `tests/crawlers/github-repos.crawler.test.ts:145`
 * - `tests/crawlers/github-repos.crawler.test.ts:181`
 * - `tests/crawlers/github-repos.crawler.test.ts:182`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
export class GitHubReposCrawler implements NewsCrawler<GitHubReposSourceConfig> {
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  constructor(
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    private readonly http: HttpClientLike = axios.create({
      // Gán field cấu trúc để tạo object đúng contract.
      timeout: env.REQUEST_TIMEOUT_MS,
      // Gán field cấu trúc để tạo object đúng contract.
      headers: {
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        'User-Agent': env.USER_AGENT,
      },
    }),
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  ) {}

  /**
   * Hàm `crawl` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/crawlers/crawler.types.ts:85`
   * - `src/crawlers/github-repos.crawler.ts:57`
   * - `src/crawlers/html.crawler.ts:177`
   * - `src/crawlers/rss.crawler.ts:280`
   * - `src/crawlers/x-search.crawler.ts:233`
   * - `src/services/source.service.ts:29`
   * - `src/services/source.service.ts:33`
   * - `src/services/source.service.ts:37`
   * - `src/services/source.service.ts:40`
   * - `src/services/source.service.ts:42`
   * - `tests/crawlers/github-repos.crawler.test.ts:90`
   * - `tests/crawlers/github-repos.crawler.test.ts:145`
   * - `tests/crawlers/github-repos.crawler.test.ts:181`
   * - `tests/crawlers/github-repos.crawler.test.ts:182`
   * - `tests/crawlers/github-repos.crawler.test.ts:183`
   * - `tests/crawlers/html.crawler.test.ts:35`
   * - `tests/crawlers/html.crawler.test.ts:60`
   * - `tests/crawlers/rss.crawler.test.ts:57`
   * - `tests/crawlers/rss.crawler.test.ts:94`
   * - `tests/crawlers/rss.crawler.test.ts:123`
   * - `tests/crawlers/rss.crawler.test.ts:150`
   * - `tests/crawlers/rss.crawler.test.ts:190`
   * - `tests/crawlers/rss.crawler.test.ts:241`
   * - `tests/crawlers/rss.crawler.test.ts:300`
   * - `tests/crawlers/rss.crawler.test.ts:346`
   * - `tests/crawlers/rss.crawler.test.ts:390`
   * - `tests/crawlers/x-search.crawler.test.ts:51`
   * - `tests/crawlers/x-search.crawler.test.ts:94`
   * - `tests/services/source.service.test.ts:38`
   * - `tests/services/source.service.test.ts:39`
   * - `tests/services/source.service.test.ts:40`
   * - `tests/services/source.service.test.ts:85`
   * - `tests/services/source.service.test.ts:86`
   * - `tests/services/source.service.test.ts:87`
   * - `tests/services/source.service.test.ts:124`
   * - `tests/services/source.service.test.ts:125`
   * - `tests/services/source.service.test.ts:126`
   * - `tests/services/source.service.test.ts:171`
   * - `tests/services/source.service.test.ts:172`
   * - `tests/services/source.service.test.ts:173`
   * - `tests/services/source.service.test.ts:209`
   * - `tests/services/source.service.test.ts:210`
   * - `tests/services/source.service.test.ts:211`
   * - `tests/services/source.service.test.ts:243`
   * - `tests/services/source.service.test.ts:244`
   * - `tests/services/source.service.test.ts:245`
   * - `tests/services/source.service.test.ts:246`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  async crawl(source: GitHubReposSourceConfig): Promise<Article[]> {
    // Bắt đầu thao tác có thể lỗi để bảo vệ toàn bộ pipeline.
    try {
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const repositories = await this.fetchRepositories(source);

      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return repositories
        // Tiếp tục biến đổi dữ liệu theo chuỗi thao tác bất biến.
        .map((repo) => mapRepositoryToArticle(repo as GitHubRepository, source))
        // Tiếp tục biến đổi dữ liệu theo chuỗi thao tác bất biến.
        .filter((article): article is Article => Boolean(article));
    // Thu lỗi từ thao tác trước và chuyển sang fallback an toàn.
    } catch (error) {
      // Ghi thông tin chẩn đoán mà không thay đổi dữ liệu nghiệp vụ.
      console.error(`Failed to crawl GitHub repositories from source ${source.id}: ${formatErrorMessage(error)}`);
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return [];
    }
  }

  /**
   * Hàm `fetchRepositories` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/crawlers/github-repos.crawler.ts:51`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  private async fetchRepositories(source: GitHubReposSourceConfig): Promise<GitHubRepository[]> {
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const queries = buildQueries(source);
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const repositoryGroups = await Promise.all(
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      queries.map(async (query) => {
        // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
        const response = await this.http.get('https://api.github.com/search/repositories', {
          // Gán field cấu trúc để tạo object đúng contract.
          headers: buildHeaders(source.token),
          // Gán field cấu trúc để tạo object đúng contract.
          params: {
            // Gán field cấu trúc để tạo object đúng contract.
            q: query,
            // Gán field cấu trúc để tạo object đúng contract.
            sort: 'stars',
            // Gán field cấu trúc để tạo object đúng contract.
            order: 'desc',
            // Gán field cấu trúc để tạo object đúng contract.
            per_page: source.maxResults,
          },
        });

        // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
        if (!Array.isArray(response.data.items)) {
          // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
          return [];
        }

        // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
        return response.data.items as GitHubRepository[];
      }),
    );

    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return dedupeRepositories(repositoryGroups.flat())
      // Tiếp tục biến đổi dữ liệu theo chuỗi thao tác bất biến.
      .sort((left, right) => (right.stargazers_count ?? 0) - (left.stargazers_count ?? 0))
      // Tiếp tục biến đổi dữ liệu theo chuỗi thao tác bất biến.
      .slice(0, source.maxResults);
  }
}

/**
 * Hàm `buildHeaders` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts:67`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function buildHeaders(token: string): Record<string, string> {
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const headers: Record<string, string> = {
    // Gán field cấu trúc để tạo object đúng contract.
    Accept: 'application/vnd.github+json',
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (token.trim()) {
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    headers.Authorization = `Bearer ${token}`;
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return headers;
}

/**
 * Hàm `buildQueries` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts:63`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function buildQueries(source: GitHubReposSourceConfig): string[] {
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const customQuery = source.query.trim();

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (customQuery) {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return [customQuery];
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return buildDefaultQueries(source.lookbackDays);
}

/**
 * Hàm `buildDefaultQueries` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts:110`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function buildDefaultQueries(lookbackDays: number): string[] {
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const fromDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return defaultAiTopics.map((topic) => `topic:${topic} pushed:>=${fromDate}`);
}

/**
 * Hàm `dedupeRepositories` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts:84`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function dedupeRepositories(repositories: GitHubRepository[]): GitHubRepository[] {
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const seenUrls = new Set<string>();
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const result: GitHubRepository[] = [];

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  for (const repository of repositories) {
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (!repository.html_url || seenUrls.has(repository.html_url)) {
      // Điều khiển vòng lặp sau khi nhánh hiện tại đã xử lý xong.
      continue;
    }

    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    seenUrls.add(repository.html_url);
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    result.push(repository);
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return result;
}

/**
 * Hàm `mapRepositoryToArticle` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts:54`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function mapRepositoryToArticle(repo: GitHubRepository, source: GitHubReposSourceConfig): Article | undefined {
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (!repo.html_url || !repo.full_name) {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return undefined;
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return {
    // Gán field cấu trúc để tạo object đúng contract.
    id: repo.html_url,
    // Gán field cấu trúc để tạo object đúng contract.
    sourceId: source.id,
    // Gán field cấu trúc để tạo object đúng contract.
    sourceName: source.name,
    // Gán field cấu trúc để tạo object đúng contract.
    title: repo.full_name,
    // Gán field cấu trúc để tạo object đúng contract.
    url: repo.html_url,
    // Gán field cấu trúc để tạo object đúng contract.
    summary: formatSummary(repo),
    // Gán field cấu trúc để tạo object đúng contract.
    imageUrl: normalizeImageUrl(repo.owner?.avatar_url),
    // Gán field cấu trúc để tạo object đúng contract.
    author: repo.owner?.login,
    // Gán field cấu trúc để tạo object đúng contract.
    publishedAt: repo.pushed_at ?? repo.updated_at ?? repo.created_at,
    // Gán field cấu trúc để tạo object đúng contract.
    collectedAt: new Date().toISOString(),
    // Gán field cấu trúc để tạo object đúng contract.
    topics: ['ai'],
  };
}

/**
 * Hàm `formatSummary` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts:145`
 * - `src/crawlers/x-search.crawler.ts:465`
 * - `src/crawlers/x-search.crawler.ts:510`
 * - `src/services/digest.service.ts:84`
 * - `src/services/digest.service.ts:310`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function formatSummary(repo: GitHubRepository): string {
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const parts = [
    /**
     * Hàm `compactText` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - `src/crawlers/github-repos.crawler.ts:5`
     * - `src/crawlers/html.crawler.ts:22`
     * - `src/crawlers/html.crawler.ts:196`
     * - `src/crawlers/html.crawler.ts:213`
     * - `src/crawlers/html.crawler.ts:251`
     * - `src/crawlers/rss.crawler.ts:26`
     * - `src/crawlers/rss.crawler.ts:291`
     * - `src/crawlers/rss.crawler.ts:293`
     * - `src/crawlers/x-search.crawler.ts:18`
     * - `src/crawlers/x-search.crawler.ts:442`
     * - `src/services/article-editorial.service.ts:4`
     * - `src/services/article-editorial.service.ts:75`
     * - `src/services/article-editorial.service.ts:96`
     * - `src/services/digest.service.ts:6`
     * - `src/services/digest.service.ts:235`
     * - `src/services/digest.service.ts:236`
     * - `src/services/digest.service.ts:237`
     * - `src/services/digest.service.ts:315`
     * - `src/utils/text.ts:1`
     */
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    compactText(repo.description ?? ''),
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    typeof repo.stargazers_count === 'number' ? `Stars: ${repo.stargazers_count}` : '',
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    repo.language ? `Language: ${repo.language}` : '',
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    repo.created_at ? `Created: ${formatDate(repo.created_at)}` : '',
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    repo.updated_at ? `Updated: ${formatDate(repo.updated_at)}` : '',
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    repo.pushed_at ? `Pushed: ${formatDate(repo.pushed_at)}` : '',
  ];

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return parts.filter(Boolean).join(' | ');
}

/**
 * Hàm `formatDate` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts:159`
 * - `src/crawlers/github-repos.crawler.ts:160`
 * - `src/crawlers/github-repos.crawler.ts:161`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function formatDate(value: string): string {
  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return value.slice(0, 10);
}

/**
 * Hàm `normalizeImageUrl` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts:146`
 * - `src/crawlers/html.crawler.ts:219`
 * - `src/crawlers/html.crawler.ts:307`
 * - `src/crawlers/rss.crawler.ts:410`
 * - `src/crawlers/rss.crawler.ts:480`
 * - `src/crawlers/rss.crawler.ts:613`
 * - `src/services/digest.service.ts:292`
 * - `src/services/digest.service.ts:295`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function normalizeImageUrl(imageUrl?: string): string | undefined {
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const trimmed = imageUrl?.trim();

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (!trimmed) {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return undefined;
  }

  // Bắt đầu thao tác có thể lỗi để bảo vệ toàn bộ pipeline.
  try {
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const url = new URL(trimmed);
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return url.protocol === 'https:' ? url.toString() : undefined;
  // Thu lỗi từ thao tác trước và chuyển sang fallback an toàn.
  } catch {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return undefined;
  }
}

/**
 * Hàm `formatErrorMessage` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts:57`
 * - `src/services/telegram.service.ts:112`
 * - `src/services/telegram.service.ts:138`
 * - `src/services/telegram.service.ts:207`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function formatErrorMessage(error: unknown): string {
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (error instanceof Error) {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return error.message;
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return 'unknown error';
}
