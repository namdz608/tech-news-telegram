import { env } from '../config/env';
import type { Article } from '../types/article';
import type { TopicKey } from '../types/topic';
import { compactText } from '../utils/text';
import type {
  ActionLevel,
  ArticleEditorial,
  ArticleEditorialGenerator,
} from './article-editorial.types';
import { CodexArticleEditorialGenerator } from './codex-article-editorial.generator';
import { GoogleArticleEditorialGenerator } from './google-article-editorial.generator';
import { OpenAIArticleEditorialGenerator } from './openai-article-editorial.generator';

const fallbackWhyImportant: Record<TopicKey, string> = {
  ai: 'Thay đổi này có thể ảnh hưởng đến cách các nhóm đánh giá, tích hợp hoặc vận hành hệ thống AI hiện có.',
  k8s: 'Các cụm Kubernetes liên quan nên được kiểm tra để xác định tác động đến khả năng tương thích và vận hành.',
  security: 'Các hệ thống liên quan cần được kiểm tra mức độ phơi nhiễm để giảm nguy cơ bị khai thác hoặc gián đoạn.',
  devops: 'Thay đổi này có thể ảnh hưởng đến pipeline, công cụ hoặc quy trình vận hành đang sử dụng.',
  cloud: 'Các workload và dịch vụ cloud liên quan nên được đánh giá để xác định tác động đến vận hành, chi phí hoặc bảo mật.',
};

export class ArticleEditorialService {
  constructor(private readonly generator = createDefaultGenerator()) {}

  async editArticle(article: Article, topic: TopicKey): Promise<ArticleEditorial> {
    const fallback = createFallbackEditorial(article, topic);

    if (!this.generator) {
      return fallback;
    }

    try {
      const raw = await this.generator.generate({
        title: article.title,
        summary: article.summary,
        sourceName: article.sourceName,
        topic,
        publishedAt: article.publishedAt,
        collectedAt: article.collectedAt,
      });
      const parsed = parseJsonObject(raw);

      return {
        title: cleanString(parsed.title) || fallback.title,
        summary: cleanString(parsed.summary) || fallback.summary,
        whyImportant: cleanString(parsed.whyImportant) || fallback.whyImportant,
        actionLevel: isActionLevel(parsed.actionLevel) ? parsed.actionLevel : fallback.actionLevel,
        actionText: cleanString(parsed.actionText) || fallback.actionText,
      };
    } catch (error) {
      console.warn('Article editorial generation failed, using fallback', error);
      return fallback;
    }
  }
}

function createDefaultGenerator(): ArticleEditorialGenerator | undefined {
  if (env.EDITORIAL_PROVIDER === 'codex') {
    return new CodexArticleEditorialGenerator();
  }

  if (env.EDITORIAL_PROVIDER === 'openai') {
    return new OpenAIArticleEditorialGenerator();
  }

  if (env.EDITORIAL_PROVIDER === 'google') {
    return new GoogleArticleEditorialGenerator();
  }

  return undefined;
}

export function createFallbackEditorial(article: Article, topic: TopicKey): ArticleEditorial {
  return {
    title: compactText(article.title),
    summary:
      cleanString(article.summary) || 'Nguồn chưa cung cấp mô tả chi tiết cho bản tin này.',
    whyImportant: fallbackWhyImportant[topic],
    actionLevel: 'monitor',
    actionText: 'Kiểm tra mức độ liên quan và theo dõi thông báo chính thức từ nguồn.',
  };
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const normalized = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  const parsed: unknown = JSON.parse(normalized);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Editorial response must be a JSON object');
  }

  return parsed as Record<string, unknown>;
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? compactText(value) : '';
}

function isActionLevel(value: unknown): value is ActionLevel {
  return value === 'urgent' || value === 'high' || value === 'monitor';
}
