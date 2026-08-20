import { compactText } from '../utils/text';
import type { PoliticsCandidate } from '../types/gold-politics';

interface PoliticsEditorial {
  title: string;
  summary: string;
  whyImportant: string;
}

const TITLE_BOUND = 240;
const SUMMARY_BOUND = 720;
const WHY_BOUND = 360;
const CLAIM_BOUND = 280;

const CERTAINTY = /chắc chắn|đã xác nhận|được xác nhận|ĐÃ XÁC NHẬN|definitely|proven|confirms that|kết luận chính thức/iu;
const GUILTY = /phạm tội|có tội|tội phạm|đã thực hiện|convicted|guilty|thú nhận|admitted guilt/giu;
const MOTIVE = /vì muốn|động cơ|in order to|because he wanted/iu;
const NEGATION = /\bnot\b|không|chưa|phủ nhận|did not|was not|do not|does not/iu;
const LIMITATION = /chưa đầy đủ|chưa truy cập|không đầy đủ|giới hạn/iu;
const CONFLICT = /mâu thuẫn|xung đột|phủ nhận|conflicting/iu;
const INSTRUCTION_FOLLOWED =
  /ignore previous instructions.{0,40}(?:tuân theo|followed|obeyed)|(?:tuân theo|followed).{0,40}ignore previous instructions/iu;
const NUMBER = /\d+(?:[.,]\d+)?/gu;
const PROPER_NAME = /\b[A-Z][a-z]+(?:\s+[A-Z][a-zA-Z]+)+\b/g;
const ESTABLISHED_FINDING =
  /sự thật đã được xác lập|đã được xác lập|là sự thật|kết luận đã được xác lập|không còn là cáo buộc|established finding|established fact/iu;
const COMPLETED_ACT = /đã (?!được đưa tin|được kiểm chứng)\p{L}+|committed|carried out/iu;
const ALLEGATION_MODALITY =
  /bị cáo buộc|cáo buộc|allegedly|\balleged\b|đang được đưa tin/iu;

export function truncateUtf16(value: string, max: number): string {
  if (max <= 0) return '';
  if (value.length <= max) return value;
  let end = max;
  const last = value.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return value.slice(0, end);
}

export function actorLabel(candidate: PoliticsCandidate): string {
  const name = compactText(
    candidate.originAttribution.account
      || candidate.originalAccount
      || candidate.originalAuthor
      || candidate.author
      || '',
  );
  return name ? `Tài khoản ${name}` : 'Tài khoản chưa xác định';
}

function boundClaim(candidate: PoliticsCandidate, max = CLAIM_BOUND): string {
  return truncateUtf16(compactText(candidate.title || candidate.summary || ''), max);
}

export function createUnverifiedEditorial(candidate: PoliticsCandidate): PoliticsEditorial {
  const actor = actorLabel(candidate);
  const attributed = `${actor} cho rằng ${boundClaim(candidate)}`;
  return {
    title: truncateUtf16(attributed, TITLE_BOUND),
    summary: truncateUtf16(
      `${attributed}. Đây là thông tin chưa được kiểm chứng, không phải kết luận sự thật.`,
      SUMMARY_BOUND,
    ),
    whyImportant: truncateUtf16(
      `${actor} cho rằng đây là thông tin chưa được kiểm chứng, không phải kết luận sự thật.`,
      WHY_BOUND,
    ),
  };
}

export function createProviderFallbackEditorial(candidate: PoliticsCandidate): PoliticsEditorial {
  if (candidate.verificationState === 'unverified') {
    return createUnverifiedEditorial(candidate);
  }
  const actor = actorLabel(candidate);
  const attributed = `Theo ${compactText(candidate.sourceName)}, ${actor} cho rằng ${boundClaim(candidate)}`;
  const summaryParts = [
    attributed,
    compactText(candidate.summary ?? ''),
    candidate.conflictNote ? compactText(candidate.conflictNote) : '',
  ].filter(Boolean);
  const whyBody = compactText(candidate.corroborationNote)
    || 'sự việc đang được đưa tin, chưa phải kết luận cuối.';
  return {
    title: truncateUtf16(attributed, TITLE_BOUND),
    summary: truncateUtf16(summaryParts.join(' '), SUMMARY_BOUND),
    whyImportant: truncateUtf16(
      `Theo ${compactText(candidate.sourceName)}, ${actor} cho rằng ${whyBody}`,
      WHY_BOUND,
    ),
  };
}

