const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const X_RECENT_SEARCH_QUERY_LIMIT = 512;

export function parseXTrackedAccounts(value: string): string[] {
  const seen = new Set<string>();

  return value
    .split(',')
    .map((account) => account.trim().replace(/^@/, ''))
    .filter((account) => {
      if (account && !X_HANDLE.test(account)) {
        throw new Error('X_TRACKED_ACCOUNTS contains an invalid handle');
      }

      const key = account.toLowerCase();
      if (!account || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

export function buildXTrackedAccountsQuery(accounts: string[]): string {
  if (accounts.length === 0) {
    throw new Error('X_TRACKED_ACCOUNTS must contain at least one handle');
  }

  const query = `(${accounts.map((account) => `from:${account}`).join(' OR ')}) -is:retweet -is:reply`;
  if (query.length > X_RECENT_SEARCH_QUERY_LIMIT) {
    throw new Error('X tracked accounts query exceeds 512 characters');
  }

  return query;
}
