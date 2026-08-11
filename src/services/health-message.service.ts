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

const internationalSourceIds = new Set([
  'medlineplus-new',
  'medlineplus-healthy-living',
  'fda-medwatch',
  'niddk-news',
]);
const vietnameseCharacterPattern = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/iu;
const clinicianPattern = /(?:bác sĩ|dược sĩ)/iu;
const researchLimitationPattern = /(?:sơ bộ|thiết kế nghiên cứu|nghiên cứu quan sát|nghiên cứu động vật|mẫu (?:nhỏ|hạn chế)|chưa (?:đủ|thể|xác định))/iu;

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
      const international = internationalSourceIds.has(entry.article.sourceId);
      const sourceText = `${entry.article.title} ${entry.article.summary ?? ''}`;
      const sourceSummaryFallback = sanitizeHealthEditorialText(
        international ? '' : entry.article.summary ?? '',
        international
          ? 'Nguồn quốc tế chưa có bản dịch tiếng Việt an toàn.'
          : 'Nguồn chưa cung cấp mô tả chi tiết.',
        sourceText,
      );
      const title = truncateArticleMessageText(sanitizeHealthEditorialText(
        ensureVietnameseHealthText(
          editorial.title,
          international ? 'Bản tin sức khỏe từ nguồn quốc tế.' : editorial.title,
          international,
        ),
        international
          ? 'Bản tin sức khỏe từ nguồn quốc tế.'
          : 'Bản tin sức khỏe từ nguồn chính thức.',
        sourceText,
      ), 220);
      const summary = truncateArticleMessageText(
        sanitizeHealthEditorialText(
          ensureVietnameseHealthText(editorial.summary, sourceSummaryFallback, international),
          sourceSummaryFallback,
          sourceText,
        ),
        520,
      );
      let safeTakeaway = sanitizeHealthEditorialText(
        ensureVietnameseHealthText(
          editorial.actionText,
          topic.fallbackSafeTakeaway,
          international,
        ),
        topic.fallbackSafeTakeaway,
        sourceText,
      );
      if (entry.evidence === 'drug-safety' && !clinicianPattern.test(safeTakeaway)) {
        safeTakeaway = topic.fallbackSafeTakeaway;
      }
      safeTakeaway = truncateArticleMessageText(safeTakeaway, 320);
      let evidenceNote = sanitizeHealthEditorialText(
        ensureVietnameseHealthText(
          editorial.whyImportant,
          topic.fallbackEvidenceNote,
          international,
        ),
        topic.fallbackEvidenceNote,
        sourceText,
      );
      if (entry.evidence === 'research' && !researchLimitationPattern.test(evidenceNote)) {
        evidenceNote = topic.fallbackEvidenceNote;
      }
      evidenceNote = truncateArticleMessageText(evidenceNote, 360);
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

function ensureVietnameseHealthText(
  value: string,
  fallback: string,
  required: boolean,
): string {
  if (!required || vietnameseCharacterPattern.test(value)) return value;
  return fallback;
}

function getHealthTopic(key: HealthTopicKey) {
  const topic = healthTopics.find((candidate) => candidate.key === key);
  if (!topic) throw new Error(`Unknown health topic: ${key}`);
  return topic;
}