export function createTranslationFallbackEditorial(candidate: PoliticsCandidate): PoliticsEditorial {
  const actor = actorLabel(candidate);
  const originalTitle = truncateUtf16(compactText(candidate.title), CLAIM_BOUND);
  const originalSummary = truncateUtf16(compactText(candidate.summary ?? candidate.title), SUMMARY_BOUND - 80);
  return {
    title: truncateUtf16(`Chưa dịch được tiêu đề. ${actor} cho rằng: ${originalTitle}`, TITLE_BOUND),
    summary: truncateUtf16(
      `Chưa có bản dịch tiếng Việt đã xác minh. ${actor} cho rằng: ${originalSummary}`,
      SUMMARY_BOUND,
    ),
    whyImportant: truncateUtf16(
      `Theo ${compactText(candidate.sourceName)}, ${actor} cho rằng nội dung gốc chưa dịch được; sự việc đang được đưa tin, chưa phải kết luận cuối; không bịa bản dịch.`,
      WHY_BOUND,
    ),
  };
}

function sourceCorpus(candidate: PoliticsCandidate): string {
  return [
    candidate.title,
    candidate.summary ?? '',
    candidate.sourceName,
    candidate.author ?? '',
    candidate.originalAuthor ?? '',
    candidate.originalAccount ?? '',
    candidate.originAttribution.account ?? '',
    candidate.corroborationNote,
    candidate.conflictNote ?? '',
    candidate.semanticClaimKey,
    candidate.claimEntities.join(' '),
    ...candidate.evidenceAssertions.map((assertion) => assertion.claimText),
  ].join('\n');
}

function normalize(value: string): string {
  return value.normalize('NFC').toLowerCase().replace(/-/g, ' ');
}

function numbersIn(value: string): string[] {
  return value.match(NUMBER) ?? [];
}

function inventedNumbers(field: string, corpus: string): boolean {
  const allowed = new Set(numbersIn(corpus));
  return numbersIn(field).some((value) => !allowed.has(value));
}

const NAME_STOP = new Set(['theo', 'according', 'reported', 'nguon', 'nguồn', 'tai', 'khoan']);

function inventedNames(field: string, corpus: string): boolean {
  const normalizedCorpus = normalize(corpus);
  return (field.match(PROPER_NAME) ?? []).some((name) => {
    if (normalizedCorpus.includes(normalize(name))) return false;
    const parts = normalize(name).split(/\s+/).filter((part) => part.length > 1 && !NAME_STOP.has(part));
    return parts.some((part) => !normalizedCorpus.includes(part));
  });
}

function inventedQuotes(field: string, corpus: string): boolean {
  const normalizedCorpus = normalize(corpus);
  return [...field.matchAll(/"([^"]+)"/g)].some((match) => !normalizedCorpus.includes(normalize(match[1] ?? '')));
}

function matchingAssertionEffect(candidate: PoliticsCandidate): string {
  const match = candidate.evidenceAssertions.find(
    (assertion) => assertion.semanticClaimKey === candidate.semanticClaimKey,
  );
  return match?.effect ?? candidate.evidentiaryEffect;
}

function needsAllegationFrame(candidate: PoliticsCandidate): boolean {
  return candidate.verificationState === 'reported'
    || candidate.verificationState === 'unverified'
    || candidate.claimModality === 'alleged'
    || candidate.evidentiaryEffect === 'records-claim'
    || matchingAssertionEffect(candidate) === 'records-claim';
}

function claimantNames(candidate: PoliticsCandidate): string[] {
  return [...new Set([
    compactText(candidate.sourceName),
    compactText(candidate.originAttribution.account || ''),
    compactText(candidate.originalAccount || ''),
    compactText(candidate.originalAuthor || ''),
    compactText(candidate.author || ''),
  ].filter(Boolean))];
}

function hasClaimantAttribution(field: string, candidate: PoliticsCandidate): boolean {
  const text = compactText(field);
  return claimantNames(candidate).some((name) => {
    const quoted = escapeRegExp(name);
    return new RegExp(`tài khoản\\s+${quoted}\\b`, 'iu').test(text)
      || new RegExp(`(?:^|\\s)theo\\s+${quoted}\\b`, 'iu').test(text)
      || new RegExp(`(?:according to|reported by)\\s+${quoted}\\b`, 'iu').test(text)
      || new RegExp(`${quoted}\\s+reported\\b`, 'iu').test(text)
      || new RegExp(`${quoted}.{0,48}(?:cho rằng|cáo buộc|reported|ghi nhận)`, 'iu').test(text);
  });
}

function hasAllegationModality(field: string, candidate: PoliticsCandidate): boolean {
  if (ALLEGATION_MODALITY.test(field)) return true;
  return hasClaimantAttribution(field, candidate) && /cho rằng/iu.test(field);
}

function restatedAllegationAsFact(field: string, candidate: PoliticsCandidate): boolean {
  if (candidate.verificationState === 'confirmed' && candidate.claimModality === 'established') {
    return false;
  }
  if (ESTABLISHED_FINDING.test(field) || COMPLETED_ACT.test(field)) return true;
  if (!needsAllegationFrame(candidate)) return false;
  return /đã thực hiện/iu.test(field) && !hasAllegationModality(field, candidate);
}

