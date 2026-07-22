# Reddit DNS Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore every Reddit-owned HTTP request on the CMC-hosted VPS by falling back from poisoned `reddit.com` DNS answers to the reachable regional Fastly aliases.

**Architecture:** Add one focused utility that wraps Node's normal lookup and retries recognized Reddit hostname families through their Fastly alias only after `ENOTFOUND`. Reuse a single HTTPS agent configured with that lookup in the RSS parser, RSS article-image client, and Telegram image downloader, preserving original HTTP hostnames and TLS SNI.

**Tech Stack:** TypeScript 6, Node.js `dns`/`https`, rss-parser 3.13, Axios 1.17, Vitest 4

---

## File Structure

- Create `src/utils/reddit-dns.ts`: Reddit hostname classification, conditional DNS fallback, and shared HTTPS agent.
- Create `tests/utils/reddit-dns.test.ts`: unit coverage for normal lookup, aliases, errors, and callback shapes.
- Modify `src/crawlers/rss.crawler.ts`: attach the shared agent to the default RSS parser and Axios client.
- Modify `tests/crawlers/rss.crawler.test.ts`: verify default RSS HTTP clients use the agent without disturbing injected doubles.
- Modify `src/services/telegram.service.ts`: attach the shared agent to the default Telegram image downloader.
- Modify `tests/services/telegram.service.test.ts`: verify the default downloader uses the agent without disturbing injected doubles.

The workspace has no `.git` directory. Commit commands are intentionally replaced by explicit checkpoints; do not initialize a repository as part of this task.

### Task 1: Reddit-aware DNS utility

**Files:**
- Create: `tests/utils/reddit-dns.test.ts`
- Create: `src/utils/reddit-dns.ts`

- [ ] **Step 1: Write the failing utility tests**

Create `tests/utils/reddit-dns.test.ts`:

