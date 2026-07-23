/**
 * Tải RSS/XML, chuẩn hóa item và gắn topic để tạo Article[].
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import axios from 'axios';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import * as cheerio from 'cheerio';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import Parser from 'rss-parser';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { env } from '../config/env';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { matchTopics } from '../services/article.service';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { Article } from '../types/article';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { RssSourceConfig } from '../types/source';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { normalizeUrl } from '../utils/normalize-url';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { createRedditAwareLookup, redditHttpsAgent } from '../utils/reddit-dns';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { compactText } from '../utils/text';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { NewsCrawler } from './crawler.types';

/**
 * Interface `RssItemLike` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface RssItemLike {
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  title?: string;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  link?: string;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  contentSnippet?: string;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  content?: string;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  isoDate?: string;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  creator?: string;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  enclosure?: {
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    url?: string;
    // Khai báo contract có kiểu để các caller dùng nhất quán.
    type?: string;
  };
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  mediaContent?: {
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    $?: {
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      url?: string;
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      medium?: string;
      // Khai báo contract có kiểu để các caller dùng nhất quán.
      type?: string;
    };
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  }[];
}

/**
 * Interface `RssParserLike` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface RssParserLike {
  /**
   * Hàm `parseURL` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  parseURL(url: string): Promise<{ items: RssItemLike[] }>;
}

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
 * Class `RssCrawler` đóng gói trách nhiệm chính của module.
 *
 * Được sử dụng tại:
 * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
export class RssCrawler implements NewsCrawler<RssSourceConfig> {
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  constructor(
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    private readonly parser: RssParserLike = new Parser({
      // Gán field cấu trúc để tạo object đúng contract.
      headers: {
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        'User-Agent': env.USER_AGENT,
        // Gán field cấu trúc để tạo object đúng contract.
        Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
      },
      // Gán field cấu trúc để tạo object đúng contract.
      requestOptions: {
        // Gán field cấu trúc để tạo object đúng contract.
        lookup: createRedditAwareLookup(),
      },
      // Gán field cấu trúc để tạo object đúng contract.
      timeout: env.REQUEST_TIMEOUT_MS,
    }),
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    private readonly http: HttpClientLike = axios.create({
      // Gán field cấu trúc để tạo object đúng contract.
      timeout: env.REQUEST_TIMEOUT_MS,
      // Gán field cấu trúc để tạo object đúng contract.
      headers: {
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        'User-Agent': env.USER_AGENT,
      },
      // Gán field cấu trúc để tạo object đúng contract.
      httpsAgent: redditHttpsAgent,
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
  async crawl(source: RssSourceConfig): Promise<Article[]> {
    /**
     * Hàm `feed` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
     */
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const feed = await this.parser.parseURL(source.feedUrl);

    /**
     * Hằng `articles` lưu cấu hình hoặc helper dùng trong module.
     *
     * Được sử dụng tại:
     * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
     */
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const articles = feed.items
      // Tiếp tục biến đổi dữ liệu theo chuỗi thao tác bất biến.
      .filter((item) => item.title && item.link)
      // Tiếp tục biến đổi dữ liệu theo chuỗi thao tác bất biến.
      .map((item) => {
        /**
         * Hàm `title` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
         *
         * Được sử dụng tại:
         * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
         */
        // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
        const title = compactText(item.title ?? '');
        /**
         * Hàm `summary` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
         *
         * Được sử dụng tại:
         * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
         */
        // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
        const summary = compactText(item.contentSnippet ?? item.content ?? '');
        /**
         * Hàm `url` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
         *
         * Được sử dụng tại:
         * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
         */
        // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
        const url = normalizeUrl(item.link ?? '');
        /**
         * Hàm `topics` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
         *
         * Được sử dụng tại:
         * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
         */
        // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
        const topics = [...new Set([...(source.defaultTopics ?? []), ...matchTopics({ title, summary })])];

        // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
        return {
          // Gán field cấu trúc để tạo object đúng contract.
          article: {
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
            // Gán field cấu trúc để tạo object đúng contract.
            imageUrl: extractImageUrl(item),
            // Gán field cấu trúc để tạo object đúng contract.
            author: item.creator,
            // Gán field cấu trúc để tạo object đúng contract.
            publishedAt: item.isoDate,
            // Gán field cấu trúc để tạo object đúng contract.
            collectedAt: new Date().toISOString(),
            // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
            topics,
          },
          // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
          item,
        };
      })
      // Tiếp tục biến đổi dữ liệu theo chuỗi thao tác bất biến.
      .filter(({ article }) => article.topics.length > 0);

    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return Promise.all(articles.map(({ article, item }) => this.withArticlePageImage(article, item)));
  }

  /**
   * Hàm `withArticlePageImage` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  private async withArticlePageImage(article: Article, item: RssItemLike): Promise<Article> {
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (article.imageUrl) {
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return article;
    }

    /**
     * Hàm `imageLookupUrl` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
     */
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const imageLookupUrl = getImageLookupUrl(article, item);
    /**
     * Hàm `imageUrl` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
     */
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const imageUrl = await this.fetchArticleImageUrl(imageLookupUrl);

    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return imageUrl ? { ...article, imageUrl } : article;
  }

  /**
   * Hàm `fetchArticleImageUrl` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  private async fetchArticleImageUrl(articleUrl: string): Promise<string | undefined> {
    // Bắt đầu thao tác có thể lỗi để bảo vệ toàn bộ pipeline.
    try {
      /**
       * Hàm `response` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
       *
       * Được sử dụng tại:
       * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
       */
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const response = await this.http.get(articleUrl);
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return extractImageUrlFromHtml(response.data, articleUrl);
    // Thu lỗi từ thao tác trước và chuyển sang fallback an toàn.
    } catch {
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return undefined;
    }
  }
}

