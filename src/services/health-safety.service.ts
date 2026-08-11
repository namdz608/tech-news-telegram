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
const treatmentDirectivePattern = /(?:uống|dùng|bắt đầu|ngừng|bỏ|đổi|thay|điều chỉnh|chỉnh|tăng|giảm|take|start|stop|switch|change|adjust|increase|decrease).{0,40}(?:thuốc|medicine|medication|drug|dose|liều|viên|điều trị|treatment|therapy)/iu;
const reversedTreatmentDirectivePattern = /(?:thuốc|medicine|medication|drug|dose|liều|viên|điều trị|treatment|therapy).{0,40}(?:uống|dùng|bắt đầu|ngừng|bỏ|đổi|thay|điều chỉnh|chỉnh|tăng|giảm|take|start|stop|switch|change|adjust|increase|decrease)/iu;
const selfMedicationPattern = /(?:tự điều trị|tự dùng thuốc|tự uống thuốc|self[- ]?medicat)/iu;
const rapidWeightLossPattern = /(?:giảm|lose)\s+\d+\s*(?:kg|kilograms?).{0,20}(?:ngày|days?|tuần|weeks?)/iu;
const personalizedDiagnosisPattern = /(?:bạn|you).{0,30}(?:bị|mắc|have|has|được chẩn đoán|diagnosed)/iu;
const prescriptionPattern = /(?:kê đơn|toa thuốc|prescribe|prescription|điều trị dành cho bạn|your treatment)/iu;
const certaintyEscalationPattern = /(?:chắc chắn|chứng minh|proves?|definitely|guarantees?).{0,50}(?:gây|causes?|cures?|khỏi bệnh)/iu;
const causalClaimPattern = /(?:gây|dẫn đến|giảm nguy cơ|tăng nguy cơ|causes?|leads? to|reduces? risk|increases? risk|chữa khỏi|cures?)/iu;
const uncertaintyPattern = /(?:có thể|liên quan|mối liên hệ|may|might|could|associated|linked|suggests?|potentially|preliminary|sơ bộ)/iu;

const containsAny = (text: string, terms: string[]) =>
  terms.some((term) => matchesCuratedKeyword(text, term));

export function isSafeHealthArticle(article: Article): boolean {
  const text = `${article.title} ${article.summary ?? ''}`;
  const isOfficialAlert = article.sourceId === 'fda-medwatch';
  const hasTreatmentDirective = treatmentDirectivePattern.test(text)
    || reversedTreatmentDirectivePattern.test(text);
  if (selfMedicationPattern.test(text)) return false;
  if (dosagePattern.test(article.title) && !isOfficialAlert) return false;
  if (dosagePattern.test(text) && hasTreatmentDirective) return false;
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

export function sanitizeHealthEditorialText(
  value: string,
  fallback: string,
  sourceText = '',
): string {
  const compact = value.replace(/\s+/gu, ' ').trim();
  const sourceIsUncertain = uncertaintyPattern.test(sourceText);
  if (
    !compact
    || dosagePattern.test(compact)
    || treatmentDirectivePattern.test(compact)
    || reversedTreatmentDirectivePattern.test(compact)
    || selfMedicationPattern.test(compact)
    || personalizedDiagnosisPattern.test(compact)
    || prescriptionPattern.test(compact)
    || certaintyEscalationPattern.test(compact)
    || (causalClaimPattern.test(compact) && !uncertaintyPattern.test(compact))
    || (sourceIsUncertain && !uncertaintyPattern.test(compact))
  ) {
    return fallback;
  }
  return compact;
}
