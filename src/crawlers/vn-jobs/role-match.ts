/**
 * Lọc job sau crawl để chỉ giữ tin khớp đúng role yêu cầu.
 */
import type { JobRole, VnJobListing } from './types';

const ENGLISH_TEACHER_PATTERNS = [
  /giáo\s*viên/,
  /tro\s*giang|trợ\s*giảng/,
  /english\s*teacher/,
  /teaching\s*assistant/,
  /\bta\b.*english|english.*\bta\b/,
  /teacher.*english|english.*teacher/,
  /mầm\s*non/,
  /tiểu\s*học/,
  /\bkindergarten\b/,
  /\bpreschool\b/,
  /primary\s*(school\s*)?(english|teacher)/,
];

const ENGLISH_TEACHER_NEGATIVE = [
  /\bqa\b/,
  /\bqc\b/,
  /tester/,
  /kiểm\s*tra\s*thủ\s*công/,
  /kiểm\s*thử/,
  /\bdevops\b/,
  /\bdeveloper\b/,
  /\bengineer\b/,
  /\bbackend\b/,
  /\bfrontend\b/,
];

const DEVOPS_PATTERNS = [
  /\bdevops\b/,
  /\bsre\b/,
  /site\s*reliability/,
  /platform\s*engineer/,
  /platform\s*engineering/,
  /\bci\s*\/?\s*cd\b/,
  /infrastructure\s*engineer/,
  /cloud\s*engineer/,
  /mlops/,
];

function searchableText(job: VnJobListing): string {
  return [job.title, job.summary, job.experienceText].filter(Boolean).join(' ').toLowerCase().normalize('NFC');
}

/**
 * Job phải khớp keyword role; thiếu tín hiệu hoặc lệch ngành → loại.
 */
export function matchesRole(job: VnJobListing, role: JobRole): boolean {
  const text = searchableText(job);

  if (!text.trim()) {
    return false;
  }

  if (role === 'english-teacher') {
    if (ENGLISH_TEACHER_NEGATIVE.some((pattern) => pattern.test(text))) {
      return false;
    }

    return ENGLISH_TEACHER_PATTERNS.some((pattern) => pattern.test(text));
  }

  return DEVOPS_PATTERNS.some((pattern) => pattern.test(text));
}
