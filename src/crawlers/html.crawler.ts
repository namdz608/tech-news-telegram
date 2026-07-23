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
 * - `src/crawlers/github-repos.crawler.ts:8`
 * - `src/crawlers/github-repos.crawler.ts:41`
 * - `src/crawlers/html.crawler.ts:17`
 * - `src/crawlers/rss.crawler.ts:117`
 * - `src/crawlers/rss.crawler.ts:213`
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
   * - `src/crawlers/html.crawler.ts:26`
   * - `src/crawlers/rss.crawler.ts:169`
   * - `src/crawlers/rss.crawler.ts:371`
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
 * Class `HtmlCrawler` đóng gói trách nhiệm chính của module.
 *
 * Được sử dụng tại:
 * - `src/crawlers/index.ts:10`
 * - `src/crawlers/index.ts:30`
 * - `tests/crawlers/html.crawler.test.ts:2`
 * - `tests/crawlers/html.crawler.test.ts:5`
 * - `tests/crawlers/html.crawler.test.ts:23`
 * - `tests/crawlers/html.crawler.test.ts:60`
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
   * - `src/crawlers/crawler.types.ts:85`
   * - `src/crawlers/github-repos.crawler.ts:49`
   * - `src/crawlers/github-repos.crawler.ts:57`
   * - `src/crawlers/rss.crawler.ts:280`
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
  async crawl(source: HtmlSourceConfig): Promise<Article[]> {
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const response = await this.http.get(source.listUrl);
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
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const item = $(element);
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const title = compactText(item.find(source.selectors.title).first().text());
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const href = item.find(source.selectors.url).first().attr('href');

      // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
      if (!title || !href) {
        // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
        return;
      }

      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const absoluteUrl = new URL(href, source.homepageUrl).toString();
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const url = normalizeUrl(absoluteUrl);
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const summary = source.selectors.summary
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        ? compactText(item.find(source.selectors.summary).first().text())
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        : undefined;
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const imageUrl = source.selectors.image
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        ? normalizeImageUrl(item.find(source.selectors.image).first().attr('src'), source.homepageUrl)
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        : undefined;
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const publishedAt = source.selectors.publishedAt
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        ? item.find(source.selectors.publishedAt).first().attr('datetime') ??
          /**
           * Hàm `compactText` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
           *
           * Được sử dụng tại:
           * - `src/crawlers/github-repos.crawler.ts:5`
           * - `src/crawlers/github-repos.crawler.ts:156`
           * - `src/crawlers/html.crawler.ts:8`
           * - `src/crawlers/html.crawler.ts:32`
           * - `src/crawlers/html.crawler.ts:42`
           * - `src/crawlers/rss.crawler.ts:26`
           * - `src/crawlers/rss.crawler.ts:291`
           * - `src/crawlers/rss.crawler.ts:293`
           * - `src/crawlers/x-search.crawler.ts:6`
           * - `src/crawlers/x-search.crawler.ts:68`
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
          compactText(item.find(source.selectors.publishedAt).first().text())
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        : undefined;
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
 * - `src/crawlers/github-repos.crawler.ts:146`
 * - `src/crawlers/github-repos.crawler.ts:171`
 * - `src/crawlers/html.crawler.ts:45`
 * - `src/crawlers/rss.crawler.ts:410`
 * - `src/crawlers/rss.crawler.ts:480`
 * - `src/crawlers/rss.crawler.ts:613`
 * - `src/services/digest.service.ts:292`
 * - `src/services/digest.service.ts:295`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function normalizeImageUrl(imageUrl: string | undefined, baseUrl: string): string | undefined {
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
    const url = new URL(trimmed, baseUrl);
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return url.protocol === 'https:' ? url.toString() : undefined;
  // Thu lỗi từ thao tác trước và chuyển sang fallback an toàn.
  } catch {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return undefined;
  }
}
