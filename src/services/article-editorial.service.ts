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
  ArticleEditorialInput,
  EditorialTopicContext,
} from './article-editorial.types';
import { verifiedVietnameseEditorial } from './article-editorial.types';
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
  'jobs-english':
    'Tin tuyển dụng này có thể phù hợp nếu bạn đang tìm vị trí giáo viên hoặc trợ giảng tiếng Anh mầm non / tiểu học.',
};

const VIETNAMESE_CHAR =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/iu;

export function hasVietnameseEditorialText(editorial: {
  title: string;
  summary: string;
}): boolean {
  return VIETNAMESE_CHAR.test(editorial.title.normalize('NFC'))
    && VIETNAMESE_CHAR.test(editorial.summary.normalize('NFC'));
}

export interface ArticleEditorialServiceOptions {
  fallbackGenerator?: ArticleEditorialGenerator;
  failClosed?: boolean;
}

export class ArticleEditorialUnavailableError extends Error {
  constructor() {
    super('Article editorial unavailable');
    this.name = 'ArticleEditorialUnavailableError';
  }
}

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
  constructor(
    private readonly generator: ArticleEditorialGenerator | null =
      createArticleEditorialGenerator() ?? null,
    private readonly options: ArticleEditorialServiceOptions = {},
  ) {}

  /**
   * Hàm `editArticle` biên tập nội dung và giữ contract message; kết quả được trả cho caller theo kiểu khai báo.
   *
   * Được sử dụng tại:
   * - `tests/services/article-editorial.service.test.ts`
   * - `src/services/digest-message-editorial.service.ts`
   */
  // Mở method `editArticle` để biên tập nội dung và giữ contract message.
  async editArticle(article: Article, topic: TopicKey | EditorialTopicContext): Promise<ArticleEditorial> {
    const topicContext = resolveEditorialTopic(topic);
    // Tính `fallback` từ `createFallbackEditorial(article, topic);` và giữ bất biến trong phạm vi hiện tại.
    const fallback = createFallbackEditorial(article, topic);

    // Nếu `!this.generator` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (!this.generator) {
      // Trả `fallback;` cho caller và kết thúc nhánh hiện tại.
      return fallback;
    }

    // Cô lập thao tác có thể lỗi để module còn cơ hội thử provider dự phòng.
    try {
      return await this.generateEditorial(
        this.generator,
        createEditorialInput(article, topicContext),
        fallback,
      );
    } catch {
      if (this.options.fallbackGenerator) {
        try {
          return await this.generateEditorial(
            this.options.fallbackGenerator,
            createEditorialInput(article, topicContext),
            fallback,
          );
        } catch {
          return this.handleGenerationFailure(fallback);
        }
      }
      return this.handleGenerationFailure(fallback);
    }
  }

  private async generateEditorial(
    generator: ArticleEditorialGenerator,
    input: ArticleEditorialInput,
    fallback: ArticleEditorial,
  ): Promise<ArticleEditorial> {
    const parsed = parseJsonObject(await generator.generate(input));
    if (this.options.failClosed && !(generator instanceof GoogleArticleEditorialGenerator)) {
      assertCompleteEditorial(parsed);
    }
    const editorial = createEditorialFromParsed(
      parsed,
      fallback,
      generator instanceof GoogleArticleEditorialGenerator,
    );
    if (this.options.failClosed) {
      assertVietnameseEditorial(editorial);
    }
    if (
      this.options.failClosed
      && generator instanceof GoogleArticleEditorialGenerator
      && editorial[verifiedVietnameseEditorial] !== true
    ) {
      throw new ArticleEditorialUnavailableError();
    }
    return editorial;
  }

  private handleGenerationFailure(fallback: ArticleEditorial): ArticleEditorial {
    if (this.options.failClosed) {
      console.warn('Article editorial generation failed, aborting delivery');
      throw new ArticleEditorialUnavailableError();
    }

    console.warn('Article editorial generation failed, using fallback');
    return fallback;
  }

  async editArticles(
    requests: Array<{
      article: Article;
      topic: TopicKey | EditorialTopicContext;
    }>,
  ): Promise<ArticleEditorial[]> {
    if (requests.length === 0) {
      return [];
    }

    if (!this.generator?.generateBatch) {
      return Promise.all(
        requests.map(({ article, topic }) => this.editArticle(article, topic)),
      );
    }

    const contexts = requests.map(({ topic }) => resolveEditorialTopic(topic));
    const fallbacks = requests.map(({ article, topic }) => createFallbackEditorial(article, topic));
    const inputs = requests.map(({ article }, index) =>
      createEditorialInput(article, contexts[index]));

    let parsed: unknown[];
    try {
      parsed = parseJsonArray(await this.generator.generateBatch(inputs));
    } catch {
      return Promise.all(inputs.map((input, index) =>
        this.generateFallbackEditorial(input, fallbacks[index])));
    }

    return Promise.all(requests.map((_request, index) => {
      const item = parsed[index];
      if (isJsonObject(item)) {
        try {
          if (this.options.failClosed) assertCompleteEditorial(item);
          const editorial = createEditorialFromParsed(item, fallbacks[index]);
          if (this.options.failClosed) assertVietnameseEditorial(editorial);
          return editorial;
        } catch {
          return this.generateFallbackEditorial(inputs[index], fallbacks[index]);
        }
      }
      return this.generateFallbackEditorial(inputs[index], fallbacks[index]);
    }));
  }

  private async generateFallbackEditorial(
    input: ArticleEditorialInput,
    fallback: ArticleEditorial,
  ): Promise<ArticleEditorial> {
    if (!this.options.fallbackGenerator) {
      if (this.options.failClosed) {
        console.warn('Article editorial batch generation failed, aborting delivery');
        throw new ArticleEditorialUnavailableError();
      }
      console.warn('Article editorial batch generation failed, using fallback');
      return fallback;
    }

    try {
      return await this.generateEditorial(this.options.fallbackGenerator, input, fallback);
    } catch {
      console.warn('Article editorial fallback generation failed, aborting delivery');
      throw new ArticleEditorialUnavailableError();
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
export type ArticleEditorialProvider = 'openai' | 'codex' | 'google' | 'none';

export function createArticleEditorialGenerator(
  provider: ArticleEditorialProvider = env.EDITORIAL_PROVIDER,
): ArticleEditorialGenerator | undefined {
  // Nếu `env.EDITORIAL_PROVIDER === 'codex'` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (provider === 'codex') {
    // Trả `new CodexArticleEditorialGenerator();` cho caller và kết thúc nhánh hiện tại.
    return new CodexArticleEditorialGenerator();
  }

  // Nếu `env.EDITORIAL_PROVIDER === 'openai'` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (provider === 'openai') {
    // Trả `new OpenAIArticleEditorialGenerator();` cho caller và kết thúc nhánh hiện tại.
    return new OpenAIArticleEditorialGenerator();
  }

  // Nếu `env.EDITORIAL_PROVIDER === 'google'` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (provider === 'google') {
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
export function createFallbackEditorial(
  article: Article,
  topic: TopicKey | EditorialTopicContext,
): ArticleEditorial {
  const topicContext = resolveEditorialTopic(topic);
  // Trả `{` cho caller và kết thúc nhánh hiện tại.
  return {
    // Gán field `title` từ `compactText(article.title),` để object khớp contract.
    title: compactText(article.title),
    summary:
      cleanString(article.summary) || 'Nguồn chưa cung cấp mô tả chi tiết cho bản tin này.',
    // Gán field `whyImportant` từ `fallbackWhyImportant[topic],` để object khớp contract.
    whyImportant: topicContext.fallbackWhyImportant,
    // Gán field `actionLevel` từ `'monitor',` để object khớp contract.
    actionLevel: 'monitor',
    // Gán field `actionText` từ `'Kiểm tra mức độ liên quan và theo dõi thông báo chính thức từ nguồn.',` để object khớp contract.
    actionText:
      topicContext.fallbackActionText
      ?? 'Kiểm tra mức độ liên quan và theo dõi thông báo chính thức từ nguồn.',
  };
}

function resolveEditorialTopic(topic: TopicKey | EditorialTopicContext): EditorialTopicContext {
  return typeof topic === 'string'
    ? { key: topic, fallbackWhyImportant: fallbackWhyImportant[topic] }
    : topic;
}

function createEditorialInput(
  article: Article,
  topic: EditorialTopicContext,
): ArticleEditorialInput {
  return {
    title: article.title,
    summary: article.summary,
    sourceName: article.sourceName,
    topic: topic.key,
    publishedAt: article.publishedAt,
    collectedAt: article.collectedAt,
    instructions: topic.instructions,
  };
}

function createEditorialFromParsed(
  parsed: Record<string, unknown>,
  fallback: ArticleEditorial,
  trustLanguageVerification = false,
): ArticleEditorial {
  const editorial: ArticleEditorial = {
    title: cleanString(parsed.title) || fallback.title,
    summary: cleanString(parsed.summary) || fallback.summary,
    whyImportant: cleanString(parsed.whyImportant) || fallback.whyImportant,
    actionLevel: isActionLevel(parsed.actionLevel) ? parsed.actionLevel : fallback.actionLevel,
    actionText: cleanString(parsed.actionText) || fallback.actionText,
  };
  return trustLanguageVerification && parsed.languageVerified === true
    ? { ...editorial, [verifiedVietnameseEditorial]: true }
    : editorial;
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

function parseJsonArray(raw: string): unknown[] {
  const normalized = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  const parsed: unknown = JSON.parse(normalized);
  if (!Array.isArray(parsed)) {
    throw new Error('Editorial response must be a JSON array');
  }
  return parsed;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertCompleteEditorial(value: Record<string, unknown>): void {
  if (
    !cleanString(value.title)
    || !cleanString(value.summary)
    || !cleanString(value.whyImportant)
    || !isActionLevel(value.actionLevel)
    || !cleanString(value.actionText)
  ) {
    throw new Error('Editorial response is incomplete');
  }
}

function assertVietnameseEditorial(editorial: ArticleEditorial): void {
  if (!hasVietnameseEditorialText(editorial)) {
    throw new Error('Editorial response is not Vietnamese');
  }
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
