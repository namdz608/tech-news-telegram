/**
 * Tải trang HTML, dùng CSS selector và chuyển từng card tin thành Article.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp axios từ `axios` để dùng đúng dependency/type thay vì tự triển khai lại.
import axios from 'axios';
// Nạp * as cheerio từ `cheerio` để dùng đúng dependency/type thay vì tự triển khai lại.
import * as cheerio from 'cheerio';
// Nạp { env } từ `../config/env` để dùng đúng dependency/type thay vì tự triển khai lại.
import { env } from '../config/env';
// Nạp { matchTopics } từ `../services/article.service` để dùng đúng dependency/type thay vì tự triển khai lại.
import { matchTopics } from '../services/article.service';
// Nạp { Article } từ `../types/article` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { Article } from '../types/article';
// Nạp { HtmlSourceConfig } từ `../types/source` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { HtmlSourceConfig } from '../types/source';
// Nạp { normalizeUrl } từ `../utils/normalize-url` để dùng đúng dependency/type thay vì tự triển khai lại.
import { normalizeUrl } from '../utils/normalize-url';
// Nạp { compactText } từ `../utils/text` để dùng đúng dependency/type thay vì tự triển khai lại.
import { compactText } from '../utils/text';
// Nạp { NewsCrawler } từ `./crawler.types` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { NewsCrawler } from './crawler.types';

/**
 * Interface `HttpClientLike` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/crawlers/html.crawler.ts`
 */
// Mở khai báo `interface HttpClientLike` để compiler kiểm tra contract cho mọi consumer.
interface HttpClientLike {
  // Gán field `get(url` từ `string): Promise<{ data: string }>;` để object khớp contract.
  get(url: string): Promise<{ data: string }>;
}

/**
 * Class `HtmlCrawler` sở hữu vòng đời dependency và điều phối các bước html crawler.
 *
 * Được sử dụng tại:
 * - `src/crawlers/index.ts`
 * - `tests/crawlers/html.crawler.test.ts`
 */
