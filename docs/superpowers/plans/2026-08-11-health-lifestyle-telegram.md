# Health and Lifestyle Telegram Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated Vietnamese health/lifestyle Telegram service while refactoring gadget and health onto a shared, typed curated-news engine without changing existing gadget behavior.

**Architecture:** Extract orchestration, RSS collection, balanced selection primitives, and tracked Telegram delivery into domain-neutral modules. Keep gadget and health source lists, classification policies, editorial rules, credentials, locks, and history files isolated; compose each flow through a thin factory.

**Tech Stack:** Node.js 22, TypeScript, Express 5, Vitest, Zod, rss-parser, Telegraf, existing editorial/translation services, JSON atomic history storage.

---

## Scope and Repository Safety

- Implement from the approved spec at `docs/superpowers/specs/2026-08-11-health-lifestyle-telegram-design.md`.
- At execution time, use `superpowers:using-git-worktrees` to create an isolated feature branch from the current committed HEAD. The current checkout contains unrelated unstaged documentation deletions; do not stage, restore, or modify those deletions.
- Never put real Telegram credentials in tracked files, tests, shell output, plan files, or commits.
- Do not make a live Telegram call until the user provides the dedicated health bot credential, sends a message to that bot, and explicitly authorizes live delivery.

## Target File Map

### Shared curated engine

- Create `src/types/curated.ts`: generic collection, selection, message, response, and dependency contracts.
- Create `src/services/curated-telegram-flow.service.ts`: domain-neutral orchestration.
- Create `src/services/curated-rss-source.service.ts`: all-settled RSS collection, freshness filtering, sorting, safety URL filtering, and dedupe.
- Create `src/services/curated-selection.ts`: canonical URL dedupe, Unicode keyword matching, and balanced picking.
- Create `src/services/tracked-telegram-delivery.service.ts`: Telegram delivery with per-message history callbacks.
- Create focused tests for every shared module.

### Gadget adapters

- Modify `src/services/gadget-flow.service.ts`: delegate orchestration to `CuratedTelegramFlow` while preserving public classes, errors, factory, response, and endpoint behavior.
- Modify `src/services/gadget-source.service.ts`: delegate collection to `CuratedRssSourceService`.
- Modify `src/services/gadget-selection.service.ts`: use shared URL/matching/balancing helpers while preserving gadget scoring and classification.
- Modify `src/services/gadget-delivery.service.ts`: thin adapter over tracked delivery.
- Keep existing gadget tests and add explicit characterization assertions.

### Health domain

- Create `src/types/health.ts`: topic, evidence, digest-entry, selection, presentation, and message types.
- Create `src/config/health-sources.ts`: seven approved feeds.
- Create `src/config/health-topics.ts`: six categories, keywords, fallback images/copy, and source affinities.
- Create `src/services/health-safety.service.ts`: promotion/self-medication rejection, evidence labeling, and generated-text sanitization.
- Create `src/services/health-selection.service.ts`: classification, scoring, history suppression, and balancing.
- Create `src/services/health-message.service.ts`: safe editorial context, deterministic validation, HTML rendering, disclaimer, and image fallback.
- Create `src/services/health-source.service.ts`: health wrapper around the shared RSS collector.
- Create `src/services/health-flow.service.ts`: health composition, error type, and response channel.
- Create health unit/integration tests.

### Integration and runtime

- Modify `src/config/env.ts`, `.env.example`, and `README.md`: health credentials, 12-article maximum, 7-day history, endpoint, Docker persistence, and no scheduler.
- Modify `src/services/article-editorial.types.ts`, `src/services/article-editorial.service.ts`, `src/services/openai-article-editorial.generator.ts`, and `src/services/codex-article-editorial.generator.ts`: allow a domain-specific instruction string and fallback action copy without changing current tech defaults.
- Modify `src/controllers/telegram.controller.ts` and `src/routes/telegram.routes.ts`: lazy health flow, independent concurrency guard, 200/409/503 behavior, and `POST /telegram/send-health`.

---

### Task 1: Add the generic curated flow contracts and orchestration

**Files:**
- Create: `src/types/curated.ts`
- Create: `src/services/curated-telegram-flow.service.ts`
- Create: `tests/services/curated-telegram-flow.service.test.ts`

- [ ] **Step 1: Write the failing orchestration tests**

Create `tests/services/curated-telegram-flow.service.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { CuratedTelegramFlow } from '../../src/services/curated-telegram-flow.service';
import type { Article } from '../../src/types/article';

const article: Article = {
  id: 'a', sourceId: 'source', sourceName: 'Source', title: 'Article',
  url: 'https://example.com/a', collectedAt: '2026-08-11T00:00:00.000Z', topics: [],
};
const entry = { article, topic: 'topic', score: 10 };
const message = { text: 'message', url: article.url };

function dependencies() {
  return {
    collector: { collectLatest: vi.fn() },
    history: { seenUrls: vi.fn().mockResolvedValue(new Set<string>()) },
    selector: { select: vi.fn() },
    messageBuilder: { buildMessages: vi.fn() },
    delivery: { send: vi.fn().mockResolvedValue(undefined) },
  };
}

describe('CuratedTelegramFlow', () => {
  it('collects, selects, builds, delivers, and returns channel metadata', async () => {
    const deps = dependencies();
    deps.collector.collectLatest.mockResolvedValue({
      articles: [article], successfulSourceCount: 6, failedSourceCount: 1,
    });
    deps.selector.select.mockReturnValue({
      selected: [entry], eligibleCount: 1, skippedSeenCount: 0,
    });
    deps.messageBuilder.buildMessages.mockResolvedValue([message]);
    const flow = new CuratedTelegramFlow(deps, {
      channel: 'telegram-test',
      createAllSourcesFailedError: () => new Error('all failed'),
    });

    await expect(flow.run()).resolves.toEqual({
      sent: true,
      messageCount: 1,
      collectedCount: 1,
      eligibleCount: 1,
      skippedSeenCount: 0,
      language: 'vi',
      channel: 'telegram-test',
    });
    expect(deps.selector.select).toHaveBeenCalledWith([article], new Set());
    expect(deps.delivery.send).toHaveBeenCalledWith([message]);
  });

  it('returns no_new_articles without building or sending messages', async () => {
    const deps = dependencies();
    deps.collector.collectLatest.mockResolvedValue({
      articles: [article], successfulSourceCount: 7, failedSourceCount: 0,
    });
    deps.selector.select.mockReturnValue({
      selected: [], eligibleCount: 0, skippedSeenCount: 1,
    });
    const flow = new CuratedTelegramFlow(deps, {
      channel: 'telegram-test',
      createAllSourcesFailedError: () => new Error('all failed'),
    });

    await expect(flow.run()).resolves.toMatchObject({
      sent: false, reason: 'no_new_articles', messageCount: 0,
    });
    expect(deps.messageBuilder.buildMessages).not.toHaveBeenCalled();
    expect(deps.delivery.send).not.toHaveBeenCalled();
  });

  it('throws the configured domain error when every source fails', async () => {
    const deps = dependencies();
    deps.collector.collectLatest.mockResolvedValue({
      articles: [], successfulSourceCount: 0, failedSourceCount: 7,
    });
    const flow = new CuratedTelegramFlow(deps, {
      channel: 'telegram-test',
      createAllSourcesFailedError: () => new TypeError('domain failure'),
    });

    await expect(flow.run()).rejects.toEqual(new TypeError('domain failure'));
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx vitest run tests/services/curated-telegram-flow.service.test.ts
```

Expected: FAIL because `curated-telegram-flow.service.ts` does not exist.

- [ ] **Step 3: Create the shared contracts**

Create `src/types/curated.ts`:

```typescript
import type { Article } from './article';

export interface CuratedCollectionResult {
  articles: Article[];
  successfulSourceCount: number;
  failedSourceCount: number;
}

export interface CuratedEntry {
  article: Article;
  topic: string;
  score: number;
}

export interface CuratedSelectionResult<TEntry extends CuratedEntry> {
  selected: TEntry[];
  eligibleCount: number;
  skippedSeenCount: number;
}

export interface CuratedMessage {
  text: string;
  url: string;
  imageUrl?: string;
}

export interface CuratedFlowDependencies<
  TEntry extends CuratedEntry,
  TMessage extends CuratedMessage,
> {
  collector: { collectLatest(): Promise<CuratedCollectionResult> };
  history: { seenUrls(): Promise<Set<string>> };
  selector: {
    select(articles: Article[], seen: ReadonlySet<string>): CuratedSelectionResult<TEntry>;
  };
  messageBuilder: { buildMessages(entries: TEntry[]): Promise<TMessage[]> };
  delivery: { send(messages: TMessage[]): Promise<void> };
}

export interface CuratedFlowOptions<TChannel extends string> {
  channel: TChannel;
  createAllSourcesFailedError(): Error;
}
```

- [ ] **Step 4: Implement the generic flow**

Create `src/services/curated-telegram-flow.service.ts`:

```typescript
import type {
  CuratedEntry,
  CuratedFlowDependencies,
  CuratedFlowOptions,
  CuratedMessage,
} from '../types/curated';

export class CuratedTelegramFlow<
  TEntry extends CuratedEntry,
  TMessage extends CuratedMessage,
  TChannel extends string,
> {
  constructor(
    private readonly dependencies: CuratedFlowDependencies<TEntry, TMessage>,
    private readonly options: CuratedFlowOptions<TChannel>,
  ) {}

  async run() {
    const collected = await this.dependencies.collector.collectLatest();
    if (collected.successfulSourceCount === 0) {
      throw this.options.createAllSourcesFailedError();
    }

    const history = await this.dependencies.history.seenUrls();
    const result = this.dependencies.selector.select(collected.articles, history);
    const common = {
      collectedCount: collected.articles.length,
      eligibleCount: result.eligibleCount,
      skippedSeenCount: result.skippedSeenCount,
      language: 'vi' as const,
      channel: this.options.channel,
    };

    if (result.selected.length === 0) {
      return {
        sent: false as const,
        reason: 'no_new_articles' as const,
        messageCount: 0,
        ...common,
      };
    }

    const messages = await this.dependencies.messageBuilder.buildMessages(result.selected);
    await this.dependencies.delivery.send(messages);
    return { sent: true as const, messageCount: messages.length, ...common };
  }
}
```

- [ ] **Step 5: Run focused verification**

Run:

```bash
npx vitest run tests/services/curated-telegram-flow.service.test.ts
npm run build
```

Expected: 3 tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/types/curated.ts src/services/curated-telegram-flow.service.ts tests/services/curated-telegram-flow.service.test.ts
git commit -m "feat: add shared curated Telegram flow"
```

### Task 2: Refactor gadget orchestration onto the shared flow

**Files:**
- Modify: `src/services/gadget-flow.service.ts`
- Modify: `tests/services/gadget-flow.service.test.ts`
- Test: `tests/routes/telegram-gadgets.routes.test.ts`

- [ ] **Step 1: Strengthen gadget characterization before refactoring**

Add to the successful test in `tests/services/gadget-flow.service.test.ts`:

```typescript
await expect(flow.run()).resolves.toEqual({
  sent: true,
  messageCount: 1,
  collectedCount: 1,
  eligibleCount: 1,
  skippedSeenCount: 0,
  language: 'vi',
  channel: 'telegram-gadgets',
});
expect(deps.history.seenUrls).toHaveBeenCalledOnce();
expect(deps.selection.select).toHaveBeenCalledWith([article], new Set());
expect(deps.messages.buildMessages).toHaveBeenCalledWith([entry]);
```

Do not remove the all-source error and no-new tests.

- [ ] **Step 2: Run the characterization suite before the refactor**

Run:

```bash
npx vitest run tests/services/gadget-flow.service.test.ts tests/routes/telegram-gadgets.routes.test.ts
```

Expected: PASS on existing code; this records the behavior that must remain unchanged.

- [ ] **Step 3: Replace gadget orchestration with a thin adapter**

Keep `AllGadgetSourcesFailedError`, `isAllGadgetSourcesFailedError`, and `createGadgetFlowService`. Replace only the body of `GadgetFlowService` with:

```typescript
export class GadgetFlowService {
  private readonly flow: CuratedTelegramFlow<GadgetDigestEntry, GadgetMessage, 'telegram-gadgets'>;

