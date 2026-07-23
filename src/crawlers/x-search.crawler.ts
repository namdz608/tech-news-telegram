/**
 * Gọi X Recent Search API, ghép author/media và chuẩn hóa tweet thành Article.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import axios from 'axios';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { env } from '../config/env';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { matchTopics } from '../services/article.service';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { Article } from '../types/article';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { XSearchSourceConfig } from '../types/source';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { compactText } from '../utils/text';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { NewsCrawler } from './crawler.types';

/**
 * Interface `HttpClientLike` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface HttpClientLike {
  /**
   * Hàm `get` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  get(url: string, config: { headers: Record<string, string>; params: Record<string, string | number> }): Promise<{ data: XSearchResponse }>;
}

/**
 * Interface `XSearchResponse` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface XSearchResponse {
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  data?: XPost[];
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  includes?: {
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    users?: XUser[];
  };
}

/**
 * Interface `XPost` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface XPost {
  // Gán field cấu trúc để tạo object đúng contract.
  id: string;
  // Gán field cấu trúc để tạo object đúng contract.
  text: string;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  author_id?: string;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  created_at?: string;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  public_metrics?: {
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    like_count?: number;
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    retweet_count?: number;
  };
}

/**
 * Interface `XUser` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface XUser {
  // Gán field cấu trúc để tạo object đúng contract.
  id: string;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  name?: string;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  username?: string;
}

/**
 * Class `XSearchCrawler` đóng gói trách nhiệm chính của module.
 *
 * Được sử dụng tại:
 * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
export class XSearchCrawler implements NewsCrawler<XSearchSourceConfig> {
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
   * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  async crawl(source: XSearchSourceConfig): Promise<Article[]> {
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (!source.bearerToken.trim()) {
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return [];
    }

    /**
     * Hàm `response` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
     */
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const response = await this.http.get('https://api.x.com/2/tweets/search/recent', {
      // Gán field cấu trúc để tạo object đúng contract.
      headers: {
        // Gán field cấu trúc để tạo object đúng contract.
        Authorization: `Bearer ${source.bearerToken}`,
      },
      // Gán field cấu trúc để tạo object đúng contract.
      params: {
        // Gán field cấu trúc để tạo object đúng contract.
        query: source.query,
        // Gán field cấu trúc để tạo object đúng contract.
        max_results: source.maxResults,
        // Gán field cấu trúc để tạo object đúng contract.
        expansions: 'author_id',
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        'tweet.fields': 'author_id,created_at,public_metrics,lang',
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        'user.fields': 'name,username',
      },
    });
    /**
     * Hàm `usersById` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
     */
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const usersById = new Map((response.data.includes?.users ?? []).map((user) => [user.id, user]));

    /**
     * Hàm `return` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
     */
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    return (response.data.data ?? [])
      // Tiếp tục biến đổi dữ liệu theo chuỗi thao tác bất biến.
      .map((post) => {
        /**
         * Hàm `text` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
         *
         * Được sử dụng tại:
         * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
         */
        // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
        const text = compactText(post.text);
        /**
         * Hàm `topics` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
         *
         * Được sử dụng tại:
         * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
         */
        // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
        const topics = matchTopics({ title: text, summary: text });
        /**
         * Hàm `user` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
         *
         * Được sử dụng tại:
         * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
         */
        // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
        const user = post.author_id ? usersById.get(post.author_id) : undefined;
        /**
         * Hàm `author` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
         *
         * Được sử dụng tại:
         * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
         */
        // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
        const author = formatAuthor(user);
        /**
         * Hằng `url` lưu cấu hình hoặc helper dùng trong module.
         *
         * Được sử dụng tại:
         * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
         */
        // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
        const url = `https://x.com/i/web/status/${post.id}`;

        // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
        return {
          // Gán field cấu trúc để tạo object đúng contract.
          id: url,
          // Gán field cấu trúc để tạo object đúng contract.
          sourceId: source.id,
          // Gán field cấu trúc để tạo object đúng contract.
          sourceName: source.name,
          // Gán field cấu trúc để tạo object đúng contract.
          title: truncateText(text, 160),
          // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
          url,
          // Gán field cấu trúc để tạo object đúng contract.
          summary: formatSummary(text, author, post.public_metrics),
          // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
          author,
          // Gán field cấu trúc để tạo object đúng contract.
          publishedAt: post.created_at,
          // Gán field cấu trúc để tạo object đúng contract.
          collectedAt: new Date().toISOString(),
          // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
          topics,
        };
      })
      // Tiếp tục biến đổi dữ liệu theo chuỗi thao tác bất biến.
      .filter((article) => article.topics.length > 0);
  }
}

/**
 * Hàm `formatAuthor` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function formatAuthor(user?: XUser): string | undefined {
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (user?.username) {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return `@${user.username}`;
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return user?.name;
}

/**
 * Hàm `formatSummary` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function formatSummary(text: string, author?: string, metrics?: XPost['public_metrics']): string {
  /**
   * Hằng `parts` lưu cấu hình hoặc helper dùng trong module.
   *
   * Được sử dụng tại:
   * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
   */
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const parts = [author ? `${author}: ${text}` : text];

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (typeof metrics?.like_count === 'number') {
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    parts.push(`Likes: ${metrics.like_count}`);
  }

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (typeof metrics?.retweet_count === 'number') {
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    parts.push(`Reposts: ${metrics.retweet_count}`);
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return parts.join(' | ');
}

/**
 * Hàm `truncateText` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function truncateText(value: string, maxLength: number): string {
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (value.length <= maxLength) {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return value;
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}
