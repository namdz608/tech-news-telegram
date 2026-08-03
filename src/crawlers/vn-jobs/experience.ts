/**
 * Lọc tin tuyển dụng theo bucket năm kinh nghiệm.
 */
import type { ExperienceYears } from './types';

/**
 * Khi không parse được mức kinh nghiệm từ text → giữ job (true).
 * Khi parse được → chỉ giữ nếu khớp bucket.
 */
export function matchesExperience(experienceText: string | undefined, bucket: ExperienceYears): boolean {
  const parsed = parseExperienceBucket(experienceText);

  if (!parsed) {
    return true;
  }

  return parsed === bucket;
}

/**
 * Suy ra bucket từ chuỗi kinh nghiệm / job level trên card.
 * Trả undefined khi không đủ tín hiệu.
 */
export function parseExperienceBucket(experienceText: string | undefined): ExperienceYears | undefined {
  if (!experienceText) {
    return undefined;
  }

  const text = experienceText.toLowerCase().normalize('NFC');

  if (
    /\bfresher\b/.test(text) ||
    /\bintern(ship)?\b/.test(text) ||
    /không yêu cầu/.test(text) ||
    /khong yeu cau/.test(text) ||
    /no experience/.test(text) ||
    /entry[- ]?level/.test(text) ||
    /dưới\s*1\s*năm/.test(text) ||
    /duoi\s*1\s*nam/.test(text) ||
    /under\s*1\s*year/.test(text) ||
    /0\s*[-–]\s*1\s*năm/.test(text) ||
    /0\s*[-–]\s*1\s*year/.test(text)
  ) {
    return '0';
  }

  if (/5\s*\+/.test(text) || /trên\s*5/.test(text) || /over\s*5/.test(text) || /more than\s*5/.test(text)) {
    return '5+';
  }

  if (
    /\b3\s*[-–]\s*5\b/.test(text) ||
    /\b3\s*đến\s*5\b/.test(text) ||
    /\b3\s*to\s*5\b/.test(text) ||
    /\b4\s*năm\b/.test(text) ||
    /\b4\s*years?\b/.test(text)
  ) {
    return '3-5';
  }

  if (
    /\b1\s*[-–]\s*2\b/.test(text) ||
    /\b1\s*đến\s*2\b/.test(text) ||
    /\b1\s*to\s*2\b/.test(text) ||
    /\b2\s*năm\b/.test(text) ||
    /\b2\s*years?\b/.test(text) ||
    /\b1\s*năm\b/.test(text) ||
    /\b1\s*year\b/.test(text) ||
    /\bjunior\b/.test(text)
  ) {
    return '1-2';
  }

  if (/\b3\s*năm\b/.test(text) || /\b3\s*years?\b/.test(text) || /\b5\s*năm\b/.test(text) || /\b5\s*years?\b/.test(text)) {
    if (/\b5\s*năm\b/.test(text) || /\b5\s*years?\b/.test(text)) {
      return '5+';
    }

    return '3-5';
  }

  // "Experienced (non-manager)" của VietnamWorks không phải số năm cụ thể → coi như không parse được.
  // Tránh khớp nhầm chữ "manager" trong "(non-manager)".
  if (/\bsenior\b/.test(text) || /\blead\b/.test(text) || (/\bmanager\b/.test(text) && !/non[\s-]*manager/.test(text))) {
    return '5+';
  }

  return undefined;
}
