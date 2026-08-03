/**
 * Query / slug tìm kiếm theo role cho từng board.
 */
import type { JobRole } from './types';

export function itviecSearchUrl(role: JobRole): string | null {
  // ITviec là board IT; không dùng cho english-teacher để tránh JD lệch ngành.
  if (role === 'english-teacher') {
    return null;
  }

  return 'https://itviec.com/it-jobs/devops';
}

export function topcvSearchUrl(role: JobRole): string {
  const keyword =
    role === 'devops'
      ? 'devops'
      : 'giáo viên tiếng anh mầm non tiểu học trợ giảng';

  return `https://www.topcv.vn/viec-lam?keyword=${encodeURIComponent(keyword)}`;
}

export function vietnamworksQuery(role: JobRole): string {
  if (role === 'devops') {
    return 'devops';
  }

  return 'giáo viên tiếng anh OR trợ giảng tiếng anh OR english teacher kindergarten primary';
}
