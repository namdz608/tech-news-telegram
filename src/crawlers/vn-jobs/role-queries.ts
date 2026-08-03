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

/**
 * VietnamWorks không hiểu cú pháp OR; gọi lần lượt các query đơn giản rồi gộp.
 */
export function vietnamworksQueries(role: JobRole): string[] {
  if (role === 'devops') {
    return ['devops', 'sre', 'platform engineer'];
  }

  return ['giáo viên tiếng anh', 'english teacher', 'trợ giảng tiếng anh', 'IELTS teacher'];
}
