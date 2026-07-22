import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  TELEGRAM_BOT_TOKEN: z.string().default('test-token'),
  TELEGRAM_CHAT_ID: z.string().default('test-chat-id'),
  TELEGRAM_MESSAGE_EFFECT_ID: z.string().default('5104841245755180586'),
  X_BEARER_TOKEN: z.string().default(''),
  X_SEARCH_QUERY: z
    .string()
    .default('(AI OR "artificial intelligence" OR LLM OR Kubernetes OR DevOps OR cloud OR security OR CVE) lang:en -is:retweet -is:reply'),
  X_SEARCH_MAX_RESULTS: z.coerce.number().int().min(10).max(100).default(20),
  GITHUB_TOKEN: z.string().default(''),
  GITHUB_AI_REPO_QUERY: z.string().default(''),
  GITHUB_AI_REPO_MAX_RESULTS: z.coerce.number().int().min(1).max(100).default(10),
  GITHUB_AI_REPO_LOOKBACK_DAYS: z.coerce.number().int().positive().default(7),
  OPENAI_API_KEY: z.string().default('test-openai-key'),
  OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
  EDITORIAL_PROVIDER: z.enum(['openai', 'codex', 'google', 'none']).default('google'),
  TRANSLATION_TARGET_LANGUAGE: z.string().default('vi'),
  CODEX_TRANSLATION_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  MAX_ARTICLES_PER_DIGEST: z.coerce.number().int().positive().default(20),
  MAX_ARTICLES_PER_TOPIC: z.coerce.number().int().positive().default(2),
  MAX_ARTICLE_AGE_DAYS: z.coerce.number().int().positive().default(14),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(12000),
  USER_AGENT: z.string().default('TechNewsTelegramBot/1.0'),
});

export const env = envSchema.parse(process.env);