// Mở khai báo `export class HtmlCrawler implements NewsCrawler<HtmlSourceConfig>` để compiler kiểm tra contract cho mọi consumer.
export class HtmlCrawler implements NewsCrawler<HtmlSourceConfig> {
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
   * - `tests/crawlers/html.crawler.test.ts`
   * - `src/services/source.service.ts`
   */
  // Mở method `crawl` để tải dữ liệu nguồn và chuẩn hóa thành Article[].
  async crawl(source: HtmlSourceConfig): Promise<Article[]> {
    // Tính `response` từ `await this.http.get(source.listUrl);` và giữ bất biến trong phạm vi hiện tại.
    const response = await this.http.get(source.listUrl);
    const $ = cheerio.load(response.data);
    // Gán field `const articles` từ `Article[] = [];` để object khớp contract.
    const articles: Article[] = [];

    // Tạo callback nhận `$(source.selectors.item).each((_index, element)` để xử lý từng kết quả trong collection/promise.
    $(source.selectors.item).each((_index, element) => {
      // Tính `item` từ `$(element);` và giữ bất biến trong phạm vi hiện tại.
      const item = $(element);
      // Tính `title` từ `compactText(item.find(source.selectors.title).first().text());` và giữ bất biến trong phạm vi hiện tại.
      const title = compactText(item.find(source.selectors.title).first().text());
      // Tính `href` từ `item.find(source.selectors.url).first().attr('href');` và giữ bất biến trong phạm vi hiện tại.
      const href = item.find(source.selectors.url).first().attr('href');

      // Nếu `!title || !href` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
      if (!title || !href) {
        // Trả quyền điều khiển cho caller và kết thúc nhánh hiện tại.
        return;
      }

      // Tính `absoluteUrl` từ `new URL(href, source.homepageUrl).toString();` và giữ bất biến trong phạm vi hiện tại.
      const absoluteUrl = new URL(href, source.homepageUrl).toString();
      // Tính `url` từ `normalizeUrl(absoluteUrl);` và giữ bất biến trong phạm vi hiện tại.
      const url = normalizeUrl(absoluteUrl);
      // Tính `summary` từ `source.selectors.summary` và giữ bất biến trong phạm vi hiện tại.
      const summary = source.selectors.summary
        ? compactText(item.find(source.selectors.summary).first().text())
        : undefined;
      // Tính `imageUrl` từ `source.selectors.image` và giữ bất biến trong phạm vi hiện tại.
      const imageUrl = source.selectors.image
        ? normalizeImageUrl(item.find(source.selectors.image).first().attr('src'), source.homepageUrl)
        : undefined;
      // Tính `publishedAt` từ `source.selectors.publishedAt` và giữ bất biến trong phạm vi hiện tại.
      const publishedAt = source.selectors.publishedAt
        ? item.find(source.selectors.publishedAt).first().attr('datetime') ??
          // Gọi `compactText` với `item.find(source.selectors.publishedAt).first().text()` để hoàn tất side effect/bước xử lý hiện tại.
          compactText(item.find(source.selectors.publishedAt).first().text())
        : undefined;
      // Tính `topics` từ `matchTopics({ title, summary });` và giữ bất biến trong phạm vi hiện tại.
      const topics = matchTopics({ title, summary });

      // Nếu `topics.length === 0` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
      if (topics.length === 0) {
        // Trả quyền điều khiển cho caller và kết thúc nhánh hiện tại.
        return;
      }

      articles.push({
        // Gán field `id` từ `url,` để object khớp contract.
        id: url,
        // Gán field `sourceId` từ `source.id,` để object khớp contract.
        sourceId: source.id,
        // Gán field `sourceName` từ `source.name,` để object khớp contract.
        sourceName: source.name,
        // Đưa giá trị `title` vào field cùng tên của object đang tạo.
        title,
        // Đưa giá trị `url` vào field cùng tên của object đang tạo.
        url,
        // Đưa giá trị `summary` vào field cùng tên của object đang tạo.
        summary,
        // Đưa giá trị `imageUrl` vào field cùng tên của object đang tạo.
        imageUrl,
        // Đưa giá trị `publishedAt` vào field cùng tên của object đang tạo.
        publishedAt,
        // Gán field `collectedAt` từ `new Date().toISOString(),` để object khớp contract.
        collectedAt: new Date().toISOString(),
        // Đưa giá trị `topics` vào field cùng tên của object đang tạo.
        topics,
      });
    });

    // Trả `articles;` cho caller và kết thúc nhánh hiện tại.
    return articles;
  }
}

/**
 * Hàm `normalizeImageUrl` chuẩn hóa giá trị theo rule của hàm; input sai được giữ nguyên, bỏ qua hoặc throw đúng như implementation; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/crawlers/html.crawler.ts`
 */
// Mở thân hàm `normalizeImageUrl` với input/output được TypeScript kiểm tra.
function normalizeImageUrl(imageUrl: string | undefined, baseUrl: string): string | undefined {
  // Tính `trimmed` từ `imageUrl?.trim();` và giữ bất biến trong phạm vi hiện tại.
  const trimmed = imageUrl?.trim();

  // Nếu `!trimmed` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (!trimmed) {
    // Trả `undefined;` cho caller và kết thúc nhánh hiện tại.
    return undefined;
  }

  // Cô lập thao tác có thể lỗi để module còn cơ hội log và trả fallback an toàn.
  try {
    // Tính `url` từ `new URL(trimmed, baseUrl);` và giữ bất biến trong phạm vi hiện tại.
    const url = new URL(trimmed, baseUrl);
    // Trả `url.protocol === 'https:' ? url.toString() : undefined;` cho caller và kết thúc nhánh hiện tại.
    return url.protocol === 'https:' ? url.toString() : undefined;
  // Bắt lỗi từ khối try, không để một dependency ngoài làm hỏng toàn bộ đợt xử lý.
  } catch {
    // Trả `undefined;` cho caller và kết thúc nhánh hiện tại.
    return undefined;
  }
}
