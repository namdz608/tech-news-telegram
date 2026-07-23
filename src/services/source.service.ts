/**
 * Điều phối crawler theo loại nguồn, sắp xếp, lọc tuổi và dedupe Article.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { sources as defaultSources } from '../config/sources';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { env } from '../config/env';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { createCrawlers } from '../crawlers';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { NewsCrawler } from '../crawlers/crawler.types';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { Article } from '../types/article';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { GitHubReposSourceConfig, HtmlSourceConfig, RssSourceConfig, SourceConfig, XSearchSourceConfig } from '../types/source';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { dedupeArticles, isAllowedArticle } from './article.service';

/**
 * Interface `SourceServiceCrawlers` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - `src/services/source.service.ts`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface SourceServiceCrawlers {
  // Gán field cấu trúc để tạo object đúng contract.
  rss: NewsCrawler<RssSourceConfig>;
  // Gán field cấu trúc để tạo object đúng contract.
  html: NewsCrawler<HtmlSourceConfig>;
  // Gán field cấu trúc để tạo object đúng contract.
  xSearch: NewsCrawler<XSearchSourceConfig>;
  // Gán field cấu trúc để tạo object đúng contract.
  githubRepos: NewsCrawler<GitHubReposSourceConfig>;
}

/**
 * Class `SourceService` đóng gói trách nhiệm chính của module.
 *
 * Được sử dụng tại:
 * - `src/controllers/news.controller.ts`
 * - `src/controllers/telegram.controller.ts`
 * - `src/types/source.ts`
 * - `tests/services/source.service.test.ts`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
export class SourceService {
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  constructor(
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    private readonly sourceConfigs: SourceConfig[] = defaultSources,
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    private readonly crawlers: SourceServiceCrawlers = createCrawlers(),
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    private readonly maxArticleAgeDays = env.MAX_ARTICLE_AGE_DAYS,
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  ) {}

  /**
   * Hàm `collectLatest` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/controllers/news.controller.ts`
   * - `src/controllers/telegram.controller.ts`
   * - `tests/services/source.service.test.ts`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  async collectLatest(): Promise<Article[]> {
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const enabledSources = this.sourceConfigs.filter((source) => source.enabled);
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const articleGroups = await Promise.all(
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      enabledSources.map(async (source) => {
        // Bắt đầu thao tác có thể lỗi để bảo vệ toàn bộ pipeline.
        try {
          // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
          if (source.kind === 'rss') {
            // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
            return await this.crawlers.rss.crawl(source);
          }

          // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
          if (source.kind === 'x-search') {
            // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
            return await this.crawlers.xSearch.crawl(source);
          }

          // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
          if (source.kind === 'github-repos') {
            // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
            return await this.crawlers.githubRepos.crawl(source);
          }

          // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
          return await this.crawlers.html.crawl(source);
        // Thu lỗi từ thao tác trước và chuyển sang fallback an toàn.
        } catch (error) {
          // Ghi thông tin chẩn đoán mà không thay đổi dữ liệu nghiệp vụ.
          console.error(`Failed to crawl source ${source.id}`, error);
          // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
          return [];
        }
      }),
    );

    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const allArticles = articleGroups.flat();
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    allArticles.sort((a, b) => {
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const dateA = new Date(a.publishedAt ?? a.collectedAt).getTime();
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const dateB = new Date(b.publishedAt ?? b.collectedAt).getTime();
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return dateB - dateA;
    });

    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return dedupeArticles(allArticles.filter(isAllowedArticle).filter((article) => this.isFreshArticle(article)));
  }

  /**
   * Hàm `isFreshArticle` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/services/source.service.ts`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  private isFreshArticle(article: Article): boolean {
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const articleTime = new Date(article.publishedAt ?? article.collectedAt).getTime();

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (Number.isNaN(articleTime)) {
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return false;
    }

    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const maxAgeMs = this.maxArticleAgeDays * 24 * 60 * 60 * 1000;
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return Date.now() - articleTime <= maxAgeMs;
  }
}
