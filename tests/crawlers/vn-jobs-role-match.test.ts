import { describe, expect, it } from 'vitest';
import { matchesRole } from '../../src/crawlers/vn-jobs/role-match';
import type { VnJobListing } from '../../src/crawlers/vn-jobs/types';

function job(title: string, extras: Partial<VnJobListing> = {}): VnJobListing {
  return {
    title,
    url: 'https://example.com/job',
    sourceId: 'itviec',
    sourceName: 'ITviec',
    ...extras,
  };
}

describe('matchesRole', () => {
  it('rejects IT QA jobs for english-teacher', () => {
    expect(matchesRole(job('Máy kiểm tra thủ công (QA QC)'), 'english-teacher')).toBe(false);
    expect(matchesRole(job('Manual Tester'), 'english-teacher')).toBe(false);
  });

  it('keeps english teacher titles', () => {
    expect(matchesRole(job('Giáo viên tiếng Anh mầm non'), 'english-teacher')).toBe(true);
    expect(matchesRole(job('English Teacher - Primary'), 'english-teacher')).toBe(true);
    expect(matchesRole(job('Trợ giảng tiếng Anh'), 'english-teacher')).toBe(true);
  });

  it('keeps devops titles and rejects unrelated ones', () => {
    expect(matchesRole(job('Mid/Sr DevOps Engineer'), 'devops')).toBe(true);
    expect(matchesRole(job('Platform Engineer'), 'devops')).toBe(true);
    expect(matchesRole(job('Manual QA Tester'), 'devops')).toBe(false);
  });
});
