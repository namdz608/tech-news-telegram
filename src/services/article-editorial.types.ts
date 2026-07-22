import type { TopicKey } from '../types/topic';

export type ActionLevel = 'urgent' | 'high' | 'monitor';

export interface ArticleEditorial {
  title: string;
  summary: string;
  whyImportant: string;
  actionLevel: ActionLevel;
  actionText: string;
}

export interface ArticleEditorialInput {
  title: string;
  summary?: string;
  sourceName: string;
  topic: TopicKey;
  publishedAt?: string;
  collectedAt: string;
}

export interface ArticleEditorialGenerator {
  generate(input: ArticleEditorialInput): Promise<string>;
}

export const articleEditorialInstructions = [
  'Biên tập một tin công nghệ bằng tiếng Việt tự nhiên, súc tích.',
  'Chỉ trả về một JSON object với đúng các khóa: title, summary, whyImportant, actionLevel, actionText.',
  'actionLevel chỉ được là urgent, high hoặc monitor.',
  'Tóm tắt và nhận định chỉ được dựa trên dữ kiện đầu vào. Không bịa CVE, phiên bản, số liệu, tổ chức, trạng thái khai thác hoặc phạm vi ảnh hưởng.',
  'Nếu dữ kiện chưa đủ để kết luận mạnh, chọn monitor và đề xuất kiểm tra mức độ liên quan hoặc theo dõi nguồn chính thức.',
  'Không dùng Markdown và không thêm giải thích ngoài JSON.',
].join('\n');