  constructor(
    source: Collector,
    history: HistoryReader,
    selection: Selector,
    messages: MessageBuilder,
    delivery: Delivery,
  ) {
    this.flow = new CuratedTelegramFlow(
      { collector: source, history, selector: selection, messageBuilder: messages, delivery },
      {
        channel: 'telegram-gadgets',
        createAllSourcesFailedError: () => new AllGadgetSourcesFailedError(),
      },
    );
  }

  run() {
    return this.flow.run();
  }
}
```

Add these imports:

```typescript
import { CuratedTelegramFlow } from './curated-telegram-flow.service';
import type { GadgetDigestEntry } from '../types/gadget';
```

Keep the factory wiring to the gadget token, chat, history, source, selector, message builder, and delivery unchanged.

- [ ] **Step 4: Verify gadget behavior is unchanged**

Run:

```bash
npx vitest run tests/services/curated-telegram-flow.service.test.ts tests/services/gadget-flow.service.test.ts tests/routes/telegram-gadgets.routes.test.ts
npm run build
```

Expected: all focused tests PASS and the build exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/services/gadget-flow.service.ts tests/services/gadget-flow.service.test.ts
git commit -m "refactor: run gadgets through curated flow"
```

### Task 3: Extract the reusable RSS collector

**Files:**
- Create: `src/services/curated-rss-source.service.ts`
- Create: `tests/services/curated-rss-source.service.test.ts`
- Modify: `src/services/gadget-source.service.ts`
- Test: `tests/services/gadget-source.service.test.ts`

- [ ] **Step 1: Write failing shared collector tests**

Create `tests/services/curated-rss-source.service.test.ts`:

```typescript
import { expect, it, vi } from 'vitest';
import { CuratedRssSourceService } from '../../src/services/curated-rss-source.service';
import type { Article } from '../../src/types/article';
import type { RssSourceConfig } from '../../src/types/source';

const sources: RssSourceConfig[] = [
  {
    id: 'one', name: 'One', kind: 'rss', enabled: true,
    homepageUrl: 'https://one.test', feedUrl: 'https://one.test/feed.xml',
    includeUnmatched: true,
  },
  {
    id: 'two', name: 'Two', kind: 'rss', enabled: true,
    homepageUrl: 'https://two.test', feedUrl: 'https://two.test/feed.xml',
    includeUnmatched: true,
  },
];

const fresh: Article = {
  id: 'fresh', sourceId: 'one', sourceName: 'One', title: 'Fresh article',
  url: 'https://one.test/fresh', collectedAt: '2026-08-11T00:00:00.000Z', topics: [],
};

it('keeps successful feeds, reports failures, and logs the domain label', async () => {
  const crawler = {
    crawl: vi.fn(async (source: RssSourceConfig) => {
      if (source.id === 'two') throw new Error('down');
      return [fresh];
    }),
  };
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const service = new CuratedRssSourceService({
    sources,
    crawler,
    maxArticleAgeDays: 14,
    logLabel: 'health',
    now: () => new Date('2026-08-11T01:00:00.000Z'),
  });

  try {
    await expect(service.collectLatest()).resolves.toEqual({
      articles: [fresh], successfulSourceCount: 1, failedSourceCount: 1,
    });
    expect(error).toHaveBeenCalledWith('Failed to crawl health source two', expect.any(Error));
  } finally {
    error.mockRestore();
  }
});

it('filters stale, suspicious, invalid-date, and duplicate articles', async () => {
  const stale = { ...fresh, id: 'old', url: 'https://one.test/old', collectedAt: '2026-01-01T00:00:00.000Z' };
  const invalidDate = { ...fresh, id: 'date', url: 'https://one.test/date', collectedAt: 'invalid' };
  const suspicious = { ...fresh, id: 'bad', url: 'https://co88.cfd/bad' };
  const crawler = { crawl: vi.fn().mockResolvedValue([fresh, fresh, stale, invalidDate, suspicious]) };
  const service = new CuratedRssSourceService({
    sources: [sources[0]], crawler, maxArticleAgeDays: 14, logLabel: 'test',
    now: () => new Date('2026-08-11T01:00:00.000Z'),
  });

  await expect(service.collectLatest()).resolves.toMatchObject({ articles: [fresh] });
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
npx vitest run tests/services/curated-rss-source.service.test.ts
```

Expected: FAIL because `CuratedRssSourceService` does not exist.

- [ ] **Step 3: Implement the shared collector**

Create `src/services/curated-rss-source.service.ts`:

```typescript
import type { NewsCrawler } from '../crawlers/crawler.types';
import type { Article } from '../types/article';
import type { CuratedCollectionResult } from '../types/curated';
import type { RssSourceConfig } from '../types/source';
import { dedupeArticles, isAllowedArticle } from './article.service';

interface CuratedRssSourceOptions {
  sources: RssSourceConfig[];
  crawler: NewsCrawler<RssSourceConfig>;
  maxArticleAgeDays: number;
  logLabel: string;
  now?: () => Date;
}

export class CuratedRssSourceService {
  private readonly now: () => Date;

  constructor(private readonly options: CuratedRssSourceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async collectLatest(): Promise<CuratedCollectionResult> {
    const enabled = this.options.sources.filter((source) => source.enabled);
    const settled = await Promise.allSettled(
      enabled.map((source) => this.options.crawler.crawl(source)),
    );
    const articles: Article[] = [];
    let successfulSourceCount = 0;
    let failedSourceCount = 0;

    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successfulSourceCount += 1;
        articles.push(...result.value);
      } else {
        failedSourceCount += 1;
        console.error(
          `Failed to crawl ${this.options.logLabel} source ${enabled[index].id}`,
          result.reason,
        );
      }
    });

    const oldestAllowed = this.now().getTime() - this.options.maxArticleAgeDays * 86_400_000;
    const fresh = articles.filter((article) => {
      const timestamp = new Date(article.publishedAt ?? article.collectedAt).getTime();
      return Number.isFinite(timestamp) && timestamp >= oldestAllowed;
    });
    fresh.sort(
      (left, right) =>
        new Date(right.publishedAt ?? right.collectedAt).getTime()
        - new Date(left.publishedAt ?? left.collectedAt).getTime(),
    );

    return {
      articles: dedupeArticles(fresh.filter(isAllowedArticle)),
      successfulSourceCount,
      failedSourceCount,
    };
  }
}
```

- [ ] **Step 4: Make `GadgetSourceService` a compatibility wrapper**

Replace its collection body with a private shared collector:

```typescript
export type GadgetCollectionResult = CuratedCollectionResult;

export class GadgetSourceService {
  private readonly source: CuratedRssSourceService;

  constructor(
    sources: RssSourceConfig[] = gadgetSources,
    crawler: NewsCrawler<RssSourceConfig> = new RssCrawler(),
    maxArticleAgeDays = env.MAX_ARTICLE_AGE_DAYS,
    now = () => new Date(),
  ) {
    this.source = new CuratedRssSourceService({
      sources, crawler, maxArticleAgeDays, logLabel: 'gadget', now,
    });
  }

  collectLatest() {
    return this.source.collectLatest();
  }
}
```

- [ ] **Step 5: Run shared and gadget collector tests**

```bash
npx vitest run tests/services/curated-rss-source.service.test.ts tests/services/gadget-source.service.test.ts
npm run build
```

Expected: all tests PASS and build exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/services/curated-rss-source.service.ts src/services/gadget-source.service.ts tests/services/curated-rss-source.service.test.ts
git commit -m "refactor: share curated RSS collection"
```

### Task 4: Extract shared selection and tracked-delivery primitives

**Files:**
- Create: `src/services/curated-selection.ts`
- Create: `tests/services/curated-selection.test.ts`
- Create: `src/services/tracked-telegram-delivery.service.ts`
- Create: `tests/services/tracked-telegram-delivery.service.test.ts`
- Modify: `src/services/gadget-selection.service.ts`
- Modify: `src/services/gadget-delivery.service.ts`

- [ ] **Step 1: Write failing tests for shared selection helpers**

Create `tests/services/curated-selection.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  canonicalizeCuratedArticles,
  matchesCuratedKeyword,
  pickBalancedCuratedEntries,
} from '../../src/services/curated-selection';
import type { Article } from '../../src/types/article';

const article = (url: string, sourceId: string): Article => ({
  id: url, sourceId, sourceName: sourceId, title: 'Health article', url,
  collectedAt: '2026-08-11T00:00:00.000Z', topics: [],
});

it('canonicalizes URLs and removes duplicates', () => {
  expect(canonicalizeCuratedArticles([
    article('https://example.com/a?utm_source=rss#top', 'one'),
    article('https://example.com/a', 'two'),
  ]).map((item) => item.url)).toEqual(['https://example.com/a']);
});

it('matches Unicode words and phrases without substring collisions', () => {
  expect(matchesCuratedKeyword('Cải thiện giấc ngủ sâu', 'giấc ngủ')).toBe(true);
  expect(matchesCuratedKeyword('Sony headphones reviewed', 'phone')).toBe(false);
  expect(matchesCuratedKeyword('Company monitors performance', 'monitor')).toBe(false);
});

it('caps topics and sources while backfilling deterministically', () => {
  const ranked = [
    { article: article('https://e.test/1', 'one'), topic: 'a', score: 9, index: 0 },
    { article: article('https://e.test/2', 'one'), topic: 'a', score: 8, index: 1 },
    { article: article('https://e.test/3', 'one'), topic: 'b', score: 7, index: 2 },
    { article: article('https://e.test/4', 'two'), topic: 'b', score: 6, index: 3 },
    { article: article('https://e.test/5', 'three'), topic: 'b', score: 5, index: 4 },
    { article: article('https://e.test/6', 'four'), topic: 'b', score: 4, index: 5 },
  ];
  const selected = pickBalancedCuratedEntries(ranked, ['a', 'b'], 5, 2, 2);
  expect(selected.map((entry) => entry.article.url)).toEqual([
    'https://e.test/1', 'https://e.test/2', 'https://e.test/4', 'https://e.test/5',
  ]);
});
```

- [ ] **Step 2: Write the failing tracked-delivery test**

Create `tests/services/tracked-telegram-delivery.service.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { TrackedTelegramDeliveryService } from '../../src/services/tracked-telegram-delivery.service';

it('marks only messages acknowledged by Telegram', async () => {
  const messages = [
    { text: 'one', url: 'https://example.com/one' },
    { text: 'two', url: 'https://example.com/two' },
  ];
  const telegram = {
    sendMessages: vi.fn(async (batch, onSent) => {
      await onSent?.(batch[0]);
      throw new Error('second failed');
    }),
  };
  const history = { mark: vi.fn().mockResolvedValue(undefined) };
  const delivery = new TrackedTelegramDeliveryService(telegram, history);

  await expect(delivery.send(messages)).rejects.toThrow('second failed');
  expect(history.mark).toHaveBeenCalledWith(messages[0].url);
  expect(history.mark).not.toHaveBeenCalledWith(messages[1].url);
});
```

- [ ] **Step 3: Run both new tests and verify RED**

```bash
npx vitest run tests/services/curated-selection.test.ts tests/services/tracked-telegram-delivery.service.test.ts
```

Expected: FAIL because both shared modules are absent.

- [ ] **Step 4: Implement selection helpers**

Create `src/services/curated-selection.ts` with:

```typescript
import type { Article } from '../types/article';
import { normalizeUrl } from '../utils/normalize-url';

