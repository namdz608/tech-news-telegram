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
 * - `src/crawlers/rss.crawler.ts:34`
 * - `src/crawlers/rss.crawler.ts:95`
 * - `src/crawlers/rss.crawler.ts:116`
 * - `src/crawlers/rss.crawler.ts:149`
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
 * - `src/crawlers/rss.crawler.ts:43`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface RssParserLike {
  /**
   * Hàm `parseURL` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/crawlers/rss.crawler.ts:63`
   * - `tests/crawlers/rss.crawler.test.ts:39`
   * - `tests/crawlers/rss.crawler.test.ts:81`
   * - `tests/crawlers/rss.crawler.test.ts:107`
   * - `tests/crawlers/rss.crawler.test.ts:137`
   * - `tests/crawlers/rss.crawler.test.ts:167`
   * - `tests/crawlers/rss.crawler.test.ts:205`
   * - `tests/crawlers/rss.crawler.test.ts:261`
   * - `tests/crawlers/rss.crawler.test.ts:317`
   * - `tests/crawlers/rss.crawler.test.ts:363`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  parseURL(url: string): Promise<{ items: RssItemLike[] }>;
}

/**
 * Interface `HttpClientLike` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts:8`
 * - `src/crawlers/github-repos.crawler.ts:41`
 * - `src/crawlers/html.crawler.ts:11`
 * - `src/crawlers/html.crawler.ts:17`
 * - `src/crawlers/rss.crawler.ts:53`
 * - `src/crawlers/x-search.crawler.ts:9`
 * - `src/crawlers/x-search.crawler.ts:39`
 * - `src/services/telegram.service.ts:44`
 * - `src/services/telegram.service.ts:57`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface HttpClientLike {
  /**
   * Hàm `get` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/crawlers/github-repos.crawler.ts:9`
   * - `src/crawlers/github-repos.crawler.ts:66`
   * - `src/crawlers/html.crawler.ts:12`
   * - `src/crawlers/html.crawler.ts:26`
   * - `src/crawlers/rss.crawler.ts:108`
   * - `src/crawlers/x-search.crawler.ts:10`
   * - `src/crawlers/x-search.crawler.ts:52`
   * - `src/crawlers/x-search.crawler.ts:70`
   * - `src/routes/health.routes.ts:18`
   * - `src/routes/news.routes.ts:19`
   * - `src/routes/news.routes.ts:21`
   * - `src/services/digest.service.ts:70`
   * - `src/services/digest.service.ts:108`
   * - `src/services/digest.service.ts:336`
   * - `src/services/google-translation.service.ts:31`
   * - `src/services/telegram.service.ts:45`
   * - `src/services/telegram.service.ts:159`
   * - `tests/crawlers/github-repos.crawler.test.ts:27`
   * - `tests/crawlers/github-repos.crawler.test.ts:92`
   * - `tests/crawlers/github-repos.crawler.test.ts:93`
   * - `tests/crawlers/github-repos.crawler.test.ts:106`
   * - `tests/crawlers/github-repos.crawler.test.ts:138`
   * - `tests/crawlers/github-repos.crawler.test.ts:153`
   * - `tests/crawlers/github-repos.crawler.test.ts:169`
   * - `tests/crawlers/github-repos.crawler.test.ts:172`
   * - `tests/crawlers/html.crawler.test.ts:24`
   * - `tests/crawlers/html.crawler.test.ts:49`
   * - `tests/crawlers/rss.crawler.test.ts:179`
   * - `tests/crawlers/rss.crawler.test.ts:227`
   * - `tests/crawlers/rss.crawler.test.ts:286`
   * - `tests/crawlers/rss.crawler.test.ts:340`
   * - `tests/crawlers/rss.crawler.test.ts:376`
   * - `tests/crawlers/x-search.crawler.test.ts:18`
   * - `tests/crawlers/x-search.crawler.test.ts:53`
   * - `tests/crawlers/x-search.crawler.test.ts:91`
   * - `tests/crawlers/x-search.crawler.test.ts:97`
   * - `tests/routes/health.routes.test.ts:7`
   * - `tests/routes/news.routes.test.ts:7`
   * - `tests/services/google-translation.service.test.ts:7`
   * - `tests/services/google-translation.service.test.ts:18`
   * - `tests/services/telegram.service.test.ts:161`
   * - `tests/services/telegram.service.test.ts:188`
   * - `tests/services/telegram.service.test.ts:207`
   * - `tests/services/telegram.service.test.ts:253`
   * - `tests/services/telegram.service.test.ts:309`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  get(url: string): Promise<{ data: string }>;
}

/**
 * Class `RssCrawler` đóng gói trách nhiệm chính của module.
 *
 * Được sử dụng tại:
 * - `src/crawlers/index.ts:12`
 * - `src/crawlers/index.ts:28`
 * - `tests/crawlers/rss.crawler.test.ts:2`
 * - `tests/crawlers/rss.crawler.test.ts:6`
 * - `tests/crawlers/rss.crawler.test.ts:8`
 * - `tests/crawlers/rss.crawler.test.ts:38`
 * - `tests/crawlers/rss.crawler.test.ts:80`
 * - `tests/crawlers/rss.crawler.test.ts:123`
 * - `tests/crawlers/rss.crawler.test.ts:150`
 * - `tests/crawlers/rss.crawler.test.ts:190`
 * - `tests/crawlers/rss.crawler.test.ts:241`
 * - `tests/crawlers/rss.crawler.test.ts:300`
 * - `tests/crawlers/rss.crawler.test.ts:346`
 * - `tests/crawlers/rss.crawler.test.ts:390`
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
   * - `src/crawlers/crawler.types.ts:85`
   * - `src/crawlers/github-repos.crawler.ts:49`
   * - `src/crawlers/github-repos.crawler.ts:57`
   * - `src/crawlers/html.crawler.ts:25`
   * - `src/crawlers/x-search.crawler.ts:47`
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
  async crawl(source: RssSourceConfig): Promise<Article[]> {
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const feed = await this.parser.parseURL(source.feedUrl);

    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const articles = feed.items
      // Tiếp tục biến đổi dữ liệu theo chuỗi thao tác bất biến.
      .filter((item) => item.title && item.link)
      // Tiếp tục biến đổi dữ liệu theo chuỗi thao tác bất biến.
      .map((item) => {
        // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
        const title = compactText(item.title ?? '');
        // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
        const summary = compactText(item.contentSnippet ?? item.content ?? '');
        // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
        const url = normalizeUrl(item.link ?? '');
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
   * - `src/crawlers/rss.crawler.ts:92`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  private async withArticlePageImage(article: Article, item: RssItemLike): Promise<Article> {
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (article.imageUrl) {
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return article;
    }

    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const imageLookupUrl = getImageLookupUrl(article, item);
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const imageUrl = await this.fetchArticleImageUrl(imageLookupUrl);

    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return imageUrl ? { ...article, imageUrl } : article;
  }

  /**
   * Hàm `fetchArticleImageUrl` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/crawlers/rss.crawler.ts:101`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  private async fetchArticleImageUrl(articleUrl: string): Promise<string | undefined> {
    // Bắt đầu thao tác có thể lỗi để bảo vệ toàn bộ pipeline.
    try {
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
 * - `src/crawlers/rss.crawler.ts:81`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function extractImageUrl(item: RssItemLike): string | undefined {
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
     * - `src/crawlers/rss.crawler.ts:128`
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
 * - `src/crawlers/rss.crawler.ts:122`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function extractFirstImageFromHtml(html?: string): string | undefined {
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (!html) {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return undefined;
  }

  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const $ = cheerio.load(html);
  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return $('img').first().attr('src');
}

/**
 * Hàm `extractImageUrlFromHtml` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/crawlers/rss.crawler.ts:109`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function extractImageUrlFromHtml(html: string, baseUrl: string): string | undefined {
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const $ = cheerio.load(html);
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
 * - `src/crawlers/rss.crawler.ts:100`
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
 * - `src/crawlers/rss.crawler.ts:154`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function extractExternalRedditLink(html?: string): string | undefined {
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (!html) {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return undefined;
  }

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
 * - `src/crawlers/rss.crawler.ts:173`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function normalizeExternalRedditLink(href: string): string | undefined {
  // Bắt đầu thao tác có thể lỗi để bảo vệ toàn bộ pipeline.
  try {
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
 * - `src/crawlers/rss.crawler.ts:184`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function isRedditHostname(hostname: string): boolean {
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
 * - `src/crawlers/github-repos.crawler.ts:146`
 * - `src/crawlers/github-repos.crawler.ts:171`
 * - `src/crawlers/html.crawler.ts:45`
 * - `src/crawlers/html.crawler.ts:75`
 * - `src/crawlers/rss.crawler.ts:125`
 * - `src/crawlers/rss.crawler.ts:146`
 * - `src/services/digest.service.ts:292`
 * - `src/services/digest.service.ts:295`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function normalizeImageUrl(imageUrl?: string, baseUrl?: string): string | undefined {
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
    const url = baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed);
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return url.protocol === 'https:' ? url.toString() : undefined;
  // Thu lỗi từ thao tác trước và chuyển sang fallback an toàn.
  } catch {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return undefined;
  }
}
