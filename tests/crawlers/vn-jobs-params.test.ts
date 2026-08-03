import { describe, expect, it } from 'vitest';
import { parseJobSendParams } from '../../src/crawlers/vn-jobs/params';

describe('parseJobSendParams', () => {
  it('accepts required role without experienceYears', () => {
    expect(parseJobSendParams({ role: 'devops' })).toEqual({ role: 'devops' });
  });

  it('accepts english-teacher with experienceYears', () => {
    expect(parseJobSendParams({ role: 'english-teacher', experienceYears: '1-2' })).toEqual({
      role: 'english-teacher',
      experienceYears: '1-2',
    });
  });

  it('rejects missing role', () => {
    expect(() => parseJobSendParams({})).toThrow(/Invalid role/);
  });

  it('rejects unknown role', () => {
    expect(() => parseJobSendParams({ role: 'backend' })).toThrow(/Invalid role/);
  });

  it('rejects unknown experienceYears', () => {
    expect(() => parseJobSendParams({ role: 'devops', experienceYears: '10+' })).toThrow(
      /Invalid experienceYears/,
    );
  });
});
