/**
 * Tải RSS/XML, chuẩn hóa item và gắn topic để tạo Article[].
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp axios từ `axios` để dùng đúng dependency/type thay vì tự triển khai lại.
import axios from 'axios';
// Nạp * as cheerio từ `cheerio` để dùng đúng dependency/type thay vì tự triển khai lại.
import * as cheerio from 'cheerio';
// Nạp Parser từ `rss-parser` để dùng đúng dependency/type thay vì tự triển khai lại.
import Parser from 'rss-parser';
// Nạp { env } từ `../config/env` để dùng đúng dependency/type thay vì tự triển khai lại.
import { env } from '../config/env';
// Nạp { matchTopics } từ `../services/article.service` để dùng đúng dependency/type thay vì tự triển khai lại.
import { matchTopics } from '../services/article.service';
// Nạp { Article } từ `../types/article` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { Article } from '../types/article';
// Nạp { RssSourceConfig } từ `../types/source` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { RssSourceConfig } from '../types/source';
// Nạp { normalizeUrl } từ `../utils/normalize-url` để dùng đúng dependency/type thay vì tự triển khai lại.
import { normalizeUrl } from '../utils/normalize-url';
// Nạp { createRedditAwareLookup, redditHttpsAgent } từ `../utils/reddit-dns` để dùng đúng dependency/type thay vì tự triển khai lại.
import { createRedditAwareLookup, redditHttpsAgent } from '../utils/reddit-dns';
// Nạp { compactText } từ `../utils/text` để dùng đúng dependency/type thay vì tự triển khai lại.
import { compactText } from '../utils/text';
// Nạp { NewsCrawler } từ `./crawler.types` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { NewsCrawler } from './crawler.types';

/**
 * Interface `RssItemLike` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/crawlers/rss.crawler.ts`
 */
// Mở khai báo `interface RssItemLike` để compiler kiểm tra contract cho mọi consumer.
interface RssItemLike {
  // Gán field `title?` từ `string;` để object khớp contract.
  title?: string;
  // Gán field `link?` từ `string;` để object khớp contract.
  link?: string;
  // Gán field `contentSnippet?` từ `string;` để object khớp contract.
  contentSnippet?: string;
  // Gán field `content?` từ `string;` để object khớp contract.
  content?: string;
  // Gán field `isoDate?` từ `string;` để object khớp contract.
  isoDate?: string;
  // Gán field `creator?` từ `string;` để object khớp contract.
  creator?: string;
  // Gán field `enclosure?` từ `{` để object khớp contract.
  enclosure?: {
    // Gán field `url?` từ `string;` để object khớp contract.
    url?: string;
    // Mở khai báo `type?: string;` để compiler kiểm tra contract cho mọi consumer.
    type?: string;
  };
  // Gán field `mediaContent?` từ `{` để object khớp contract.
  mediaContent?: {
    // Gán field `$?` từ `{` để object khớp contract.
    $?: {
      // Gán field `url?` từ `string;` để object khớp contract.
      url?: string;
      // Gán field `medium?` từ `string;` để object khớp contract.
      medium?: string;
      // Mở khai báo `type?: string;` để compiler kiểm tra contract cho mọi consumer.
      type?: string;
    };
  }[];
}

/**
 * Interface `RssParserLike` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/crawlers/rss.crawler.ts`
 */
// Mở khai báo `interface RssParserLike` để compiler kiểm tra contract cho mọi consumer.
interface RssParserLike {
  parseURL(url: string): Promise<{ items: RssItemLike[] }>;
}

/**
 * Interface `HttpClientLike` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/crawlers/rss.crawler.ts`
 */
// Mở khai báo `interface HttpClientLike` để compiler kiểm tra contract cho mọi consumer.
interface HttpClientLike {
  get(url: string): Promise<{ data: string }>;
}

/**
 * Class `RssCrawler` sở hữu vòng đời dependency và điều phối các bước rss crawler.
 *
 * Được sử dụng tại:
 * - `src/crawlers/index.ts`
 * - `tests/crawlers/rss.crawler.test.ts`
 */
