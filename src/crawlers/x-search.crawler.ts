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
 * - `src/crawlers/github-repos.crawler.ts:8`
 * - `src/crawlers/github-repos.crawler.ts:41`
 * - `src/crawlers/html.crawler.ts:41`
 * - `src/crawlers/html.crawler.ts:112`
 * - `src/crawlers/rss.crawler.ts:117`
 * - `src/crawlers/rss.crawler.ts:213`
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
   * - `src/crawlers/html.crawler.ts:93`
   * - `src/crawlers/html.crawler.ts:179`
   * - `src/crawlers/rss.crawler.ts:169`
   * - `src/crawlers/rss.crawler.ts:371`
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
  get(url: string, config: { headers: Record<string, string>; params: Record<string, string | number> }): Promise<{ data: XSearchResponse }>;
}

/**
 * Interface `XSearchResponse` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - `src/crawlers/x-search.crawler.ts:10`
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
 * - `src/crawlers/x-search.crawler.ts:14`
 * - `src/crawlers/x-search.crawler.ts:99`
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
 * - `src/crawlers/x-search.crawler.ts:16`
 * - `src/crawlers/x-search.crawler.ts:91`
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
 * - `src/crawlers/index.ts:14`
 * - `src/crawlers/index.ts:32`
 * - `tests/crawlers/x-search.crawler.test.ts:2`
 * - `tests/crawlers/x-search.crawler.test.ts:5`
 * - `tests/crawlers/x-search.crawler.test.ts:51`
 * - `tests/crawlers/x-search.crawler.test.ts:94`
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
   * - `src/crawlers/crawler.types.ts:85`
   * - `src/crawlers/github-repos.crawler.ts:49`
   * - `src/crawlers/github-repos.crawler.ts:57`
   * - `src/crawlers/html.crawler.ts:177`
   * - `src/crawlers/rss.crawler.ts:280`
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
  async crawl(source: XSearchSourceConfig): Promise<Article[]> {
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (!source.bearerToken.trim()) {
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return [];
    }

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
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const usersById = new Map((response.data.includes?.users ?? []).map((user) => [user.id, user]));

    /**
     * Hàm `return` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - `src/app.ts:38`
     * - `src/crawlers/github-repos.crawler.ts:53`
     * - `src/crawlers/github-repos.crawler.ts:58`
     * - `src/crawlers/github-repos.crawler.ts:77`
     * - `src/crawlers/github-repos.crawler.ts:80`
     * - `src/crawlers/github-repos.crawler.ts:84`
     * - `src/crawlers/github-repos.crawler.ts:100`
     * - `src/crawlers/github-repos.crawler.ts:107`
     * - `src/crawlers/github-repos.crawler.ts:110`
     * - `src/crawlers/github-repos.crawler.ts:115`
     * - `src/crawlers/github-repos.crawler.ts:131`
     * - `src/crawlers/github-repos.crawler.ts:136`
     * - `src/crawlers/github-repos.crawler.ts:139`
     * - `src/crawlers/github-repos.crawler.ts:164`
     * - `src/crawlers/github-repos.crawler.ts:168`
     * - `src/crawlers/github-repos.crawler.ts:175`
     * - `src/crawlers/github-repos.crawler.ts:180`
     * - `src/crawlers/github-repos.crawler.ts:182`
     * - `src/crawlers/github-repos.crawler.ts:188`
     * - `src/crawlers/github-repos.crawler.ts:191`
     * - `src/crawlers/html.crawler.ts:203`
     * - `src/crawlers/html.crawler.ts:260`
     * - `src/crawlers/html.crawler.ts:289`
     * - `src/crawlers/html.crawler.ts:314`
     * - `src/crawlers/html.crawler.ts:322`
     * - `src/crawlers/html.crawler.ts:326`
     * - `src/crawlers/index.ts:26`
     * - `src/crawlers/rss.crawler.ts:300`
     * - `src/crawlers/rss.crawler.ts:334`
     * - `src/crawlers/rss.crawler.ts:348`
     * - `src/crawlers/rss.crawler.ts:357`
     * - `src/crawlers/rss.crawler.ts:373`
     * - `src/crawlers/rss.crawler.ts:377`
     * - `src/crawlers/rss.crawler.ts:410`
     * - `src/crawlers/rss.crawler.ts:424`
     * - `src/crawlers/rss.crawler.ts:430`
     * - `src/crawlers/rss.crawler.ts:480`
     * - `src/crawlers/rss.crawler.ts:494`
     * - `src/crawlers/rss.crawler.ts:498`
     * - `src/crawlers/rss.crawler.ts:512`
     * - `src/crawlers/rss.crawler.ts:539`
     * - `src/crawlers/rss.crawler.ts:558`
     * - `src/crawlers/rss.crawler.ts:564`
     * - `src/crawlers/rss.crawler.ts:568`
     * - `src/crawlers/rss.crawler.ts:572`
     * - `src/crawlers/rss.crawler.ts:587`
     * - `src/crawlers/rss.crawler.ts:620`
     * - `src/crawlers/rss.crawler.ts:628`
     * - `src/crawlers/rss.crawler.ts:632`
     * - `src/crawlers/x-search.crawler.ts:49`
     * - `src/crawlers/x-search.crawler.ts:74`
     * - `src/crawlers/x-search.crawler.ts:93`
     * - `src/crawlers/x-search.crawler.ts:96`
     * - `src/crawlers/x-search.crawler.ts:110`
     * - `src/crawlers/x-search.crawler.ts:115`
     * - `src/crawlers/x-search.crawler.ts:118`
     * - `src/services/article-editorial.service.ts:29`
     * - `src/services/article-editorial.service.ts:43`
     * - `src/services/article-editorial.service.ts:52`
     * - `src/services/article-editorial.service.ts:59`
     * - `src/services/article-editorial.service.ts:63`
     * - `src/services/article-editorial.service.ts:67`
     * - `src/services/article-editorial.service.ts:70`
     * - `src/services/article-editorial.service.ts:74`
     * - `src/services/article-editorial.service.ts:92`
     * - `src/services/article-editorial.service.ts:96`
     * - `src/services/article-editorial.service.ts:100`
     * - `src/services/article.service.ts:14`
     * - `src/services/article.service.ts:32`
     * - `src/services/article.service.ts:54`
     * - `src/services/article.service.ts:58`
     * - `src/services/article.service.ts:63`
     * - `src/services/article.service.ts:68`
     * - `src/services/article.service.ts:70`
     * - `src/services/codex-article-editorial.generator.ts:22`
     * - `src/services/codex-exec.runner.ts:12`
     * - `src/services/codex-exec.runner.ts:61`
     * - `src/services/digest-message-editorial.service.ts:16`
     * - `src/services/digest.service.ts:56`
     * - `src/services/digest.service.ts:94`
     * - `src/services/digest.service.ts:101`
     * - `src/services/digest.service.ts:122`
     * - `src/services/digest.service.ts:150`
     * - `src/services/digest.service.ts:160`
     * - `src/services/digest.service.ts:185`
     * - `src/services/digest.service.ts:208`
     * - `src/services/digest.service.ts:225`
     * - `src/services/digest.service.ts:260`
     * - `src/services/digest.service.ts:280`
     * - `src/services/digest.service.ts:288`
     * - `src/services/digest.service.ts:292`
     * - `src/services/digest.service.ts:299`
     * - `src/services/digest.service.ts:304`
     * - `src/services/digest.service.ts:306`
     * - `src/services/digest.service.ts:312`
     * - `src/services/digest.service.ts:318`
     * - `src/services/digest.service.ts:321`
     * - `src/services/digest.service.ts:326`
     * - `src/services/digest.service.ts:329`
     * - `src/services/digest.service.ts:341`
     * - `src/services/digest.service.ts:345`
     * - `src/services/digest.service.ts:365`
     * - `src/services/google-article-editorial.generator.ts:20`
     * - `src/services/google-translation.service.ts:13`
     * - `src/services/google-translation.service.ts:23`
     * - `src/services/google-translation.service.ts:26`
     * - `src/services/google-translation.service.ts:50`
     * - `src/services/google-translation.service.ts:53`
     * - `src/services/google-translation.service.ts:59`
     * - `src/services/google-translation.service.ts:92`
     * - `src/services/openai-article-editorial.generator.ts:30`
     * - `src/services/source.service.ts:29`
     * - `src/services/source.service.ts:33`
     * - `src/services/source.service.ts:37`
     * - `src/services/source.service.ts:40`
     * - `src/services/source.service.ts:43`
     * - `src/services/source.service.ts:52`
     * - `src/services/source.service.ts:55`
     * - `src/services/source.service.ts:62`
     * - `src/services/source.service.ts:66`
     * - `src/services/telegram.service.ts:72`
     * - `src/services/telegram.service.ts:90`
     * - `src/services/telegram.service.ts:105`
     * - `src/services/telegram.service.ts:136`
     * - `src/services/telegram.service.ts:148`
     * - `src/services/telegram.service.ts:162`
     * - `src/services/telegram.service.ts:171`
     * - `src/services/telegram.service.ts:204`
     * - `src/services/telegram.service.ts:209`
     * - `src/services/telegram.service.ts:212`
     * - `src/services/telegram.service.ts:221`
     * - `src/services/telegram.service.ts:224`
     * - `src/services/telegram.service.ts:227`
     * - `src/services/translation.service.ts:5`
     * - `src/services/translation.service.ts:13`
     * - `src/services/translation.service.ts:20`
     * - `src/services/translation.service.ts:23`
     * - `src/services/translation.service.ts:47`
     * - `src/services/translation.service.ts:51`
     * - `src/services/translation.service.ts:66`
     * - `src/utils/normalize-url.ts:12`
     * - `src/utils/reddit-dns.ts:10`
     * - `src/utils/reddit-dns.ts:14`
     * - `src/utils/reddit-dns.ts:21`
     * - `src/utils/reddit-dns.ts:30`
     * - `src/utils/reddit-dns.ts:39`
     * - `src/utils/reddit-dns.ts:43`
     * - `src/utils/reddit-dns.ts:46`
     * - `src/utils/reddit-dns.ts:50`
     * - `src/utils/text.ts:2`
     * - `src/utils/text.ts:6`
     * - `src/utils/text.ts:17`
     * - `src/utils/text.ts:20`
     * - `src/utils/text.ts:24`
     * - `tests/config/env.test.ts:27`
     * - `tests/crawlers/github-repos.crawler.test.ts:6`
     * - `tests/crawlers/github-repos.crawler.test.ts:29`
     * - `tests/crawlers/github-repos.crawler.test.ts:49`
     * - `tests/crawlers/github-repos.crawler.test.ts:82`
     * - `tests/crawlers/rss.crawler.test.ts:229`
     * - `tests/crawlers/rss.crawler.test.ts:288`
     * - `tests/crawlers/rss.crawler.test.ts:342`
     * - `tests/crawlers/rss.crawler.test.ts:378`
     * - `tests/utils/reddit-dns.test.ts:40`
     * - `tests/utils/reddit-dns.test.ts:100`
     * - `tests/utils/reddit-dns.test.ts:113`
     * - `tests/utils/reddit-dns.test.ts:117`
     * - `tests/utils/reddit-dns.test.ts:126`
     */
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    return (response.data.data ?? [])
      // Tiếp tục biến đổi dữ liệu theo chuỗi thao tác bất biến.
      .map((post) => {
        // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
        const text = compactText(post.text);
        // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
        const topics = matchTopics({ title: text, summary: text });
        // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
        const user = post.author_id ? usersById.get(post.author_id) : undefined;
        // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
        const author = formatAuthor(user);
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
 * - `src/crawlers/x-search.crawler.ts:71`
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
 * - `src/crawlers/github-repos.crawler.ts:145`
 * - `src/crawlers/github-repos.crawler.ts:154`
 * - `src/crawlers/x-search.crawler.ts:80`
 * - `src/services/digest.service.ts:84`
 * - `src/services/digest.service.ts:310`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function formatSummary(text: string, author?: string, metrics?: XPost['public_metrics']): string {
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
 * - `src/crawlers/x-search.crawler.ts:78`
 * - `src/services/digest.service.ts:235`
 * - `src/services/digest.service.ts:236`
 * - `src/services/digest.service.ts:237`
 * - `src/services/digest.service.ts:321`
 * - `src/services/digest.service.ts:324`
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