function lostRecordsClaim(field: string, candidate: PoliticsCandidate): boolean {
  const effect = matchingAssertionEffect(candidate);
  if (effect !== 'records-claim' && candidate.evidentiaryEffect !== 'records-claim') return false;
  if (candidate.verificationState === 'confirmed') return false;
  return ESTABLISHED_FINDING.test(field) || COMPLETED_ACT.test(field);
}

function lostReportedFraming(field: string, candidate: PoliticsCandidate): boolean {
  if (!needsAllegationFrame(candidate)) return false;
  return !hasClaimantAttribution(field, candidate) || !hasAllegationModality(field, candidate);
}

function swappedRoles(field: string, candidate: PoliticsCandidate): boolean {
  const claimant = normalize(
    candidate.originAttribution.account || candidate.originalAccount || '',
  );
  const subject = normalize(candidate.claimEntities[0] ?? '');
  if (!claimant || !subject) return false;
  const text = normalize(field);
  const swap = new RegExp(
    `${escapeRegExp(subject)}.{0,48}(?:buộc tội|cáo buộc|accused).{0,48}${escapeRegExp(claimant)}`,
    'iu',
  );
  return swap.test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lostNegation(field: string, candidate: PoliticsCandidate, corpus: string): boolean {
  if (candidate.claimStance !== 'denies' && !NEGATION.test(corpus)) return false;
  if (candidate.claimStance === 'denies') return !NEGATION.test(field);
  return false;
}

function hasUnguardedGuiltyLanguage(field: string): boolean {
  for (const match of field.matchAll(GUILTY)) {
    const start = match.index ?? 0;
    const before = field.slice(Math.max(0, start - 48), start);
    if (/(?:không phải|chưa)(?:\s+\S+){0,4}\s*$/iu.test(before)) continue;
    if (/\b(?:not|no)\b(?:\s+\S+){0,4}\s*$/iu.test(before)) continue;
    return true;
  }
  return false;
}

function isFieldSafe(
  candidate: PoliticsCandidate,
  field: string,
  _role: 'title' | 'summary' | 'whyImportant',
  corpus: string,
): boolean {
  const compact = compactText(field);
  if (!compact) return false;
  if (INSTRUCTION_FOLLOWED.test(compact)) return false;
  if (inventedNumbers(compact, corpus) || inventedNames(compact, corpus) || inventedQuotes(compact, corpus)) {
    return false;
  }
  if (MOTIVE.test(compact) || hasUnguardedGuiltyLanguage(compact) || restatedAllegationAsFact(compact, candidate)) {
    return false;
  }
  if (candidate.verificationState !== 'confirmed' && CERTAINTY.test(compact)) return false;
  if (swappedRoles(compact, candidate)) return false;
  if (lostNegation(compact, candidate, corpus)) return false;
  if (lostReportedFraming(compact, candidate)) return false;
  if (lostRecordsClaim(compact, candidate)) return false;
  return true;
}

function chooseSafeField(
  candidate: PoliticsCandidate,
  generated: string,
  fallback: string,
  role: 'title' | 'summary' | 'whyImportant',
  corpus: string,
): string {
  const compactGenerated = compactText(generated);
  if (isFieldSafe(candidate, compactGenerated, role, corpus)) return compactGenerated;
  const compactFallback = compactText(fallback);
  if (isFieldSafe(candidate, compactFallback, role, corpus)) return compactFallback;
  return compactFallback;
}

export class PoliticsEditorialValidator {
  validate(
    candidate: PoliticsCandidate,
    editorial: PoliticsEditorial,
    fallbackOverride?: PoliticsEditorial,
  ): PoliticsEditorial {
    const fallback = fallbackOverride ?? (candidate.verificationState === 'unverified'
      ? createUnverifiedEditorial(candidate)
      : createProviderFallbackEditorial(candidate));
    const corpus = sourceCorpus(candidate);
    const next: PoliticsEditorial = {
      title: chooseSafeField(candidate, editorial.title, fallback.title, 'title', corpus),
      summary: chooseSafeField(candidate, editorial.summary, fallback.summary, 'summary', corpus),
      whyImportant: chooseSafeField(
        candidate,
        editorial.whyImportant,
        fallback.whyImportant,
        'whyImportant',
        corpus,
      ),
    };

    if (candidate.sourceTextStatus === 'incomplete' && !LIMITATION.test(`${next.title} ${next.summary} ${next.whyImportant}`)) {
      next.whyImportant = truncateUtf16(`${next.whyImportant} Nội dung nguồn chưa đầy đủ.`.trim(), WHY_BOUND);
    }
    if (candidate.conflictNote && !CONFLICT.test(`${next.title} ${next.summary} ${next.whyImportant}`)) {
      next.summary = truncateUtf16(`${next.summary} ${compactText(candidate.conflictNote)}`.trim(), SUMMARY_BOUND);
    }
    return next;
  }
}