// Mở khai báo `export class RssCrawler implements NewsCrawler<RssSourceConfig>` để compiler kiểm tra contract cho mọi consumer.
export class RssCrawler implements NewsCrawler<RssSourceConfig> {
  constructor(
    private readonly parser: RssParserLike = new Parser({
      // Gán field `headers` từ `{` để object khớp contract.
      headers: {
        // Gán field `User-Agent` từ `env.USER_AGENT,` để object khớp contract.
        'User-Agent': env.USER_AGENT,
        // Gán field `Accept` từ `'application/rss+xml, application/xml;q=0.9, */*;q=0.8',` để object khớp contract.
        Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
      },
      // Gán field `requestOptions` từ `{` để object khớp contract.
      requestOptions: {
        // Gán field `lookup` từ `createRedditAwareLookup(),` để object khớp contract.
        lookup: createRedditAwareLookup(),
      },
      // Gán field `timeout` từ `env.REQUEST_TIMEOUT_MS,` để object khớp contract.
      timeout: env.REQUEST_TIMEOUT_MS,
    }),
    private readonly http: HttpClientLike = axios.create({
      // Gán field `timeout` từ `env.REQUEST_TIMEOUT_MS,` để object khớp contract.
      timeout: env.REQUEST_TIMEOUT_MS,
      // Gán field `headers` từ `{` để object khớp contract.
      headers: {
        // Gán field `User-Agent` từ `env.USER_AGENT,` để object khớp contract.
        'User-Agent': env.USER_AGENT,
      },
      // Gán field `httpsAgent` từ `redditHttpsAgent,` để object khớp contract.
      httpsAgent: redditHttpsAgent,
    }),
  ) {}

  /**
   * Hàm `crawl` tải dữ liệu nguồn và chuẩn hóa thành Article[]; kết quả được trả cho caller theo kiểu khai báo.
   *
   * Được sử dụng tại:
   * - `tests/crawlers/rss.crawler.test.ts`
   * - `src/services/source.service.ts`
   */
  // Mở method `crawl` để tải dữ liệu nguồn và chuẩn hóa thành Article[].
  async crawl(source: RssSourceConfig): Promise<Article[]> {
    // Tính `feed` từ `await this.parser.parseURL(source.feedUrl);` và giữ bất biến trong phạm vi hiện tại.
    const feed = await this.parser.parseURL(source.feedUrl);

    // Tính `articles` từ `feed.items` và giữ bất biến trong phạm vi hiện tại.
    const articles = feed.items
      // Áp dụng `filter` để tiếp tục biến đổi kết quả trung gian mà không đổi input gốc.
      .filter((item) => item.title && item.link)
      // Áp dụng `map` để tiếp tục biến đổi kết quả trung gian mà không đổi input gốc.
      .map((item) => {
        // Tính `title` từ `compactText(item.title ?? '');` và giữ bất biến trong phạm vi hiện tại.
        const title = compactText(item.title ?? '');
        // Tính `summary` từ `compactText(item.contentSnippet ?? item.content ?? '');` và giữ bất biến trong phạm vi hiện tại.
        const summary = compactText(item.contentSnippet ?? item.content ?? '');
        // Tính `url` từ `normalizeUrl(item.link ?? '');` và giữ bất biến trong phạm vi hiện tại.
        const url = normalizeUrl(item.link ?? '');
        // Tính `topics` từ `[...new Set([...(source.defaultTopics ?? []), ...matchTopics({ title, summary })])];` và giữ bất biến trong phạm vi hiện tại.
        const topics = [...new Set([...(source.defaultTopics ?? []), ...matchTopics({ title, summary })])];

        // Trả `{` cho caller và kết thúc nhánh hiện tại.
        return {
          // Gán field `article` từ `{` để object khớp contract.
          article: {
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
            // Gán field `imageUrl` từ `extractImageUrl(item),` để object khớp contract.
            imageUrl: extractImageUrl(item),
            // Gán field `author` từ `item.creator,` để object khớp contract.
            author: item.creator,
            // Gán field `publishedAt` từ `item.isoDate,` để object khớp contract.
            publishedAt: item.isoDate,
            // Gán field `collectedAt` từ `new Date().toISOString(),` để object khớp contract.
            collectedAt: new Date().toISOString(),
            // Đưa giá trị `topics` vào field cùng tên của object đang tạo.
            topics,
          },
          // Đưa giá trị `item` vào field cùng tên của object đang tạo.
          item,
        };
      })
      // Áp dụng `filter` để tiếp tục biến đổi kết quả trung gian mà không đổi input gốc.
      .filter(({ article }) => article.topics.length > 0);

    // Trả `Promise.all(articles.map(({ article, item }) => this.withArticlePageImage(article, item…` cho caller và kết thúc nhánh hiện tại.
    return Promise.all(articles.map(({ article, item }) => this.withArticlePageImage(article, item)));
  }

