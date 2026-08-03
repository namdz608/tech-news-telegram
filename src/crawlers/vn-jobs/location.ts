/**
 * Lọc địa điểm làm việc. Mặc định chỉ giữ Hà Nội.
 */
import type { JobLocation, VnJobListing } from './types';

const HANOI_PATTERNS = [
  /hà\s*nội/,
  /ha\s*noi/,
  /\bhanoi\b/,
];

/**
 * Khi `locationFilter === 'all'` thì luôn giữ.
 * Mặc định `hanoi`: chỉ giữ job có địa điểm khớp Hà Nội.
 */
export function matchesLocation(job: VnJobListing, locationFilter: JobLocation = 'hanoi'): boolean {
  if (locationFilter === 'all') {
    return true;
  }

  const text = (job.location ?? '').toLowerCase().normalize('NFC');

  if (!text.trim()) {
    return false;
  }

  return HANOI_PATTERNS.some((pattern) => pattern.test(text));
}
