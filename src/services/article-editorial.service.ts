/**
 * Chọn provider, validate JSON editorial và cung cấp fallback có căn cứ.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp { env } từ `../config/env` để dùng đúng dependency/type thay vì tự triển khai lại.
import { env } from '../config/env';
// Nạp { Article } từ `../types/article` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { Article } from '../types/article';
// Nạp { TopicKey } từ `../types/topic` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { TopicKey } from '../types/topic';
// Nạp { compactText } từ `../utils/text` để dùng đúng dependency/type thay vì tự triển khai lại.
import { compactText } from '../utils/text';
import type {
  // Đưa giá trị `ActionLevel` vào field cùng tên của object đang tạo.
  ActionLevel,
  // Đưa giá trị `ArticleEditorial` vào field cùng tên của object đang tạo.
  ArticleEditorial,
  // Đưa giá trị `ArticleEditorialGenerator` vào field cùng tên của object đang tạo.
  ArticleEditorialGenerator,
} from './article-editorial.types';
// Nạp { CodexArticleEditorialGenerator } từ `./codex-article-editorial.generator` để dùng đúng dependency/type thay vì tự triển khai lại.
import { CodexArticleEditorialGenerator } from './codex-article-editorial.generator';
// Nạp { GoogleArticleEditorialGenerator } từ `./google-article-editorial.generator` để dùng đúng dependency/type thay vì tự triển khai lại.
import { GoogleArticleEditorialGenerator } from './google-article-editorial.generator';
// Nạp { OpenAIArticleEditorialGenerator } từ `./openai-article-editorial.generator` để dùng đúng dependency/type thay vì tự triển khai lại.
import { OpenAIArticleEditorialGenerator } from './openai-article-editorial.generator';

// Khởi tạo biến cục bộ `fallbackWhyImportant` kiểu `Record<TopicKey, string>` từ `{`.
const fallbackWhyImportant: Record<TopicKey, string> = {
  // Gán field `ai` từ `'Thay đổi này có thể ảnh hưởng đến cách các nhóm đánh giá, tích hợp hoặc vận hành hệ th…` để object khớp contract.
  ai: 'Thay đổi này có thể ảnh hưởng đến cách các nhóm đánh giá, tích hợp hoặc vận hành hệ thống AI hiện có.',
  // Gán field `k8s` từ `'Các cụm Kubernetes liên quan nên được kiểm tra để xác định tác động đến khả năng tương…` để object khớp contract.
  k8s: 'Các cụm Kubernetes liên quan nên được kiểm tra để xác định tác động đến khả năng tương thích và vận hành.',
  // Gán field `security` từ `'Các hệ thống liên quan cần được kiểm tra mức độ phơi nhiễm để giảm nguy cơ bị khai thá…` để object khớp contract.
  security: 'Các hệ thống liên quan cần được kiểm tra mức độ phơi nhiễm để giảm nguy cơ bị khai thác hoặc gián đoạn.',
  // Gán field `devops` từ `'Thay đổi này có thể ảnh hưởng đến pipeline, công cụ hoặc quy trình vận hành đang sử dụ…` để object khớp contract.
  devops: 'Thay đổi này có thể ảnh hưởng đến pipeline, công cụ hoặc quy trình vận hành đang sử dụng.',
  // Gán field `cloud` từ `'Các workload và dịch vụ cloud liên quan nên được đánh giá để xác định tác động đến vận…` để object khớp contract.
  cloud: 'Các workload và dịch vụ cloud liên quan nên được đánh giá để xác định tác động đến vận hành, chi phí hoặc bảo mật.',
};

/**
 * Class `ArticleEditorialService` sở hữu vòng đời dependency và điều phối các bước article editorial service.
 *
 * Được sử dụng tại:
 * - `src/controllers/news.controller.ts`
 * - `src/controllers/telegram.controller.ts`
 * - `tests/services/article-editorial.service.test.ts`
 */
// Mở khai báo `export class ArticleEditorialService` để compiler kiểm tra contract cho mọi consumer.
export class ArticleEditorialService {
  constructor(private readonly generator = createDefaultGenerator()) {}

