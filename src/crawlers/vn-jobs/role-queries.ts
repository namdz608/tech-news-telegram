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

/**
 * TopCV SEO list pages render job cards in HTML (SPA `?keyword=` often does not).
 * Default to Hà Nội (`kl1`) to match product location filter.
 */
export function topcvSearchUrl(role: JobRole): string {
  if (role === 'devops') {
    return 'https://www.topcv.vn/tim-viec-lam-devops-tai-ha-noi-kl1';
  }

  return 'https://www.topcv.vn/tim-viec-lam-giao-vien-tieng-anh-tai-ha-noi-kl1';
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