/**
 * Hàm `extractImageUrl` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function extractImageUrl(item: RssItemLike): string | undefined {
  /**
   * Hằng `candidates` lưu cấu hình hoặc helper dùng trong module.
   *
   * Được sử dụng tại:
   * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
   */
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const candidates = [
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    item.enclosure?.type?.startsWith('image/') ? item.enclosure.url : undefined,
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    ...(item.mediaContent ?? []).map((media) =>
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      media.$?.medium === 'image' || media.$?.type?.startsWith('image/') ? media.$.url : undefined,
    ),
    /**
     * Hàm `extractFirstImageFromHtml` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
     */
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    extractFirstImageFromHtml(item.content),
  ];

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return candidates.map((candidate) => normalizeImageUrl(candidate)).find(Boolean);
}

/**
 * Hàm `extractFirstImageFromHtml` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function extractFirstImageFromHtml(html?: string): string | undefined {
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (!html) {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return undefined;
  }

  /**
   * Hàm `$` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
   */
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const $ = cheerio.load(html);
  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return $('img').first().attr('src');
}

/**
 * Hàm `extractImageUrlFromHtml` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function extractImageUrlFromHtml(html: string, baseUrl: string): string | undefined {
  /**
   * Hàm `$` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
   */
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const $ = cheerio.load(html);
  /**
   * Hằng `candidates` lưu cấu hình hoặc helper dùng trong module.
   *
   * Được sử dụng tại:
   * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
   */
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const candidates = [
    /**
     * Hàm `$` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
     */
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    $('meta[property="og:image"]').attr('content'),
    /**
     * Hàm `$` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
     */
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    $('meta[name="twitter:image"]').attr('content'),
    /**
     * Hàm `$` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
     */
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    $('article img').first().attr('src'),
    /**
     * Hàm `$` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
     */
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    $('main img').first().attr('src'),
  ];

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return candidates.map((candidate) => normalizeImageUrl(candidate, baseUrl)).find(Boolean);
}

/**
 * Hàm `getImageLookupUrl` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function getImageLookupUrl(article: Article, item: RssItemLike): string {
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (!article.sourceId.startsWith('reddit-')) {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return article.url;
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return extractExternalRedditLink(item.content) ?? article.url;
}

/**
 * Hàm `extractExternalRedditLink` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function extractExternalRedditLink(html?: string): string | undefined {
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (!html) {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return undefined;
  }

  /**
   * Hàm `$` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
   */
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const $ = cheerio.load(html);
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const candidates: string[] = [];

  /**
   * Hàm `$` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
   */
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  $('a[href]').each((_index, element) => {
    /**
     * Hàm `href` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
     */
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const href = $(element).attr('href');

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (href) {
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      candidates.push(href);
    }
  });

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return candidates.map(normalizeExternalRedditLink).find(Boolean);
}

/**
 * Hàm `normalizeExternalRedditLink` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function normalizeExternalRedditLink(href: string): string | undefined {
  // Bắt đầu thao tác có thể lỗi để bảo vệ toàn bộ pipeline.
  try {
    /**
     * Hàm `url` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
     */
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const url = new URL(href.trim());

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (url.protocol !== 'https:') {
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return undefined;
    }

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (isRedditHostname(url.hostname)) {
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return undefined;
    }

    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return url.toString();
  // Thu lỗi từ thao tác trước và chuyển sang fallback an toàn.
  } catch {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return undefined;
  }
}

/**
 * Hàm `isRedditHostname` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function isRedditHostname(hostname: string): boolean {
  /**
   * Hàm `normalized` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
   */
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const normalized = hostname.toLowerCase();
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  return (
    // Cập nhật trạng thái cục bộ từ kết quả vừa tính.
    normalized === 'reddit.com' ||
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    normalized.endsWith('.reddit.com') ||
    // Cập nhật trạng thái cục bộ từ kết quả vừa tính.
    normalized === 'redd.it' ||
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    normalized.endsWith('.redd.it')
  );
}

/**
 * Hàm `normalizeImageUrl` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - Không có caller trực tiếp; đây là helper nội bộ hoặc entry contract.
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function normalizeImageUrl(imageUrl?: string, baseUrl?: string): string | undefined {
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
    const url = baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed);
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return url.protocol === 'https:' ? url.toString() : undefined;
  // Thu lỗi từ thao tác trước và chuyển sang fallback an toàn.
  } catch {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return undefined;
  }
}
