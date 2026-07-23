/**
 * Contract chung giữa orchestration editorial và ba provider Codex/OpenAI/Google.
 *
 * Các generator nhận ArticleEditorialInput, trả JSON string, rồi
 * ArticleEditorialService parse/validate thành ArticleEditorial.
 */
import type { TopicKey } from '../types/topic';

/**
 * Ba mức hành động được phép xuất hiện trong message cuối.
 * Được dùng bởi `ArticleEditorial` và validator `isActionLevel` trong `article-editorial.service.ts`.
 */
export type ActionLevel = 'urgent' | 'high' | 'monitor';

/**
 * Editorial đã validate, sẵn sàng để DigestService render HTML.
 * Được dùng tại `article-editorial.service.ts`, `digest-message-editorial.service.ts`
 * và `digest.service.ts`.
 */
export interface ArticleEditorial {
  title: string;
  summary: string;
  whyImportant: string;
  actionLevel: ActionLevel;
  actionText: string;
}

/**
 * Dữ kiện tối thiểu được phép gửi cho provider để tránh bịa thông tin.
 * Được cả ba generator Codex/Google/OpenAI và các generator tests sử dụng.
 */
export interface ArticleEditorialInput {
  title: string;
  summary?: string;
  sourceName: string;
  topic: TopicKey;
  publishedAt?: string;
  collectedAt: string;
}

/**
 * Interface dependency-injection cho mọi editorial provider.
 *
 * Được implement bởi Codex/OpenAI/Google generator và được
 * `article-editorial.service.ts` cùng các generator tests sử dụng.
 * Implementations: `codex-article-editorial.generator.ts`,
 * `google-article-editorial.generator.ts`, `openai-article-editorial.generator.ts`.
 */
export interface ArticleEditorialGenerator {
  generate(input: ArticleEditorialInput): Promise<string>;
}

/**
 * System instructions dùng chung để ép provider trả JSON có căn cứ.
 *
 * Được các provider generator ghép vào prompt; tests provider kiểm tra
 * request chứa ràng buộc này.
 */
export const articleEditorialInstructions = [
  // Các dòng tách riêng để prompt dễ đọc nhưng được join thành một string.
  'Biên tập một tin công nghệ bằng tiếng Việt tự nhiên, súc tích.',
  'Chỉ trả về một JSON object với đúng các khóa: title, summary, whyImportant, actionLevel, actionText.',
  'actionLevel chỉ được là urgent, high hoặc monitor.',
  'Tóm tắt và nhận định chỉ được dựa trên dữ kiện đầu vào. Không bịa CVE, phiên bản, số liệu, tổ chức, trạng thái khai thác hoặc phạm vi ảnh hưởng.',
  'Nếu dữ kiện chưa đủ để kết luận mạnh, chọn monitor và đề xuất kiểm tra mức độ liên quan hoặc theo dõi nguồn chính thức.',
  'Không dùng Markdown và không thêm giải thích ngoài JSON.',
].join('\n');