  /**
   * Hàm `withArticlePageImage` thực hiện trách nhiệm `with article page image` của module; kết quả được trả cho caller theo kiểu khai báo.
   *
   * Được sử dụng tại:
   * - `src/crawlers/rss.crawler.ts`
   */
  // Mở method `withArticlePageImage` để thực hiện trách nhiệm `with article page image` của module.
  private async withArticlePageImage(article: Article, item: RssItemLike): Promise<Article> {
    // Nếu `article.imageUrl` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (article.imageUrl) {
      // Trả `article;` cho caller và kết thúc nhánh hiện tại.
      return article;
    }

    // Tính `imageLookupUrl` từ `getImageLookupUrl(article, item);` và giữ bất biến trong phạm vi hiện tại.
    const imageLookupUrl = getImageLookupUrl(article, item);
    // Tính `imageUrl` từ `await this.fetchArticleImageUrl(imageLookupUrl);` và giữ bất biến trong phạm vi hiện tại.
    const imageUrl = await this.fetchArticleImageUrl(imageLookupUrl);

    // Trả `imageUrl ? { ...article, imageUrl } : article;` cho caller và kết thúc nhánh hiện tại.
    return imageUrl ? { ...article, imageUrl } : article;
  }

  /**
   * Hàm `fetchArticleImageUrl` lấy dữ liệu từ dependency bên ngoài; kết quả được trả cho caller theo kiểu khai báo.
   *
   * Được sử dụng tại:
   * - `src/crawlers/rss.crawler.ts`
   */
  // Mở method `fetchArticleImageUrl` để lấy dữ liệu từ dependency bên ngoài.
  private async fetchArticleImageUrl(articleUrl: string): Promise<string | undefined> {
    // Cô lập thao tác có thể lỗi để module còn cơ hội log và trả fallback an toàn.
    try {
      // Tính `response` từ `await this.http.get(articleUrl);` và giữ bất biến trong phạm vi hiện tại.
      const response = await this.http.get(articleUrl);
      // Trả `extractImageUrlFromHtml(response.data, articleUrl);` cho caller và kết thúc nhánh hiện tại.
      return extractImageUrlFromHtml(response.data, articleUrl);
    // Bắt lỗi từ khối try, không để một dependency ngoài làm hỏng toàn bộ đợt xử lý.
    } catch {
      // Trả `undefined;` cho caller và kết thúc nhánh hiện tại.
      return undefined;
    }
  }
}

/**
 * Hàm `extractImageUrl` trích field hợp lệ từ dữ liệu thô; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/crawlers/rss.crawler.ts`
 */
// Mở thân hàm `extractImageUrl` với input/output được TypeScript kiểm tra.
function extractImageUrl(item: RssItemLike): string | undefined {
  // Tính `candidates` từ `[` và giữ bất biến trong phạm vi hiện tại.
  const candidates = [
    item.enclosure?.type?.startsWith('image/') ? item.enclosure.url : undefined,
    // Tạo callback nhận `...(item.mediaContent ?? []).map((media)` để xử lý từng kết quả trong collection/promise.
    ...(item.mediaContent ?? []).map((media) =>
      media.$?.medium === 'image' || media.$?.type?.startsWith('image/') ? media.$.url : undefined,
    ),
    extractFirstImageFromHtml(item.content),
  ];

  // Trả `candidates.map((candidate) => normalizeImageUrl(candidate)).find(Boolean);` cho caller và kết thúc nhánh hiện tại.
  return candidates.map((candidate) => normalizeImageUrl(candidate)).find(Boolean);
}

