/**
 * Khởi tạo tập crawler mặc định và cung cấp dependency cho SourceService.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp { GitHubReposCrawler } từ `./github-repos.crawler` để dùng đúng dependency/type thay vì tự triển khai lại.
import { GitHubReposCrawler } from './github-repos.crawler';
// Nạp { HtmlCrawler } từ `./html.crawler` để dùng đúng dependency/type thay vì tự triển khai lại.
import { HtmlCrawler } from './html.crawler';
// Nạp { RssCrawler } từ `./rss.crawler` để dùng đúng dependency/type thay vì tự triển khai lại.
import { RssCrawler } from './rss.crawler';
// Nạp { XSearchCrawler } từ `./x-search.crawler` để dùng đúng dependency/type thay vì tự triển khai lại.
import { XSearchCrawler } from './x-search.crawler';

/**
 * Hàm `createCrawlers` tạo cấu trúc đầu ra từ cấu hình/dữ liệu đầu vào; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/source.service.ts`
 */
// Mở thân hàm `createCrawlers` với input/output được TypeScript kiểm tra.
export function createCrawlers() {
  // Trả `{` cho caller và kết thúc nhánh hiện tại.
  return {
    // Gán field `rss` từ `new RssCrawler(),` để object khớp contract.
    rss: new RssCrawler(),
    // Gán field `html` từ `new HtmlCrawler(),` để object khớp contract.
    html: new HtmlCrawler(),
    // Gán field `xSearch` từ `new XSearchCrawler(),` để object khớp contract.
    xSearch: new XSearchCrawler(),
    // Gán field `githubRepos` từ `new GitHubReposCrawler(),` để object khớp contract.
    githubRepos: new GitHubReposCrawler(),
  };
}
