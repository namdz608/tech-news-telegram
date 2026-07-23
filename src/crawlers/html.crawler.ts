/**
 * Tải trang HTML, dùng CSS selector và chuyển từng card tin thành Article.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import axios from 'axios';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import * as cheerio from 'cheerio';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { env } from '../config/env';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { matchTopics } from '../services/article.service';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { Article } from '../types/article';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { HtmlSourceConfig } from '../types/source';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { normalizeUrl } from '../utils/normalize-url';
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
  get(url: string): Promise<{ data: string }>;
}

/**
 * Class `HtmlCrawler` đóng gói trách nhiệm chính của module.
 *
 * Được sử dụng tại:
 * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
export class HtmlCrawler implements NewsCrawler<HtmlSourceConfig> {
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
  async crawl(source: HtmlSourceConfig): Promise<Article[]> {
    /**
     * Hàm `response` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
     */
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const response = await this.http.get(source.listUrl);
    /**
     * Hàm `$` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
     */
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const $ = cheerio.load(response.data);
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const articles: Article[] = [];

    /**
     * Hàm `$` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
     */
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    $(source.selectors.item).each((_index, element) => {
      /**
       * Hàm `item` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
       *
       * Được sử dụng tại:
       * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
       */
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const item = $(element);
      /**
       * Hàm `title` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
       *
       * Được sử dụng tại:
       * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
       */
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const title = compactText(item.find(source.selectors.title).first().text());
      /**
       * Hàm `href` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
       *
       * Được sử dụng tại:
       * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
       */
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const href = item.find(source.selectors.url).first().attr('href');

      // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
      if (!title || !href) {
        // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
        return;
      }

      /**
       * Hàm `absoluteUrl` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
       *
       * Được sử dụng tại:
       * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
       */
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const absoluteUrl = new URL(href, source.homepageUrl).toString();
      /**
       * Hàm `url` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
       *
       * Được sử dụng tại:
       * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
       */
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const url = normalizeUrl(absoluteUrl);
      /**
       * Hằng `summary` lưu cấu hình hoặc helper dùng trong module.
       *
       * Được sử dụng tại:
       * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
       */
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const summary = source.selectors.summary
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        ? compactText(item.find(source.selectors.summary).first().text())
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        : undefined;
      /**
       * Hằng `imageUrl` lưu cấu hình hoặc helper dùng trong module.
       *
       * Được sử dụng tại:
       * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
       */
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const imageUrl = source.selectors.image
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        ? normalizeImageUrl(item.find(source.selectors.image).first().attr('src'), source.homepageUrl)
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        : undefined;
      /**
       * Hằng `publishedAt` lưu cấu hình hoặc helper dùng trong module.
       *
       * Được sử dụng tại:
       * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
       */
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const publishedAt = source.selectors.publishedAt
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        ? item.find(source.selectors.publishedAt).first().attr('datetime') ??
          /**
           * Hàm `compactText` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
           *
           * Được sử dụng tại:
           * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
           */
          // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
          compactText(item.find(source.selectors.publishedAt).first().text())
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        : undefined;
      /**
       * Hàm `topics` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
       *
       * Được sử dụng tại:
       * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
       */
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const topics = matchTopics({ title, summary });

      // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
      if (topics.length === 0) {
        // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
        return;
      }

      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      articles.push({
        // Gán field cấu trúc để tạo object đúng contract.
        id: url,
        // Gán field cấu trúc để tạo object đúng contract.
        sourceId: source.id,
        // Gán field cấu trúc để tạo object đúng contract.
        sourceName: source.name,
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        title,
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        url,
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        summary,
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        imageUrl,
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        publishedAt,
        // Gán field cấu trúc để tạo object đúng contract.
        collectedAt: new Date().toISOString(),
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        topics,
      });
    });

    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return articles;
  }
}

/**
 * Hàm `normalizeImageUrl` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function normalizeImageUrl(imageUrl: string | undefined, baseUrl: string): string | undefined {
  /**
   * Hàm `trimmed` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
   */
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const trimmed = imageUrl?.trim();

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (!trimmed) {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return undefined;
  }

  // Bắt đầu thao tác có thể lỗi để bảo vệ toàn bộ pipeline.
  try {
    /**
     * Hàm `url` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
     */
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const url = new URL(trimmed, baseUrl);
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return url.protocol === 'https:' ? url.toString() : undefined;
  // Thu lỗi từ thao tác trước và chuyển sang fallback an toàn.
  } catch {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return undefined;
  }
}