  /**
   * Hàm `editArticle` biên tập nội dung và giữ contract message; kết quả được trả cho caller theo kiểu khai báo.
   *
   * Được sử dụng tại:
   * - `tests/services/article-editorial.service.test.ts`
   * - `src/services/digest-message-editorial.service.ts`
   */
  // Mở method `editArticle` để biên tập nội dung và giữ contract message.
  async editArticle(article: Article, topic: TopicKey): Promise<ArticleEditorial> {
    // Tính `fallback` từ `createFallbackEditorial(article, topic);` và giữ bất biến trong phạm vi hiện tại.
    const fallback = createFallbackEditorial(article, topic);

    // Nếu `!this.generator` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (!this.generator) {
      // Trả `fallback;` cho caller và kết thúc nhánh hiện tại.
      return fallback;
    }

    // Cô lập thao tác có thể lỗi để module còn cơ hội log và trả fallback an toàn.
    try {
      // Tính `raw` từ `await this.generator.generate({` và giữ bất biến trong phạm vi hiện tại.
      const raw = await this.generator.generate({
        // Gán field `title` từ `article.title,` để object khớp contract.
        title: article.title,
        // Gán field `summary` từ `article.summary,` để object khớp contract.
        summary: article.summary,
        // Gán field `sourceName` từ `article.sourceName,` để object khớp contract.
        sourceName: article.sourceName,
        // Đưa giá trị `topic` vào field cùng tên của object đang tạo.
        topic,
        // Gán field `publishedAt` từ `article.publishedAt,` để object khớp contract.
        publishedAt: article.publishedAt,
        // Gán field `collectedAt` từ `article.collectedAt,` để object khớp contract.
        collectedAt: article.collectedAt,
      });
      // Tính `parsed` từ `parseJsonObject(raw);` và giữ bất biến trong phạm vi hiện tại.
      const parsed = parseJsonObject(raw);

      // Trả `{` cho caller và kết thúc nhánh hiện tại.
      return {
        // Gán field `title` từ `cleanString(parsed.title) || fallback.title,` để object khớp contract.
        title: cleanString(parsed.title) || fallback.title,
        // Gán field `summary` từ `cleanString(parsed.summary) || fallback.summary,` để object khớp contract.
        summary: cleanString(parsed.summary) || fallback.summary,
        // Gán field `whyImportant` từ `cleanString(parsed.whyImportant) || fallback.whyImportant,` để object khớp contract.
        whyImportant: cleanString(parsed.whyImportant) || fallback.whyImportant,
        // Gán field `actionLevel` từ `isActionLevel(parsed.actionLevel) ? parsed.actionLevel : fallback.actionLevel,` để object khớp contract.
        actionLevel: isActionLevel(parsed.actionLevel) ? parsed.actionLevel : fallback.actionLevel,
        // Gán field `actionText` từ `cleanString(parsed.actionText) || fallback.actionText,` để object khớp contract.
        actionText: cleanString(parsed.actionText) || fallback.actionText,
      };
    // Bắt lỗi từ khối try, không để một dependency ngoài làm hỏng toàn bộ đợt xử lý.
    } catch (error) {
      // Ghi sự kiện `console.warn('Article editorial generation failed, using fallback', error);` phục vụ chẩn đoán mà không đổi kết quả nghiệp vụ.
      console.warn('Article editorial generation failed, using fallback', error);
      // Trả `fallback;` cho caller và kết thúc nhánh hiện tại.
      return fallback;
    }
  }
}

/**
 * Hàm `createDefaultGenerator` tạo cấu trúc đầu ra từ cấu hình/dữ liệu đầu vào; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/article-editorial.service.ts`
 */