```typescript
import type { LookupAddress, LookupOptions } from 'node:dns';
import type { LookupFunction } from 'node:net';
import { describe, expect, it } from 'vitest';
import { createRedditAwareLookup } from '../../src/utils/reddit-dns';

interface LookupResult {
  address: string | LookupAddress[];
  family?: number;
}

describe('createRedditAwareLookup', () => {
  it('returns a successful normal lookup without resolving an alias', async () => {
    const requestedHosts: string[] = [];
    const systemLookup: LookupFunction = (hostname, _options, callback) => {
      requestedHosts.push(hostname);
      callback(null, '203.0.113.10', 4);
    };

    const result = await lookup(createRedditAwareLookup(systemLookup), 'example.com');

    expect(result).toEqual({ address: '203.0.113.10', family: 4 });
    expect(requestedHosts).toEqual(['example.com']);
  });

  it.each([
    ['reddit.com', 'reddit.map.fastly.net'],
    ['www.reddit.com', 'reddit.map.fastly.net'],
    ['OLD.REDDIT.COM.', 'reddit.map.fastly.net'],
    ['redd.it', 'dualstack.reddit.map.fastly.net'],
    ['preview.redd.it', 'dualstack.reddit.map.fastly.net'],
    ['redditstatic.com', 'dualstack.reddit.map.fastly.net'],
    ['www.redditstatic.com', 'dualstack.reddit.map.fastly.net'],
  ])('falls back from %s to %s after ENOTFOUND', async (hostname, expectedAlias) => {
    const requestedHosts: string[] = [];
    const systemLookup: LookupFunction = (requestedHost, _options, callback) => {
      requestedHosts.push(requestedHost);

      if (requestedHost === hostname) {
        callback(createDnsError('ENOTFOUND'), '', 0);
        return;
      }

      callback(null, '151.101.77.140', 4);
    };

    const result = await lookup(createRedditAwareLookup(systemLookup), hostname);

    expect(result).toEqual({ address: '151.101.77.140', family: 4 });
    expect(requestedHosts).toEqual([hostname, expectedAlias]);
  });

  it('does not fall back for a non-Reddit hostname', async () => {
    const requestedHosts: string[] = [];
    const systemLookup: LookupFunction = (hostname, _options, callback) => {
      requestedHosts.push(hostname);
      callback(createDnsError('ENOTFOUND'), '', 0);
    };

    await expect(lookup(createRedditAwareLookup(systemLookup), 'example.com')).rejects.toMatchObject({
      code: 'ENOTFOUND',
    });
    expect(requestedHosts).toEqual(['example.com']);
  });

  it('does not disguise DNS errors other than ENOTFOUND', async () => {
    const requestedHosts: string[] = [];
    const systemLookup: LookupFunction = (hostname, _options, callback) => {
      requestedHosts.push(hostname);
      callback(createDnsError('EAI_AGAIN'), '', 0);
    };

    await expect(lookup(createRedditAwareLookup(systemLookup), 'www.reddit.com')).rejects.toMatchObject({
      code: 'EAI_AGAIN',
    });
    expect(requestedHosts).toEqual(['www.reddit.com']);
  });

  it('propagates an error from the Fastly alias lookup', async () => {
    const requestedHosts: string[] = [];
    const systemLookup: LookupFunction = (hostname, _options, callback) => {
      requestedHosts.push(hostname);
      const code = hostname === 'www.reddit.com' ? 'ENOTFOUND' : 'EAI_AGAIN';
      callback(createDnsError(code), '', 0);
    };

    await expect(lookup(createRedditAwareLookup(systemLookup), 'www.reddit.com')).rejects.toMatchObject({
      code: 'EAI_AGAIN',
    });
    expect(requestedHosts).toEqual(['www.reddit.com', 'reddit.map.fastly.net']);
  });

  it('preserves all-address lookup results from the alias', async () => {
    const addresses: LookupAddress[] = [
      { address: '151.101.77.140', family: 4 },
      { address: '2a04:4e42:12::396', family: 6 },
    ];
    const systemLookup: LookupFunction = (hostname, _options, callback) => {
      if (hostname === 'www.reddit.com') {
        callback(createDnsError('ENOTFOUND'), [], undefined);
        return;
      }

      callback(null, addresses, undefined);
    };

    const result = await lookup(createRedditAwareLookup(systemLookup), 'www.reddit.com', { all: true });

    expect(result).toEqual({ address: addresses, family: undefined });
  });
});

function lookup(lookupFunction: LookupFunction, hostname: string, options: LookupOptions = {}): Promise<LookupResult> {
  return new Promise((resolve, reject) => {
    lookupFunction(hostname, options, (error, address, family) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ address, family });
    });
  });
}

function createDnsError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}
```

- [ ] **Step 2: Run the utility test and verify RED**

Run:

```bash
npm test -- tests/utils/reddit-dns.test.ts
```

Expected: FAIL because `../../src/utils/reddit-dns` does not exist.

- [ ] **Step 3: Implement the minimal Reddit-aware lookup and agent**

Create `src/utils/reddit-dns.ts`:

```typescript
import { lookup as nodeLookup } from 'node:dns';
import { Agent } from 'node:https';
import type { LookupFunction } from 'node:net';

const redditFastlyAlias = 'reddit.map.fastly.net';
const redditDualstackFastlyAlias = 'dualstack.reddit.map.fastly.net';
const systemLookup = nodeLookup as LookupFunction;

export function createRedditAwareLookup(baseLookup: LookupFunction = systemLookup): LookupFunction {
  return (hostname, options, callback) => {
    baseLookup(hostname, options, (error, address, family) => {
      if (!error) {
        callback(null, address, family);
        return;
      }

      const fallbackAlias = error.code === 'ENOTFOUND' ? getRedditFallbackAlias(hostname) : undefined;

      if (!fallbackAlias) {
        callback(error, address, family);
        return;
      }

      baseLookup(fallbackAlias, options, callback);
    });
  };
}

export function createRedditHttpsAgent(baseLookup: LookupFunction = systemLookup): Agent {
  return new Agent({ lookup: createRedditAwareLookup(baseLookup) });
}

export const redditHttpsAgent = createRedditHttpsAgent();

function getRedditFallbackAlias(hostname: string): string | undefined {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');

  if (isHostnameInFamily(normalized, 'reddit.com')) {
    return redditFastlyAlias;
  }

  if (isHostnameInFamily(normalized, 'redd.it') || isHostnameInFamily(normalized, 'redditstatic.com')) {
    return redditDualstackFastlyAlias;
  }

  return undefined;
}

function isHostnameInFamily(hostname: string, root: string): boolean {
  return hostname === root || hostname.endsWith(`.${root}`);
}
```

