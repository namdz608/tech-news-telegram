import type { Article } from '../types/article';
import type { HealthEvidenceKind } from '../types/health';
import { matchesCuratedKeyword } from './curated-selection';

const promotionalClaims = [
  'thần dược', 'chữa khỏi mọi bệnh', 'cam kết hiệu quả', 'detox',
  'mua ngay', 'giảm giá thực phẩm chức năng', 'lời chứng thực giảm cân',
  'miracle cure', 'cure all', 'guaranteed result', 'supplement sale',
  'weight loss testimonial',
];
const alertTerms = [
  'warn', 'warning', 'alert', 'recall', 'hidden ingredient',
  'cảnh báo', 'thu hồi', 'phát hiện chất cấm',
];
const researchTerms = [
  'study', 'research', 'trial', 'researchers',
  'nghiên cứu', 'thử nghiệm', 'các nhà khoa học',
];
const guidanceTerms = [
  'habit', 'healthy living', 'prevention', 'exercise', 'nutrition', 'sleep',
  'thói quen', 'lối sống', 'phòng bệnh', 'vận động', 'dinh dưỡng', 'giấc ngủ',
];
const dosagePattern = /\b\d+(?:[.,]\d+)?\s?(?:mg|mcg|µg|g|ml|viên|liều)\b/iu;
const treatmentDirectivePattern = /(?:uống|dùng|bắt đầu|ngừng|bỏ|đổi|tăng|giảm|take|start|stop|switch|increase|decrease).{0,40}(?:thuốc|medicine|drug|dose|liều)/iu;
const rapidWeightLossPattern = /(?:giảm|lose)\s+\d+\s*(?:kg|kilograms?).{0,20}(?:ngày|days?|tuần|weeks?)/iu;
const personalizedDiagnosisPattern = /(?:bạn|you).{0,30}(?:bị|mắc|have|has|được chẩn đoán|diagnosed)/iu;
const prescriptionPattern = /(?:kê đơn|toa thuốc|prescribe|prescription|điều trị dành cho bạn|your treatment)/iu;
const certaintyEscalationPattern = /(?:chắc chắn|chứng minh|proves?|definitely|guarantees?).{0,50}(?:gây|causes?|cures?|khỏi bệnh)/iu;

const containsAny = (text: string, terms: string[]) =>
  terms.some((term) => matchesCuratedKeyword(text, term));

export function isSafeHealthArticle(article: Article): boolean {
  const text = `${article.title} ${article.summary ?? ''}`;
  const isOfficialAlert = article.sourceId === 'fda-medwatch' || containsAny(text, alertTerms);
  if (dosagePattern.test(text) && treatmentDirectivePattern.test(text)) return false;
  if (rapidWeightLossPattern.test(text)) return false;
  if (containsAny(text, promotionalClaims) && !isOfficialAlert) return false;
  return true;
}

export function classifyHealthEvidence(article: Article): HealthEvidenceKind {
  const text = `${article.title} ${article.summary ?? ''}`;
  if (article.sourceId === 'fda-medwatch') return 'drug-safety';
  if (article.sourceId === 'niddk-news' || containsAny(text, researchTerms)) return 'research';
  if (containsAny(text, alertTerms)) return 'public-health-alert';
  if (containsAny(text, guidanceTerms)) return 'guidance';
  return 'medical-news';
}

export function sanitizeHealthEditorialText(value: string, fallback: string): string {
  const compact = value.replace(/\s+/gu, ' ').trim();
  if (
    !compact
    || dosagePattern.test(compact)
    || treatmentDirectivePattern.test(compact)
    || personalizedDiagnosisPattern.test(compact)
    || prescriptionPattern.test(compact)
    || certaintyEscalationPattern.test(compact)
  ) {
    return fallback;
  }
  return compact;
}
