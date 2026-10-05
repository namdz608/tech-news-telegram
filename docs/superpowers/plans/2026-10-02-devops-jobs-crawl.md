# Remote DevOps Jobs Crawl Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /telegram/send-devops-jobs`, a separate Telegram flow that collects worldwide remote DevOps jobs and sends fixed Vietnamese cards.

**Architecture:** Seven public adapters normalize jobs into one type. A filter and selection service keep keyword and worldwide-remote matches, skip seen URLs, and cap the digest. A fixed HTML card is sent with the button `Xem tin gốc`. Helm cron calls the endpoint at 08:50 Asia/Ho_Chi_Minh. No editorial model.

**Tech Stack:** TypeScript, Express, Vitest, axios, cheerio, rss-parser, existing `SentHistoryStore` and `TelegramService.sendDigest`, Helm CronJob.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-02-devops-jobs-crawl-design.md`.
- Do not change the Vietnam jobs crawler, PDF builder, or mailer (`POST /telegram/send-jobs`).
- No LLM, no job applications, no images, no LinkedIn or Indeed cookies.
- User-Agent on every outbound request: `tech-news-telegram/devops-jobs`.
- Search queries, in order: `devops`, `sre`, `platform engineer`, `kubernetes`, `cloud engineer`.
- A search adapter succeeds when at least one query returns a parseable document. HTTP status >= 400, including 429, fails that query.
- An empty parseable document is success with zero jobs. A thrown adapter fails only that source key.
- All seven adapters fail → HTTP 503 `{ "error": "All devops-jobs sources failed" }`.
- Held lock → HTTP 409 `{ "error": "DevOps jobs digest is already running" }`. Lock symbol: `Symbol.for('tech-news-telegram:devops-jobs-digest-running')`.
- Placeholder token or chat id (`test-devops-jobs-token`, `test-devops-jobs-chat-id`, `replace_me`, or blank) and a sent-history read failure propagate as HTTP 500 and send nothing.
- History store: `failurePolicy: 'fail-closed'`. Compare seen URLs with `normalizeUrl`, because `SentHistoryStore.mark` stores normalized URLs. Do not merge two different job URLs.
- Caps: 8 jobs, 2 per source, 72 hours, except `sourceId === 'hn'`.
- Button label is exactly `Xem tin gốc`. `TrackedTelegramDeliveryService` cannot set that label and also sends a separator, so delivery calls `sendDigest` then `history.mark`, matching `DevopsInfraDeliveryService`.
- Tests use injected fetchers and clocks. No live HTTP.
- Branch from `origin/main`, not the current local `main` tip.

## Prerequisite

In `/root/tech-news-telegram`:

```bash
git fetch origin main
git checkout -B feature/devops-jobs-crawl origin/main
```

Helm Task 12 is a separate branch in `/root/helm`.

## File map

- Create `src/types/devops-jobs.ts` — job, message, collection, selection, and flow result types.
- Create `src/config/devops-jobs-sources.ts` — URLs and the query list.
- Create `src/services/devops-jobs-filter.ts` — keyword and worldwide-remote rules.
- Create `src/services/devops-jobs-record.ts` — drop invalid records and dedupe by URL.
- Create `src/services/devops-jobs-http.ts` — GET text with the required User-Agent.
- Create `src/services/devops-jobs-search.ts` — run the five queries and succeed if one parses.
- Create one adapter per source under `src/services/devops-jobs-*.adapter.ts`.
- Create selection, message, source, delivery, flow, and lock services.
- Modify `src/config/env.ts`, `src/controllers/telegram.controller.ts`, `src/routes/telegram.routes.ts`, `README.md`.
- Modify `/root/helm/tech-news-telegram/values.yaml` and `tests/render-test.sh`.

---

### Task 1: Job filter

**Files:**
- Create: `src/types/devops-jobs.ts`
- Create: `src/services/devops-jobs-filter.ts`
- Test: `tests/services/devops-jobs-filter.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `DevopsJob`, `matchesDevopsJobKeyword(job)`, `isWorldwideRemote(job)`, `isEligibleDevopsJob(job)`

- [ ] **Step 1: Write the failing test**

Create `tests/services/devops-jobs-filter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isEligibleDevopsJob } from '../../src/services/devops-jobs-filter';
import type { DevopsJob } from '../../src/types/devops-jobs';

function job(overrides: Partial<DevopsJob> = {}): DevopsJob {
  return {
    id: '1',
    sourceId: 'remoteok',
    sourceName: 'Remote OK',
    title: 'DevOps Engineer',
    company: 'Acme',
    url: 'https://example.com/jobs/1',
    location: '',
    description: 'Keep clusters healthy',
    tags: [],
    publishedAt: '2026-10-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('devops job filter', () => {
  it.each([
    ['title devops', { title: 'DevOps Engineer' }],
    ['sre', { title: 'Staff SRE' }],
    ['site reliability', { title: 'Site Reliability Engineer' }],
    ['platform', { title: 'Platform Engineer' }],
    ['infrastructure', { description: 'Infrastructure for CI' }],
    ['kubernetes', { tags: ['Kubernetes'] }],
    ['k8s', { title: 'K8s operator' }],
    ['cloud engineer', { title: 'Cloud Engineer' }],
  ])('keeps %s', (_label, overrides) => {
    expect(isEligibleDevopsJob(job(overrides))).toBe(true);
  });

  it('drops a title with no approved keyword', () => {
    expect(isEligibleDevopsJob(job({ title: 'Accountant', description: 'Ledgers' }))).toBe(false);
  });

  it.each([
    'US only',
    'EU only',
    'UK only',
    'must be located in Texas',
    'must be based in London',
  ])('drops restriction %s', (phrase) => {
    expect(isEligibleDevopsJob(job({ description: phrase }))).toBe(false);
  });

  it.each(['Worldwide', 'Anywhere', 'Global', ''])(
    'keeps remote-only location %j',
    (location) => {
      expect(isEligibleDevopsJob(job({ location }))).toBe(true);
    },
  );

  it('keeps a worldwide job whose description mentions us-east-1', () => {
    expect(isEligibleDevopsJob(job({
      location: 'Worldwide',
      description: 'DevOps role. Deploy to us-east-1.',
    }))).toBe(true);
  });

  it('drops a remote-only job located in the United States', () => {
    expect(isEligibleDevopsJob(job({ location: 'United States' }))).toBe(false);
  });

  it('drops LinkedIn unless the post has a remote signal', () => {
    expect(isEligibleDevopsJob(job({
      sourceId: 'linkedin',
      location: 'Worldwide',
      description: 'Office collaboration',
    }))).toBe(false);
  });

  it('keeps a LinkedIn remote worldwide post', () => {
    expect(isEligibleDevopsJob(job({
      sourceId: 'linkedin',
      location: 'Worldwide',
      description: 'Remote DevOps',
    }))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/services/devops-jobs-filter.test.ts`

Expected: FAIL because `devops-jobs-filter` does not exist.

- [ ] **Step 3: Implement the types and filter**

Create `src/types/devops-jobs.ts`:

```ts
export interface DevopsJob {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  company: string;
  url: string;
  location: string;
  description: string;
  tags: readonly string[];
  salary?: string;
  publishedAt: string;
}

export interface DevopsJobsMessage {
  text: string;
  url: string;
}

export interface DevopsJobsCollectionResult {
  items: DevopsJob[];
  collectedCount: number;
  successfulSourceCount: number;
  failedSources: string[];
}

export interface DevopsJobsSelectionResult {
  selected: DevopsJob[];
  eligibleCount: number;
  skippedSeenCount: number;
}

export interface DevopsJobsFlowResult {
  sent: boolean;
  reason?: 'no_new_articles';
  channel: 'telegram-devops-jobs';
  messageCount: number;
  collectedCount: number;
  eligibleCount: number;
  skippedSeenCount: number;
  partial: boolean;
  failedSources: string[];
  language: 'vi';
}
```

Create `src/services/devops-jobs-filter.ts`:

```ts
import type { DevopsJob } from '../types/devops-jobs';

const KEYWORDS: readonly RegExp[] = [
  /\bdevops\b/iu,
  /\bsre\b/iu,
  /site reliability/iu,
  /\bplatform\b/iu,
  /\binfrastructure\b/iu,
  /\bkubernetes\b/iu,
  /\bk8s\b/iu,
  /cloud engineer/iu,
];

const LOCATION_REGION =
  /(?:^|[^a-z0-9.])(?:united states|united kingdom|north america|south america|u\.s\.|usa|uk|europe|canada|germany|france|india|australia|latam|emea|apac|africa|asia|eu|us)(?=$|[^a-z0-9-])/iu;

const RESTRICTION =
  /\b(?:us only|usa only|u\.s\. only|united states only|uk only|eu only|europe only|canada only|must be located|must be based in|must reside|candidates must be in|only candidates in)\b|\bremote\s*[-–—]\s*(?:us|usa|uk|eu|canada|europe)\b/iu;

const REMOTE_SIGNAL = /\bremote\b|work from home|work from anywhere|\bdistributed\b/iu;

const REMOTE_ONLY_SOURCES = new Set([
  'remoteok',
  'remotive',
  'weworkremotely',
  'himalayas',
]);

function corpus(job: DevopsJob): string {
  return [job.title, job.location, job.description, ...job.tags].join('\n');
}

export function matchesDevopsJobKeyword(job: DevopsJob): boolean {
  const text = [job.title, job.description, ...job.tags].join('\n');
  return KEYWORDS.some((pattern) => pattern.test(text));
}

export function isWorldwideRemote(job: DevopsJob): boolean {
  if (RESTRICTION.test(corpus(job))) return false;
  if (LOCATION_REGION.test(job.location)) return false;
  if (REMOTE_ONLY_SOURCES.has(job.sourceId)) return true;
  return REMOTE_SIGNAL.test([job.title, job.location, job.description].join('\n'));
}

export function isEligibleDevopsJob(job: DevopsJob): boolean {
  return matchesDevopsJobKeyword(job) && isWorldwideRemote(job);
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run tests/services/devops-jobs-filter.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/devops-jobs.ts src/services/devops-jobs-filter.ts tests/services/devops-jobs-filter.test.ts
git commit -m "$(cat <<'EOF'
feat: filter worldwide remote DevOps jobs

EOF
)"
```

---