/**
 * Hàm `extractFirstImageFromHtml` trích field hợp lệ từ dữ liệu thô; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/crawlers/rss.crawler.ts`
 */
// Mở thân hàm `extractFirstImageFromHtml` với input/output được TypeScript kiểm tra.
function extractFirstImageFromHtml(html?: string): string | undefined {
  // Nếu `!html` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (!html) {
    // Trả `undefined;` cho caller và kết thúc nhánh hiện tại.
    return undefined;
  }

  const $ = cheerio.load(html);
  // Trả `$('img').first().attr('src');` cho caller và kết thúc nhánh hiện tại.
  return $('img').first().attr('src');
}

/**
 * Hàm `extractImageUrlFromHtml` trích field hợp lệ từ dữ liệu thô; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/crawlers/rss.crawler.ts`
 */
// Mở thân hàm `extractImageUrlFromHtml` với input/output được TypeScript kiểm tra.
function extractImageUrlFromHtml(html: string, baseUrl: string): string | undefined {
  const $ = cheerio.load(html);
  // Tính `candidates` từ `[` và giữ bất biến trong phạm vi hiện tại.
  const candidates = [
    $('meta[property="og:image"]').attr('content'),
    $('meta[name="twitter:image"]').attr('content'),
    $('article img').first().attr('src'),
    $('main img').first().attr('src'),
  ];

  // Trả `candidates.map((candidate) => normalizeImageUrl(candidate, baseUrl)).find(Boolean);` cho caller và kết thúc nhánh hiện tại.
  return candidates.map((candidate) => normalizeImageUrl(candidate, baseUrl)).find(Boolean);
}

/**
 * Hàm `getImageLookupUrl` lấy giá trị dẫn xuất an toàn; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/crawlers/rss.crawler.ts`
 */
// Mở thân hàm `getImageLookupUrl` với input/output được TypeScript kiểm tra.
function getImageLookupUrl(article: Article, item: RssItemLike): string {
  // Nếu `!article.sourceId.startsWith('reddit-')` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (!article.sourceId.startsWith('reddit-')) {
    // Trả `article.url;` cho caller và kết thúc nhánh hiện tại.
    return article.url;
  }

  // Trả `extractExternalRedditLink(item.content) ?? article.url;` cho caller và kết thúc nhánh hiện tại.
  return extractExternalRedditLink(item.content) ?? article.url;
}

/**
 * Hàm `extractExternalRedditLink` trích field hợp lệ từ dữ liệu thô; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/crawlers/rss.crawler.ts`
 */
// Mở thân hàm `extractExternalRedditLink` với input/output được TypeScript kiểm tra.
function extractExternalRedditLink(html?: string): string | undefined {
  // Nếu `!html` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (!html) {
    // Trả `undefined;` cho caller và kết thúc nhánh hiện tại.
    return undefined;
  }

  const $ = cheerio.load(html);
  // Khởi tạo biến cục bộ `candidates` kiểu `string[]` từ `[];`.
  const candidates: string[] = [];

  // Tạo callback nhận `$('a[href]').each((_index, element)` để xử lý từng kết quả trong collection/promise.
  $('a[href]').each((_index, element) => {
    // Tính `href` từ `$(element).attr('href');` và giữ bất biến trong phạm vi hiện tại.
    const href = $(element).attr('href');

    // Nếu `href` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (href) {
      // Gọi `candidates.push` với `href` để hoàn tất side effect/bước xử lý hiện tại.
      candidates.push(href);
    }
  });

  // Trả `candidates.map(normalizeExternalRedditLink).find(Boolean);` cho caller và kết thúc nhánh hiện tại.
  return candidates.map(normalizeExternalRedditLink).find(Boolean);
}

