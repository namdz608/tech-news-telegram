import { healthTopics } from '../config/health-topics';
import type { Article } from '../types/article';
import type {
  HealthDigestEntry,
  HealthEvidenceKind,
  HealthMessage,
  HealthTopicKey,
} from '../types/health';
import { escapeHtml } from '../utils/text';
import { ArticleEditorialService } from './article-editorial.service';
import type { ArticleEditorial, EditorialTopicContext } from './article-editorial.types';
import {
  formatArticleDate,
  getArticleMessageImageUrl,
  truncateArticleMessageText,
} from './article-message.service';
import { sanitizeHealthEditorialText } from './health-safety.service';

interface HealthArticleEditor {
  editArticle(article: Article, topic: EditorialTopicContext): Promise<ArticleEditorial>;
}

export const healthEditorialInstructions = [
  'Biên tập thông tin sức khỏe bằng tiếng Việt tự nhiên, trung lập và súc tích.',
  'Chỉ trả về JSON với đúng các khóa: title, summary, whyImportant, actionLevel, actionText.',
  'Không chẩn đoán, kê đơn, nêu liều, hoặc khuyên bắt đầu, ngừng, đổi hay tăng giảm thuốc.',
  'Giữ nguyên mức độ chắc chắn; không biến liên quan thành quan hệ nhân quả.',
  'Với nghiên cứu ban đầu, nêu giới hạn được cung cấp như nghiên cứu động vật, quan sát, mẫu nhỏ hoặc sơ bộ.',
  'actionText chỉ được là hành động ít rủi ro hoặc khuyên trao đổi với bác sĩ/dược sĩ.',
  'actionLevel dùng monitor trừ khi nguồn chính thức mô tả cảnh báo an toàn cần chú ý.',
  'Không dùng Markdown và không thêm nội dung ngoài JSON.',
].join('\n');

const evidenceLabels: Record<HealthEvidenceKind, string> = {
  guidance: '🟢 HƯỚNG DẪN',
  'public-health-alert': '🟠 CẢNH BÁO SỨC KHỎE',
  'drug-safety': '🟠 CẢNH BÁO AN TOÀN THUỐC/THIẾT BỊ',
  research: '🔬 NGHIÊN CỨU',
  'medical-news': '🔵 TIN Y KHOA',
};

export class HealthMessageService {
  constructor(private readonly editor: HealthArticleEditor = new ArticleEditorialService()) {}

  async buildMessages(entries: HealthDigestEntry[]): Promise<HealthMessage[]> {
    return Promise.all(entries.map(async (entry) => {
      const topic = getHealthTopic(entry.topic);
      const editorial = await this.editor.editArticle(entry.article, {
        key: topic.key,
        fallbackWhyImportant: topic.fallbackEvidenceNote,
        fallbackActionText: topic.fallbackSafeTakeaway,
        instructions: healthEditorialInstructions,
      });
      const sourceSummaryFallback = sanitizeHealthEditorialText(
        entry.article.summary ?? '',
        'Nguồn chưa cung cấp mô tả chi tiết.',
      );
      const title = truncateArticleMessageText(sanitizeHealthEditorialText(
        editorial.title,
        'Bản tin sức khỏe từ nguồn chính thức.',
      ), 220);
      const summary = truncateArticleMessageText(
        sanitizeHealthEditorialText(editorial.summary, sourceSummaryFallback),
        520,
      );
      const safeTakeaway = truncateArticleMessageText(
        sanitizeHealthEditorialText(editorial.actionText, topic.fallbackSafeTakeaway),
        320,
      );
      const evidenceNote = truncateArticleMessageText(
        sanitizeHealthEditorialText(editorial.whyImportant, topic.fallbackEvidenceNote),
        360,
      );
      const text = [
        `${topic.icon}  <b>${escapeHtml(topic.label.toUpperCase())}</b>`,
        '━━━━━━━━━━━━━━━━',
        '',
        `📰  <b>${escapeHtml(title)}</b>`,
        '',
        `🏷️ <b>Loại thông tin:</b> ${evidenceLabels[entry.evidence]}`,
        `📅 <b>Công bố:</b> ${formatArticleDate(entry.article)}`,
        '',
        '📝 <b>Tóm tắt</b>',
        escapeHtml(summary),
        '',
        '✅ <b>Điều có thể áp dụng an toàn</b>',
        escapeHtml(safeTakeaway),
        '',
        '⚠️ <b>Giới hạn/Lưu ý</b>',
        escapeHtml(evidenceNote),
        '',
        'ℹ️ <i>Thông tin tham khảo, không thay thế chẩn đoán hoặc điều trị y khoa.</i>',
        '',
        `🏢 <i>Nguồn: ${escapeHtml(entry.article.sourceName)}</i>`,
      ].join('\n').trim();
      return {
        text,
        url: entry.article.url,
        imageUrl: getArticleMessageImageUrl(entry.article, topic.fallbackImageUrl),
        article: entry.article,
        topic: entry.topic,
        evidence: entry.evidence,
      };
    }));
  }
}

function getHealthTopic(key: HealthTopicKey) {
  const topic = healthTopics.find((candidate) => candidate.key === key);
  if (!topic) throw new Error(`Unknown health topic: ${key}`);
  return topic;
}
