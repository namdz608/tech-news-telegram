import { describe, expect, it } from 'vitest';
import { matchesExperience, parseExperienceBucket } from '../../src/crawlers/vn-jobs/experience';

describe('parseExperienceBucket', () => {
  it('maps fresher / no experience to 0', () => {
    expect(parseExperienceBucket('Fresher')).toBe('0');
    expect(parseExperienceBucket('Không yêu cầu kinh nghiệm')).toBe('0');
  });

  it('maps 1-2 year ranges', () => {
    expect(parseExperienceBucket('1-2 năm')).toBe('1-2');
    expect(parseExperienceBucket('Junior')).toBe('1-2');
  });

  it('maps 2-5 ranges', () => {
    expect(parseExperienceBucket('2-5 năm')).toBe('2-5');
  });

  it('maps 3-5 ranges and leaves vague VietnamWorks levels unparsed', () => {
    expect(parseExperienceBucket('3-5 years')).toBe('3-5');
    expect(parseExperienceBucket('Experienced (non-manager)')).toBeUndefined();
  });

  it('maps 5+', () => {
    expect(parseExperienceBucket('5+ years')).toBe('5+');
  });

  it('returns undefined when unknown', () => {
    expect(parseExperienceBucket('Competitive package')).toBeUndefined();
  });
});

describe('matchesExperience', () => {
  it('keeps jobs with missing experience text', () => {
    expect(matchesExperience(undefined, '1-2')).toBe(true);
    expect(matchesExperience('', '3-5')).toBe(true);
  });

  it('filters when bucket does not match', () => {
    expect(matchesExperience('Fresher', '3-5')).toBe(false);
    expect(matchesExperience('1-2 năm', '1-2')).toBe(true);
  });

  it('keeps vague Experienced level for any experienceYears filter', () => {
    expect(matchesExperience('Experienced (non-manager)', '1-2')).toBe(true);
  });

  it('treats 2-5 filter as covering 1-2 and 3-5 buckets', () => {
    expect(matchesExperience('1-2 năm', '2-5')).toBe(true);
    expect(matchesExperience('3-5 years', '2-5')).toBe(true);
    expect(matchesExperience('2-5 năm', '2-5')).toBe(true);
    expect(matchesExperience('Fresher', '2-5')).toBe(false);
    expect(matchesExperience('5+ years', '2-5')).toBe(false);
  });
});