- [ ] **Step 4: Run the utility test and verify GREEN**

Run:

```bash
npm test -- tests/utils/reddit-dns.test.ts
```

Expected: 1 test file passes with all utility cases green.

- [ ] **Step 5: Run the TypeScript build**

Run:

```bash
npm run build
```

Expected: PASS with exit code 0.

- [ ] **Step 6: Record the no-Git checkpoint**

Confirm only the intended Task 1 files were added:

```bash
ls -l src/utils/reddit-dns.ts tests/utils/reddit-dns.test.ts
```

Expected: both files exist. Do not run `git init` or a commit command.

### Task 2: Attach the resolver to all RSS crawler requests

**Files:**
- Modify: `tests/crawlers/rss.crawler.test.ts:1-15`
- Modify: `src/crawlers/rss.crawler.ts:1-55`

- [ ] **Step 1: Extend the existing default-client test**

Add this import to `tests/crawlers/rss.crawler.test.ts`:

```typescript
import { redditHttpsAgent } from '../../src/utils/reddit-dns';
```

Replace the first test with:

```typescript
it('configures default RSS clients with forum headers and Reddit-aware DNS', () => {
  const crawler = new RssCrawler();
  const parser = (
    crawler as unknown as {
      parser: {
        options?: {
          headers?: Record<string, string>;
          requestOptions?: { agent?: unknown };
        };
      };
    }
  ).parser;
  const http = (crawler as unknown as { http: { defaults?: { httpsAgent?: unknown } } }).http;

  expect(parser.options?.headers?.['User-Agent']).toBeTruthy();
  expect(parser.options?.headers?.Accept).toContain('application/rss+xml');
  expect(parser.options?.requestOptions?.agent).toBe(redditHttpsAgent);
  expect(http.defaults?.httpsAgent).toBe(redditHttpsAgent);
});
```

- [ ] **Step 2: Run the crawler test and verify RED**

Run:

```bash
npm test -- tests/crawlers/rss.crawler.test.ts
```

Expected: FAIL because the parser and Axios defaults do not yet contain `redditHttpsAgent`.

- [ ] **Step 3: Configure both default RSS HTTP clients**

Add this import to `src/crawlers/rss.crawler.ts`:

```typescript
import { redditHttpsAgent } from '../utils/reddit-dns';
```

Update the default parser and Axios creation inside the existing constructor to:

```typescript
private readonly parser: RssParserLike = new Parser({
  headers: {
    'User-Agent': env.USER_AGENT,
    Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
  },
  requestOptions: {
    agent: redditHttpsAgent,
  },
  timeout: env.REQUEST_TIMEOUT_MS,
}),
private readonly http: HttpClientLike = axios.create({
  timeout: env.REQUEST_TIMEOUT_MS,
  headers: {
    'User-Agent': env.USER_AGENT,
  },
  httpsAgent: redditHttpsAgent,
}),
```

Do not alter the constructor parameter order; existing tests inject parser and HTTP doubles positionally.

- [ ] **Step 4: Run the crawler test and verify GREEN**

Run:

```bash
npm test -- tests/crawlers/rss.crawler.test.ts
```

Expected: all RSS crawler tests pass.

- [ ] **Step 5: Record the no-Git checkpoint**

Run:

```bash
npm test -- tests/utils/reddit-dns.test.ts tests/crawlers/rss.crawler.test.ts
```

Expected: both test files pass. Do not initialize Git.

### Task 3: Attach the resolver to Telegram image downloads

