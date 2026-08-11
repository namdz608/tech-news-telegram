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
import {
  type ArticleEditorial,
  type EditorialTopicContext,
  verifiedVietnameseEditorial,
} from './article-editorial.types';
import {
  formatArticleDate,
  getArticleMessageImageUrl,
  truncateArticleMessageText,
} from './article-message.service';
import { GoogleTranslationService } from './google-translation.service';
import { sanitizeHealthEditorialText } from './health-safety.service';

interface HealthArticleEditor {
  editArticle(article: Article, topic: EditorialTopicContext): Promise<ArticleEditorial>;
}

interface VerifiedHealthTranslator {
  translateDigestVerified(text: string): Promise<{ text: string; succeeded: boolean }>;
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
const researchLimitationPattern = /(?:sơ bộ|thiết kế nghiên cứu|nghiên cứu quan sát|nghiên cứu động vật|mẫu (?:nhỏ|hạn chế)|chưa (?:đủ|thể|xác định))/iu;
const drugSafetyTakeaway = 'Không tự thay đổi điều trị; hãy trao đổi với bác sĩ hoặc dược sĩ trước mọi quyết định liên quan đến thuốc.';

const researchQualifierRules: Array<{ pattern: RegExp; note: string }> = [
  {
    pattern: /(?:preliminary|early evidence|pilot|sơ bộ)/iu,
    note: 'Kết quả còn sơ bộ.',
  },
  {
    pattern: /(?:animal(?:-only)?|mice|mouse|rats?|động vật|chuột)/iu,
    note: 'Nghiên cứu trên động vật chưa cho phép kết luận tương tự ở người.',
  },
  {
    pattern: /(?:small (?:sample|study)|limited sample|mẫu (?:nhỏ|hạn chế))/iu,
    note: 'Mẫu nhỏ làm hạn chế khả năng khái quát kết quả.',
  },
  {
    pattern: /(?:observational|cohort|quan sát|đoàn hệ)/iu,
    note: 'Thiết kế quan sát không đủ để khẳng định quan hệ nhân quả.',
  },
];

export class HealthMessageService {
  constructor(
    private readonly editor: HealthArticleEditor = new ArticleEditorialService(),
    private readonly translator: VerifiedHealthTranslator = new GoogleTranslationService(),
  ) {}

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
      const translated = editorial[verifiedVietnameseEditorial] === true
        ? {
            title: editorial.title,
            summary: editorial.summary,
            succeeded: true,
          }
        : await translateHealthTitleAndSummary(this.translator, editorial);
      const titleFallback = international
        ? 'Bản tin sức khỏe từ nguồn quốc tế.'
        : entry.article.title;
      const sourceSummaryFallback = sanitizeHealthEditorialText(
        international ? '' : entry.article.summary ?? '',
        international
          ? 'Nguồn quốc tế chưa có bản dịch tiếng Việt an toàn.'
          : 'Nguồn chưa cung cấp mô tả chi tiết.',
        sourceText,
      );
      const title = truncateArticleMessageText(sanitizeHealthEditorialText(
        translated.succeeded ? translated.title : titleFallback,
        titleFallback || 'Bản tin sức khỏe từ nguồn chính thức.',
        sourceText,
      ), 220);
      const summary = truncateArticleMessageText(
        sanitizeHealthEditorialText(
          translated.succeeded ? translated.summary : sourceSummaryFallback,
          sourceSummaryFallback,
          sourceText,
        ),
        520,
      );
      let safeTakeaway = sanitizeHealthEditorialText(
        editorial[verifiedVietnameseEditorial] === true
          ? editorial.actionText
          : topic.fallbackSafeTakeaway,
        topic.fallbackSafeTakeaway,
        sourceText,
      );
      if (entry.evidence === 'drug-safety') {
        safeTakeaway = drugSafetyTakeaway;
      }
      safeTakeaway = truncateArticleMessageText(safeTakeaway, 320);
      let evidenceNote = sanitizeHealthEditorialText(
        editorial[verifiedVietnameseEditorial] === true
          ? editorial.whyImportant
          : topic.fallbackEvidenceNote,
        topic.fallbackEvidenceNote,
        sourceText,
      );
      if (entry.evidence === 'research') {
        const sourceLimitations = getResearchLimitations(sourceText);
        if (!sourceLimitations.length && !researchLimitationPattern.test(evidenceNote)) {
          evidenceNote = topic.fallbackEvidenceNote;
        }
        evidenceNote = combineEvidenceWithRequiredLimitations(
          evidenceNote,
          sourceLimitations,
          360,
        );
      }
      if (entry.evidence !== 'research') {
        evidenceNote = truncateArticleMessageText(evidenceNote, 360);
      }
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

async function translateHealthTitleAndSummary(
  translator: VerifiedHealthTranslator,
  editorial: ArticleEditorial,
): Promise<{ title: string; summary: string; succeeded: boolean }> {
  const [title, summary] = await Promise.all([
    translator.translateDigestVerified(editorial.title),
    translator.translateDigestVerified(editorial.summary),
  ]);
  return {
    title: title.text,
    summary: summary.text,
    succeeded: title.succeeded && summary.succeeded,
  };
}

function getResearchLimitations(sourceText: string): string[] {
  return researchQualifierRules
    .filter(({ pattern }) => pattern.test(sourceText))
    .map(({ note }) => note);
}

function combineEvidenceWithRequiredLimitations(
  evidenceNote: string,
  requiredLimitations: string[],
  maxLength: number,
): string {
  const limitations = requiredLimitations
    .filter((note, index, notes) => notes.indexOf(note) === index)
    .join(' ');
  if (!limitations) return truncateArticleMessageText(evidenceNote, maxLength);

  const evidenceBudget = maxLength - limitations.length - 1;
  if (evidenceBudget <= 0) return limitations;
  return `${truncateArticleMessageText(evidenceNote, evidenceBudget)} ${limitations}`;
}

function getHealthTopic(key: HealthTopicKey) {
  const topic = healthTopics.find((candidate) => candidate.key === key);
  if (!topic) throw new Error(`Unknown health topic: ${key}`);
  return topic;
}
