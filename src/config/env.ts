/**
 * Nạp, ép kiểu và kiểm tra toàn bộ biến môi trường tại một điểm duy nhất.
 *
 * `env` được dùng bởi server, config nguồn, crawler và các service tích hợp.
 * Parse thất bại làm tiến trình dừng sớm thay vì chạy với cấu hình sai.
 */
import 'dotenv/config';
import { z } from 'zod';

// Schema vừa mô tả contract runtime vừa cung cấp default an toàn cho local/test.
const envSchema = z.object({
  // Chế độ chạy quyết định hành vi thư viện và tối ưu runtime.
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Cổng HTTP phải là số nguyên dương.
  PORT: z.coerce.number().int().positive().default(3000),
  // Credential và chat đích được TelegramService sử dụng.
  TELEGRAM_BOT_TOKEN: z.string().default('test-token'),
  TELEGRAM_CHAT_ID: z.string().default('test-chat-id'),
  TELEGRAM_MESSAGE_EFFECT_ID: z.string().default('5104841245755180586'),
  // Token rỗng sẽ khiến nguồn X bị tắt trong `sources.ts`.
  X_BEARER_TOKEN: z.string().default(''),
  // Query mặc định bao phủ các chủ đề công nghệ chính và loại retweet/reply.
  X_SEARCH_QUERY: z
    .string()
    .default('(AI OR "artificial intelligence" OR LLM OR Kubernetes OR DevOps OR cloud OR security OR CVE) lang:en -is:retweet -is:reply'),
  // X API chỉ chấp nhận page size trong khoảng 10–100.
  X_SEARCH_MAX_RESULTS: z.coerce.number().int().min(10).max(100).default(20),
  // GitHub token/query có thể rỗng; crawler có chế độ public/default query.
  GITHUB_TOKEN: z.string().default(''),
  GITHUB_AI_REPO_QUERY: z.string().default(''),
  GITHUB_AI_REPO_MAX_RESULTS: z.coerce.number().int().min(1).max(100).default(10),
  GITHUB_AI_REPO_LOOKBACK_DAYS: z.coerce.number().int().positive().default(7),
  // Cấu hình provider biên tập và model OpenAI.
  OPENAI_API_KEY: z.string().default('test-openai-key'),
  OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
  EDITORIAL_PROVIDER: z.enum(['openai', 'codex', 'google', 'none']).default('google'),
  // Ngôn ngữ dịch đích và timeout tiến trình Codex.
  TRANSLATION_TARGET_LANGUAGE: z.string().default('vi'),
  CODEX_TRANSLATION_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  // Các giới hạn chọn bài ngăn digest quá dài hoặc lệch topic.
  MAX_ARTICLES_PER_DIGEST: z.coerce.number().int().positive().default(20),
  MAX_ARTICLES_PER_TOPIC: z.coerce.number().int().positive().default(2),
  MAX_ARTICLE_AGE_DAYS: z.coerce.number().int().positive().default(14),
  // Timeout/User-Agent dùng chung cho các HTTP client.
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(12000),
  USER_AGENT: z.string().default('TechNewsTelegramBot/1.0'),
});

/**
 * Cấu hình đã validate dùng xuyên suốt ứng dụng.
 *
 * Được sử dụng tại 14 module trong `src/`, gồm `server.ts`, `sources.ts`,
 * mọi crawler, Source/Digest/Telegram/Translation và các editorial provider;
 * `tests/config/env.test.ts` kiểm tra default và validation.
 */
export const env = envSchema.parse(process.env);
