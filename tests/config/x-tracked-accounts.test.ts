import { describe, expect, it } from 'vitest';
import {
  buildXTrackedAccountsQuery,
  parseXTrackedAccounts,
} from '../../src/config/x-tracked-accounts';

describe('X tracked accounts config', () => {
  it('normalizes handles and removes duplicates case-insensitively', () => {
    expect(parseXTrackedAccounts(' @OpenAI,AnthropicAI, openai ,thsottiaux ')).toEqual([
      'OpenAI',
      'AnthropicAI',
      'thsottiaux',
    ]);
  });

  it('builds one Recent Search query for original posts from every account', () => {
    expect(buildXTrackedAccountsQuery(['OpenAI', 'thsottiaux'])).toBe(
      '(from:OpenAI OR from:thsottiaux) -is:retweet -is:reply',
    );
  });

  it('rejects invalid account handles', () => {
    expect(() => parseXTrackedAccounts('OpenAI,bad-handle')).toThrow(
      'X_TRACKED_ACCOUNTS contains an invalid handle',
    );
  });

  it('rejects an empty tracked account list', () => {
    expect(() => buildXTrackedAccountsQuery([])).toThrow(
      'X_TRACKED_ACCOUNTS must contain at least one handle',
    );
  });

  it('rejects a Recent Search query longer than the self-serve limit', () => {
    const accounts = Array.from({ length: 30 }, (_, index) => `account_${index}`);

    expect(() => buildXTrackedAccountsQuery(accounts)).toThrow(
      'X tracked accounts query exceeds 512 characters',
    );
  });
});