/**
 * Hàm `normalizeExternalRedditLink` chuẩn hóa giá trị theo rule của hàm; input sai được giữ nguyên, bỏ qua hoặc throw đúng như implementation; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/crawlers/rss.crawler.ts`
 */
// Mở thân hàm `normalizeExternalRedditLink` với input/output được TypeScript kiểm tra.
function normalizeExternalRedditLink(href: string): string | undefined {
  // Cô lập thao tác có thể lỗi để module còn cơ hội log và trả fallback an toàn.
  try {
    // Tính `url` từ `new URL(href.trim());` và giữ bất biến trong phạm vi hiện tại.
    const url = new URL(href.trim());

    // Nếu `url.protocol !== 'https:'` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (url.protocol !== 'https:') {
      // Trả `undefined;` cho caller và kết thúc nhánh hiện tại.
      return undefined;
    }

    // Nếu `isRedditHostname(url.hostname)` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (isRedditHostname(url.hostname)) {
      // Trả `undefined;` cho caller và kết thúc nhánh hiện tại.
      return undefined;
    }

    // Trả `url.toString();` cho caller và kết thúc nhánh hiện tại.
    return url.toString();
  // Bắt lỗi từ khối try, không để một dependency ngoài làm hỏng toàn bộ đợt xử lý.
  } catch {
    // Trả `undefined;` cho caller và kết thúc nhánh hiện tại.
    return undefined;
  }
}

/**
 * Hàm `isRedditHostname` kiểm tra điều kiện và trả boolean; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/crawlers/rss.crawler.ts`
 */
// Mở thân hàm `isRedditHostname` với input/output được TypeScript kiểm tra.
function isRedditHostname(hostname: string): boolean {
  // Tính `normalized` từ `hostname.toLowerCase();` và giữ bất biến trong phạm vi hiện tại.
  const normalized = hostname.toLowerCase();
  // Trả `(` cho caller và kết thúc nhánh hiện tại.
  return (
    // Cập nhật `normalized` bằng `== 'reddit.com' ||` cho bước kế tiếp.
    normalized === 'reddit.com' ||
    normalized.endsWith('.reddit.com') ||
    // Cập nhật `normalized` bằng `== 'redd.it' ||` cho bước kế tiếp.
    normalized === 'redd.it' ||
    // Gọi `normalized.endsWith` với `'.redd.it'` để hoàn tất side effect/bước xử lý hiện tại.
    normalized.endsWith('.redd.it')
  );
}

/**
 * Hàm `normalizeImageUrl` chỉ chấp nhận URL ảnh HTTPS hợp lệ; input rỗng, sai cú pháp hoặc protocol khác trả `undefined`; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/crawlers/rss.crawler.ts`
 */
// Mở thân hàm `normalizeImageUrl` với input/output được TypeScript kiểm tra.
function normalizeImageUrl(imageUrl?: string, baseUrl?: string): string | undefined {
  // Tính `trimmed` từ `imageUrl?.trim();` và giữ bất biến trong phạm vi hiện tại.
  const trimmed = imageUrl?.trim();

  // Nếu `!trimmed` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (!trimmed) {
    // Trả `undefined;` cho caller và kết thúc nhánh hiện tại.
    return undefined;
  }

  // Cô lập thao tác có thể lỗi để module còn cơ hội log và trả fallback an toàn.
  try {
    // Tính `url` từ `baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed);` và giữ bất biến trong phạm vi hiện tại.
    const url = baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed);
    // Trả `url.protocol === 'https:' ? url.toString() : undefined;` cho caller và kết thúc nhánh hiện tại.
    return url.protocol === 'https:' ? url.toString() : undefined;
  // Bắt lỗi từ khối try, không để một dependency ngoài làm hỏng toàn bộ đợt xử lý.
  } catch {
    // Trả `undefined;` cho caller và kết thúc nhánh hiện tại.
    return undefined;
  }
}