### Task 2: Selection caps and HN age exemption

**Files:**
- Create: `src/services/devops-jobs-selection.service.ts`
- Test: `tests/services/devops-jobs-selection.service.test.ts`

**Interfaces:**
- Consumes: `DevopsJob`, `isEligibleDevopsJob`
- Produces: `DevopsJobsSelectionService.select(jobs, seenUrls)` returning `DevopsJobsSelectionResult`

- [ ] **Step 1: Write the failing test**

Create `tests/services/devops-jobs-selection.service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DevopsJobsSelectionService } from '../../src/services/devops-jobs-selection.service';
import type { DevopsJob } from '../../src/types/devops-jobs';

const NOW = new Date('2026-10-02T12:00:00.000Z');

function job(overrides: Partial<DevopsJob> = {}): DevopsJob {
  return {
    id: overrides.url ?? 'job',
    sourceId: 'remoteok',
    sourceName: 'Remote OK',
    title: 'DevOps Engineer',
    company: 'Acme',
    url: 'https://example.com/jobs/1',
    location: 'Worldwide',
    description: 'Remote',
    tags: [],
    publishedAt: '2026-10-02T00:00:00.000Z',
    ...overrides,
  };
}

function service(): DevopsJobsSelectionService {
  return new DevopsJobsSelectionService(8, 2, 72, () => NOW);
}

describe('DevopsJobsSelectionService', () => {
  it('drops seen URLs and reports both counts', () => {
    const result = service().select(
      [
        job({ url: 'https://example.com/jobs/1' }),
        job({ url: 'https://example.com/jobs/2?utm_source=x' }),
      ],
      new Set(['https://example.com/jobs/1']),
    );
    expect(result.skippedSeenCount).toBe(1);
    expect(result.eligibleCount).toBe(1);
    expect(result.selected.map((entry) => entry.url)).toEqual([
      'https://example.com/jobs/2?utm_source=x',
    ]);
  });

  it('drops jobs older than 72 hours', () => {
    const result = service().select(
      [job({ publishedAt: '2026-09-28T00:00:00.000Z' })],
      new Set(),
    );
    expect(result.selected).toEqual([]);
    expect(result.eligibleCount).toBe(0);
  });

  it('keeps an older HN hiring comment', () => {
    const result = service().select(
      [job({
        sourceId: 'hn',
        sourceName: 'HN Who is hiring',
        publishedAt: '2026-09-01T00:00:00.000Z',
        description: 'Remote platform work',
      })],
      new Set(),
    );
    expect(result.selected).toHaveLength(1);
  });

  it('caps at two jobs per source and eight overall', () => {
    const jobs = [
      'remoteok',
      'remotive',
      'weworkremotely',
      'himalayas',
      'hn',
    ].flatMap((sourceId, sourceIndex) =>
      [0, 1, 2].map((index) => job({
        sourceId,
        url: `https://example.com/${sourceId}/${index}`,
        publishedAt: new Date(NOW.getTime() - (sourceIndex * 3 + index) * 1000).toISOString(),
      })));
    const result = service().select(jobs, new Set());
    expect(result.selected).toHaveLength(8);
    expect(result.selected.filter((entry) => entry.sourceId === 'remoteok')).toHaveLength(2);
    expect(result.eligibleCount).toBe(15);
  });

  it('drops jobs that fail the keyword filter before counting them eligible', () => {
    const result = service().select(
      [job({ title: 'Accountant', description: 'Ledgers' })],
      new Set(),
    );
    expect(result.eligibleCount).toBe(0);
    expect(result.skippedSeenCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/services/devops-jobs-selection.service.test.ts`

Expected: FAIL because the selection service does not exist.

- [ ] **Step 3: Implement selection**

Create `src/services/devops-jobs-selection.service.ts`:

```ts
import type { DevopsJob, DevopsJobsSelectionResult } from '../types/devops-jobs';
import { normalizeUrl } from '../utils/normalize-url';
import { isEligibleDevopsJob } from './devops-jobs-filter';

const SOURCE_ORDER = [
  'remoteok',
  'remotive',
  'weworkremotely',
  'himalayas',
  'hn',
  'linkedin',
  'indeed',
];
const HOUR_MS = 36e5;

export class DevopsJobsSelectionService {
  constructor(
    private readonly maxJobs: number,
    private readonly maxPerSource: number,
    private readonly maxAgeHours: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  select(
    jobs: readonly DevopsJob[],
    seenUrls: ReadonlySet<string>,
  ): DevopsJobsSelectionResult {
    const fresh = jobs.filter((job) => this.freshEnough(job));
    const seen = new Set([...seenUrls].map((url) => normalizeUrl(url)));
    let skippedSeenCount = 0;
    const unseen = fresh.filter((job) => {
      if (!seen.has(normalizeUrl(job.url))) return true;
      skippedSeenCount += 1;
      return false;
    });
    const ranked = [...unseen].sort((left, right) => this.compare(left, right));
    const selected: DevopsJob[] = [];
    const perSource = new Map<string, number>();
    for (const job of ranked) {
      if (selected.length >= this.maxJobs) break;
      const used = perSource.get(job.sourceId) ?? 0;
      if (used >= this.maxPerSource) continue;
      perSource.set(job.sourceId, used + 1);
      selected.push(job);
    }
    return {
      selected,
      eligibleCount: unseen.length,
      skippedSeenCount,
    };
  }

  private freshEnough(job: DevopsJob): boolean {
    if (!isEligibleDevopsJob(job)) return false;
    if (job.sourceId === 'hn') return true;
    const publishedAt = Date.parse(job.publishedAt);
    if (!Number.isFinite(publishedAt)) return false;
    return this.now().getTime() - publishedAt <= this.maxAgeHours * HOUR_MS;
  }

  private compare(left: DevopsJob, right: DevopsJob): number {
    const age = Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
    if (age !== 0) return age;
    const source = SOURCE_ORDER.indexOf(left.sourceId) - SOURCE_ORDER.indexOf(right.sourceId);
    if (source !== 0) return source;
    return left.url.localeCompare(right.url);
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run tests/services/devops-jobs-selection.service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/devops-jobs-selection.service.ts tests/services/devops-jobs-selection.service.test.ts
git commit -m "$(cat <<'EOF'
feat: select capped unseen remote DevOps jobs

EOF
)"
```

---

### Task 3: Fixed Vietnamese card

**Files:**
- Create: `src/services/devops-jobs-message.service.ts`
- Test: `tests/services/devops-jobs-message.service.test.ts`

**Interfaces:**
- Consumes: `DevopsJob`
- Produces: `DevopsJobsMessageService.buildMessages(jobs)` returning `DevopsJobsMessage[]` with `text` and `url`

- [ ] **Step 1: Write the failing test**

Create `tests/services/devops-jobs-message.service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DevopsJobsMessageService } from '../../src/services/devops-jobs-message.service';
import type { DevopsJob } from '../../src/types/devops-jobs';

function job(overrides: Partial<DevopsJob> = {}): DevopsJob {
  return {
    id: '1',
    sourceId: 'remoteok',
    sourceName: 'Remote OK',
    title: 'DevOps <Engineer>',
    company: 'Acme & Co',
    url: 'https://example.com/jobs/1',
    location: 'United States',
    description: '<p>Keep the platform healthy</p>',
    tags: [],
    publishedAt: '2026-10-02T18:30:00.000Z',
    ...overrides,
  };
}

describe('DevopsJobsMessageService', () => {
  const service = new DevopsJobsMessageService();

  it('renders salary and escapes HTML', async () => {
    const [message] = await service.buildMessages([job({ salary: '$100k' })]);
    expect(message?.url).toBe('https://example.com/jobs/1');
    expect(message?.text).toBe([
      '🛠️ DevOps remote',
      '',
      '<b>DevOps &lt;Engineer&gt;</b>',
      '🏢 Acme &amp; Co',
      '📍 Remote · toàn cầu',
      '💰 $100k',
      '🗓 03/10/2026',
      '📡 Remote OK',
      '',
      'Keep the platform healthy',
    ].join('\n'));
  });

  it('omits the salary line and the excerpt when they are absent', async () => {
    const [message] = await service.buildMessages([job({ description: '   ' })]);
    expect(message?.text.includes('💰')).toBe(false);
    expect(message?.text.endsWith('📡 Remote OK')).toBe(true);
  });

  it('truncates the excerpt to 240 characters and adds an ellipsis', async () => {
    const [message] = await service.buildMessages([
      job({ description: 'a'.repeat(241) }),
    ]);
    const excerpt = message?.text.split('\n').at(-1);
    expect(excerpt).toBe(`${'a'.repeat(240)}…`);
  });
});
```

`2026-10-02T18:30:00.000Z` is `03/10/2026` in `Asia/Ho_Chi_Minh`.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/services/devops-jobs-message.service.test.ts`

Expected: FAIL because the message service does not exist.

- [ ] **Step 3: Implement the card**

Create `src/services/devops-jobs-message.service.ts`:

```ts
import type { DevopsJob, DevopsJobsMessage } from '../types/devops-jobs';
import { htmlToCompactText } from '../utils/html-text';
import { escapeHtml } from '../utils/text';

const EXCERPT_LIMIT = 240;

export class DevopsJobsMessageService {
  constructor(private readonly timeZone = 'Asia/Ho_Chi_Minh') {}

  async buildMessages(jobs: readonly DevopsJob[]): Promise<DevopsJobsMessage[]> {
    return jobs.map((job) => ({
      text: this.render(job),
      url: job.url,
    }));
  }

  private render(job: DevopsJob): string {
    const excerpt = this.excerpt(job.description);
    const lines = [
      '🛠️ DevOps remote',
      '',
      `<b>${escapeHtml(job.title)}</b>`,
      `🏢 ${escapeHtml(job.company)}`,
      '📍 Remote · toàn cầu',
      ...(job.salary ? [`💰 ${escapeHtml(job.salary)}`] : []),
      `🗓 ${this.formatDate(job.publishedAt)}`,
      `📡 ${escapeHtml(job.sourceName)}`,
      ...(excerpt ? ['', excerpt] : []),
    ];
    return lines.join('\n');
  }

  private excerpt(description: string): string {
    const text = htmlToCompactText(description);
    if (text === '') return '';
    if (text.length <= EXCERPT_LIMIT) return escapeHtml(text);
    return `${escapeHtml(text.slice(0, EXCERPT_LIMIT))}…`;
  }

  private formatDate(value: string): string {
    const date = new Date(value);
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: this.timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((entry) => entry.type === type)?.value ?? '';
    return `${part('day')}/${part('month')}/${part('year')}`;
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run tests/services/devops-jobs-message.service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/devops-jobs-message.service.ts tests/services/devops-jobs-message.service.test.ts
git commit -m "$(cat <<'EOF'
feat: render fixed Vietnamese DevOps job cards

EOF
)"
```

---

### Task 4: Shared record, HTTP, and Remote OK

**Files:**
- Create: `src/config/devops-jobs-sources.ts`
- Create: `src/services/devops-jobs-record.ts`
- Create: `src/services/devops-jobs-http.ts`
- Create: `src/services/devops-jobs-search.ts`
- Create: `src/services/devops-jobs-remoteok.adapter.ts`
- Test: `tests/services/devops-jobs-remoteok.adapter.test.ts`

**Interfaces:**
- Consumes: `DevopsJob`
- Produces:
  - `DEVOPS_JOB_QUERIES`
  - `toDevopsJob(input): DevopsJob | undefined`
  - `dedupeDevopsJobs(jobs): DevopsJob[]`
  - `getDevopsJobsText(url): Promise<string>`
  - `collectDevopsJobQueries(queries, fetchQuery): Promise<DevopsJob[]>`
  - `RemoteOkAdapter` with `readonly key = 'remoteok'` and `collect(): Promise<DevopsJob[]>`

- [ ] **Step 1: Write the failing test**

Create `tests/services/devops-jobs-remoteok.adapter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RemoteOkAdapter } from '../../src/services/devops-jobs-remoteok.adapter';

const body = JSON.stringify([
  { legal: 'please link back' },
  {
    id: 10,
    position: 'DevOps Engineer',
    company: 'Acme',
    tags: ['devops'],
    location: 'Worldwide',
    description: '<p>Remote</p>',
    url: 'https://remoteok.com/remote-jobs/10',
    date: '2026-10-02T00:00:00.000Z',
    salary_min: 100000,
    salary_max: 140000,
  },
  { id: 11, company: 'Missing title' },
]);

describe('RemoteOkAdapter', () => {
  it('skips the legal object and incomplete rows', async () => {
    const adapter = new RemoteOkAdapter(async () => body);
    const jobs = await adapter.collect();
    expect(jobs).toEqual([{
      id: '10',
      sourceId: 'remoteok',
      sourceName: 'Remote OK',
      title: 'DevOps Engineer',
      company: 'Acme',
      url: 'https://remoteok.com/remote-jobs/10',
      location: 'Worldwide',
      description: '<p>Remote</p>',
      tags: ['devops'],
      salary: '100000-140000',
      publishedAt: '2026-10-02T00:00:00.000Z',
    }]);
  });

  it('throws when the body is not JSON', async () => {
    const adapter = new RemoteOkAdapter(async () => '<html></html>');
    await expect(adapter.collect()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/services/devops-jobs-remoteok.adapter.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement shared helpers and Remote OK**

Create `src/config/devops-jobs-sources.ts`:

```ts
export const DEVOPS_JOB_QUERIES = [
  'devops',
  'sre',
  'platform engineer',
  'kubernetes',
  'cloud engineer',
] as const;

export const DEVOPS_JOBS_USER_AGENT = 'tech-news-telegram/devops-jobs';

export const DEVOPS_JOB_SOURCE_URLS = {
  remoteok: 'https://remoteok.com/api',
  remotive: 'https://remotive.com/api/remote-jobs',
  weworkremotely: 'https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss',
  himalayas: 'https://himalayas.app/jobs/api/search',
  hnStories: 'https://hn.algolia.com/api/v1/search_by_date',
  hnComments: 'https://hn.algolia.com/api/v1/search',
  linkedin: 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search',
  indeed: 'https://rss.indeed.com/rss',
} as const;
```

Create `src/services/devops-jobs-record.ts`:

```ts
import type { DevopsJob } from '../types/devops-jobs';

export interface DevopsJobInput {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  company: string;
  url: string;
  location?: string;
  description?: string;
  tags?: readonly string[];
  salary?: string;
  publishedAt: string;
}

export function toDevopsJob(input: DevopsJobInput): DevopsJob | undefined {
  const title = input.title.trim();
  const company = input.company.trim();
  const url = input.url.trim();
  if (title === '' || company === '' || !Number.isFinite(Date.parse(input.publishedAt))) {
    return undefined;
  }
  try {
    const protocol = new URL(url).protocol;
    if (protocol !== 'http:' && protocol !== 'https:') return undefined;
  } catch {
    return undefined;
  }
  const salary = input.salary?.trim();
  return {
    id: input.id,
    sourceId: input.sourceId,
    sourceName: input.sourceName,
    title,
    company,
    url,
    location: input.location?.trim() ?? '',
    description: input.description ?? '',
    tags: input.tags ?? [],
    publishedAt: new Date(input.publishedAt).toISOString(),
    ...(salary ? { salary } : {}),
  };
}

export function dedupeDevopsJobs(jobs: readonly DevopsJob[]): DevopsJob[] {
  const seen = new Set<string>();
  const unique: DevopsJob[] = [];
  for (const job of jobs) {
    if (seen.has(job.url)) continue;
    seen.add(job.url);
    unique.push(job);
  }
  return unique;
}

export function salaryRange(min?: unknown, max?: unknown): string | undefined {
  const left = typeof min === 'number' ? String(min) : undefined;
  const right = typeof max === 'number' ? String(max) : undefined;
  if (left && right) return `${left}-${right}`;
  return left ?? right;
}
```

Create `src/services/devops-jobs-http.ts`:

```ts
import axios from 'axios';
import { env } from '../config/env';
import { DEVOPS_JOBS_USER_AGENT } from '../config/devops-jobs-sources';

export async function getDevopsJobsText(url: string): Promise<string> {
  const response = await axios.get<string>(url, {
    timeout: env.REQUEST_TIMEOUT_MS,
    responseType: 'text',
    validateStatus: () => true,
    headers: {
      'User-Agent': DEVOPS_JOBS_USER_AGENT,
      Accept: 'application/json, application/rss+xml, text/html, */*',
    },
  });
  if (response.status >= 400) {
    throw new Error(`HTTP ${response.status}`);
  }
  return String(response.data);
}
```

Create `src/services/devops-jobs-search.ts`:

```ts
import type { DevopsJob } from '../types/devops-jobs';
import { dedupeDevopsJobs } from './devops-jobs-record';

export async function collectDevopsJobQueries(
  queries: readonly string[],
  fetchQuery: (query: string) => Promise<DevopsJob[]>,
): Promise<DevopsJob[]> {
  const settled = await Promise.allSettled(queries.map((query) => fetchQuery(query)));
  const jobs: DevopsJob[] = [];
  let successes = 0;
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    successes += 1;
    jobs.push(...result.value);
  }
  if (successes === 0) {
    throw new Error('All devops-jobs queries failed');
  }
  return dedupeDevopsJobs(jobs);
}
```

Create `src/services/devops-jobs-remoteok.adapter.ts`:

```ts
import { DEVOPS_JOB_SOURCE_URLS } from '../config/devops-jobs-sources';
import type { DevopsJob } from '../types/devops-jobs';
import { getDevopsJobsText } from './devops-jobs-http';
import { salaryRange, toDevopsJob } from './devops-jobs-record';

interface RemoteOkRow {
  id?: number | string;
  position?: string;
  company?: string;
  tags?: string[];
  location?: string;
  description?: string;
  url?: string;
  date?: string;
  salary_min?: number;
  salary_max?: number;
}

export class RemoteOkAdapter {
  readonly key = 'remoteok';

  constructor(private readonly getText: (url: string) => Promise<string> = getDevopsJobsText) {}

  async collect(): Promise<DevopsJob[]> {
    const parsed: unknown = JSON.parse(await this.getText(DEVOPS_JOB_SOURCE_URLS.remoteok));
    if (!Array.isArray(parsed)) throw new Error('Remote OK payload is not an array');
    return parsed.flatMap((row: RemoteOkRow) => {
      if (!row.position || row.id === undefined || !row.url || !row.date || !row.company) {
        return [];
      }
      const job = toDevopsJob({
        id: String(row.id),
        sourceId: this.key,
        sourceName: 'Remote OK',
        title: row.position,
        company: row.company,
        url: row.url,
        location: row.location,
        description: row.description,
        tags: row.tags,
        salary: salaryRange(row.salary_min, row.salary_max),
        publishedAt: row.date,
      });
      return job ? [job] : [];
    });
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run tests/services/devops-jobs-remoteok.adapter.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config/devops-jobs-sources.ts src/services/devops-jobs-record.ts src/services/devops-jobs-http.ts src/services/devops-jobs-search.ts src/services/devops-jobs-remoteok.adapter.ts tests/services/devops-jobs-remoteok.adapter.test.ts
git commit -m "$(cat <<'EOF'
feat: collect Remote OK DevOps jobs

EOF
)"
```

---

### Task 5: Remotive, We Work Remotely, and Himalayas

**Files:**
- Create: `src/services/devops-jobs-remotive.adapter.ts`
- Create: `src/services/devops-jobs-weworkremotely.adapter.ts`
- Create: `src/services/devops-jobs-himalayas.adapter.ts`
- Test: `tests/services/devops-jobs-board-adapters.test.ts`

**Interfaces:**
- Consumes: `collectDevopsJobQueries`, `toDevopsJob`, `DEVOPS_JOB_QUERIES`, `DEVOPS_JOB_SOURCE_URLS`
- Produces: `RemotiveAdapter.key = 'remotive'`, `WeWorkRemotelyAdapter.key = 'weworkremotely'`, `HimalayasAdapter.key = 'himalayas'`, each `collect(): Promise<DevopsJob[]>`

- [ ] **Step 1: Write the failing test**

Create `tests/services/devops-jobs-board-adapters.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { HimalayasAdapter } from '../../src/services/devops-jobs-himalayas.adapter';
import { RemotiveAdapter } from '../../src/services/devops-jobs-remotive.adapter';
import { WeWorkRemotelyAdapter } from '../../src/services/devops-jobs-weworkremotely.adapter';

describe('board adapters', () => {
  it('collects a Remotive job and ignores a failed sibling query', async () => {
    const adapter = new RemotiveAdapter(async (url) => {
      if (!url.includes('search=devops')) throw new Error('HTTP 429');
      return JSON.stringify({
        jobs: [{
          id: 7,
          title: 'SRE',
          company_name: 'Acme',
          candidate_required_location: 'Worldwide',
          url: 'https://remotive.com/remote-jobs/7',
          description: 'Remote',
          publication_date: '2026-10-02T00:00:00.000Z',
          salary: '$120k',
          tags: ['sre'],
        }],
      });
    });
    const jobs = await adapter.collect();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.salary).toBe('$120k');
    expect(jobs[0]?.sourceId).toBe('remotive');
  });

  it('reads the company from a We Work Remotely title', async () => {
    const adapter = new WeWorkRemotelyAdapter(async () => ({
      items: [{
        title: 'Acme: Platform Engineer',
        link: 'https://weworkremotely.com/remote-jobs/acme',
        content: '<p>Kubernetes</p>',
        isoDate: '2026-10-02T00:00:00.000Z',
      }],
    }));
    const jobs = await adapter.collect();
    expect(jobs[0]).toMatchObject({
      company: 'Acme',
      title: 'Platform Engineer',
      sourceId: 'weworkremotely',
    });
  });

  it('throws when every Himalayas query fails', async () => {
    const adapter = new HimalayasAdapter(async () => {
      throw new Error('HTTP 403');
    });
    await expect(adapter.collect()).rejects.toThrow(/queries failed/);
  });

  it('maps a Himalayas worldwide job', async () => {
    const adapter = new HimalayasAdapter(async (url) => {
      if (!url.includes('q=devops')) throw new Error('HTTP 429');
      return JSON.stringify({
        jobs: [{
          guid: 'abc',
          title: 'Cloud Engineer',
          companyName: 'Acme',
          description: 'Remote',
          applicationLink: 'https://himalayas.app/companies/acme/jobs/cloud',
          locationRestrictions: [],
          parentCategories: ['Engineering'],
          minSalary: 90,
          maxSalary: 120,
          pubDate: Date.parse('2026-10-02T00:00:00.000Z'),
        }],
      });
    });
    const jobs = await adapter.collect();
    expect(jobs[0]).toMatchObject({
      sourceId: 'himalayas',
      location: '',
      salary: '90-120',
      url: 'https://himalayas.app/companies/acme/jobs/cloud',
    });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/services/devops-jobs-board-adapters.test.ts`

Expected: FAIL because the adapters do not exist.

- [ ] **Step 3: Implement the three adapters**

Create `src/services/devops-jobs-remotive.adapter.ts`:

```ts
import { DEVOPS_JOB_QUERIES, DEVOPS_JOB_SOURCE_URLS } from '../config/devops-jobs-sources';
import type { DevopsJob } from '../types/devops-jobs';
import { getDevopsJobsText } from './devops-jobs-http';
import { toDevopsJob } from './devops-jobs-record';
import { collectDevopsJobQueries } from './devops-jobs-search';

interface RemotiveJob {
  id?: number | string;
  title?: string;
  company_name?: string;
  candidate_required_location?: string;
  url?: string;
  description?: string;
  publication_date?: string;
  salary?: string;
  tags?: string[];
}

export class RemotiveAdapter {
  readonly key = 'remotive';

  constructor(private readonly getText: (url: string) => Promise<string> = getDevopsJobsText) {}

  collect(): Promise<DevopsJob[]> {
    return collectDevopsJobQueries(DEVOPS_JOB_QUERIES, (query) => this.one(query));
  }

  private async one(query: string): Promise<DevopsJob[]> {
    const url = `${DEVOPS_JOB_SOURCE_URLS.remotive}?search=${encodeURIComponent(query)}&limit=50`;
    const parsed: unknown = JSON.parse(await this.getText(url));
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { jobs?: unknown }).jobs)) {
      throw new Error('Remotive payload is not a job list');
    }
    return ((parsed as { jobs: RemotiveJob[] }).jobs).flatMap((row) => {
      if (row.id === undefined || !row.title || !row.company_name || !row.url || !row.publication_date) {
        return [];
      }
      const job = toDevopsJob({
        id: String(row.id),
        sourceId: this.key,
        sourceName: 'Remotive',
        title: row.title,
        company: row.company_name,
        url: row.url,
        location: row.candidate_required_location,
        description: row.description,
        tags: row.tags,
        salary: row.salary,
        publishedAt: row.publication_date,
      });
      return job ? [job] : [];
    });
  }
}
```

Create `src/services/devops-jobs-weworkremotely.adapter.ts`. The test passes one zero-argument loader:

```ts
import Parser from 'rss-parser';
import { DEVOPS_JOB_SOURCE_URLS } from '../config/devops-jobs-sources';
import type { DevopsJob } from '../types/devops-jobs';
import { getDevopsJobsText } from './devops-jobs-http';
import { toDevopsJob } from './devops-jobs-record';

interface FeedItem {
  title?: string;
  link?: string;
  content?: string;
  isoDate?: string;
}

export class WeWorkRemotelyAdapter {
  readonly key = 'weworkremotely';

  constructor(
    private readonly load: () => Promise<{ items?: FeedItem[] }> = async () => {
      const xml = await getDevopsJobsText(DEVOPS_JOB_SOURCE_URLS.weworkremotely);
      return new Parser().parseString(xml);
    },
  ) {}

  async collect(): Promise<DevopsJob[]> {
    const feed = await this.load();
    if (!feed.items) throw new Error('We Work Remotely feed has no items');
    return feed.items.flatMap((item) => {
      const split = item.title?.split(':') ?? [];
      const company = split[0]?.trim();
      const title = split.slice(1).join(':').trim();
      if (!company || !title || !item.link || !item.isoDate) return [];
      const job = toDevopsJob({
        id: item.link,
        sourceId: this.key,
        sourceName: 'We Work Remotely',
        title,
        company,
        url: item.link,
        description: item.content,
        publishedAt: item.isoDate,
      });
      return job ? [job] : [];
    });
  }
}
```

Create `src/services/devops-jobs-himalayas.adapter.ts`:

```ts
import { DEVOPS_JOB_QUERIES, DEVOPS_JOB_SOURCE_URLS } from '../config/devops-jobs-sources';
import type { DevopsJob } from '../types/devops-jobs';
import { getDevopsJobsText } from './devops-jobs-http';
import { salaryRange, toDevopsJob } from './devops-jobs-record';
import { collectDevopsJobQueries } from './devops-jobs-search';

interface HimalayasJob {
  guid?: string;
  title?: string;
  companyName?: string;
  description?: string;
  applicationLink?: string;
  locationRestrictions?: string[];
  parentCategories?: string[];
  categories?: string[];
  minSalary?: number;
  maxSalary?: number;
  pubDate?: number | string;
}

export class HimalayasAdapter {
  readonly key = 'himalayas';

  constructor(private readonly getText: (url: string) => Promise<string> = getDevopsJobsText) {}

  collect(): Promise<DevopsJob[]> {
    return collectDevopsJobQueries(DEVOPS_JOB_QUERIES, (query) => this.one(query));
  }

  private async one(query: string): Promise<DevopsJob[]> {
    const url = `${DEVOPS_JOB_SOURCE_URLS.himalayas}?q=${encodeURIComponent(query)}&worldwide=true&sort=recent`;
    const parsed: unknown = JSON.parse(await this.getText(url));
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { jobs?: unknown }).jobs)) {
      throw new Error('Himalayas payload is not a job list');
    }
    return ((parsed as { jobs: HimalayasJob[] }).jobs).flatMap((row) => {
      const publishedAt = typeof row.pubDate === 'number'
        ? new Date(row.pubDate).toISOString()
        : row.pubDate;
      if (!row.guid || !row.title || !row.companyName || !row.applicationLink || !publishedAt) {
        return [];
      }
      const job = toDevopsJob({
        id: row.guid,
        sourceId: this.key,
        sourceName: 'Himalayas',
        title: row.title,
        company: row.companyName,
        url: row.applicationLink,
        location: (row.locationRestrictions ?? []).join(', '),
        description: row.description,
        tags: [...(row.parentCategories ?? []), ...(row.categories ?? [])],
        salary: salaryRange(row.minSalary, row.maxSalary),
        publishedAt,
      });
      return job ? [job] : [];
    });
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run tests/services/devops-jobs-board-adapters.test.ts`

Expected: PASS. The We Work Remotely test calls `new WeWorkRemotelyAdapter(async () => ({ items: [...] }))`.

- [ ] **Step 5: Commit**

```bash
git add src/services/devops-jobs-remotive.adapter.ts src/services/devops-jobs-weworkremotely.adapter.ts src/services/devops-jobs-himalayas.adapter.ts tests/services/devops-jobs-board-adapters.test.ts
git commit -m "$(cat <<'EOF'
feat: collect Remotive, WWR, and Himalayas jobs

EOF
)"
```

---

### Task 6: HN Who is hiring

**Files:**
- Create: `src/services/devops-jobs-hn.adapter.ts`
- Test: `tests/services/devops-jobs-hn.adapter.test.ts`

**Interfaces:**
- Consumes: `toDevopsJob`, `DEVOPS_JOB_SOURCE_URLS`
- Produces: `HnHiringAdapter.key = 'hn'` and `collect(): Promise<DevopsJob[]>`. Constructor takes `getText` and `now`.

- [ ] **Step 1: Write the failing test**

Create `tests/services/devops-jobs-hn.adapter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { HnHiringAdapter } from '../../src/services/devops-jobs-hn.adapter';

const now = () => new Date('2026-10-02T00:00:00.000Z');

describe('HnHiringAdapter', () => {
  it('keeps a comment from the current month story', async () => {
    const adapter = new HnHiringAdapter(async (url) => {
      if (url.includes('search_by_date')) {
        return JSON.stringify({
          hits: [
            { objectID: '1', title: 'Ask HN: Who is hiring? (September 2026)' },
            { objectID: '2', title: 'Ask HN: Who is hiring? (October 2026)' },
          ],
        });
      }
      return JSON.stringify({
        hits: [{
          objectID: '99',
          comment_text: 'Acme | SRE | Remote\nWorldwide platform work',
          created_at: '2026-10-01T00:00:00.000Z',
        }],
      });
    }, now);
    const jobs = await adapter.collect();
    expect(jobs[0]).toMatchObject({
      sourceId: 'hn',
      company: 'Acme',
      title: 'SRE',
      url: 'https://news.ycombinator.com/item?id=99',
    });
  });

  it('throws when the current month story is missing', async () => {
    const adapter = new HnHiringAdapter(async () => JSON.stringify({
      hits: [{ objectID: '1', title: 'Ask HN: Who is hiring? (September 2026)' }],
    }), now);
    await expect(adapter.collect()).rejects.toThrow(/story/);
  });

  it('drops a comment without a company separator', async () => {
    const adapter = new HnHiringAdapter(async (url) => {
      if (url.includes('search_by_date')) {
        return JSON.stringify({
          hits: [{ objectID: '2', title: 'Ask HN: Who is hiring? (October 2026)' }],
        });
      }
      return JSON.stringify({
        hits: [{
          objectID: '100',
          comment_text: 'Looking for work',
          created_at: '2026-10-01T00:00:00.000Z',
        }],
      });
    }, now);
    expect(await adapter.collect()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/services/devops-jobs-hn.adapter.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the adapter**

Create `src/services/devops-jobs-hn.adapter.ts`:

```ts
import { DEVOPS_JOB_SOURCE_URLS } from '../config/devops-jobs-sources';
import type { DevopsJob } from '../types/devops-jobs';
import { getDevopsJobsText } from './devops-jobs-http';
import { toDevopsJob } from './devops-jobs-record';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface HnHit {
  objectID?: string;
  title?: string;
  comment_text?: string;
  created_at?: string;
}

export class HnHiringAdapter {
  readonly key = 'hn';

  constructor(
    private readonly getText: (url: string) => Promise<string> = getDevopsJobsText,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async collect(): Promise<DevopsJob[]> {
    const month = MONTHS[this.now().getUTCMonth()];
    const year = this.now().getUTCFullYear();
    const expected = `Ask HN: Who is hiring? (${month} ${year})`;
    const storyUrl = `${DEVOPS_JOB_SOURCE_URLS.hnStories}?tags=story&query=${encodeURIComponent('Ask HN: Who is hiring')}&hitsPerPage=5`;
    const stories = await this.hits(storyUrl);
    const story = stories.find((hit) => hit.title === expected && hit.objectID);
    if (!story?.objectID) throw new Error('Current HN hiring story was not found');
    const commentUrl = `${DEVOPS_JOB_SOURCE_URLS.hnComments}?tags=${encodeURIComponent(`comment,story_${story.objectID}`)}&hitsPerPage=200`;
    const comments = await this.hits(commentUrl);
    return comments.flatMap((hit) => {
      const parsed = companyAndTitle(hit.comment_text ?? '');
      if (!parsed || !hit.objectID || !hit.created_at) return [];
      const job = toDevopsJob({
        id: hit.objectID,
        sourceId: this.key,
        sourceName: 'HN Who is hiring',
        title: parsed.title,
        company: parsed.company,
        url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        description: hit.comment_text,
        publishedAt: hit.created_at,
      });
      return job ? [job] : [];
    });
  }

  private async hits(url: string): Promise<HnHit[]> {
    const parsed: unknown = JSON.parse(await this.getText(url));
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { hits?: unknown }).hits)) {
      throw new Error('HN payload is not a hit list');
    }
    return (parsed as { hits: HnHit[] }).hits;
  }
}

function companyAndTitle(text: string): { company: string; title: string } | undefined {
  const first = text.split('\n')[0] ?? '';
  const separator = first.includes('|') ? '|' : /\s+-\s+/.test(first) ? '-' : undefined;
  if (!separator) return undefined;
  const [company, title] = separator === '|'
    ? first.split('|').map((part) => part.trim())
    : first.split(/\s+-\s+/).map((part) => part.trim());
  if (!company || !title) return undefined;
  return { company, title };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run tests/services/devops-jobs-hn.adapter.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/devops-jobs-hn.adapter.ts tests/services/devops-jobs-hn.adapter.test.ts
git commit -m "$(cat <<'EOF'
feat: collect the current HN hiring thread

EOF
)"
```

---

### Task 7: LinkedIn guest HTML and Indeed RSS

**Files:**
- Create: `src/services/devops-jobs-linkedin.adapter.ts`
- Create: `src/services/devops-jobs-indeed.adapter.ts`
- Test: `tests/services/devops-jobs-public-search.adapter.test.ts`

**Interfaces:**
- Consumes: `collectDevopsJobQueries`, `toDevopsJob`
- Produces: `LinkedInJobsAdapter.key = 'linkedin'`, `IndeedJobsAdapter.key = 'indeed'`

- [ ] **Step 1: Write the failing test**

Create `tests/services/devops-jobs-public-search.adapter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { IndeedJobsAdapter } from '../../src/services/devops-jobs-indeed.adapter';
import { LinkedInJobsAdapter } from '../../src/services/devops-jobs-linkedin.adapter';

const card = `
  <li class="base-card">
    <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/15"></a>
    <h3 class="base-search-card__title">DevOps Engineer</h3>
    <h4 class="base-search-card__subtitle">Acme</h4>
    <span class="job-search-card__location">Worldwide</span>
    <time datetime="2026-10-02"></time>
  </li>`;

describe('public search adapters', () => {
  it('parses a LinkedIn guest card', async () => {
    const adapter = new LinkedInJobsAdapter(async (url) => {
      if (!url.includes('keywords=devops')) throw new Error('HTTP 403');
      return card;
    });
    const jobs = await adapter.collect();
    expect(jobs[0]).toMatchObject({
      sourceId: 'linkedin',
      company: 'Acme',
      title: 'DevOps Engineer',
      location: 'Worldwide',
      publishedAt: '2026-10-02T00:00:00.000Z',
    });
  });

  it('treats a LinkedIn auth wall on every query as failure', async () => {
    const adapter = new LinkedInJobsAdapter(async () => '<html>authwall login</html>');
    await expect(adapter.collect()).rejects.toThrow(/queries failed/);
  });

  it('treats a LinkedIn 200 with no cards as zero jobs', async () => {
    const adapter = new LinkedInJobsAdapter(async () => '<html><body>No matching jobs</body></html>');
    expect(await adapter.collect()).toEqual([]);
  });

  it('reads an Indeed RSS item', async () => {
    const adapter = new IndeedJobsAdapter(async (query) => {
      if (query !== 'devops') throw new Error('HTTP 403');
      return {
        items: [{
          title: 'DevOps Engineer - Acme',
          link: 'https://www.indeed.com/viewjob?jk=abc',
          content: 'Remote worldwide',
          isoDate: '2026-10-02T00:00:00.000Z',
        }],
      };
    });
    const jobs = await adapter.collect();
    expect(jobs[0]).toMatchObject({
      sourceId: 'indeed',
      title: 'DevOps Engineer',
      company: 'Acme',
    });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/services/devops-jobs-public-search.adapter.test.ts`

Expected: FAIL because the adapters do not exist.

- [ ] **Step 3: Implement both adapters**

Create `src/services/devops-jobs-linkedin.adapter.ts`:

```ts
import * as cheerio from 'cheerio';
import { DEVOPS_JOB_QUERIES, DEVOPS_JOB_SOURCE_URLS } from '../config/devops-jobs-sources';
import type { DevopsJob } from '../types/devops-jobs';
import { getDevopsJobsText } from './devops-jobs-http';
import { toDevopsJob } from './devops-jobs-record';
import { collectDevopsJobQueries } from './devops-jobs-search';

export class LinkedInJobsAdapter {
  readonly key = 'linkedin';

  constructor(private readonly getText: (url: string) => Promise<string> = getDevopsJobsText) {}

  collect(): Promise<DevopsJob[]> {
    return collectDevopsJobQueries(DEVOPS_JOB_QUERIES, (query) => this.one(query));
  }

  private async one(query: string): Promise<DevopsJob[]> {
    const url = `${DEVOPS_JOB_SOURCE_URLS.linkedin}?keywords=${encodeURIComponent(query)}&location=Worldwide&f_WT=2&start=0`;
    const html = await this.getText(url);
    if (/authwall/i.test(html) || /loginCsrfParam/.test(html)) {
      throw new Error('LinkedIn auth wall');
    }
    const $ = cheerio.load(html);
    const cards = $('.base-card, .job-search-card').toArray();
    return cards.flatMap((element) => {
      const card = $(element);
      const href = card.find('a.base-card__full-link, a[href*="/jobs/view/"]').attr('href') ?? '';
      const datetime = card.find('time').attr('datetime') ?? '';
      const job = toDevopsJob({
        id: href,
        sourceId: this.key,
        sourceName: 'LinkedIn',
        title: card.find('.base-search-card__title, h3').text(),
        company: card.find('.base-search-card__subtitle, h4').text(),
        url: href,
        location: card.find('.job-search-card__location').text(),
        publishedAt: datetime,
      });
      return job ? [job] : [];
    });
  }
}
```

Create `src/services/devops-jobs-indeed.adapter.ts`:

```ts
import Parser from 'rss-parser';
import { DEVOPS_JOB_QUERIES, DEVOPS_JOB_SOURCE_URLS } from '../config/devops-jobs-sources';
import type { DevopsJob } from '../types/devops-jobs';
import { getDevopsJobsText } from './devops-jobs-http';
import { toDevopsJob } from './devops-jobs-record';
import { collectDevopsJobQueries } from './devops-jobs-search';

interface FeedItem {
  title?: string;
  link?: string;
  content?: string;
  isoDate?: string;
}

export class IndeedJobsAdapter {
  readonly key = 'indeed';

  constructor(
    private readonly load: (query: string) => Promise<{ items?: FeedItem[] }> = async (query) => {
      const url = `${DEVOPS_JOB_SOURCE_URLS.indeed}?q=${encodeURIComponent(query)}&l=Remote&fromage=3&sort=date`;
      return new Parser().parseString(await getDevopsJobsText(url));
    },
  ) {}

  collect(): Promise<DevopsJob[]> {
    return collectDevopsJobQueries(DEVOPS_JOB_QUERIES, (query) => this.one(query));
  }

  private async one(query: string): Promise<DevopsJob[]> {
    const feed = await this.load(query);
    if (!feed.items) throw new Error('Indeed feed has no items');
    return feed.items.flatMap((item) => {
      const split = item.title?.split(' - ') ?? [];
      const title = split[0]?.trim();
      const company = split.slice(1).join(' - ').trim();
      if (!title || !company || !item.link || !item.isoDate) return [];
      const job = toDevopsJob({
        id: item.link,
        sourceId: this.key,
        sourceName: 'Indeed',
        title,
        company,
        url: item.link,
        description: item.content,
        publishedAt: item.isoDate,
      });
      return job ? [job] : [];
    });
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run tests/services/devops-jobs-public-search.adapter.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/devops-jobs-linkedin.adapter.ts src/services/devops-jobs-indeed.adapter.ts tests/services/devops-jobs-public-search.adapter.test.ts
git commit -m "$(cat <<'EOF'
feat: collect public LinkedIn and Indeed job posts

EOF
)"
```

---

### Task 8: Source fan-out

**Files:**
- Create: `src/services/devops-jobs-source.adapter.ts`
- Create: `src/services/devops-jobs-source.service.ts`
- Test: `tests/services/devops-jobs-source.service.test.ts`

**Interfaces:**
- Consumes: `DevopsJob`, `DevopsJobsCollectionResult`
- Produces: `DevopsJobsSourceAdapter` with `key` and `collect()`, and `DevopsJobsSourceService.collectLatest()`

- [ ] **Step 1: Write the failing test**

Create `tests/services/devops-jobs-source.service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { DevopsJobsSourceAdapter } from '../../src/services/devops-jobs-source.adapter';
import { DevopsJobsSourceService } from '../../src/services/devops-jobs-source.service';
import type { DevopsJob } from '../../src/types/devops-jobs';

function adapter(key: string, result: DevopsJob[] | Error): DevopsJobsSourceAdapter {
  return {
    key,
    collect: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

const job: DevopsJob = {
  id: '1',
  sourceId: 'remoteok',
  sourceName: 'Remote OK',
  title: 'DevOps',
  company: 'Acme',
  url: 'https://example.com/1',
  location: '',
  description: '',
  tags: [],
  publishedAt: '2026-10-02T00:00:00.000Z',
};

describe('DevopsJobsSourceService', () => {
  it('keeps jobs from live sources when one adapter throws', async () => {
    const service = new DevopsJobsSourceService([
      adapter('remoteok', [job]),
      adapter('linkedin', new Error('HTTP 403')),
    ]);
    const result = await service.collectLatest();
    expect(result.collectedCount).toBe(1);
    expect(result.successfulSourceCount).toBe(1);
    expect(result.failedSources).toEqual(['linkedin']);
  });

  it('counts an empty adapter as success', async () => {
    const service = new DevopsJobsSourceService([adapter('indeed', [])]);
    const result = await service.collectLatest();
    expect(result.successfulSourceCount).toBe(1);
    expect(result.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/services/devops-jobs-source.service.test.ts`

Expected: FAIL because the source service does not exist.

- [ ] **Step 3: Implement fan-out**

Create `src/services/devops-jobs-source.adapter.ts`:

```ts
import type { DevopsJob } from '../types/devops-jobs';

export interface DevopsJobsSourceAdapter {
  readonly key: string;
  collect(): Promise<DevopsJob[]>;
}
```

Create `src/services/devops-jobs-source.service.ts`:

```ts
import type { DevopsJob, DevopsJobsCollectionResult } from '../types/devops-jobs';
import type { DevopsJobsSourceAdapter } from './devops-jobs-source.adapter';

export class DevopsJobsSourceService {
  constructor(private readonly adapters: readonly DevopsJobsSourceAdapter[]) {}

  async collectLatest(): Promise<DevopsJobsCollectionResult> {
    const settled = await Promise.allSettled(
      this.adapters.map((adapter) => adapter.collect()),
    );
    const items: DevopsJob[] = [];
    const failedSources: string[] = [];
    settled.forEach((result, index) => {
      const key = this.adapters[index]?.key ?? `source-${index}`;
      if (result.status === 'fulfilled') items.push(...result.value);
      else failedSources.push(key);
    });
    return {
      items,
      collectedCount: items.length,
      successfulSourceCount: this.adapters.length - failedSources.length,
      failedSources,
    };
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run tests/services/devops-jobs-source.service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/devops-jobs-source.adapter.ts src/services/devops-jobs-source.service.ts tests/services/devops-jobs-source.service.test.ts
git commit -m "$(cat <<'EOF'
feat: fan out DevOps job collection across sources

EOF
)"
```

---

### Task 9: Flow, delivery, and lock

**Files:**
- Create: `src/services/devops-jobs-digest-lock.ts`
- Create: `src/services/devops-jobs-delivery.service.ts`
- Create: `src/services/devops-jobs-flow.service.ts`
- Test: `tests/services/devops-jobs-digest-lock.test.ts`
- Test: `tests/services/devops-jobs-flow.service.test.ts`
- Test: `tests/services/devops-jobs-flow.factory.test.ts`

**Interfaces:**
- Consumes: collection, selection, and message types; `SentHistoryStore`; `createTelegramService`
- Produces: `tryAcquireDevopsJobsDigestLock`, `releaseDevopsJobsDigestLock`, `DevopsJobsFlowService.run()`, `createDevopsJobsFlowService()`, `AllDevopsJobsSourcesFailedError`, `isAllDevopsJobsSourcesFailedError`, `DevopsJobsFlowError`

- [ ] **Step 1: Write the failing tests**

Create `tests/services/devops-jobs-digest-lock.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import {
  releaseDevopsJobsDigestLock,
  tryAcquireDevopsJobsDigestLock,
} from '../../src/services/devops-jobs-digest-lock';

describe('devops-jobs digest lock', () => {
  afterEach(() => {
    releaseDevopsJobsDigestLock();
  });

  it('rejects a second acquire until released', () => {
    expect(tryAcquireDevopsJobsDigestLock()).toBe(true);
    expect(tryAcquireDevopsJobsDigestLock()).toBe(false);
    releaseDevopsJobsDigestLock();
    expect(tryAcquireDevopsJobsDigestLock()).toBe(true);
  });

  it('survives a fresh import of the lock module', async () => {
    expect(tryAcquireDevopsJobsDigestLock()).toBe(true);
    const reimported = await import('../../src/services/devops-jobs-digest-lock');
    expect(reimported.tryAcquireDevopsJobsDigestLock()).toBe(false);
  });
});
```

Create `tests/services/devops-jobs-flow.service.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  AllDevopsJobsSourcesFailedError,
  DevopsJobsFlowError,
  DevopsJobsFlowService,
} from '../../src/services/devops-jobs-flow.service';
import type { DevopsJob, DevopsJobsCollectionResult } from '../../src/types/devops-jobs';

const job: DevopsJob = {
  id: '1',
  sourceId: 'remoteok',
  sourceName: 'Remote OK',
  title: 'DevOps',
  company: 'Acme',
  url: 'https://example.com/1',
  location: '',
  description: '',
  tags: [],
  publishedAt: '2026-10-02T00:00:00.000Z',
};

function collection(overrides: Partial<DevopsJobsCollectionResult> = {}): DevopsJobsCollectionResult {
  return {
    items: [job],
    collectedCount: 1,
    successfulSourceCount: 1,
    failedSources: [],
    ...overrides,
  };
}

function flow(overrides: {
  collection?: DevopsJobsCollectionResult;
  seen?: Set<string>;
  selected?: DevopsJob[];
  eligibleCount?: number;
  skippedSeenCount?: number;
} = {}) {
  const send = vi.fn().mockResolvedValue(undefined);
  const service = new DevopsJobsFlowService({
    source: { collectLatest: vi.fn().mockResolvedValue(overrides.collection ?? collection()) },
    history: { seenUrls: vi.fn().mockResolvedValue(overrides.seen ?? new Set<string>()) },
    selection: {
      select: vi.fn().mockReturnValue({
        selected: overrides.selected ?? [job],
        eligibleCount: overrides.eligibleCount ?? 1,
        skippedSeenCount: overrides.skippedSeenCount ?? 0,
      }),
    },
    messages: {
      buildMessages: vi.fn().mockResolvedValue([{ text: 'card', url: job.url }]),
    },
    delivery: { send },
  });
  return { service, send };
}

describe('DevopsJobsFlowService', () => {
  it('throws when every source fails', async () => {
    const { service } = flow({
      collection: collection({ items: [], collectedCount: 0, successfulSourceCount: 0, failedSources: ['remoteok'] }),
    });
    await expect(service.run()).rejects.toBeInstanceOf(AllDevopsJobsSourcesFailedError);
  });

  it('sends when some sources fail', async () => {
    const { service, send } = flow({
      collection: collection({ failedSources: ['linkedin'], successfulSourceCount: 6 }),
    });
    const result = await service.run();
    expect(send).toHaveBeenCalledOnce();
    expect(result.sent).toBe(true);
    expect(result.partial).toBe(true);
    expect(result.channel).toBe('telegram-devops-jobs');
    expect(result.language).toBe('vi');
  });

  it('returns no_new_articles without sending', async () => {
    const { service, send } = flow({ selected: [], eligibleCount: 0, skippedSeenCount: 1 });
    const result = await service.run();
    expect(send).not.toHaveBeenCalled();
    expect(result).toMatchObject({ sent: false, reason: 'no_new_articles', messageCount: 0 });
  });

  it('wraps a history read failure', async () => {
    const service = new DevopsJobsFlowService({
      source: { collectLatest: vi.fn().mockResolvedValue(collection()) },
      history: { seenUrls: vi.fn().mockRejectedValue(new Error('disk')) },
      selection: { select: vi.fn() },
      messages: { buildMessages: vi.fn() },
      delivery: { send: vi.fn() },
    });
    await expect(service.run()).rejects.toMatchObject({ code: 'sent-history-read-failed' } satisfies Partial<DevopsJobsFlowError>);
  });
});
```

Create `tests/services/devops-jobs-flow.factory.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DevopsJobsFlowError, assertDevopsJobsConfigured } from '../../src/services/devops-jobs-flow.service';

describe('assertDevopsJobsConfigured', () => {
  it.each(['', 'test-devops-jobs-token', 'replace_me'])('rejects token %j', (botToken) => {
    expect(() => assertDevopsJobsConfigured({
      botToken,
      chatId: '-100123',
    })).toThrow(DevopsJobsFlowError);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/services/devops-jobs-digest-lock.test.ts tests/services/devops-jobs-flow.service.test.ts tests/services/devops-jobs-flow.factory.test.ts`

Expected: FAIL because the flow modules do not exist.

- [ ] **Step 3: Implement lock, delivery, and flow**

Create `src/services/devops-jobs-digest-lock.ts`:

```ts
const LOCK = Symbol.for('tech-news-telegram:devops-jobs-digest-running');

type LockSlot = typeof globalThis & { [LOCK]?: boolean };

export function tryAcquireDevopsJobsDigestLock(): boolean {
  const slots: LockSlot = globalThis;
  if (slots[LOCK]) return false;
  slots[LOCK] = true;
  return true;
}

export function releaseDevopsJobsDigestLock(): void {
  const slots: LockSlot = globalThis;
  slots[LOCK] = false;
}
```

Create `src/services/devops-jobs-delivery.service.ts`:

```ts
import type { DevopsJobsMessage } from '../types/devops-jobs';

interface DevopsJobsTelegramLike {
  sendDigest(
    message: string,
    url?: string,
    imageUrl?: string,
    buttonText?: string,
  ): Promise<void>;
}

interface DevopsJobsHistoryLike {
  mark(url: string): Promise<void>;
}

export class DevopsJobsDeliveryService {
  constructor(
    private readonly telegram: DevopsJobsTelegramLike,
    private readonly history: DevopsJobsHistoryLike,
  ) {}

  async send(messages: readonly DevopsJobsMessage[]): Promise<void> {
    for (const message of messages) {
      await this.telegram.sendDigest(message.text, message.url, undefined, 'Xem tin gốc');
      await this.history.mark(message.url);
    }
  }
}
```

Create `src/services/devops-jobs-flow.service.ts`:

```ts
import { env } from '../config/env';
import type {
  DevopsJob,
  DevopsJobsCollectionResult,
  DevopsJobsFlowResult,
  DevopsJobsMessage,
  DevopsJobsSelectionResult,
} from '../types/devops-jobs';
import { SentHistoryStore } from './sent-history.store';
import { createTelegramService } from './telegram.service';
import { DevopsJobsDeliveryService } from './devops-jobs-delivery.service';
import { HimalayasAdapter } from './devops-jobs-himalayas.adapter';
import { HnHiringAdapter } from './devops-jobs-hn.adapter';
import { IndeedJobsAdapter } from './devops-jobs-indeed.adapter';
import { LinkedInJobsAdapter } from './devops-jobs-linkedin.adapter';
import { DevopsJobsMessageService } from './devops-jobs-message.service';
import { RemoteOkAdapter } from './devops-jobs-remoteok.adapter';
import { RemotiveAdapter } from './devops-jobs-remotive.adapter';
import { DevopsJobsSelectionService } from './devops-jobs-selection.service';
import { DevopsJobsSourceService } from './devops-jobs-source.service';
import { WeWorkRemotelyAdapter } from './devops-jobs-weworkremotely.adapter';

const PLACEHOLDER_VALUES = new Set([
  'test-devops-jobs-token',
  'test-devops-jobs-chat-id',
  'replace_me',
]);

export class AllDevopsJobsSourcesFailedError extends Error {
  constructor() {
    super('All devops-jobs sources failed');
    this.name = 'AllDevopsJobsSourcesFailedError';
  }
}

export function isAllDevopsJobsSourcesFailedError(error: unknown): boolean {
  return error instanceof AllDevopsJobsSourcesFailedError
    || (error instanceof Error && error.name === 'AllDevopsJobsSourcesFailedError');
}

export class DevopsJobsFlowError extends Error {
  constructor(readonly code: 'telegram-not-configured' | 'sent-history-read-failed') {
    super(code);
    this.name = 'DevopsJobsFlowError';
  }
}

export function assertDevopsJobsConfigured(configuration: {
  botToken: string;
  chatId: string;
}): void {
  const botToken = configuration.botToken.trim();
  const chatId = configuration.chatId.trim();
  if (
    botToken === ''
    || chatId === ''
    || PLACEHOLDER_VALUES.has(botToken.toLowerCase())
    || PLACEHOLDER_VALUES.has(chatId.toLowerCase())
  ) {
    throw new DevopsJobsFlowError('telegram-not-configured');
  }
}

export interface DevopsJobsFlowDependencies {
  source: { collectLatest(): Promise<DevopsJobsCollectionResult> };
  history: { seenUrls(): Promise<Set<string>> };
  selection: {
    select(jobs: readonly DevopsJob[], seenUrls: ReadonlySet<string>): DevopsJobsSelectionResult;
  };
  messages: { buildMessages(jobs: readonly DevopsJob[]): Promise<DevopsJobsMessage[]> };
  delivery: { send(messages: readonly DevopsJobsMessage[]): Promise<void> };
}

export class DevopsJobsFlowService {
  constructor(private readonly dependencies: DevopsJobsFlowDependencies) {}

  async run(): Promise<DevopsJobsFlowResult> {
    const { source, history, selection, messages, delivery } = this.dependencies;
    const collection = await source.collectLatest();
    if (collection.successfulSourceCount === 0) {
      throw new AllDevopsJobsSourcesFailedError();
    }
    let seenUrls: Set<string>;
    try {
      seenUrls = await history.seenUrls();
    } catch (error) {
      if (isAllDevopsJobsSourcesFailedError(error)) throw error;
      throw new DevopsJobsFlowError('sent-history-read-failed');
    }
    const result = selection.select(collection.items, seenUrls);
    const common = {
      channel: 'telegram-devops-jobs' as const,
      collectedCount: collection.collectedCount,
      eligibleCount: result.eligibleCount,
      skippedSeenCount: result.skippedSeenCount,
      partial: collection.failedSources.length > 0,
      failedSources: collection.failedSources,
      language: 'vi' as const,
    };
    if (result.selected.length === 0) {
      return { sent: false, reason: 'no_new_articles', messageCount: 0, ...common };
    }
    const built = await messages.buildMessages(result.selected);
    await delivery.send(built);
    return { sent: true, messageCount: built.length, ...common };
  }
}

export function createDevopsJobsFlowService(): DevopsJobsFlowService {
  assertDevopsJobsConfigured({
    botToken: env.DEVOPS_JOBS_TELEGRAM_BOT_TOKEN,
    chatId: env.DEVOPS_JOBS_TELEGRAM_CHAT_ID,
  });
  const source = new DevopsJobsSourceService([
    new RemoteOkAdapter(),
    new RemotiveAdapter(),
    new WeWorkRemotelyAdapter(),
    new HimalayasAdapter(),
    new HnHiringAdapter(),
    new LinkedInJobsAdapter(),
    new IndeedJobsAdapter(),
  ]);
  const history = new SentHistoryStore(
    env.DEVOPS_JOBS_HISTORY_PATH,
    env.DEVOPS_JOBS_HISTORY_RETENTION_DAYS,
    () => new Date(),
    { failurePolicy: 'fail-closed' },
  );
  const selection = new DevopsJobsSelectionService(
    env.DEVOPS_JOBS_MAX_JOBS,
    env.DEVOPS_JOBS_MAX_PER_SOURCE,
    env.DEVOPS_JOBS_MAX_AGE_HOURS,
  );
  const telegram = createTelegramService(
    env.DEVOPS_JOBS_TELEGRAM_BOT_TOKEN,
    env.DEVOPS_JOBS_TELEGRAM_CHAT_ID,
  );
  return new DevopsJobsFlowService({
    source,
    history,
    selection,
    messages: new DevopsJobsMessageService(),
    delivery: new DevopsJobsDeliveryService(telegram, history),
  });
}
```

Confirm `createTelegramService` is exported from `src/services/telegram.service.ts`. It is the factory used by `createDevopsInfraFlowService`.

Add these env fields in this same step so the factory typechecks:

```ts
DEVOPS_JOBS_TELEGRAM_BOT_TOKEN: z.string().default('test-devops-jobs-token'),
DEVOPS_JOBS_TELEGRAM_CHAT_ID: z.string().default('test-devops-jobs-chat-id'),
DEVOPS_JOBS_MAX_JOBS: z.coerce.number().int().min(1).max(50).default(8),
DEVOPS_JOBS_MAX_PER_SOURCE: z.coerce.number().int().min(1).max(10).default(2),
DEVOPS_JOBS_MAX_AGE_HOURS: z.coerce.number().int().positive().default(72),
DEVOPS_JOBS_HISTORY_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
DEVOPS_JOBS_HISTORY_PATH: z.string().min(1).default('data/devops-jobs-sent-history.json'),
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/services/devops-jobs-digest-lock.test.ts tests/services/devops-jobs-flow.service.test.ts tests/services/devops-jobs-flow.factory.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/devops-jobs-digest-lock.ts src/services/devops-jobs-delivery.service.ts src/services/devops-jobs-flow.service.ts src/config/env.ts tests/services/devops-jobs-digest-lock.test.ts tests/services/devops-jobs-flow.service.test.ts tests/services/devops-jobs-flow.factory.test.ts
git commit -m "$(cat <<'EOF'
feat: orchestrate the remote DevOps jobs Telegram flow

EOF
)"
```

---

### Task 10: HTTP route, env test, and README

**Files:**
- Modify: `src/controllers/telegram.controller.ts`
- Modify: `src/routes/telegram.routes.ts`
- Modify: `tests/config/env.test.ts`
- Modify: `README.md`
- Test: `tests/routes/telegram-devops-jobs.routes.test.ts`

**Interfaces:**
- Consumes: `createDevopsJobsFlowService`, `isAllDevopsJobsSourcesFailedError`, lock functions
- Produces: `POST /telegram/send-devops-jobs`

- [ ] **Step 1: Write the failing tests**

Add this test to `tests/config/env.test.ts`:

```ts
it('provides isolated devops-jobs defaults', () => {
  expect(readEnvValues([
    'DEVOPS_JOBS_TELEGRAM_BOT_TOKEN',
    'DEVOPS_JOBS_TELEGRAM_CHAT_ID',
    'DEVOPS_JOBS_MAX_JOBS',
    'DEVOPS_JOBS_MAX_PER_SOURCE',
    'DEVOPS_JOBS_MAX_AGE_HOURS',
    'DEVOPS_JOBS_HISTORY_RETENTION_DAYS',
    'DEVOPS_JOBS_HISTORY_PATH',
  ])).toEqual({
    DEVOPS_JOBS_TELEGRAM_BOT_TOKEN: 'test-devops-jobs-token',
    DEVOPS_JOBS_TELEGRAM_CHAT_ID: 'test-devops-jobs-chat-id',
    DEVOPS_JOBS_MAX_JOBS: 8,
    DEVOPS_JOBS_MAX_PER_SOURCE: 2,
    DEVOPS_JOBS_MAX_AGE_HOURS: 72,
    DEVOPS_JOBS_HISTORY_RETENTION_DAYS: 7,
    DEVOPS_JOBS_HISTORY_PATH: 'data/devops-jobs-sent-history.json',
  });
});
```

Create `tests/routes/telegram-devops-jobs.routes.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDevopsJobsFlowService: vi.fn(),
  jobsRun: vi.fn(),
  createDevopsInfraFlowService: vi.fn(),
  devopsRun: vi.fn(),
  gadgetRun: vi.fn(),
  healthRun: vi.fn(),
  goldRun: vi.fn(),
}));

vi.mock('../../src/services/devops-jobs-flow.service', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/services/devops-jobs-flow.service')>(),
  createDevopsJobsFlowService: mocks.createDevopsJobsFlowService,
}));
vi.mock('../../src/services/devops-infra-flow.service', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/services/devops-infra-flow.service')>(),
  createDevopsInfraFlowService: mocks.createDevopsInfraFlowService,
}));
vi.mock('../../src/services/gadget-flow.service', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/services/gadget-flow.service')>(),
  createGadgetFlowService: () => ({ run: mocks.gadgetRun }),
}));
vi.mock('../../src/services/health-flow.service', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/services/health-flow.service')>(),
  createHealthFlowService: () => ({ run: mocks.healthRun }),
}));
vi.mock('../../src/services/gold-politics-flow.service', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/services/gold-politics-flow.service')>(),
  createGoldPoliticsFlowService: () => ({ run: mocks.goldRun }),
}));

import request from 'supertest';
import { releaseDevopsJobsDigestLock } from '../../src/services/devops-jobs-digest-lock';

const success = {
  sent: true,
  channel: 'telegram-devops-jobs',
  messageCount: 1,
  collectedCount: 2,
  eligibleCount: 1,
  skippedSeenCount: 0,
  partial: false,
  failedSources: [],
  language: 'vi',
};

async function createTestApp() {
  const { createApp } = await import('../../src/app');
  return createApp();
}

describe('POST /telegram/send-devops-jobs', () => {
  beforeEach(() => {
    vi.resetModules();
    releaseDevopsJobsDigestLock();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.createDevopsJobsFlowService.mockImplementation(() => ({ run: mocks.jobsRun }));
    mocks.createDevopsInfraFlowService.mockImplementation(() => ({ run: mocks.devopsRun }));
  });

  it('returns the flow response unchanged', async () => {
    mocks.jobsRun.mockResolvedValue(success);
    const response = await request(await createTestApp()).post('/telegram/send-devops-jobs');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(success);
    expect(JSON.stringify(response.body)).not.toContain('test-devops-jobs-token');
  });

  it('maps all failed sources to 503', async () => {
    const { AllDevopsJobsSourcesFailedError } = await import(
      '../../src/services/devops-jobs-flow.service'
    );
    mocks.jobsRun.mockRejectedValue(new AllDevopsJobsSourcesFailedError());
    const response = await request(await createTestApp()).post('/telegram/send-devops-jobs');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'All devops-jobs sources failed' });
  });

  it('returns 409 while another devops-jobs run is active', async () => {
    let release!: () => void;
    const promise = new Promise<typeof success>((resolve) => {
      release = () => resolve(success);
    });
    mocks.jobsRun.mockReturnValue(promise);
    const app = await createTestApp();
    const first = request(app).post('/telegram/send-devops-jobs');
    try {
      await vi.waitFor(() => expect(mocks.jobsRun).toHaveBeenCalledOnce());
      const second = await request(app).post('/telegram/send-devops-jobs');
      expect(second.status).toBe(409);
      expect(second.body).toEqual({ error: 'DevOps jobs digest is already running' });
    } finally {
      release();
    }
    await first;
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/config/env.test.ts tests/routes/telegram-devops-jobs.routes.test.ts`

Expected: the route test FAILs with 404. The env test PASSes if Task 9 already added the schema. If it fails, the schema from Task 9 is missing.

- [ ] **Step 3: Wire the route and document it**

In `src/controllers/telegram.controller.ts`, import the jobs lock and flow factory next to the devops-infra imports and add:

```ts
let devopsJobsFlowService: ReturnType<typeof createDevopsJobsFlowService> | undefined;

export async function sendDevopsJobs(_req: Request, res: Response) {
  if (!tryAcquireDevopsJobsDigestLock()) {
    res.status(409).json({ error: 'DevOps jobs digest is already running' });
    return;
  }
  try {
    devopsJobsFlowService ??= createDevopsJobsFlowService();
    res.json(await devopsJobsFlowService.run());
  } catch (error) {
    if (isAllDevopsJobsSourcesFailedError(error)) {
      res.status(503).json({ error: 'All devops-jobs sources failed' });
      return;
    }
    throw error;
  } finally {
    releaseDevopsJobsDigestLock();
  }
}
```

Register `telegramRoutes.post('/telegram/send-devops-jobs', sendDevopsJobs)` in `src/routes/telegram.routes.ts`.

In `README.md`, after the DevOps infra section, add a section `Luồng DevOps jobs` that states:

- `POST /telegram/send-devops-jobs` sends fixed Vietnamese cards for worldwide remote DevOps, SRE, platform, infrastructure, Kubernetes, and cloud engineer jobs.
- Sources: Remote OK, Remotive, We Work Remotely, Himalayas, the current HN “Who is hiring?” thread, plus public LinkedIn and Indeed pages. LinkedIn and Indeed are skipped when blocked.
- Own bot and chat: `DEVOPS_JOBS_TELEGRAM_BOT_TOKEN` and `DEVOPS_JOBS_TELEGRAM_CHAT_ID`.
- At most 8 jobs, at most 2 per source, 72-hour window except the current HN hiring thread.
- History path `data/devops-jobs-sent-history.json`, retained 7 days.
- Cron `50 8 * * *` Asia/Ho_Chi_Minh.
- HTTP 409 when a run is in progress, HTTP 503 when every source fails.
- This is not the Vietnam jobs PDF email endpoint.

Include:

```bash
curl -X POST http://localhost:3000/telegram/send-devops-jobs
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/config/env.test.ts tests/routes/telegram-devops-jobs.routes.test.ts tests/services/devops-jobs-flow.service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/controllers/telegram.controller.ts src/routes/telegram.routes.ts tests/config/env.test.ts tests/routes/telegram-devops-jobs.routes.test.ts README.md
git commit -m "$(cat <<'EOF'
feat: expose the remote DevOps jobs Telegram endpoint

EOF
)"
```

---

### Task 11: Helm cron

**Files:**
- Modify: `/root/helm/tech-news-telegram/values.yaml`
- Modify: `/root/helm/tech-news-telegram/tests/render-test.sh`

**Interfaces:**
- Consumes: the app endpoint `/telegram/send-devops-jobs`
- Produces: CronJob `test-tech-news-telegram-devops-jobs` at `50 8 * * *`

- [ ] **Step 1: Create the Helm branch and write the failing assertions**

```bash
cd /root/helm
git fetch origin main
git checkout -B feature/devops-jobs-cron origin/main
```

In `tech-news-telegram/tests/render-test.sh`:

- Add `assert_cronjob test-tech-news-telegram-devops-jobs "50 8 * * *" /telegram/send-devops-jobs` after the devops-infra assertion.
- Add the seven `DEVOPS_JOBS_*` keys to the `for key in` list, in alphabetical order beside the other keys.
- Change `test "$secret_env_count" -eq 72` to `test "$secret_env_count" -eq 79`.
- In the long-name awk script, change the suffix pattern to include `devops-jobs` and change `if (count != 5)` to `if (count != 6)`.

- [ ] **Step 2: Run the render test and confirm it fails**

Run from `/root/helm`: `tech-news-telegram/tests/render-test.sh`

Expected: FAIL because the cron job and env keys are absent.

- [ ] **Step 3: Add the cron and empty credentials**

In `tech-news-telegram/values.yaml`, add under `cronjobs.jobs` after `devops-infra`:

```yaml
    devops-jobs:
      enabled: true
      schedule: "50 8 * * *"
      endpoint: /telegram/send-devops-jobs
```

In `secretEnv`, add these keys with empty credentials. Do not copy tokens from other flows:

```yaml
  DEVOPS_JOBS_TELEGRAM_BOT_TOKEN: ""
  DEVOPS_JOBS_TELEGRAM_CHAT_ID: ""
  DEVOPS_JOBS_MAX_JOBS: "8"
  DEVOPS_JOBS_MAX_PER_SOURCE: "2"
  DEVOPS_JOBS_MAX_AGE_HOURS: "72"
  DEVOPS_JOBS_HISTORY_RETENTION_DAYS: "7"
  DEVOPS_JOBS_HISTORY_PATH: "data/devops-jobs-sent-history.json"
```

Leave `Chart.yaml` `version` at `0.3.0`.

- [ ] **Step 4: Run the render test and confirm it passes**

Run from `/root/helm`: `tech-news-telegram/tests/render-test.sh`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add tech-news-telegram/values.yaml tech-news-telegram/tests/render-test.sh
git commit -m "$(cat <<'EOF'
feat: schedule the remote DevOps jobs digest

EOF
)"
```

---

## Self-review notes

- Spec filter, caps, HN exemption, card copy, 409, 503, partial success, and the seven sources each have a task.
- `eligibleCount` excludes already-sent URLs. `skippedSeenCount` counts those URLs only after the keyword, location, and age rules.
- Delivery uses `sendDigest(..., 'Xem tin gốc')` and marks history after Telegram accepts the message.
- We Work Remotely takes a zero-argument feed loader. Indeed’s injected loader receives the query string, not a URL.
