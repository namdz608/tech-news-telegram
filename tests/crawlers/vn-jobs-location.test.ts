import { describe, expect, it } from 'vitest';
import { matchesLocation } from '../../src/crawlers/vn-jobs/location';
import type { VnJobListing } from '../../src/crawlers/vn-jobs/types';

function job(location?: string): VnJobListing {
  return {
    title: 'Giáo viên tiếng Anh',
    url: 'https://example.com/job',
    location,
    sourceId: 'vietnamworks',
    sourceName: 'VietnamWorks',
  };
}

describe('matchesLocation', () => {
  it('keeps Hanoi jobs by default', () => {
    expect(matchesLocation(job('Hà Nội'))).toBe(true);
    expect(matchesLocation(job('Ha Noi, Gia Lam'))).toBe(true);
    expect(matchesLocation(job('Hanoi'))).toBe(true);
  });

  it('drops other cities and missing location by default', () => {
    expect(matchesLocation(job('Hồ Chí Minh'))).toBe(false);
    expect(matchesLocation(job('Da Nang'))).toBe(false);
    expect(matchesLocation(job(undefined))).toBe(false);
  });

  it('keeps all cities when filter is all', () => {
    expect(matchesLocation(job('Hồ Chí Minh'), 'all')).toBe(true);
    expect(matchesLocation(job(undefined), 'all')).toBe(true);
  });
});
