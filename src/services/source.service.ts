/**
 * Điều phối crawler theo loại nguồn, sắp xếp, lọc tuổi và dedupe Article.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp { sources as defaultSources } từ `../config/sources` để dùng đúng dependency/type thay vì tự triển khai lại.
import { sources as defaultSources } from '../config/sources';
// Nạp { env } từ `../config/env` để dùng đúng dependency/type thay vì tự triển khai lại.
import { env } from '../config/env';
// Nạp { createCrawlers } từ `../crawlers` để dùng đúng dependency/type thay vì tự triển khai lại.
import { createCrawlers } from '../crawlers';
// Nạp { NewsCrawler } từ `../crawlers/crawler.types` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { NewsCrawler } from '../crawlers/crawler.types';
// Nạp { Article } từ `../types/article` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { Article } from '../types/article';
// Nạp { GitHubReposSourceConfig, HtmlSourceConfig, RssSourceConfig, SourceConfig, XSearchSourceConfig } từ `../types/source` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { GitHubReposSourceConfig, HtmlSourceConfig, RssSourceConfig, SourceConfig, XSearchSourceConfig } from '../types/source';
// Nạp { dedupeArticles, isAllowedArticle } từ `./article.service` để dùng đúng dependency/type thay vì tự triển khai lại.
import { dedupeArticles, isAllowedArticle } from './article.service';

/**
 * Interface `SourceServiceCrawlers` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/services/source.service.ts`
 */
// Mở khai báo `interface SourceServiceCrawlers` để compiler kiểm tra contract cho mọi consumer.
interface SourceServiceCrawlers {
  // Gán field `rss` từ `NewsCrawler<RssSourceConfig>;` để object khớp contract.
  rss: NewsCrawler<RssSourceConfig>;
  // Gán field `html` từ `NewsCrawler<HtmlSourceConfig>;` để object khớp contract.
  html: NewsCrawler<HtmlSourceConfig>;
  // Gán field `xSearch` từ `NewsCrawler<XSearchSourceConfig>;` để object khớp contract.
  xSearch: NewsCrawler<XSearchSourceConfig>;
  // Gán field `githubRepos` từ `NewsCrawler<GitHubReposSourceConfig>;` để object khớp contract.
  githubRepos: NewsCrawler<GitHubReposSourceConfig>;
}

/**
 * Class `SourceService` sở hữu vòng đời dependency và điều phối các bước source service.
 *
 * Được sử dụng tại:
 * - `src/controllers/news.controller.ts`
 * - `src/controllers/telegram.controller.ts`
 * - `tests/services/source.service.test.ts`
 */
// Mở khai báo `export class SourceService` để compiler kiểm tra contract cho mọi consumer.
export class SourceService {
  constructor(
    // Gán field `private readonly sourceConfigs` từ `SourceConfig[] = defaultSources,` để object khớp contract.
    private readonly sourceConfigs: SourceConfig[] = defaultSources,
    // Gán field `private readonly crawlers` từ `SourceServiceCrawlers = createCrawlers(),` để object khớp contract.
    private readonly crawlers: SourceServiceCrawlers = createCrawlers(),
    private readonly maxArticleAgeDays = env.MAX_ARTICLE_AGE_DAYS,
  ) {}

