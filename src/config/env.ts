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
  // Credential, đích gửi và giới hạn riêng cho luồng tin thiết bị tiêu dùng.
  GADGET_TELEGRAM_BOT_TOKEN: z.string().default('test-gadget-token'),
  GADGET_TELEGRAM_CHAT_ID: z.string().default('test-gadget-chat-id'),
  GADGET_MAX_ARTICLES: z.coerce.number().int().min(1).max(50).default(12),
  GADGET_HISTORY_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  GADGET_HISTORY_PATH: z.string().min(1).default('data/gadget-sent-history.json'),
  // Credential, giới hạn và lịch sử riêng cho luồng đời sống/sức khỏe.
  HEALTH_TELEGRAM_BOT_TOKEN: z.string().default('test-health-token'),
  HEALTH_TELEGRAM_CHAT_ID: z.string().default('test-health-chat-id'),
  HEALTH_MAX_ARTICLES: z.coerce.number().int().min(1).max(50).default(12),
  HEALTH_HISTORY_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
  HEALTH_HISTORY_PATH: z.string().min(1).default('data/health-sent-history.json'),
  // Cấu hình runtime riêng cho luồng giá vàng và tin chính trị.
  GOLD_POLITICS_TELEGRAM_BOT_TOKEN: z.string().default('test-gold-politics-token'),
  GOLD_POLITICS_TELEGRAM_CHAT_ID: z.string().default('test-gold-politics-chat-id'),
  GOLD_POLITICS_MAX_ARTICLES: z.coerce.number().int().min(2).max(15).default(15),
  GOLD_POLITICS_MAX_GOLD_NEWS: z.coerce.number().int().min(0).max(3).default(3),
  GOLD_POLITICS_MAX_AGE_HOURS: z.coerce.number().int().positive().default(72),
  GOLD_POLITICS_MAX_PRICE_AGE_MINUTES: z.coerce.number().int().positive().default(60),
  GOLD_POLITICS_HISTORY_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
  GOLD_POLITICS_HISTORY_PATH: z.string().min(1).default('data/gold-politics-sent-history.json'),
  GOLD_PRICE_HISTORY_PATH: z.string().min(1).default('data/gold-price-history.json'),
  GOLD_POLITICS_WEB_SEARCH_MAX_QUERIES: z.coerce.number().int().min(0).max(20).default(8),
  BRAVE_SEARCH_API_KEY: z.string().default(''),
  GOLD_SPOT_API_URL: z
    .string()
    .url()
    .refine((value) => {
      const parsed = new URL(value);
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
        && !parsed.username
        && !parsed.password;
    })
    .default('https://api.gold-api.com/price/XAU'),
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
  MAX_JOBS_PER_DIGEST: z.coerce.number().int().positive().default(10),
  // Timeout/User-Agent dùng chung cho các HTTP client.
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(12000),
  USER_AGENT: z.string().default('TechNewsTelegramBot/1.0'),
  // FlareSolverr optional — dùng để vượt Cloudflare khi crawl TopCV.
  FLARESOLVERR_URL: z.string().default(''),
  // SMTP mail cho luồng gửi PDF tin tuyển dụng.
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .string()
    .default('false')
    .transform((value) => value === 'true' || value === '1'),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().default(''),
  MAIL_TO: z.string().default(''),
  // Font PDF (mặc định DejaVu bundled) để hiện tiếng Việt.
  JOBS_PDF_FONT_PATH: z.string().default(''),
});

/**
 * Cấu hình đã validate dùng xuyên suốt ứng dụng.
 *
 * Được sử dụng tại 14 module trong `src/`, gồm `server.ts`, `sources.ts`,
 * mọi crawler, Source/Digest/Telegram/Translation và các editorial provider;
 * `tests/config/env.test.ts` kiểm tra default và validation.
 */
const parsedEnv = envSchema.parse(process.env);

export const env = {
  ...parsedEnv,
  GOLD_POLITICS_MAX_GOLD_NEWS: Math.min(
    parsedEnv.GOLD_POLITICS_MAX_GOLD_NEWS,
    parsedEnv.GOLD_POLITICS_MAX_ARTICLES,
  ),
};
