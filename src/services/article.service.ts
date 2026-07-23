/**
 * Gán topic, loại bài trùng và chặn URL/nội dung đáng ngờ trước khi dựng digest.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp { topics } từ `../config/topics` để dùng đúng dependency/type thay vì tự triển khai lại.
import { topics } from '../config/topics';
// Nạp { Article } từ `../types/article` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { Article } from '../types/article';
// Nạp { TopicKey } từ `../types/topic` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { TopicKey } from '../types/topic';
// Nạp { includesKeyword } từ `../utils/text` để dùng đúng dependency/type thay vì tự triển khai lại.
import { includesKeyword } from '../utils/text';

/**
 * Interface `MatchTopicsInput` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/services/article.service.ts`
 */
// Mở khai báo `interface MatchTopicsInput` để compiler kiểm tra contract cho mọi consumer.
interface MatchTopicsInput {
  // Gán field `title` từ `string;` để object khớp contract.
  title: string;
  // Gán field `summary?` từ `string;` để object khớp contract.
  summary?: string;
}

/**
 * Hàm `matchTopics` đối chiếu keyword để gán topic; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/crawlers/html.crawler.ts`
 * - `src/crawlers/rss.crawler.ts`
 * - `src/crawlers/x-search.crawler.ts`
 * - `tests/services/article.service.test.ts`
 */
// Mở thân hàm `matchTopics` với input/output được TypeScript kiểm tra.
export function matchTopics(input: MatchTopicsInput): TopicKey[] {
  // Tính `searchable` từ ``${input.title} ${input.summary ?? ''}`;` và giữ bất biến trong phạm vi hiện tại.
  const searchable = `${input.title} ${input.summary ?? ''}`;

  // Trả `topics` cho caller và kết thúc nhánh hiện tại.
  return topics
    // Áp dụng `filter` để tiếp tục biến đổi kết quả trung gian mà không đổi input gốc.
    .filter((topic) => topic.keywords.some((keyword) => includesKeyword(searchable, keyword)))
    // Áp dụng `map` để tiếp tục biến đổi kết quả trung gian mà không đổi input gốc.
    .map((topic) => topic.key);
}

/**
 * Hàm `dedupeArticles` loại phần tử trùng nhưng giữ thứ tự ưu tiên; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/source.service.ts`
 */
// Mở thân hàm `dedupeArticles` với input/output được TypeScript kiểm tra.
export function dedupeArticles(articles: Article[]): Article[] {
  // Tính `seen` từ `new Set<string>();` và giữ bất biến trong phạm vi hiện tại.
  const seen = new Set<string>();
  // Khởi tạo biến cục bộ `result` kiểu `Article[]` từ `[];`.
  const result: Article[] = [];

  // Lặp theo `const article of articles` để xử lý đủ từng phần tử/trạng thái.
  for (const article of articles) {
    // Nếu `seen.has(article.url)` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (seen.has(article.url)) {
      // Dùng `continue;` để bỏ qua/kết thúc vòng lặp sau khi điều kiện hiện tại đã rõ.
      continue;
    }

    // Gọi `seen.add` với `article.url` để hoàn tất side effect/bước xử lý hiện tại.
    seen.add(article.url);
    // Gọi `result.push` với `article` để hoàn tất side effect/bước xử lý hiện tại.
    result.push(article);
  }

  // Trả `result;` cho caller và kết thúc nhánh hiện tại.
  return result;
}

// Tính `blockedHostnames` từ `new Set(['co88.cfd']);` và giữ bất biến trong phạm vi hiện tại.
const blockedHostnames = new Set(['co88.cfd']);
// Tính `suspiciousTerms` từ `[` và giữ bất biến trong phạm vi hiện tại.
const suspiciousTerms = [
  // Thêm giá trị `'casino',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
  'casino',
  // Thêm giá trị `'betting',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
  'betting',
  // Thêm giá trị `'slots',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
  'slots',
  // Thêm giá trị `'xoso',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
  'xoso',
  // Thêm giá trị `'co88',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
  'co88',
  // Thêm giá trị `'nổ hũ',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
  'nổ hũ',
  // Thêm giá trị `'no hu',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
  'no hu',
  // Thêm giá trị `'lô đề',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
  'lô đề',
  // Thêm giá trị `'lo de',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
  'lo de',
  // Thêm giá trị `'game bài',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
  'game bài',
  // Thêm giá trị `'game bai',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
  'game bai',
];

/**
 * Hàm `isAllowedArticle` kiểm tra điều kiện và trả boolean; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/source.service.ts`
 */
// Mở thân hàm `isAllowedArticle` với input/output được TypeScript kiểm tra.
export function isAllowedArticle(article: Article): boolean {
  // Tính `hostname` từ `getHostname(article.url);` và giữ bất biến trong phạm vi hiện tại.
  const hostname = getHostname(article.url);

  // Nếu `!hostname` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (!hostname) {
    // Trả `false;` cho caller và kết thúc nhánh hiện tại.
    return false;
  }

  // Nếu `blockedHostnames.has(hostname)` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (blockedHostnames.has(hostname)) {
    // Trả `false;` cho caller và kết thúc nhánh hiện tại.
    return false;
  }

  // Tính `searchable` từ ``${hostname} ${article.title} ${article.summary ?? ''}`.toLowerCase();` và giữ bất biến trong phạm vi hiện tại.
  const searchable = `${hostname} ${article.title} ${article.summary ?? ''}`.toLowerCase();

  // Trả `!suspiciousTerms.some((term) => searchable.includes(term));` cho caller và kết thúc nhánh hiện tại.
  return !suspiciousTerms.some((term) => searchable.includes(term));
}

/**
 * Hàm `getHostname` lấy giá trị dẫn xuất an toàn; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/article.service.ts`
 */
// Mở thân hàm `getHostname` với input/output được TypeScript kiểm tra.
function getHostname(url: string): string {
  // Cô lập thao tác có thể lỗi để module còn cơ hội log và trả fallback an toàn.
  try {
    // Trả `new URL(url).hostname.toLowerCase().replace(/^www\./, '');` cho caller và kết thúc nhánh hiện tại.
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  // Bắt lỗi từ khối try, không để một dependency ngoài làm hỏng toàn bộ đợt xử lý.
  } catch {
    // Trả `'';` cho caller và kết thúc nhánh hiện tại.
    return '';
  }
}