  /**
   * Hàm `collectLatest` thực hiện trách nhiệm `collect latest` của module; kết quả được trả cho caller theo kiểu khai báo.
   *
   * Được sử dụng tại:
   * - `tests/services/source.service.test.ts`
   * - `src/controllers/news.controller.ts`
   * - `src/controllers/telegram.controller.ts`
   */
  // Mở method `collectLatest` để thực hiện trách nhiệm `collect latest` của module.
  async collectLatest(): Promise<Article[]> {
    // Tính `enabledSources` từ `this.sourceConfigs.filter((source) => source.enabled);` và giữ bất biến trong phạm vi hiện tại.
    const enabledSources = this.sourceConfigs.filter((source) => source.enabled);
    // Tính `articleGroups` từ `await Promise.all(` và giữ bất biến trong phạm vi hiện tại.
    const articleGroups = await Promise.all(
      // Tạo callback nhận `enabledSources.map(async (source)` để xử lý từng kết quả trong collection/promise.
      enabledSources.map(async (source) => {
        // Cô lập thao tác có thể lỗi để module còn cơ hội log và trả fallback an toàn.
        try {
          // Nếu `source.kind === 'rss'` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
          if (source.kind === 'rss') {
            // Trả `await this.crawlers.rss.crawl(source);` cho caller và kết thúc nhánh hiện tại.
            return await this.crawlers.rss.crawl(source);
          }

          // Nếu `source.kind === 'x-search'` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
          if (source.kind === 'x-search') {
            // Trả `await this.crawlers.xSearch.crawl(source);` cho caller và kết thúc nhánh hiện tại.
            return await this.crawlers.xSearch.crawl(source);
          }

          // Nếu `source.kind === 'github-repos'` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
          if (source.kind === 'github-repos') {
            // Trả `await this.crawlers.githubRepos.crawl(source);` cho caller và kết thúc nhánh hiện tại.
            return await this.crawlers.githubRepos.crawl(source);
          }

          // Trả `await this.crawlers.html.crawl(source);` cho caller và kết thúc nhánh hiện tại.
          return await this.crawlers.html.crawl(source);
        // Bắt lỗi từ khối try, không để một dependency ngoài làm hỏng toàn bộ đợt xử lý.
        } catch (error) {
          // Ghi sự kiện `console.error(`Failed to crawl source ${source.id}`, error);` phục vụ chẩn đoán mà không đổi kết quả nghiệp vụ.
          console.error(`Failed to crawl source ${source.id}`, error);
          // Trả `[];` cho caller và kết thúc nhánh hiện tại.
          return [];
        }
      }),
    );

    // Tính `allArticles` từ `articleGroups.flat();` và giữ bất biến trong phạm vi hiện tại.
    const allArticles = articleGroups.flat();
    // Tạo callback nhận `allArticles.sort((a, b)` để xử lý từng kết quả trong collection/promise.
    allArticles.sort((a, b) => {
      // Tính `dateA` từ `new Date(a.publishedAt ?? a.collectedAt).getTime();` và giữ bất biến trong phạm vi hiện tại.
      const dateA = new Date(a.publishedAt ?? a.collectedAt).getTime();
      // Tính `dateB` từ `new Date(b.publishedAt ?? b.collectedAt).getTime();` và giữ bất biến trong phạm vi hiện tại.
      const dateB = new Date(b.publishedAt ?? b.collectedAt).getTime();
      // Trả `dateB - dateA;` cho caller và kết thúc nhánh hiện tại.
      return dateB - dateA;
    });

    // Trả `dedupeArticles(allArticles.filter(isAllowedArticle).filter((article) => this.isFreshArt…` cho caller và kết thúc nhánh hiện tại.
    return dedupeArticles(allArticles.filter(isAllowedArticle).filter((article) => this.isFreshArticle(article)));
  }

  /**
   * Hàm `isFreshArticle` kiểm tra điều kiện và trả boolean; kết quả được trả cho caller theo kiểu khai báo.
   *
   * Được sử dụng tại:
   * - `src/services/source.service.ts`
   */
  // Mở method `isFreshArticle` để kiểm tra điều kiện và trả boolean.
  private isFreshArticle(article: Article): boolean {
    // Tính `articleTime` từ `new Date(article.publishedAt ?? article.collectedAt).getTime();` và giữ bất biến trong phạm vi hiện tại.
    const articleTime = new Date(article.publishedAt ?? article.collectedAt).getTime();

    // Nếu `Number.isNaN(articleTime)` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (Number.isNaN(articleTime)) {
      // Trả `false;` cho caller và kết thúc nhánh hiện tại.
      return false;
    }

    // Tính `maxAgeMs` từ `this.maxArticleAgeDays * 24 * 60 * 60 * 1000;` và giữ bất biến trong phạm vi hiện tại.
    const maxAgeMs = this.maxArticleAgeDays * 24 * 60 * 60 * 1000;
    // Trả `Date.now() - articleTime <= maxAgeMs;` cho caller và kết thúc nhánh hiện tại.
    return Date.now() - articleTime <= maxAgeMs;
  }
}