export interface RankedCuratedEntry<TTopic extends string> {
  article: Article;
  topic: TTopic;
  score: number;
  index: number;
}

export function canonicalizeCuratedArticles(articles: Article[]): Article[] {
  const seen = new Set<string>();
  const result: Article[] = [];
  for (const article of articles) {
    try {
      const url = normalizeUrl(article.url);
      if (seen.has(url)) continue;
      seen.add(url);
      result.push({ ...article, id: url, url });
    } catch {
      continue;
    }
  }
  return result;
}

export function matchesCuratedKeyword(text: string, keyword: string): boolean {
  const phrase = keyword.trim().split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${phrase}(?![\\p{L}\\p{N}])`, 'iu').test(text);
}

export function pickBalancedCuratedEntries<
  TTopic extends string,
  TEntry extends RankedCuratedEntry<TTopic>,
>(
  ranked: TEntry[],
  topicOrder: readonly TTopic[],
  limit: number,
  maxPerTopic = 2,
  maxPerSource = 2,
): Array<Omit<TEntry, 'index'>> {
  const selected: TEntry[] = [];
  const urls = new Set<string>();
  const sourceCounts = new Map<string, number>();
  const topicCounts = new Map<TTopic, number>();
  const tryPick = (entry: TEntry) => {
    if (selected.length >= limit || urls.has(entry.article.url)) return false;
    const sourceCount = sourceCounts.get(entry.article.sourceId) ?? 0;
    const topicCount = topicCounts.get(entry.topic) ?? 0;
    if (sourceCount >= maxPerSource || topicCount >= maxPerTopic) return false;
    selected.push(entry);
    urls.add(entry.article.url);
    sourceCounts.set(entry.article.sourceId, sourceCount + 1);
    topicCounts.set(entry.topic, topicCount + 1);
    return true;
  };

  for (const topic of topicOrder) {
    let topicCount = 0;
    for (const entry of ranked) {
      if (entry.topic !== topic || topicCount >= maxPerTopic) continue;
      if (tryPick(entry)) topicCount += 1;
    }
  }
  for (const entry of ranked) tryPick(entry);

  return selected.map(({ index: _index, ...entry }) => entry);
}
```

- [ ] **Step 5: Implement tracked delivery**

Create `src/services/tracked-telegram-delivery.service.ts`:

```typescript
import type { TelegramMessage } from './telegram.service';

interface TelegramSender {
  sendMessages(
    messages: TelegramMessage[],
    onSent?: (message: TelegramMessage) => void | Promise<void>,
  ): Promise<void>;
}

interface HistoryWriter {
  mark(url: string): Promise<void>;
}

export class TrackedTelegramDeliveryService<TMessage extends TelegramMessage = TelegramMessage> {
  constructor(
    private readonly telegram: TelegramSender,
    private readonly history: HistoryWriter,
  ) {}

  async send(messages: TMessage[]): Promise<void> {
    await this.telegram.sendMessages(messages, (message) => this.history.mark(message.url));
  }
}
```

- [ ] **Step 6: Refactor gadget selection and delivery to delegate**

In `gadget-selection.service.ts`:

- Replace `canonicalizeAndDedupe` with `canonicalizeCuratedArticles`.
- Replace `matchesGadgetKeyword` with `matchesCuratedKeyword` in relevance, classification, and scoring.
- Replace `pickBalanced` with:

```typescript
pickBalancedCuratedEntries(
  ranked,
  gadgetTopics.map((topic) => topic.key),
  this.maxArticles,
  2,
  2,
)
```

In `gadget-delivery.service.ts`, keep the public class but delegate:

```typescript
export class GadgetDeliveryService extends TrackedTelegramDeliveryService<GadgetMessage> {}
```

- [ ] **Step 7: Run all shared and gadget regressions**

```bash
npx vitest run tests/services/curated-selection.test.ts tests/services/tracked-telegram-delivery.service.test.ts tests/services/gadget-selection.service.test.ts tests/services/gadget-delivery.service.test.ts
npm run build
npm run lint
```

Expected: all focused tests PASS; build and lint exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/services/curated-selection.ts src/services/tracked-telegram-delivery.service.ts src/services/gadget-selection.service.ts src/services/gadget-delivery.service.ts tests/services/curated-selection.test.ts tests/services/tracked-telegram-delivery.service.test.ts
git commit -m "refactor: share curated selection and delivery"
```

### Task 5: Add health environment, sources, topics, and domain types

**Files:**
- Modify: `src/config/env.ts`
- Modify: `tests/config/env.test.ts`
- Create: `src/config/health-sources.ts`
- Create: `tests/config/health-sources.test.ts`
- Create: `src/config/health-topics.ts`
- Create: `tests/config/health-topics.test.ts`
- Create: `src/types/health.ts`

- [ ] **Step 1: Add failing health default assertions**

Add a test to `tests/config/env.test.ts` using `readEnvValues`:

```typescript
it('provides isolated health defaults', () => {
  expect(readEnvValues([
    'HEALTH_TELEGRAM_BOT_TOKEN',
    'HEALTH_TELEGRAM_CHAT_ID',
    'HEALTH_MAX_ARTICLES',
    'HEALTH_HISTORY_RETENTION_DAYS',
    'HEALTH_HISTORY_PATH',
  ])).toEqual({
    HEALTH_TELEGRAM_BOT_TOKEN: 'test-health-token',
    HEALTH_TELEGRAM_CHAT_ID: 'test-health-chat-id',
    HEALTH_MAX_ARTICLES: 12,
    HEALTH_HISTORY_RETENTION_DAYS: 7,
    HEALTH_HISTORY_PATH: 'data/health-sent-history.json',
  });
});
```

- [ ] **Step 2: Add failing source and topic configuration tests**

Create `tests/config/health-sources.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { healthSources } from '../../src/config/health-sources';

it('contains the seven approved isolated HTTPS RSS feeds', () => {
  expect(healthSources.map((source) => source.id)).toEqual([
    'vnexpress-health',
    'tuoitre-health',
    'thanhnien-health',
    'medlineplus-new',
    'medlineplus-healthy-living',
    'fda-medwatch',
    'niddk-news',
  ]);
  expect(new Set(healthSources.map((source) => source.id)).size).toBe(7);
  for (const source of healthSources) {
    expect(source).toMatchObject({ kind: 'rss', enabled: true, includeUnmatched: true });
    expect(source.feedUrl).toMatch(/^https:\/\//);
  }
});
```

Create `tests/config/health-topics.test.ts`:

```typescript
import { expect, it } from 'vitest';
import { healthTopics } from '../../src/config/health-topics';

it('defines six ordered health topics with safety fallbacks', () => {
  expect(healthTopics.map((topic) => topic.key)).toEqual([
    'sleep-recovery',
    'nutrition-metabolism',
    'movement-musculoskeletal',
    'mental-wellbeing',
    'prevention-daily-life',
    'conditions-medicine-research',
  ]);
  for (const topic of healthTopics) {
    expect(topic.keywords.length).toBeGreaterThan(5);
    expect(topic.fallbackImageUrl).toMatch(/^https:\/\//);
    expect(topic.fallbackSafeTakeaway).toBeTruthy();
    expect(topic.fallbackEvidenceNote).toBeTruthy();
  }
});
```

- [ ] **Step 3: Run all three tests and verify RED**

```bash
npx vitest run tests/config/env.test.ts tests/config/health-sources.test.ts tests/config/health-topics.test.ts
```

Expected: FAIL because health env fields and modules are absent.

- [ ] **Step 4: Add health env schema**

Add after the gadget fields in `src/config/env.ts`:

```typescript
HEALTH_TELEGRAM_BOT_TOKEN: z.string().default('test-health-token'),
HEALTH_TELEGRAM_CHAT_ID: z.string().default('test-health-chat-id'),
HEALTH_MAX_ARTICLES: z.coerce.number().int().min(1).max(50).default(12),
HEALTH_HISTORY_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
HEALTH_HISTORY_PATH: z.string().min(1).default('data/health-sent-history.json'),
```

- [ ] **Step 5: Create health types**

Create `src/types/health.ts`:

```typescript
import type { Article } from './article';

export type HealthTopicKey =
  | 'sleep-recovery'
  | 'nutrition-metabolism'
  | 'movement-musculoskeletal'
  | 'mental-wellbeing'
  | 'prevention-daily-life'
  | 'conditions-medicine-research';

export type HealthEvidenceKind =
  | 'guidance'
  | 'public-health-alert'
  | 'drug-safety'
  | 'research'
  | 'medical-news';

export interface HealthTopicDefinition {
  key: HealthTopicKey;
  label: string;
  icon: string;
  keywords: string[];
  fallbackImageUrl: string;
  fallbackSafeTakeaway: string;
  fallbackEvidenceNote: string;
}

export interface HealthDigestEntry {
  article: Article;
  topic: HealthTopicKey;
  evidence: HealthEvidenceKind;
  score: number;
}

export interface HealthSelectionResult {
  selected: HealthDigestEntry[];
  eligibleCount: number;
  skippedSeenCount: number;
}

export interface HealthMessage {
  text: string;
  url: string;
  imageUrl?: string;
  article: Article;
  topic: HealthTopicKey;
  evidence: HealthEvidenceKind;
}
```

- [ ] **Step 6: Create the seven source configs**

Create `src/config/health-sources.ts` with seven `RssSourceConfig` objects using these exact feed URLs:

```typescript
import type { RssSourceConfig } from '../types/source';

export const healthSources: RssSourceConfig[] = [
  {
    id: 'vnexpress-health', name: 'VnExpress Sức khỏe', kind: 'rss', enabled: true,
    homepageUrl: 'https://vnexpress.net/suc-khoe',
    feedUrl: 'https://vnexpress.net/rss/suc-khoe.rss', includeUnmatched: true,
  },
  {
    id: 'tuoitre-health', name: 'Tuổi Trẻ Sức khỏe', kind: 'rss', enabled: true,
    homepageUrl: 'https://tuoitre.vn/suc-khoe.htm',
    feedUrl: 'https://tuoitre.vn/rss/suc-khoe.rss', includeUnmatched: true,
  },
  {
    id: 'thanhnien-health', name: 'Thanh Niên Sức khỏe', kind: 'rss', enabled: true,
    homepageUrl: 'https://thanhnien.vn/suc-khoe.htm',
    feedUrl: 'https://thanhnien.vn/rss/suc-khoe.rss', includeUnmatched: true,
  },
  {
    id: 'medlineplus-new', name: 'MedlinePlus New Links', kind: 'rss', enabled: true,
    homepageUrl: 'https://medlineplus.gov',
    feedUrl: 'https://medlineplus.gov/groupfeeds/new.xml', includeUnmatched: true,
  },
  {
    id: 'medlineplus-healthy-living', name: 'MedlinePlus Healthy Living', kind: 'rss', enabled: true,
    homepageUrl: 'https://medlineplus.gov/healthyliving.html',
    feedUrl: 'https://medlineplus.gov/feeds/topics/healthyliving.xml', includeUnmatched: true,
  },
  {
    id: 'fda-medwatch', name: 'FDA MedWatch', kind: 'rss', enabled: true,
    homepageUrl: 'https://www.fda.gov/safety/medwatch-fda-safety-information-and-adverse-event-reporting-program',
    feedUrl: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml',
    includeUnmatched: true,
  },
  {
    id: 'niddk-news', name: 'NIH/NIDDK News', kind: 'rss', enabled: true,
    homepageUrl: 'https://www.niddk.nih.gov/news',
    feedUrl: 'https://www.niddk.nih.gov/rss/news', includeUnmatched: true,
  },
];
```

- [ ] **Step 7: Create the six health topics**

Create `src/config/health-topics.ts` with the complete configuration below:

```typescript
import type { HealthTopicDefinition, HealthTopicKey } from '../types/health';

const keywordSets = {
  'sleep-recovery': ['sleep', 'insomnia', 'circadian', 'fatigue', 'recovery', 'nap', 'ngủ', 'mất ngủ', 'thức khuya', 'mệt mỏi', 'phục hồi'],
  'nutrition-metabolism': ['nutrition', 'diet', 'food', 'protein', 'vitamin', 'obesity', 'diabetes', 'metabolism', 'dinh dưỡng', 'ăn uống', 'thực phẩm', 'béo phì', 'tiểu đường', 'chuyển hóa'],
  'movement-musculoskeletal': ['exercise', 'fitness', 'walking', 'running', 'muscle', 'joint', 'bone', 'posture', 'vận động', 'tập thể dục', 'đi bộ', 'chạy bộ', 'cơ bắp', 'xương khớp', 'tư thế'],
  'mental-wellbeing': ['mental health', 'stress', 'anxiety', 'depression', 'addiction', 'wellbeing', 'tâm lý', 'sức khỏe tinh thần', 'căng thẳng', 'lo âu', 'trầm cảm', 'nghiện'],
  'prevention-daily-life': ['prevention', 'screening', 'vaccine', 'vaccination', 'hygiene', 'infection', 'outbreak', 'healthy living', 'phòng bệnh', 'tầm soát', 'vắc xin', 'vệ sinh', 'lối sống', 'thói quen', 'dịch bệnh'],
  'conditions-medicine-research': ['disease', 'cancer', 'heart', 'kidney', 'liver', 'treatment', 'therapy', 'medicine', 'drug', 'clinical trial', 'study', 'research', 'bệnh', 'ung thư', 'tim mạch', 'thận', 'gan', 'điều trị', 'thuốc', 'thử nghiệm', 'nghiên cứu'],
} satisfies Record<HealthTopicKey, string[]>;

export const healthTopics: HealthTopicDefinition[] = [
  {
    key: 'sleep-recovery', label: 'Giấc ngủ & Phục hồi', icon: '🌙',
    keywords: keywordSets['sleep-recovery'],
    fallbackImageUrl: 'https://placehold.co/1200x630/1e3a8a/ffffff.png?text=Sleep+Recovery',
    fallbackSafeTakeaway: 'Duy trì giờ ngủ đều và trao đổi với nhân viên y tế nếu vấn đề kéo dài.',
    fallbackEvidenceNote: 'Khuyến nghị về giấc ngủ có thể không phù hợp với mọi người và cần được hiểu theo hoàn cảnh cá nhân.',
  },
  {
    key: 'nutrition-metabolism', label: 'Dinh dưỡng & Chuyển hóa', icon: '🥗',
    keywords: keywordSets['nutrition-metabolism'],
    fallbackImageUrl: 'https://placehold.co/1200x630/166534/ffffff.png?text=Nutrition',
    fallbackSafeTakeaway: 'Ưu tiên chế độ ăn cân bằng; người có bệnh nền nên hỏi chuyên gia trước thay đổi lớn.',
    fallbackEvidenceNote: 'Thông tin dinh dưỡng có thể không áp dụng cho mọi cá nhân và cần xét bệnh nền, dị ứng cùng nhu cầu riêng.',
  },
  {
    key: 'movement-musculoskeletal', label: 'Vận động & Cơ xương khớp', icon: '🏃',
    keywords: keywordSets['movement-musculoskeletal'],
    fallbackImageUrl: 'https://placehold.co/1200x630/0f766e/ffffff.png?text=Movement',
    fallbackSafeTakeaway: 'Tăng vận động từ từ, phù hợp thể trạng và dừng lại nếu có dấu hiệu bất thường.',
    fallbackEvidenceNote: 'Bài tập có thể không phù hợp với mọi người và cần được điều chỉnh theo thể trạng, chấn thương hoặc bệnh nền.',
  },
  {
    key: 'mental-wellbeing', label: 'Sức khỏe tinh thần', icon: '🧠',
    keywords: keywordSets['mental-wellbeing'],
    fallbackImageUrl: 'https://placehold.co/1200x630/7e22ce/ffffff.png?text=Mental+Wellbeing',
    fallbackSafeTakeaway: 'Tìm hỗ trợ chuyên môn khi triệu chứng kéo dài, nặng lên hoặc ảnh hưởng sinh hoạt.',
    fallbackEvidenceNote: 'Thông tin sức khỏe tinh thần không thay thế đánh giá cá nhân và có thể cần được diễn giải bởi chuyên gia.',
  },
  {
    key: 'prevention-daily-life', label: 'Phòng bệnh & Thói quen sinh hoạt', icon: '🛡️',
    keywords: keywordSets['prevention-daily-life'],
    fallbackImageUrl: 'https://placehold.co/1200x630/b45309/ffffff.png?text=Prevention',
    fallbackSafeTakeaway: 'Đối chiếu khuyến cáo chính thức và áp dụng biện pháp phù hợp với hoàn cảnh cá nhân.',
    fallbackEvidenceNote: 'Khuyến cáo phòng bệnh có thể thay đổi theo tuổi, khu vực và nguy cơ cá nhân nên cần đặt trong đúng bối cảnh.',
  },
  {
    key: 'conditions-medicine-research', label: 'Bệnh lý, Thuốc & Nghiên cứu', icon: '🔬',
    keywords: keywordSets['conditions-medicine-research'],
    fallbackImageUrl: 'https://placehold.co/1200x630/991b1b/ffffff.png?text=Medical+Research',
    fallbackSafeTakeaway: 'Không tự thay đổi điều trị; trao đổi với bác sĩ hoặc dược sĩ về thông tin liên quan.',
    fallbackEvidenceNote: 'Kết quả y khoa có thể còn sơ bộ hoặc không áp dụng cho mọi người và cần được hiểu theo thiết kế nghiên cứu.',
  },
];

const allHealthTopics = healthTopics.map((topic) => topic.key);

export const healthSourceAffinity: Record<string, HealthTopicKey[]> = {
  'vnexpress-health': allHealthTopics,
  'tuoitre-health': allHealthTopics,
  'thanhnien-health': allHealthTopics,
  'medlineplus-new': allHealthTopics,
  'medlineplus-healthy-living': [
    'sleep-recovery', 'nutrition-metabolism', 'movement-musculoskeletal',
    'mental-wellbeing', 'prevention-daily-life',
  ],
  'fda-medwatch': ['conditions-medicine-research'],
  'niddk-news': ['nutrition-metabolism', 'conditions-medicine-research'],
};
```

- [ ] **Step 8: Run config tests and build**

```bash
npx vitest run tests/config/env.test.ts tests/config/health-sources.test.ts tests/config/health-topics.test.ts
npm run build
```

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 9: Commit**

```bash
git add src/config/env.ts src/config/health-sources.ts src/config/health-topics.ts src/types/health.ts tests/config/env.test.ts tests/config/health-sources.test.ts tests/config/health-topics.test.ts
git commit -m "feat: configure health news domain"
```

### Task 6: Implement health safety policy and balanced selection

**Files:**
- Create: `src/services/health-safety.service.ts`
- Create: `tests/services/health-safety.service.test.ts`
- Create: `src/services/health-selection.service.ts`
- Create: `tests/services/health-selection.service.test.ts`

- [ ] **Step 1: Write failing safety-policy tests**

Create `tests/services/health-safety.service.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  classifyHealthEvidence,
  isSafeHealthArticle,
  sanitizeHealthEditorialText,
} from '../../src/services/health-safety.service';
import type { Article } from '../../src/types/article';

const article = (title: string, sourceId = 'vnexpress-health'): Article => ({
  id: title, sourceId, sourceName: sourceId, title,
  url: `https://example.com/${encodeURIComponent(title)}`,
  collectedAt: '2026-08-11T00:00:00.000Z', topics: [],
});

describe('health safety policy', () => {
  it.each([
    'Thần dược chữa khỏi mọi bệnh',
    'Detox giảm 8 kg trong 7 ngày cam kết hiệu quả',
    'Mua ngay thực phẩm chức năng giảm giá',
    'Uống 500 mg thuốc mỗi ngày để tự điều trị',
  ])('rejects unsafe promotional or self-medication title: %s', (title) => {
    expect(isSafeHealthArticle(article(title))).toBe(false);
  });

  it('keeps an official FDA warning even when it mentions a supplement', () => {
    expect(isSafeHealthArticle(article(
      'FDA warns detox supplement contains hidden drug ingredient',
      'fda-medwatch',
    ))).toBe(true);
  });

  it('labels official FDA, research, alerts, guidance, and general medical news', () => {
    expect(classifyHealthEvidence(article('Drug safety warning', 'fda-medwatch'))).toBe('drug-safety');
    expect(classifyHealthEvidence(article('New clinical study', 'niddk-news'))).toBe('research');
    expect(classifyHealthEvidence(article('Outbreak prevention alert'))).toBe('public-health-alert');
    expect(classifyHealthEvidence(article('Healthy sleep habits'))).toBe('guidance');
    expect(classifyHealthEvidence(article('Hospital treats kidney disease'))).toBe('medical-news');
  });

  it('replaces dosage or treatment directives with deterministic fallback', () => {
    const fallback = 'Trao đổi với bác sĩ hoặc dược sĩ.';
    expect(sanitizeHealthEditorialText('Uống 500 mg mỗi ngày.', fallback)).toBe(fallback);
    expect(sanitizeHealthEditorialText('Hãy ngừng thuốc ngay.', fallback)).toBe(fallback);
    expect(sanitizeHealthEditorialText('Bạn mắc bệnh thận.', fallback)).toBe(fallback);
    expect(sanitizeHealthEditorialText('Kê đơn thuốc mới cho bạn.', fallback)).toBe(fallback);
    expect(sanitizeHealthEditorialText('Nghiên cứu chứng minh chắc chắn thuốc này gây khỏi bệnh.', fallback))
      .toBe(fallback);
    expect(sanitizeHealthEditorialText('Duy trì giờ ngủ đều.', fallback)).toBe('Duy trì giờ ngủ đều.');
  });
});
```

- [ ] **Step 2: Write failing health selection tests**

Create `tests/services/health-selection.service.test.ts` with this complete deterministic fixture and assertions:

```typescript
import { describe, expect, it } from 'vitest';
import { HealthSelectionService } from '../../src/services/health-selection.service';
import type { Article } from '../../src/types/article';

const now = new Date('2026-08-11T12:00:00.000Z');
const service = new HealthSelectionService(12, () => now);

function article(overrides: Partial<Article> & Pick<Article, 'title'>): Article {
  const slug = encodeURIComponent(overrides.title.toLowerCase());
  return {
    id: `https://example.com/${slug}`,
    sourceId: 'vnexpress-health',
    sourceName: 'VnExpress Sức khỏe',
    url: `https://example.com/${slug}`,
    collectedAt: '2026-08-11T10:00:00.000Z',
    topics: [],
    ...overrides,
  };
}

function buildHealthFixture(): Article[] {
  return [
    article({ title: 'Cải thiện giấc ngủ sâu', url: 'https://example.com/sleep-1', sourceId: 'vnexpress-health' }),
    article({ title: 'Dinh dưỡng cân bằng mỗi ngày', url: 'https://example.com/nutrition-1', sourceId: 'vnexpress-health' }),
    article({ title: 'Mất ngủ và phục hồi đúng cách', url: 'https://example.com/sleep-2', sourceId: 'tuoitre-health' }),
    article({ title: 'Đi bộ giúp tăng vận động', url: 'https://example.com/movement-1', sourceId: 'tuoitre-health' }),
    article({ title: 'Protein và chuyển hóa khỏe mạnh', url: 'https://example.com/nutrition-2', sourceId: 'thanhnien-health' }),
    article({ title: 'Tư thế bảo vệ xương khớp', url: 'https://example.com/movement-2', sourceId: 'thanhnien-health' }),
    article({ title: 'Cách giảm căng thẳng và lo âu', url: 'https://example.com/mental-1', sourceId: 'medlineplus-new' }),
    article({ title: 'Vệ sinh là thói quen phòng bệnh', url: 'https://example.com/prevention-1', sourceId: 'medlineplus-new' }),
    article({ title: 'Sức khỏe tinh thần và trầm cảm', url: 'https://example.com/mental-2', sourceId: 'medlineplus-healthy-living' }),
    article({ title: 'Nghiên cứu thuốc điều trị bệnh thận', url: 'https://example.com/conditions-1', sourceId: 'fda-medwatch' }),
    article({ title: 'Vắc xin giúp phòng bệnh', url: 'https://example.com/prevention-2', sourceId: 'medlineplus-healthy-living' }),
    article({ title: 'Thử nghiệm điều trị bệnh gan', url: 'https://example.com/conditions-2', sourceId: 'niddk-news' }),
    article({ title: 'Nghiên cứu bệnh tim đã gửi', url: 'https://example.com/already-sent?utm_source=rss', sourceId: 'niddk-news' }),
    article({ title: 'Bản sao bài ngủ', url: 'https://example.com/sleep-1?utm_medium=feed#top', sourceId: 'fda-medwatch' }),
  ];
}

describe('HealthSelectionService', () => {
it.each([
  ['Cách cải thiện giấc ngủ', 'sleep-recovery'],
  ['Chế độ dinh dưỡng hỗ trợ chuyển hóa', 'nutrition-metabolism'],
  ['Đi bộ và tập thể dục bảo vệ xương khớp', 'movement-musculoskeletal'],
  ['Nhận biết căng thẳng và lo âu', 'mental-wellbeing'],
  ['Vắc xin và vệ sinh giúp phòng bệnh', 'prevention-daily-life'],
  ['Nghiên cứu thuốc điều trị bệnh thận', 'conditions-medicine-research'],
])('classifies %s as %s', (title, topic) => {
  const result = service.select([article({ title })], new Set());
  expect(result.selected[0].topic).toBe(topic);
});

it('rejects irrelevant and unsafe articles', () => {
  const result = service.select([
    article({ title: 'Company reports quarterly revenue' }),
    article({ title: 'Detox giảm 8 kg trong 7 ngày cam kết hiệu quả' }),
    article({ title: 'Uống 500 mg thuốc mỗi ngày để tự điều trị' }),
  ], new Set());
  expect(result).toMatchObject({ selected: [], eligibleCount: 0 });
});

it('canonicalizes history, balances six topics, caps sources, and returns at most 12', () => {
  const fixture = buildHealthFixture();
  const seen = new Set(['https://example.com/already-sent']);
  const result = service.select(fixture, seen);
  expect(result.selected).toHaveLength(12);
  expect(result.skippedSeenCount).toBe(1);
  expect(new Set(result.selected.map((entry) => entry.topic)).size).toBe(6);
  expect(result.selected.map((entry) => entry.article.url)).not.toContain(
    'https://example.com/sleep-1?utm_medium=feed#top',
  );
  for (const topic of new Set(result.selected.map((entry) => entry.topic))) {
    expect(result.selected.filter((entry) => entry.topic === topic)).toHaveLength(2);
  }
  for (const sourceId of new Set(result.selected.map((entry) => entry.article.sourceId))) {
    expect(result.selected.filter((entry) => entry.article.sourceId === sourceId).length)
      .toBeLessThanOrEqual(2);
  }
  expect(service.select(fixture, seen).selected).toEqual(result.selected);
});
});
```

- [ ] **Step 3: Run tests and verify RED**

```bash
npx vitest run tests/services/health-safety.service.test.ts tests/services/health-selection.service.test.ts
```

Expected: FAIL because health safety and selection services do not exist.

- [ ] **Step 4: Implement deterministic safety helpers**

Create `src/services/health-safety.service.ts` with the complete deterministic policy:

```typescript
import type { Article } from '../types/article';
import type { HealthEvidenceKind } from '../types/health';
import { matchesCuratedKeyword } from './curated-selection';

const promotionalClaims = [
  'thần dược', 'chữa khỏi mọi bệnh', 'cam kết hiệu quả', 'detox',
  'mua ngay', 'giảm giá thực phẩm chức năng', 'lời chứng thực giảm cân',
  'miracle cure', 'cure all', 'guaranteed result', 'supplement sale', 'weight loss testimonial',
];
const alertTerms = [
  'warn', 'warning', 'alert', 'recall', 'hidden ingredient',
  'cảnh báo', 'thu hồi', 'phát hiện chất cấm',
];
const researchTerms = [
  'study', 'research', 'trial', 'researchers',
  'nghiên cứu', 'thử nghiệm', 'các nhà khoa học',
];
const guidanceTerms = [
  'habit', 'healthy living', 'prevention', 'exercise', 'nutrition', 'sleep',
  'thói quen', 'lối sống', 'phòng bệnh', 'vận động', 'dinh dưỡng', 'giấc ngủ',
];
const dosagePattern = /\b\d+(?:[.,]\d+)?\s?(?:mg|mcg|µg|g|ml|viên|liều)\b/iu;
const treatmentDirectivePattern = /(?:uống|dùng|bắt đầu|ngừng|bỏ|đổi|tăng|giảm|take|start|stop|switch|increase|decrease).{0,40}(?:thuốc|medicine|drug|dose|liều)/iu;
const rapidWeightLossPattern = /(?:giảm|lose)\s+\d+\s*(?:kg|kilograms?).{0,20}(?:ngày|days?|tuần|weeks?)/iu;
const personalizedDiagnosisPattern = /(?:bạn|you).{0,30}(?:bị|mắc|have|has|được chẩn đoán|diagnosed)/iu;
const prescriptionPattern = /(?:kê đơn|toa thuốc|prescribe|prescription|điều trị dành cho bạn|your treatment)/iu;
const certaintyEscalationPattern = /(?:chắc chắn|chứng minh|proves?|definitely|guarantees?).{0,50}(?:gây|causes?|cures?|khỏi bệnh)/iu;

const containsAny = (text: string, terms: string[]) =>
  terms.some((term) => matchesCuratedKeyword(text, term));

export function isSafeHealthArticle(article: Article): boolean {
  const text = `${article.title} ${article.summary ?? ''}`;
  const isOfficialAlert = article.sourceId === 'fda-medwatch' || containsAny(text, alertTerms);
  if (dosagePattern.test(text) && treatmentDirectivePattern.test(text)) return false;
  if (rapidWeightLossPattern.test(text)) return false;
  if (containsAny(text, promotionalClaims) && !isOfficialAlert) return false;
  return true;
}

export function classifyHealthEvidence(article: Article): HealthEvidenceKind {
  const text = `${article.title} ${article.summary ?? ''}`;
  if (article.sourceId === 'fda-medwatch') return 'drug-safety';
  if (article.sourceId === 'niddk-news' || containsAny(text, researchTerms)) return 'research';
  if (containsAny(text, alertTerms)) return 'public-health-alert';
  if (containsAny(text, guidanceTerms)) return 'guidance';
  return 'medical-news';
}

export function sanitizeHealthEditorialText(value: string, fallback: string): string {
  const compact = value.replace(/\s+/gu, ' ').trim();
  if (
    !compact
    || dosagePattern.test(compact)
    || treatmentDirectivePattern.test(compact)
    || personalizedDiagnosisPattern.test(compact)
    || prescriptionPattern.test(compact)
    || certaintyEscalationPattern.test(compact)
  ) {
    return fallback;
  }
  return compact;
}
```

- [ ] **Step 5: Implement health selection**

Create `src/services/health-selection.service.ts`:

```typescript
import { env } from '../config/env';
import { healthSourceAffinity, healthTopics } from '../config/health-topics';
import type { Article } from '../types/article';
import type {
  HealthEvidenceKind,
  HealthSelectionResult,
  HealthTopicKey,
} from '../types/health';
import {
  canonicalizeCuratedArticles,
  matchesCuratedKeyword,
  pickBalancedCuratedEntries,
  type RankedCuratedEntry,
} from './curated-selection';
import {
  classifyHealthEvidence,
  isSafeHealthArticle,
} from './health-safety.service';

function keywordHits(article: Article, topic: HealthTopicKey): { title: number; summary: number } {
  const definition = healthTopics.find((candidate) => candidate.key === topic);
  if (!definition) return { title: 0, summary: 0 };
  return {
    title: definition.keywords.filter((keyword) => matchesCuratedKeyword(article.title, keyword)).length,
    summary: definition.keywords.filter((keyword) =>
      matchesCuratedKeyword(article.summary ?? '', keyword)).length,
  };
}

export function classifyHealthTopic(article: Article): HealthTopicKey | undefined {
  let winner: { topic: HealthTopicKey; hits: number } | undefined;
  for (const topic of healthTopics) {
    const hits = keywordHits(article, topic.key);
    const total = hits.title + hits.summary;
    if (total > (winner?.hits ?? 0)) winner = { topic: topic.key, hits: total };
  }
  return winner?.topic;
}

function scoreHealthArticle(article: Article, topic: HealthTopicKey, now: Date): number {
  const hits = keywordHits(article, topic);
  const timestamp = new Date(article.publishedAt ?? article.collectedAt).getTime();
  const ageDays = Number.isFinite(timestamp)
    ? Math.max(0, Math.floor((now.getTime() - timestamp) / 86_400_000))
    : 14;
  const freshness = Math.max(0, 14 - ageDays);
  const affinity = healthSourceAffinity[article.sourceId]?.includes(topic) ? 25 : 0;
  const metadataQuality = [article.summary, article.publishedAt, article.imageUrl]
    .filter((value) => Boolean(value?.trim())).length * 2;
  return hits.title * 100 + hits.summary * 10 + affinity + freshness + metadataQuality;
}

export class HealthSelectionService {
  constructor(
    private readonly maxArticles = env.HEALTH_MAX_ARTICLES,
    private readonly now = () => new Date(),
  ) {}

  select(articles: Article[], seenUrls: ReadonlySet<string>): HealthSelectionResult {
    const canonical = canonicalizeCuratedArticles(articles);
    let skippedSeenCount = 0;
    const ranked: Array<RankedCuratedEntry<HealthTopicKey> & { evidence: HealthEvidenceKind }> = [];

    canonical.forEach((article, index) => {
      if (seenUrls.has(article.url)) {
        skippedSeenCount += 1;
        return;
      }
      if (!isSafeHealthArticle(article)) return;
      const topic = classifyHealthTopic(article);
      if (!topic) return;
      ranked.push({
        article,
        topic,
        evidence: classifyHealthEvidence(article),
        score: scoreHealthArticle(article, topic, this.now()),
        index,
      });
    });

    ranked.sort((left, right) => right.score - left.score || left.index - right.index);
    const selected = pickBalancedCuratedEntries(
      ranked,
      healthTopics.map((topic) => topic.key),
      this.maxArticles,
      2,
      2,
    );
    return { selected, eligibleCount: ranked.length, skippedSeenCount };
  }
}
```

- [ ] **Step 6: Run health policy tests, build, and lint**

```bash
npx vitest run tests/services/health-safety.service.test.ts tests/services/health-selection.service.test.ts
npm run build
npm run lint
```

Expected: all focused tests PASS; build and lint exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/services/health-safety.service.ts src/services/health-selection.service.ts tests/services/health-safety.service.test.ts tests/services/health-selection.service.test.ts
git commit -m "feat: select safe balanced health news"
```

### Task 7: Support domain-specific editorial instructions safely

**Files:**
- Modify: `src/services/article-editorial.types.ts`
- Modify: `src/services/article-editorial.service.ts`
- Modify: `src/services/openai-article-editorial.generator.ts`
- Modify: `src/services/codex-article-editorial.generator.ts`
- Modify: `tests/services/article-editorial.service.test.ts`
- Modify: `tests/services/openai-article-editorial.generator.test.ts`
- Modify: `tests/services/codex-article-editorial.generator.test.ts`

- [ ] **Step 1: Write failing customization tests**

Add to `article-editorial.service.test.ts`:

```typescript
it('passes domain instructions and uses a domain fallback action', async () => {
  const generator = { generate: vi.fn().mockRejectedValue(new Error('offline')) };
  const service = new ArticleEditorialService(generator);
  const healthArticle = { ...article, title: 'Healthy sleep' };

  await expect(service.editArticle(healthArticle, {
    key: 'sleep-recovery',
    fallbackWhyImportant: 'Evidence fallback',
    fallbackActionText: 'Safe action fallback',
    instructions: 'HEALTH-SAFETY-INSTRUCTIONS',
  })).resolves.toMatchObject({
    whyImportant: 'Evidence fallback',
    actionText: 'Safe action fallback',
  });
  expect(generator.generate).toHaveBeenCalledWith(expect.objectContaining({
    instructions: 'HEALTH-SAFETY-INSTRUCTIONS',
  }));
});
```

Add this test to `tests/services/openai-article-editorial.generator.test.ts`:

```typescript
it('uses domain-specific instructions when provided', async () => {
  const create = vi.fn().mockResolvedValue({ output_text: '{"title":"Tin"}' });
  const generator = new OpenAIArticleEditorialGenerator({ responses: { create } }, 'test-model');
  const customInput = { ...input, instructions: 'CUSTOM-INSTRUCTIONS' };

  await generator.generate(customInput);

  expect(create).toHaveBeenCalledWith({
    model: 'test-model',
    instructions: 'CUSTOM-INSTRUCTIONS',
    input: JSON.stringify(customInput),
  });
});
```

Add this test to `tests/services/codex-article-editorial.generator.test.ts`:

```typescript
it('uses domain-specific instructions when provided', async () => {
  const runner = { run: vi.fn().mockResolvedValue('{"title":"Tin"}') };
  const generator = new CodexArticleEditorialGenerator(runner, 12345);
  const customInput = { ...input, instructions: 'CUSTOM-INSTRUCTIONS' };

  await generator.generate(customInput);

  expect(runner.run).toHaveBeenCalledWith(
    'CUSTOM-INSTRUCTIONS',
    JSON.stringify(customInput),
    12345,
  );
});
```

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npx vitest run tests/services/article-editorial.service.test.ts tests/services/openai-article-editorial.generator.test.ts tests/services/codex-article-editorial.generator.test.ts
```

Expected: FAIL because the current contracts discard custom instructions and fallback action text.

- [ ] **Step 3: Extend editorial contracts**

In `article-editorial.types.ts` add:

```typescript
export interface ArticleEditorialInput {
  title: string;
  summary?: string;
  sourceName: string;
  topic: string;
  publishedAt?: string;
  collectedAt: string;
  instructions?: string;
}

export interface EditorialTopicContext {
  key: string;
  fallbackWhyImportant: string;
  fallbackActionText?: string;
  instructions?: string;
}
```

- [ ] **Step 4: Propagate customization while preserving defaults**

In `ArticleEditorialService.editArticle`, pass:

```typescript
instructions: topicContext.instructions,
```

In `createFallbackEditorial`, set:

```typescript
actionText:
  topicContext.fallbackActionText
  ?? 'Kiểm tra mức độ liên quan và theo dõi thông báo chính thức từ nguồn.',
```

In OpenAI and Codex generators, replace the hard-coded instruction use with:

```typescript
input.instructions ?? articleEditorialInstructions
```

Do not change Google behavior; it remains translation-only and lets the service supply deterministic fallback fields.

- [ ] **Step 5: Run editorial regressions**

```bash
npx vitest run tests/services/article-editorial.service.test.ts tests/services/openai-article-editorial.generator.test.ts tests/services/codex-article-editorial.generator.test.ts tests/services/google-article-editorial.generator.test.ts tests/services/gadget-message.service.test.ts
npm run build
```

Expected: customization and all existing tech/gadget tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/article-editorial.types.ts src/services/article-editorial.service.ts src/services/openai-article-editorial.generator.ts src/services/codex-article-editorial.generator.ts tests/services/article-editorial.service.test.ts tests/services/openai-article-editorial.generator.test.ts tests/services/codex-article-editorial.generator.test.ts
git commit -m "feat: support domain editorial policies"
```

### Task 8: Build safety-aware health messages

**Files:**
- Modify: `src/services/article-message.service.ts`
- Create: `src/services/health-message.service.ts`
- Create: `tests/services/health-message.service.test.ts`

- [ ] **Step 1: Write failing health message tests**

Create `tests/services/health-message.service.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { HealthMessageService } from '../../src/services/health-message.service';
import type { Article } from '../../src/types/article';

const article: Article = {
  id: 'https://example.com/sleep', sourceId: 'medlineplus-healthy-living',
  sourceName: 'MedlinePlus', title: 'Healthy sleep habits',
  url: 'https://example.com/sleep', collectedAt: '2026-08-11T00:00:00.000Z', topics: [],
};

it('renders evidence, safe action, limitation, disclaimer, and source', async () => {
  const editor = { editArticle: vi.fn().mockResolvedValue({
    title: 'Thói quen ngủ lành mạnh',
    summary: 'Giữ lịch ngủ ổn định có thể hỗ trợ sức khỏe.',
    whyImportant: 'Khuyến nghị chung có thể không phù hợp với mọi người.',
    actionLevel: 'monitor' as const,
    actionText: 'Duy trì giờ ngủ đều.',
  }) };
  const service = new HealthMessageService(editor);
  const messages = await service.buildMessages([{
    article, topic: 'sleep-recovery', evidence: 'guidance', score: 100,
  }]);

  expect(messages[0]).toMatchObject({
    url: article.url, article, topic: 'sleep-recovery', evidence: 'guidance',
  });
  expect(messages[0].imageUrl).toMatch(/^https:\/\//);
  expect(messages[0].text).toContain('GIẤC NGỦ & PHỤC HỒI');
  expect(messages[0].text).toContain('HƯỚNG DẪN');
  expect(messages[0].text).toContain('Điều có thể áp dụng an toàn');
  expect(messages[0].text).toContain('Giới hạn/Lưu ý');
  expect(messages[0].text).toContain('không thay thế chẩn đoán hoặc điều trị y khoa');
  expect(messages[0].text).toContain('Nguồn: MedlinePlus');
});

it('replaces generated dosage and treatment directives', async () => {
  const editor = { editArticle: vi.fn().mockResolvedValue({
    title: 'Thông tin thuốc', summary: 'Uống 500 mg mỗi ngày.',
    whyImportant: 'Hãy ngừng thuốc ngay.', actionLevel: 'high' as const,
    actionText: 'Đổi thuốc và tăng liều.',
  }) };
  const service = new HealthMessageService(editor);
  const [message] = await service.buildMessages([{
    article: { ...article, title: 'Drug safety warning', sourceId: 'fda-medwatch' },
    topic: 'conditions-medicine-research', evidence: 'drug-safety', score: 100,
  }]);

  expect(message.text).not.toMatch(/500\s?mg|ngừng thuốc|tăng liều/iu);
  expect(message.text).toContain('bác sĩ hoặc dược sĩ');
});

it('escapes HTML and stays below Telegram text limits', async () => {
  const editor = { editArticle: vi.fn().mockResolvedValue({
    title: '<b>Healthy sleep</b>',
    summary: `<script>${'x'.repeat(5_000)}</script>`,
    whyImportant: 'Giới hạn <cần xem xét>.',
    actionLevel: 'monitor' as const,
    actionText: 'Duy trì giờ ngủ đều.',
  }) };
  const service = new HealthMessageService(editor);
  const [message] = await service.buildMessages([{
    article: { ...article, sourceName: 'MedlinePlus <Official>' },
    topic: 'sleep-recovery', evidence: 'guidance', score: 100,
  }]);

  expect(message.text).not.toContain('<script>');
  expect(message.text).toContain('&lt;b&gt;Healthy sleep&lt;/b&gt;');
  expect(message.text).toContain('MedlinePlus &lt;Official&gt;');
  expect(message.text.length).toBeLessThanOrEqual(4_096);
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
npx vitest run tests/services/health-message.service.test.ts
```

Expected: FAIL because `HealthMessageService` does not exist.

- [ ] **Step 3: Export common renderer helpers**

In `article-message.service.ts`, rename the two private helpers, export them, and update the three renderer calls:

```typescript
const summary = truncateArticleMessageText(compactText(editorial.summary), 360);
const whyImportant = truncateArticleMessageText(compactText(editorial.whyImportant), 320);
const actionText = truncateArticleMessageText(compactText(editorial.actionText), 240);
// ...
`📅 <b>Công bố:</b> ${formatArticleDate(article)}`,

export function formatArticleDate(article: Article): string {
  for (const value of [article.publishedAt, article.collectedAt]) {
    if (!value) continue;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) continue;
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
    }).format(date);
  }
  return 'Không rõ';
}

export function truncateArticleMessageText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}…`;
}
```

- [ ] **Step 4: Define health editorial instructions**

In `health-message.service.ts`, define:

```typescript
export const healthEditorialInstructions = [
  'Biên tập thông tin sức khỏe bằng tiếng Việt tự nhiên, trung lập và súc tích.',
  'Chỉ trả về JSON với đúng các khóa: title, summary, whyImportant, actionLevel, actionText.',
  'Không chẩn đoán, kê đơn, nêu liều, hoặc khuyên bắt đầu, ngừng, đổi hay tăng giảm thuốc.',
  'Giữ nguyên mức độ chắc chắn; không biến liên quan thành quan hệ nhân quả.',
  'Với nghiên cứu ban đầu, nêu giới hạn được cung cấp như nghiên cứu động vật, quan sát, mẫu nhỏ hoặc sơ bộ.',
  'actionText chỉ được là hành động ít rủi ro hoặc khuyên trao đổi với bác sĩ/dược sĩ.',
  'actionLevel dùng monitor trừ khi nguồn chính thức mô tả cảnh báo an toàn cần chú ý.',
  'Không dùng Markdown và không thêm nội dung ngoài JSON.',
].join('\n');
```

- [ ] **Step 5: Implement `HealthMessageService`**

Complete `src/services/health-message.service.ts` with:

```typescript
import { healthTopics } from '../config/health-topics';
import type { Article } from '../types/article';
import type {
  HealthDigestEntry,
  HealthEvidenceKind,
  HealthMessage,
  HealthTopicKey,
} from '../types/health';
import { escapeHtml } from '../utils/text';
import { ArticleEditorialService } from './article-editorial.service';
import type { ArticleEditorial, EditorialTopicContext } from './article-editorial.types';
import {
  formatArticleDate,
  getArticleMessageImageUrl,
  truncateArticleMessageText,
} from './article-message.service';
import { sanitizeHealthEditorialText } from './health-safety.service';

interface HealthArticleEditor {
  editArticle(article: Article, topic: EditorialTopicContext): Promise<ArticleEditorial>;
}

const evidenceLabels: Record<HealthEvidenceKind, string> = {
  guidance: '🟢 HƯỚNG DẪN',
  'public-health-alert': '🟠 CẢNH BÁO SỨC KHỎE',
  'drug-safety': '🟠 CẢNH BÁO AN TOÀN THUỐC/THIẾT BỊ',
  research: '🔬 NGHIÊN CỨU',
  'medical-news': '🔵 TIN Y KHOA',
};

export class HealthMessageService {
  constructor(private readonly editor: HealthArticleEditor = new ArticleEditorialService()) {}

  async buildMessages(entries: HealthDigestEntry[]): Promise<HealthMessage[]> {
    return Promise.all(entries.map(async (entry) => {
      const topic = getHealthTopic(entry.topic);
      const editorial = await this.editor.editArticle(entry.article, {
        key: topic.key,
        fallbackWhyImportant: topic.fallbackEvidenceNote,
        fallbackActionText: topic.fallbackSafeTakeaway,
        instructions: healthEditorialInstructions,
      });
      const sourceSummaryFallback = sanitizeHealthEditorialText(
        entry.article.summary ?? '',
        'Nguồn chưa cung cấp mô tả chi tiết.',
      );
      const title = truncateArticleMessageText(sanitizeHealthEditorialText(
        editorial.title,
        'Bản tin sức khỏe từ nguồn chính thức.',
      ), 220);
      const summary = truncateArticleMessageText(
        sanitizeHealthEditorialText(editorial.summary, sourceSummaryFallback),
        520,
      );
      const safeTakeaway = truncateArticleMessageText(
        sanitizeHealthEditorialText(editorial.actionText, topic.fallbackSafeTakeaway),
        320,
      );
      const evidenceNote = truncateArticleMessageText(
        sanitizeHealthEditorialText(editorial.whyImportant, topic.fallbackEvidenceNote),
        360,
      );
      const text = [
        `${topic.icon}  <b>${escapeHtml(topic.label.toUpperCase())}</b>`,
        '━━━━━━━━━━━━━━━━',
        '',
        `📰  <b>${escapeHtml(title)}</b>`,
        '',
        `🏷️ <b>Loại thông tin:</b> ${evidenceLabels[entry.evidence]}`,
        `📅 <b>Công bố:</b> ${formatArticleDate(entry.article)}`,
        '',
        '📝 <b>Tóm tắt</b>',
        escapeHtml(summary),
        '',
        '✅ <b>Điều có thể áp dụng an toàn</b>',
        escapeHtml(safeTakeaway),
        '',
        '⚠️ <b>Giới hạn/Lưu ý</b>',
        escapeHtml(evidenceNote),
        '',
        'ℹ️ <i>Thông tin tham khảo, không thay thế chẩn đoán hoặc điều trị y khoa.</i>',
        '',
        `🏢 <i>Nguồn: ${escapeHtml(entry.article.sourceName)}</i>`,
      ].join('\n').trim();
      return {
        text,
        url: entry.article.url,
        imageUrl: getArticleMessageImageUrl(entry.article, topic.fallbackImageUrl),
        article: entry.article,
        topic: entry.topic,
        evidence: entry.evidence,
      };
    }));
  }
}

function getHealthTopic(key: HealthTopicKey) {
  const topic = healthTopics.find((candidate) => candidate.key === key);
  if (!topic) throw new Error(`Unknown health topic: ${key}`);
  return topic;
}
```

- [ ] **Step 6: Run message and editorial regressions**

```bash
npx vitest run tests/services/health-message.service.test.ts tests/services/gadget-message.service.test.ts tests/services/article-message.service.test.ts tests/services/article-editorial.service.test.ts
npm run build
npm run lint
```

Expected: all focused tests PASS; build and lint exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/services/article-message.service.ts src/services/health-message.service.ts tests/services/health-message.service.test.ts
git commit -m "feat: render safe health Telegram messages"
```

### Task 9: Compose the health flow and expose the API

**Files:**
- Create: `src/services/health-source.service.ts`
- Create: `src/services/health-flow.service.ts`
- Create: `tests/services/health-flow.service.test.ts`
- Modify: `src/controllers/telegram.controller.ts`
- Modify: `src/routes/telegram.routes.ts`
- Create: `tests/routes/telegram-health.routes.test.ts`

- [ ] **Step 1: Write failing health flow tests**

Create `tests/services/health-flow.service.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import {
  AllHealthSourcesFailedError,
  HealthFlowService,
} from '../../src/services/health-flow.service';
import type { Article } from '../../src/types/article';

const article: Article = {
  id: 'a', sourceId: 'one', sourceName: 'One', title: 'Healthy sleep',
  url: 'https://example.com/a', collectedAt: '2026-08-11T00:00:00.000Z', topics: [],
};
const entry = {
  article, topic: 'sleep-recovery' as const, evidence: 'guidance' as const, score: 100,
};
const message = {
  text: 'Sleep', url: article.url, article,
  topic: 'sleep-recovery' as const, evidence: 'guidance' as const,
};

function dependencies() {
  return {
    source: { collectLatest: vi.fn() },
    history: { seenUrls: vi.fn().mockResolvedValue(new Set<string>()) },
    selection: { select: vi.fn() },
    messages: { buildMessages: vi.fn() },
    delivery: { send: vi.fn().mockResolvedValue(undefined) },
  };
}

describe('HealthFlowService', () => {
  it('collects, selects, builds, and delivers', async () => {
    const deps = dependencies();
    deps.source.collectLatest.mockResolvedValue({
      articles: [article], successfulSourceCount: 6, failedSourceCount: 1,
    });
    deps.selection.select.mockReturnValue({
      selected: [entry], eligibleCount: 1, skippedSeenCount: 0,
    });
    deps.messages.buildMessages.mockResolvedValue([message]);
    const flow = new HealthFlowService(
      deps.source, deps.history, deps.selection, deps.messages, deps.delivery,
    );

    await expect(flow.run()).resolves.toEqual({
      sent: true,
      messageCount: 1,
      collectedCount: 1,
      eligibleCount: 1,
      skippedSeenCount: 0,
      language: 'vi',
      channel: 'telegram-health',
    });
    expect(deps.delivery.send).toHaveBeenCalledWith([message]);
  });

  it('does not send when no unseen article exists', async () => {
    const deps = dependencies();
    deps.source.collectLatest.mockResolvedValue({
      articles: [article], successfulSourceCount: 7, failedSourceCount: 0,
    });
    deps.selection.select.mockReturnValue({
      selected: [], eligibleCount: 0, skippedSeenCount: 1,
    });
    const flow = new HealthFlowService(
      deps.source, deps.history, deps.selection, deps.messages, deps.delivery,
    );

    await expect(flow.run()).resolves.toMatchObject({
      sent: false, reason: 'no_new_articles', messageCount: 0,
    });
    expect(deps.delivery.send).not.toHaveBeenCalled();
  });

  it('throws when every health source fails', async () => {
    const deps = dependencies();
    deps.source.collectLatest.mockResolvedValue({
      articles: [], successfulSourceCount: 0, failedSourceCount: 7,
    });
    const flow = new HealthFlowService(
      deps.source, deps.history, deps.selection, deps.messages, deps.delivery,
    );

    await expect(flow.run()).rejects.toBeInstanceOf(AllHealthSourcesFailedError);
  });
});
```

- [ ] **Step 2: Write failing route tests**

Create `tests/routes/telegram-health.routes.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runMock } = vi.hoisted(() => ({ runMock: vi.fn() }));

vi.mock('../../src/services/health-flow.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/health-flow.service')>();
  return {
    ...actual,
    createHealthFlowService: () => ({ run: runMock }),
  };
});

import request from 'supertest';
import { createApp } from '../../src/app';
import {
  AllHealthSourcesFailedError,
  isAllHealthSourcesFailedError,
} from '../../src/services/health-flow.service';

const success = {
  sent: true, collectedCount: 2, eligibleCount: 1, skippedSeenCount: 0,
  messageCount: 1, language: 'vi', channel: 'telegram-health',
};

describe('POST /telegram/send-health', () => {
  beforeEach(() => runMock.mockReset());

it('returns the health flow response', async () => {
  runMock.mockResolvedValue(success);
  const response = await request(createApp()).post('/telegram/send-health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual(success);
});

it('returns 503 when every health source fails', async () => {
  const error = new AllHealthSourcesFailedError();
  expect(isAllHealthSourcesFailedError(error)).toBe(true);
  runMock.mockImplementationOnce(async () => { throw error; });
  const response = await request(createApp()).post('/telegram/send-health');
  expect(response.status).toBe(503);
  expect(response.body).toEqual({ error: 'All health sources failed' });
});

it('returns 409 while another health run is active', async () => {
  let release!: () => void;
  runMock.mockReturnValue(new Promise((resolve) => { release = () => resolve(success); }));
  const first = request(createApp()).post('/telegram/send-health').then((response) => response);
  await vi.waitFor(() => expect(runMock).toHaveBeenCalledOnce());
  const second = await request(createApp()).post('/telegram/send-health');
  expect(second.status).toBe(409);
  release();
  await first;
});
});
```

- [ ] **Step 3: Run flow and route tests and verify RED**

```bash
npx vitest run tests/services/health-flow.service.test.ts tests/routes/telegram-health.routes.test.ts
```

Expected: FAIL because the health flow and endpoint do not exist.

- [ ] **Step 4: Implement `HealthSourceService`**

Create `src/services/health-source.service.ts`:

```typescript
import { env } from '../config/env';
import { healthSources } from '../config/health-sources';
import type { NewsCrawler } from '../crawlers/crawler.types';
import { RssCrawler } from '../crawlers/rss.crawler';
import type { CuratedCollectionResult } from '../types/curated';
import type { RssSourceConfig } from '../types/source';
import { CuratedRssSourceService } from './curated-rss-source.service';

export type HealthCollectionResult = CuratedCollectionResult;

export class HealthSourceService {
  private readonly source: CuratedRssSourceService;

  constructor(
    sources: RssSourceConfig[] = healthSources,
    crawler: NewsCrawler<RssSourceConfig> = new RssCrawler(),
    maxArticleAgeDays = env.MAX_ARTICLE_AGE_DAYS,
    now = () => new Date(),
  ) {
    this.source = new CuratedRssSourceService({
      sources, crawler, maxArticleAgeDays, logLabel: 'health', now,
    });
  }

  collectLatest() {
    return this.source.collectLatest();
  }
}
```

- [ ] **Step 5: Implement health flow composition**

Create `src/services/health-flow.service.ts`:

```typescript
import { env } from '../config/env';
import type { Article } from '../types/article';
import type { HealthDigestEntry, HealthMessage, HealthSelectionResult } from '../types/health';
import { CuratedTelegramFlow } from './curated-telegram-flow.service';
import { HealthMessageService } from './health-message.service';
import { HealthSelectionService } from './health-selection.service';
import { type HealthCollectionResult, HealthSourceService } from './health-source.service';
import { SentHistoryStore } from './sent-history.store';
import { createTelegramService } from './telegram.service';
import { TrackedTelegramDeliveryService } from './tracked-telegram-delivery.service';

interface Collector { collectLatest(): Promise<HealthCollectionResult> }
interface HistoryReader { seenUrls(): Promise<Set<string>> }
interface Selector {
  select(articles: Article[], seen: ReadonlySet<string>): HealthSelectionResult;
}
interface MessageBuilder { buildMessages(entries: HealthDigestEntry[]): Promise<HealthMessage[]> }
interface Delivery { send(messages: HealthMessage[]): Promise<void> }

export class AllHealthSourcesFailedError extends Error {
  constructor() {
    super('All health sources failed');
    this.name = 'AllHealthSourcesFailedError';
  }
}

export function isAllHealthSourcesFailedError(error: unknown): boolean {
  return error instanceof AllHealthSourcesFailedError
    || (typeof error === 'object'
      && error !== null
      && 'name' in error
      && error.name === 'AllHealthSourcesFailedError');
}

export class HealthFlowService {
  private readonly flow: CuratedTelegramFlow<
    HealthDigestEntry,
    HealthMessage,
    'telegram-health'
  >;

  constructor(
    source: Collector,
    history: HistoryReader,
    selection: Selector,
    messages: MessageBuilder,
    delivery: Delivery,
  ) {
    this.flow = new CuratedTelegramFlow(
      { collector: source, history, selector: selection, messageBuilder: messages, delivery },
      {
        channel: 'telegram-health',
        createAllSourcesFailedError: () => new AllHealthSourcesFailedError(),
      },
    );
  }

  run() {
    return this.flow.run();
  }
}

export function createHealthFlowService(): HealthFlowService {
  const source = new HealthSourceService();
  const history = new SentHistoryStore(
    env.HEALTH_HISTORY_PATH,
    env.HEALTH_HISTORY_RETENTION_DAYS,
  );
  const selection = new HealthSelectionService();
  const messages = new HealthMessageService();
  const telegram = createTelegramService(
    env.HEALTH_TELEGRAM_BOT_TOKEN,
    env.HEALTH_TELEGRAM_CHAT_ID,
  );
  const delivery = new TrackedTelegramDeliveryService<HealthMessage>(telegram, history);
  return new HealthFlowService(source, history, selection, messages, delivery);
}
```

- [ ] **Step 6: Add the lazy controller and route**

In `telegram.controller.ts` add the health flow import and lazy module state:

```typescript
import {
  createHealthFlowService,
  isAllHealthSourcesFailedError,
} from '../services/health-flow.service';

let healthFlowService: ReturnType<typeof createHealthFlowService> | undefined;
let healthDigestRunning = false;
```

Add:

```typescript
export async function sendHealth(_req: Request, res: Response) {
  if (healthDigestRunning) {
    res.status(409).json({ error: 'Health digest is already running' });
    return;
  }

  healthDigestRunning = true;
  try {
    healthFlowService ??= createHealthFlowService();
    res.json(await healthFlowService.run());
  } catch (error) {
    if (isAllHealthSourcesFailedError(error)) {
      res.status(503).json({ error: 'All health sources failed' });
      return;
    }
    throw error;
  } finally {
    healthDigestRunning = false;
  }
}
```

In `telegram.routes.ts`, add `sendHealth` to the existing controller import and register:

```typescript
import { sendDigest, sendGadgets, sendHealth, sendJobs } from '../controllers/telegram.controller';

telegramRoutes.post('/telegram/send-health', sendHealth);
```

Keep health factory creation lazy so jobs and gadget route tests that partially mock Telegram modules do not instantiate unrelated dependencies during import.

- [ ] **Step 7: Run integration and regression tests**

```bash
npx vitest run tests/services/health-flow.service.test.ts tests/routes/telegram-health.routes.test.ts tests/routes/telegram-gadgets.routes.test.ts tests/routes/telegram-jobs.routes.test.ts tests/routes/news.routes.test.ts
npm run build
npm run lint
```

Expected: health 200/409/503 tests and all existing route regressions PASS.

- [ ] **Step 8: Commit**

```bash
git add src/services/health-source.service.ts src/services/health-flow.service.ts src/controllers/telegram.controller.ts src/routes/telegram.routes.ts tests/services/health-flow.service.test.ts tests/routes/telegram-health.routes.test.ts
git commit -m "feat: expose health Telegram endpoint"
```

### Task 10: Document runtime configuration without tracking secrets

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Create: `tests/config/health-runtime.test.ts`
- Modify ignored file only after credentials are supplied: `.env`

- [ ] **Step 1: Write the failing runtime-documentation test**

Create `tests/config/health-runtime.test.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

it('documents health env, endpoint, no scheduler, and persistent history', () => {
  const envExample = readFileSync('.env.example', 'utf8');
  const readme = readFileSync('README.md', 'utf8');
  const dockerfile = readFileSync('Dockerfile', 'utf8');

  expect(envExample).toContain('HEALTH_TELEGRAM_BOT_TOKEN=replace_me');
  expect(envExample).toContain('HEALTH_TELEGRAM_CHAT_ID=replace_me');
  expect(envExample).toContain('HEALTH_MAX_ARTICLES=12');
  expect(envExample).toContain('HEALTH_HISTORY_RETENTION_DAYS=7');
  expect(envExample).toContain('HEALTH_HISTORY_PATH=data/health-sent-history.json');
  expect(readme).toContain('POST /telegram/send-health');
  expect(readme).toContain('curl -X POST http://localhost:3000/telegram/send-health');
  expect(readme).toMatch(/không có scheduler|không tự chạy lịch/iu);
  expect(readme).toContain('không thay thế chẩn đoán hoặc điều trị y khoa');
  expect(dockerfile).toContain('mkdir -p /app/data');
});
```

- [ ] **Step 2: Run and verify RED**

```bash
npx vitest run tests/config/health-runtime.test.ts
```

Expected: FAIL because health runtime documentation is absent.

- [ ] **Step 3: Add tracked runtime documentation**

Add to `.env.example`:

```env
# Health and lifestyle Telegram flow (POST /telegram/send-health)
HEALTH_TELEGRAM_BOT_TOKEN=replace_me
HEALTH_TELEGRAM_CHAT_ID=replace_me
HEALTH_MAX_ARTICLES=12
HEALTH_HISTORY_RETENTION_DAYS=7
HEALTH_HISTORY_PATH=data/health-sent-history.json
```

Add this README section, keeping the existing project setup and gadget documentation intact:

````markdown
## Bản tin đời sống và sức khỏe trên Telegram

Luồng này đọc bảy RSS đã duyệt: VnExpress Sức khỏe, Tuổi Trẻ Sức khỏe,
Thanh Niên Sức khỏe, MedlinePlus New Links, MedlinePlus Healthy Living,
FDA MedWatch và NIH/NIDDK News. Bài được biên tập sang tiếng Việt và cân bằng
theo sáu nhóm: giấc ngủ, dinh dưỡng, vận động, sức khỏe tinh thần, phòng bệnh,
và bệnh lý/thuốc/nghiên cứu.

Mỗi lần gọi gửi tối đa 12 bài, tối đa hai bài cho mỗi nhóm và hai bài cho mỗi
nguồn. URL đã gửi được lưu riêng trong 7 ngày tại
`data/health-sent-history.json`. Nội dung chỉ nhằm cung cấp thông tin:
`Thông tin tham khảo, không thay thế chẩn đoán hoặc điều trị y khoa.`

Ứng dụng không có scheduler và không tự chạy lịch. Ứng dụng cũng không cung cấp
endpoint lấy chat ID; hãy gửi tin cho bot rồi lấy chat ID bằng quy trình vận hành
của Telegram. Kích hoạt thủ công bằng API:

```bash
curl -X POST http://localhost:3000/telegram/send-health
```

HTTP 200 trả kết quả gửi hoặc `reason: "no_new_articles"`; HTTP 409 nghĩa là
luồng sức khỏe đang chạy; HTTP 503 nghĩa là toàn bộ nguồn sức khỏe đều lỗi.
Gadget và sức khỏe dùng lock, bot/chat, lịch sử và cấu hình độc lập.

Khi chạy Docker, gắn volume vào `/app/data` theo lệnh Docker hiện có trong phần
triển khai để lịch sử không mất sau khi container khởi động lại.
````

- [ ] **Step 4: Handle local credentials conditionally and safely**

If the user has supplied and authorized a dedicated health bot token during execution:

1. Ask the user to send `/start` or any message to the new bot.
2. Discover the latest chat ID operationally through Telegram `getUpdates`; do not add an application route.
3. Add the real health token and chat ID to the ignored `.env` with the approved defaults.
4. Never print the token, stage `.env`, or copy the token into a tracked file.

If the user has not supplied credentials, leave `.env` unchanged and record that only live delivery remains pending; automated implementation continues.

- [ ] **Step 5: Run runtime and secret checks**

```bash
npx vitest run tests/config/health-runtime.test.ts
git status --short --ignored .env data/
git ls-files .env data/health-sent-history.json
```

Expected: runtime test PASS; `.env` and `data/` appear only as ignored; `git ls-files` prints nothing for secret/runtime files.

- [ ] **Step 6: Commit tracked runtime files only**

```bash
git add .env.example README.md tests/config/health-runtime.test.ts
git commit -m "docs: configure health flow runtime"
```

### Task 11: Full verification, review, and integration handoff

**Files:**
- Verify only unless a regression requires a focused TDD fix.
- Runtime output after an authorized live call: ignored `data/health-sent-history.json`.

- [ ] **Step 1: Use the verification skill and run the full suite**

Invoke `superpowers:verification-before-completion`, then run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: every Vitest file/test passes, ESLint reports zero errors, TypeScript exits 0, and diff check emits no output.

- [ ] **Step 2: Verify repository and secret state**

```bash
git status --short
git ls-files .env data/health-sent-history.json
if git grep -qE '[0-9]{8,12}:[A-Za-z0-9_-]{30,}' -- ':!docs/superpowers/**'; then
  echo 'tracked Telegram credential detected'
  exit 1
else
  echo 'tracked Telegram credential: none'
fi
```

Expected: no unintended feature-worktree changes, no tracked runtime files, and no tracked Telegram credential.

- [ ] **Step 3: Request an independent code review**

Invoke `superpowers:requesting-code-review` against the feature branch diff. Fix Critical and Important findings using TDD, rerun focused checks after each fix, and repeat full verification after the final code change.

- [ ] **Step 4: Perform the live health call only when authorized credentials exist**

When the dedicated health token/chat are configured and the user explicitly authorizes delivery:

```bash
npm start
curl --silent --show-error --fail-with-body --max-time 240 \
  -X POST http://127.0.0.1:3000/telegram/send-health
```

Expected: HTTP 200, `channel: "telegram-health"`, and `messageCount` between 1 and 12. Verify the same number of messages appear after one separator in the dedicated health chat.

Call once more only if the user authorizes a second delivery. The second response must have a positive `skippedSeenCount`; it may send different unseen articles when more than 12 eligible articles remain.

- [ ] **Step 5: Finish the branch**

Invoke `superpowers:finishing-a-development-branch`. Use the integration option selected by the user, preserve the worktree for a PR, and do not merge or delete remote state without explicit authorization.

---

## Completion Checklist

- [ ] Gadget endpoint behavior is unchanged and backed by characterization tests.
- [ ] Shared curated engine contains no gadget or health keywords.
- [ ] All seven approved health feeds are isolated and enabled.
- [ ] Six health topics are balanced with 12 total, two per topic, and two per source.
- [ ] Health history uses a separate file and 7-day retention.
- [ ] Health messages are Vietnamese, evidence-labeled, safety-sanitized, source-attributed, and contain the mandatory disclaimer.
- [ ] No diagnosis, prescription, dosage, or treatment-change directive can survive generated-field sanitization.
- [ ] `POST /telegram/send-health` returns 200/409/503 as designed and has no scheduler.
- [ ] Dedicated health Telegram credentials are read only from runtime env.
- [ ] Full tests, lint, build, diff, secret scan, and code review pass.
- [ ] Live delivery is either verified with explicit authorization or reported as pending credentials without weakening automated completion evidence.