**Files:**
- Modify: `tests/services/telegram.service.test.ts:1-10`
- Modify: `src/services/telegram.service.ts:1-61`

- [ ] **Step 1: Add a failing default-downloader test**

Add this import to `tests/services/telegram.service.test.ts`:

```typescript
import { redditHttpsAgent } from '../../src/utils/reddit-dns';
```

Add this test near the top of `describe('TelegramService', ...)`:

```typescript
it('configures the default image downloader with Reddit-aware DNS', () => {
  const service = new TelegramService();
  const http = (service as unknown as { http: { defaults?: { httpsAgent?: unknown } } }).http;

  expect(http.defaults?.httpsAgent).toBe(redditHttpsAgent);
});
```

- [ ] **Step 2: Run the Telegram test and verify RED**

Run:

```bash
npm test -- tests/services/telegram.service.test.ts
```

Expected: FAIL because the default Axios image downloader has no `httpsAgent`.

- [ ] **Step 3: Configure the Telegram image downloader**

Add this import to `src/services/telegram.service.ts`:

```typescript
import { redditHttpsAgent } from '../utils/reddit-dns';
```

Update only the default Axios client construction:

```typescript
private readonly http: HttpClientLike = axios.create({
  timeout: env.REQUEST_TIMEOUT_MS,
  headers: {
    'User-Agent': env.USER_AGENT,
  },
  httpsAgent: redditHttpsAgent,
}),
```

- [ ] **Step 4: Run the Telegram test and verify GREEN**

Run:

```bash
npm test -- tests/services/telegram.service.test.ts
```

Expected: all Telegram service tests pass, including existing injected-client cases.

- [ ] **Step 5: Record the no-Git checkpoint**

Run:

```bash
npm test -- tests/utils/reddit-dns.test.ts tests/crawlers/rss.crawler.test.ts tests/services/telegram.service.test.ts
```

Expected: all three focused test files pass. Do not initialize Git.

### Task 4: Full verification and live Reddit collection

**Files:**
- Verify only; no planned file changes.

- [ ] **Step 1: Run the entire automated test suite**

Run:

```bash
npm test
```

Expected: all test files and tests pass with no unhandled errors.

- [ ] **Step 2: Run the production TypeScript build**

Run:

```bash
npm run build
```

Expected: PASS with exit code 0 and refreshed `dist` output.

- [ ] **Step 3: Attempt the existing lint command and report its baseline limitation**

Run:

```bash
npm run lint
```

Expected baseline result: ESLint 10 exits nonzero because the repository has no `eslint.config.js`, `eslint.config.mjs`, or `eslint.config.cjs`. Do not add lint dependencies or configuration in this DNS-focused task; report the limitation separately.

- [ ] **Step 4: Verify the running service reloads successfully**

Run:

```bash
curl -sS --max-time 10 http://127.0.0.1:3000/health
```

Expected:

```json
{"status":"ok"}
```

- [ ] **Step 5: Verify live Reddit and non-Reddit collection**

Run:

```bash
curl -sS --max-time 120 http://127.0.0.1:3000/news/latest | node -e '
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const articles = JSON.parse(input).articles ?? [];
  const redditCount = articles.filter((article) => article.sourceId?.startsWith("reddit-")).length;
  const nonRedditCount = articles.length - redditCount;
  console.log(JSON.stringify({ articleCount: articles.length, redditCount, nonRedditCount }));
  process.exit(redditCount > 0 && nonRedditCount > 0 ? 0 : 1);
});
'
```

Expected: exit code 0 with `redditCount > 0` and `nonRedditCount > 0`.

- [ ] **Step 6: Verify no system DNS or proxy change was introduced**

Run:

```bash
rg -n "151\.101\.77\.140|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY" src tests .env .env.example || true
```

Expected: no hard-coded Fastly IP or proxy setting in application/config files.

- [ ] **Step 7: Summarize completion evidence**

Report the focused test counts, full-suite count, build result, live Reddit/non-Reddit counts, and the pre-existing lint-config limitation. Because the workspace has no Git metadata, list the created and modified files explicitly instead of reporting a commit hash.
