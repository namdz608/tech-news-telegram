/**
 * Gọi OpenAI Responses API để sinh editorial JSON theo schema chung.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp OpenAI từ `openai` để dùng đúng dependency/type thay vì tự triển khai lại.
import OpenAI from 'openai';
// Nạp { env } từ `../config/env` để dùng đúng dependency/type thay vì tự triển khai lại.
import { env } from '../config/env';
import type {
  // Đưa giá trị `ArticleEditorialGenerator` vào field cùng tên của object đang tạo.
  ArticleEditorialGenerator,
  // Đưa giá trị `ArticleEditorialInput` vào field cùng tên của object đang tạo.
  ArticleEditorialInput,
} from './article-editorial.types';
// Nạp { articleEditorialInstructions } từ `./article-editorial.types` để dùng đúng dependency/type thay vì tự triển khai lại.
import { articleEditorialInstructions } from './article-editorial.types';

/**
 * Interface `OpenAIResponseClientLike` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/services/openai-article-editorial.generator.ts`
 */
// Mở khai báo `interface OpenAIResponseClientLike` để compiler kiểm tra contract cho mọi consumer.
interface OpenAIResponseClientLike {
  // Gán field `responses` từ `{` để object khớp contract.
  responses: {
    // Gán field `create(input` từ `{ model: string; instructions: string; input: string }): Promise<{ output_text?: string…` để object khớp contract.
    create(input: { model: string; instructions: string; input: string }): Promise<{ output_text?: string }>;
  };
}

/**
 * Class `OpenAIArticleEditorialGenerator` sở hữu vòng đời dependency và điều phối các bước open aiarticle editorial generator.
 *
 * Được sử dụng tại:
 * - `src/services/article-editorial.service.ts`
 * - `tests/services/openai-article-editorial.generator.test.ts`
 */
// Mở khai báo `export class OpenAIArticleEditorialGenerator implements ArticleEditorialGenerator` để compiler kiểm tra contract cho mọi consumer.
export class OpenAIArticleEditorialGenerator implements ArticleEditorialGenerator {
  constructor(
    // Gán field `private readonly client` từ `OpenAIResponseClientLike = new OpenAI({` để object khớp contract.
    private readonly client: OpenAIResponseClientLike = new OpenAI({
      // Gán field `apiKey` từ `env.OPENAI_API_KEY,` để object khớp contract.
      apiKey: env.OPENAI_API_KEY,
    }) as OpenAIResponseClientLike,
    private readonly model = env.OPENAI_MODEL,
  ) {}

  /**
   * Hàm `generate` thực hiện trách nhiệm `generate` của module; kết quả được trả cho caller theo kiểu khai báo.
   *
   * Được sử dụng tại:
   * - `tests/services/openai-article-editorial.generator.test.ts`
   * - `src/services/article-editorial.service.ts`
   */
  // Mở method `generate` để thực hiện trách nhiệm `generate` của module.
  async generate(input: ArticleEditorialInput): Promise<string> {
    // Tính `response` từ `await this.client.responses.create({` và giữ bất biến trong phạm vi hiện tại.
    const response = await this.client.responses.create({
      // Gán field `model` từ `this.model,` để object khớp contract.
      model: this.model,
      // Gán field `instructions` từ `articleEditorialInstructions,` để object khớp contract.
      instructions: articleEditorialInstructions,
      // Gán field `input` từ `JSON.stringify(input),` để object khớp contract.
      input: JSON.stringify(input),
    });

    // Trả `response.output_text?.trim() ?? '';` cho caller và kết thúc nhánh hiện tại.
    return response.output_text?.trim() ?? '';
  }
}
