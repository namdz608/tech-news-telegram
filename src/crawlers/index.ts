/**
 * Khởi tạo tập crawler mặc định và cung cấp dependency cho SourceService.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { GitHubReposCrawler } from './github-repos.crawler';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { HtmlCrawler } from './html.crawler';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { RssCrawler } from './rss.crawler';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { XSearchCrawler } from './x-search.crawler';

/**
 * Hàm `createCrawlers` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/source.service.ts:3`
 * - `src/services/source.service.ts:19`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
export function createCrawlers() {
  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return {
    // Gán field cấu trúc để tạo object đúng contract.
    rss: new RssCrawler(),
    // Gán field cấu trúc để tạo object đúng contract.
    html: new HtmlCrawler(),
    // Gán field cấu trúc để tạo object đúng contract.
    xSearch: new XSearchCrawler(),
    // Gán field cấu trúc để tạo object đúng contract.
    githubRepos: new GitHubReposCrawler(),
  };
}
