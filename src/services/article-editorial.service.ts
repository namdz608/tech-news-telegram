/**
 * Chọn provider, validate JSON editorial và cung cấp fallback có căn cứ.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { env } from '../config/env';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { Article } from '../types/article';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { TopicKey } from '../types/topic';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { compactText } from '../utils/text';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type {
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  ActionLevel,
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  ArticleEditorial,
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  ArticleEditorialGenerator,
// Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
} from './article-editorial.types';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { CodexArticleEditorialGenerator } from './codex-article-editorial.generator';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { GoogleArticleEditorialGenerator } from './google-article-editorial.generator';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { OpenAIArticleEditorialGenerator } from './openai-article-editorial.generator';

// Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
const fallbackWhyImportant: Record<TopicKey, string> = {
  // Gán field cấu trúc để tạo object đúng contract.
  ai: 'Thay đổi này có thể ảnh hưởng đến cách các nhóm đánh giá, tích hợp hoặc vận hành hệ thống AI hiện có.',
  // Gán field cấu trúc để tạo object đúng contract.
  k8s: 'Các cụm Kubernetes liên quan nên được kiểm tra để xác định tác động đến khả năng tương thích và vận hành.',
  // Gán field cấu trúc để tạo object đúng contract.
  security: 'Các hệ thống liên quan cần được kiểm tra mức độ phơi nhiễm để giảm nguy cơ bị khai thác hoặc gián đoạn.',
  // Gán field cấu trúc để tạo object đúng contract.
  devops: 'Thay đổi này có thể ảnh hưởng đến pipeline, công cụ hoặc quy trình vận hành đang sử dụng.',
  // Gán field cấu trúc để tạo object đúng contract.
  cloud: 'Các workload và dịch vụ cloud liên quan nên được đánh giá để xác định tác động đến vận hành, chi phí hoặc bảo mật.',
};

/**
 * Class `ArticleEditorialService` đóng gói trách nhiệm chính của module.
 *
 * Được sử dụng tại:
 * - `src/controllers/news.controller.ts`
 * - `src/controllers/telegram.controller.ts`
 * - `tests/services/article-editorial.service.test.ts`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
export class ArticleEditorialService {
  /**
   * Hàm `constructor` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/crawlers/github-repos.crawler.ts`
   * - `src/crawlers/html.crawler.ts`
   * - `src/crawlers/rss.crawler.ts`
   * - `src/crawlers/x-search.crawler.ts`
   * - `src/services/codex-article-editorial.generator.ts`
   * - `src/services/digest.service.ts`
   * - `src/services/google-article-editorial.generator.ts`
   * - `src/services/google-translation.service.ts`
   * - `src/services/openai-article-editorial.generator.ts`
   * - `src/services/source.service.ts`
   * - `src/services/telegram.service.ts`
   * - `src/services/translation.service.ts`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  constructor(private readonly generator = createDefaultGenerator()) {}

  /**
   * Hàm `editArticle` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/services/digest-message-editorial.service.ts`
   * - `tests/services/article-editorial.service.test.ts`
   * - `tests/services/digest-message-editorial.service.test.ts`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  async editArticle(article: Article, topic: TopicKey): Promise<ArticleEditorial> {
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const fallback = createFallbackEditorial(article, topic);

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (!this.generator) {
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return fallback;
    }

    // Bắt đầu thao tác có thể lỗi để bảo vệ toàn bộ pipeline.
    try {
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const raw = await this.generator.generate({
        // Gán field cấu trúc để tạo object đúng contract.
        title: article.title,
        // Gán field cấu trúc để tạo object đúng contract.
        summary: article.summary,
        // Gán field cấu trúc để tạo object đúng contract.
        sourceName: article.sourceName,
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        topic,
        // Gán field cấu trúc để tạo object đúng contract.
        publishedAt: article.publishedAt,
        // Gán field cấu trúc để tạo object đúng contract.
        collectedAt: article.collectedAt,
      });
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const parsed = parseJsonObject(raw);

      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return {
        // Gán field cấu trúc để tạo object đúng contract.
        title: cleanString(parsed.title) || fallback.title,
        // Gán field cấu trúc để tạo object đúng contract.
        summary: cleanString(parsed.summary) || fallback.summary,
        // Gán field cấu trúc để tạo object đúng contract.
        whyImportant: cleanString(parsed.whyImportant) || fallback.whyImportant,
        // Gán field cấu trúc để tạo object đúng contract.
        actionLevel: isActionLevel(parsed.actionLevel) ? parsed.actionLevel : fallback.actionLevel,
        // Gán field cấu trúc để tạo object đúng contract.
        actionText: cleanString(parsed.actionText) || fallback.actionText,
      };
    // Thu lỗi từ thao tác trước và chuyển sang fallback an toàn.
    } catch (error) {
      // Ghi thông tin chẩn đoán mà không thay đổi dữ liệu nghiệp vụ.
      console.warn('Article editorial generation failed, using fallback', error);
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return fallback;
    }
  }
}

/**
 * Hàm `createDefaultGenerator` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/article-editorial.service.ts`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function createDefaultGenerator(): ArticleEditorialGenerator | undefined {
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (env.EDITORIAL_PROVIDER === 'codex') {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return new CodexArticleEditorialGenerator();
  }

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (env.EDITORIAL_PROVIDER === 'openai') {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return new OpenAIArticleEditorialGenerator();
  }

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (env.EDITORIAL_PROVIDER === 'google') {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return new GoogleArticleEditorialGenerator();
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return undefined;
}

/**
 * Hàm `createFallbackEditorial` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/article-editorial.service.ts`
 * - `src/services/digest.service.ts`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
export function createFallbackEditorial(article: Article, topic: TopicKey): ArticleEditorial {
  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return {
    // Gán field cấu trúc để tạo object đúng contract.
    title: compactText(article.title),
    // Gán field cấu trúc để tạo object đúng contract.
    summary:
      /**
       * Hàm `cleanString` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
       *
       * Được sử dụng tại:
       * - `src/services/article-editorial.service.ts`
       */
      // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
      cleanString(article.summary) || 'Nguồn chưa cung cấp mô tả chi tiết cho bản tin này.',
    // Gán field cấu trúc để tạo object đúng contract.
    whyImportant: fallbackWhyImportant[topic],
    // Gán field cấu trúc để tạo object đúng contract.
    actionLevel: 'monitor',
    // Gán field cấu trúc để tạo object đúng contract.
    actionText: 'Kiểm tra mức độ liên quan và theo dõi thông báo chính thức từ nguồn.',
  };
}

/**
 * Hàm `parseJsonObject` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/article-editorial.service.ts`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function parseJsonObject(raw: string): Record<string, unknown> {
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const normalized = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const parsed: unknown = JSON.parse(normalized);

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    // Dừng xử lý và chuyển lỗi có ngữ cảnh cho caller.
    throw new Error('Editorial response must be a JSON object');
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return parsed as Record<string, unknown>;
}

/**
 * Hàm `cleanString` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/article-editorial.service.ts`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function cleanString(value: unknown): string {
  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return typeof value === 'string' ? compactText(value) : '';
}

/**
 * Hàm `isActionLevel` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/article-editorial.service.ts`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function isActionLevel(value: unknown): value is ActionLevel {
  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return value === 'urgent' || value === 'high' || value === 'monitor';
}
