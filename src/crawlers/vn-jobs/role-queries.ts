/**
 * Query / slug tìm kiếm theo role cho từng board.
 */
import type { JobRole } from './types';

export function itviecSearchUrl(role: JobRole): string {
  if (role === 'devops') {
    return 'https://itviec.com/it-jobs/devops';
  }

  return 'https://itviec.com/it-jobs?q=' + encodeURIComponent('english teacher teaching assistant');
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