// Mở thân hàm `createDefaultGenerator` với input/output được TypeScript kiểm tra.
function createDefaultGenerator(): ArticleEditorialGenerator | undefined {
  // Nếu `env.EDITORIAL_PROVIDER === 'codex'` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (env.EDITORIAL_PROVIDER === 'codex') {
    // Trả `new CodexArticleEditorialGenerator();` cho caller và kết thúc nhánh hiện tại.
    return new CodexArticleEditorialGenerator();
  }

  // Nếu `env.EDITORIAL_PROVIDER === 'openai'` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (env.EDITORIAL_PROVIDER === 'openai') {
    // Trả `new OpenAIArticleEditorialGenerator();` cho caller và kết thúc nhánh hiện tại.
    return new OpenAIArticleEditorialGenerator();
  }

  // Nếu `env.EDITORIAL_PROVIDER === 'google'` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (env.EDITORIAL_PROVIDER === 'google') {
    // Trả `new GoogleArticleEditorialGenerator();` cho caller và kết thúc nhánh hiện tại.
    return new GoogleArticleEditorialGenerator();
  }

  // Trả `undefined;` cho caller và kết thúc nhánh hiện tại.
  return undefined;
}

/**
 * Hàm `createFallbackEditorial` tạo cấu trúc đầu ra từ cấu hình/dữ liệu đầu vào; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/article-editorial.service.ts`
 * - `src/services/digest.service.ts`
 */
// Mở thân hàm `createFallbackEditorial` với input/output được TypeScript kiểm tra.
export function createFallbackEditorial(article: Article, topic: TopicKey): ArticleEditorial {
  // Trả `{` cho caller và kết thúc nhánh hiện tại.
  return {
    // Gán field `title` từ `compactText(article.title),` để object khớp contract.
    title: compactText(article.title),
    summary:
      cleanString(article.summary) || 'Nguồn chưa cung cấp mô tả chi tiết cho bản tin này.',
    // Gán field `whyImportant` từ `fallbackWhyImportant[topic],` để object khớp contract.
    whyImportant: fallbackWhyImportant[topic],
    // Gán field `actionLevel` từ `'monitor',` để object khớp contract.
    actionLevel: 'monitor',
    // Gán field `actionText` từ `'Kiểm tra mức độ liên quan và theo dõi thông báo chính thức từ nguồn.',` để object khớp contract.
    actionText: 'Kiểm tra mức độ liên quan và theo dõi thông báo chính thức từ nguồn.',
  };
}

/**
 * Hàm `parseJsonObject` parse và làm sạch dữ liệu không tin cậy; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/article-editorial.service.ts`
 */
// Mở thân hàm `parseJsonObject` với input/output được TypeScript kiểm tra.
function parseJsonObject(raw: string): Record<string, unknown> {
  // Tính `normalized` từ `raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');` và giữ bất biến trong phạm vi hiện tại.
  const normalized = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  // Khởi tạo biến cục bộ `parsed` kiểu `unknown` từ `JSON.parse(normalized);`.
  const parsed: unknown = JSON.parse(normalized);

  // Nếu `!parsed || typeof parsed !== 'object' || Array.isArray(parsed)` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    // Ném lỗi `new Error('Editorial response must be a JSON object');` để caller quyết định retry/fallback.
    throw new Error('Editorial response must be a JSON object');
  }

  // Trả `parsed as Record<string, unknown>;` cho caller và kết thúc nhánh hiện tại.
  return parsed as Record<string, unknown>;
}

/**
 * Hàm `cleanString` parse và làm sạch dữ liệu không tin cậy; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/article-editorial.service.ts`
 */
// Mở thân hàm `cleanString` với input/output được TypeScript kiểm tra.
function cleanString(value: unknown): string {
  // Trả `typeof value === 'string' ? compactText(value) : '';` cho caller và kết thúc nhánh hiện tại.
  return typeof value === 'string' ? compactText(value) : '';
}

/**
 * Hàm `isActionLevel` kiểm tra điều kiện và trả boolean; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/article-editorial.service.ts`
 */
// Mở thân hàm `isActionLevel` với input/output được TypeScript kiểm tra.
function isActionLevel(value: unknown): value is ActionLevel {
  // Trả `value === 'urgent' || value === 'high' || value === 'monitor';` cho caller và kết thúc nhánh hiện tại.
  return value === 'urgent' || value === 'high' || value === 'monitor';
}
