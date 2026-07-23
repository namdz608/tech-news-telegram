/**
 * Gán topic, loại bài trùng và chặn URL/nội dung đáng ngờ trước khi dựng digest.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { topics } from '../config/topics';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { Article } from '../types/article';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { TopicKey } from '../types/topic';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { includesKeyword } from '../utils/text';

/**
 * Interface `MatchTopicsInput` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - `src/services/article.service.ts:11`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface MatchTopicsInput {
  // Gán field cấu trúc để tạo object đúng contract.
  title: string;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  summary?: string;
}

/**
 * Hàm `matchTopics` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/crawlers/html.crawler.ts:14`
 * - `src/crawlers/html.crawler.ts:255`
 * - `src/crawlers/rss.crawler.ts:16`
 * - `src/crawlers/rss.crawler.ts:297`
 * - `src/crawlers/x-search.crawler.ts:12`
 * - `src/crawlers/x-search.crawler.ts:444`
 * - `tests/services/article.service.test.ts:2`
 * - `tests/services/article.service.test.ts:7`
 * - `tests/services/article.service.test.ts:16`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
export function matchTopics(input: MatchTopicsInput): TopicKey[] {
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const searchable = `${input.title} ${input.summary ?? ''}`;

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return topics
    // Tiếp tục biến đổi dữ liệu theo chuỗi thao tác bất biến.
    .filter((topic) => topic.keywords.some((keyword) => includesKeyword(searchable, keyword)))
    // Tiếp tục biến đổi dữ liệu theo chuỗi thao tác bất biến.
    .map((topic) => topic.key);
}

/**
 * Hàm `dedupeArticles` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/source.service.ts:7`
 * - `src/services/source.service.ts:55`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
export function dedupeArticles(articles: Article[]): Article[] {
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const seen = new Set<string>();
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const result: Article[] = [];

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  for (const article of articles) {
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (seen.has(article.url)) {
      // Điều khiển vòng lặp sau khi nhánh hiện tại đã xử lý xong.
      continue;
    }

    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    seen.add(article.url);
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    result.push(article);
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return result;
}

// Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
const blockedHostnames = new Set(['co88.cfd']);
// Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
const suspiciousTerms = [
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'casino',
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'betting',
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'slots',
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'xoso',
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'co88',
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'nổ hũ',
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'no hu',
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'lô đề',
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'lo de',
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'game bài',
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  'game bai',
];

/**
 * Hàm `isAllowedArticle` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/source.service.ts:7`
 * - `src/services/source.service.ts:55`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
export function isAllowedArticle(article: Article): boolean {
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const hostname = getHostname(article.url);

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (!hostname) {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return false;
  }

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (blockedHostnames.has(hostname)) {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return false;
  }

  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const searchable = `${hostname} ${article.title} ${article.summary ?? ''}`.toLowerCase();

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return !suspiciousTerms.some((term) => searchable.includes(term));
}

/**
 * Hàm `getHostname` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/article.service.ts:51`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function getHostname(url: string): string {
  // Bắt đầu thao tác có thể lỗi để bảo vệ toàn bộ pipeline.
  try {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  // Thu lỗi từ thao tác trước và chuyển sang fallback an toàn.
  } catch {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return '';
  }
}
