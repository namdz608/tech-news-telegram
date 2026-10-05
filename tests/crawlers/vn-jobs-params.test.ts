import { describe, expect, it } from 'vitest';
import { parseJobSendParams } from '../../src/crawlers/vn-jobs/params';

describe('parseJobSendParams', () => {
  it('accepts required role without experienceYears and defaults limit', () => {
    expect(parseJobSendParams({ role: 'devops' })).toEqual({
      role: 'devops',
      limit: 10,
      channel: 'email',
    });
  });

  it('accepts english-teacher with experienceYears', () => {
    expect(parseJobSendParams({ role: 'english-teacher', experienceYears: '1-2' })).toEqual({
      role: 'english-teacher',
      experienceYears: '1-2',
      limit: 50,
      channel: 'email',
    });
  });

  it('rejects missing role', () => {
    expect(() => parseJobSendParams({})).toThrow(/Invalid role/);
  });

  it('rejects unknown role', () => {
    expect(() => parseJobSendParams({ role: 'backend' })).toThrow(/Invalid role/);
  });

  it('accepts 2-5 experienceYears', () => {
    expect(parseJobSendParams({ role: 'devops', experienceYears: '2-5' })).toEqual({
      role: 'devops',
      experienceYears: '2-5',
      limit: 10,
      channel: 'email',
    });
  });

  it('rejects unknown experienceYears', () => {
    expect(() => parseJobSendParams({ role: 'devops', experienceYears: '10+' })).toThrow(
      /Invalid experienceYears/,
    );
  });

  it('accepts limit override', () => {
    expect(parseJobSendParams({ role: 'devops', limit: '100' })).toEqual({
      role: 'devops',
      limit: 100,
      channel: 'email',
    });
  });

  it('rejects invalid limit', () => {
    expect(() => parseJobSendParams({ role: 'devops', limit: '0' })).toThrow(/Invalid limit/);
    expect(() => parseJobSendParams({ role: 'devops', limit: '101' })).toThrow(/Invalid limit/);
    expect(() => parseJobSendParams({ role: 'devops', limit: 'abc' })).toThrow(/Invalid limit/);
  });

  it('defaults channel to email and accepts telegram or both', () => {
    expect(parseJobSendParams({ role: 'devops', channel: 'telegram' }).channel).toBe('telegram');
    expect(parseJobSendParams({ role: 'devops', channel: 'both' }).channel).toBe('both');
  });

  it('rejects an unknown channel', () => {
    expect(() => parseJobSendParams({ role: 'devops', channel: 'slack' })).toThrow(/Invalid channel/);
  });
});
