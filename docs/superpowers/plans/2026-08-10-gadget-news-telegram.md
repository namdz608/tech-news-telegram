# Gadget News Telegram Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /telegram/send-gadgets`, which sends at most 12 fresh Vietnamese consumer-device news messages through a second Telegram bot and suppresses successfully delivered URLs for 30 days.

**Architecture:** Keep gadget sources, categories, selection, history, composition, and route behavior isolated from the default tech digest. Reuse the RSS crawler, editorial providers, generic article-message renderer, and Telegram sender through small backwards-compatible interfaces; persist delivery history atomically in a single-instance JSON store.

**Tech Stack:** Node.js 22, TypeScript 6, Express 5, Telegraf, rss-parser, Zod, Vitest, Supertest, Node `fs/promises`.

---

## File Map

- Modify `src/types/source.ts`: allow explicitly configured RSS sources to retain articles that do not match the default tech topics.
- Create `src/types/gadget.ts`: gadget category, selection entry, result, and message contracts.
- Modify `src/config/env.ts`: validate gadget bot/chat, selection, and history settings.
- Create `src/config/gadget-sources.ts`: seven isolated RSS source definitions and source-category affinities.
- Create `src/config/gadget-topics.ts`: six gadget category definitions, presentation, fallback text/images, and keywords.
- Modify `src/crawlers/rss.crawler.ts`: honor `includeUnmatched` without changing default behavior.
- Create `src/services/gadget-source.service.ts`: collect gadget RSS feeds with per-source success/failure counts.
- Create `src/services/gadget-selection.service.ts`: relevance, primary category, canonical dedupe, history filtering, ranking, category balance, and source caps.
- Create `src/services/sent-history.store.ts`: 30-day versioned JSON persistence with corrupt-file recovery and atomic writes.
- Create `src/services/article-message.service.ts`: generic rich HTML article rendering and fallback-image resolution extracted from the tech digest.
- Modify `src/services/digest.service.ts`: delegate its existing renderer/image behavior to the generic article-message module.
- Modify `src/services/article-editorial.types.ts` and `src/services/article-editorial.service.ts`: accept a custom editorial topic context while preserving `TopicKey` callers.
- Create `src/services/gadget-message.service.ts`: edit and render selected gadget entries in Vietnamese.
- Modify `src/services/telegram.service.ts`: accept a minimal message contract, expose credential-based construction, and report each successful article send through a callback.
- Create `src/services/gadget-delivery.service.ts`: connect Telegram success callbacks to URL history writes.
- Create `src/services/gadget-flow.service.ts`: compose collection, history lookup, selection, message building, and delivery.
- Modify `src/controllers/telegram.controller.ts` and `src/routes/telegram.routes.ts`: add the guarded endpoint and HTTP status mapping.
- Modify `.env.example`, `.gitignore`, `Dockerfile`, and `README.md`: document configuration/API and make `/app/data` writable.
- Modify ignored local `.env`: install the authorized gadget bot token and chat ID without adding the secret to Git.

### Task 1: Gadget environment, source config, and raw RSS support

**Files:**
- Modify: `src/config/env.ts`
- Modify: `src/types/source.ts`
- Create: `src/config/gadget-sources.ts`
- Modify: `src/crawlers/rss.crawler.ts`
- Modify: `tests/config/env.test.ts`
- Create: `tests/config/gadget-sources.test.ts`
- Modify: `tests/crawlers/rss.crawler.test.ts`

- [ ] **Step 1: Write failing configuration and crawler tests**

Add these assertions:

```typescript
// tests/config/env.test.ts
it('provides isolated gadget defaults', () => {
  const values = readEnvValues([
    'GADGET_TELEGRAM_BOT_TOKEN',
    'GADGET_TELEGRAM_CHAT_ID',
    'GADGET_MAX_ARTICLES',
    'GADGET_HISTORY_RETENTION_DAYS',
    'GADGET_HISTORY_PATH',
  ]);

  expect(values).toEqual({
    GADGET_TELEGRAM_BOT_TOKEN: 'test-gadget-token',
    GADGET_TELEGRAM_CHAT_ID: 'test-gadget-chat-id',
    GADGET_MAX_ARTICLES: 12,
    GADGET_HISTORY_RETENTION_DAYS: 30,
    GADGET_HISTORY_PATH: 'data/gadget-sent-history.json',
  });
});
```

```typescript
// tests/config/gadget-sources.test.ts
import { describe, expect, it } from 'vitest';
import { gadgetSources } from '../../src/config/gadget-sources';

describe('gadgetSources', () => {
  it('contains the seven isolated HTTPS RSS feeds', () => {
    expect(gadgetSources.map((source) => source.id)).toEqual([
      'vnexpress-tech',
      'thanhnien-products',
      'tuoitre-tech',
      'ars-gadgets',
      'macrumors-all',
      'tomshardware-all',
      'engadget-all',
    ]);

    expect(new Set(gadgetSources.map((source) => source.id)).size).toBe(gadgetSources.length);
    for (const source of gadgetSources) {
      expect(source.kind).toBe('rss');
      expect(source.enabled).toBe(true);
      expect(source.feedUrl).toMatch(/^https:\/\//);
      expect(source.includeUnmatched).toBe(true);
    }
  });
});
```

```typescript
// tests/crawlers/rss.crawler.test.ts
it('retains unmatched articles only when the RSS source opts in', async () => {
  const parser = {
    parseURL: vi.fn().mockResolvedValue({
      items: [{
        title: 'New laptop with 32 GB RAM',
        link: 'https://example.com/laptop',
        contentSnippet: 'Consumer hardware announcement',
        enclosure: { url: 'https://example.com/laptop.jpg', type: 'image/jpeg' },
      }],
    }),
  };
  const crawler = new RssCrawler(parser, { get: vi.fn() });
  const baseSource = {
    id: 'gadgets',
    name: 'Gadgets',
    kind: 'rss' as const,
    enabled: true,
    homepageUrl: 'https://example.com',
    feedUrl: 'https://example.com/feed.xml',
  };

  await expect(crawler.crawl(baseSource)).resolves.toEqual([]);
  await expect(crawler.crawl({ ...baseSource, includeUnmatched: true })).resolves.toEqual([
    expect.objectContaining({
      title: 'New laptop with 32 GB RAM',
      url: 'https://example.com/laptop',
      topics: [],
    }),
  ]);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npx vitest run tests/config/env.test.ts tests/config/gadget-sources.test.ts tests/crawlers/rss.crawler.test.ts
```

Expected: FAIL because gadget env keys, `gadgetSources`, and `RssSourceConfig.includeUnmatched` do not exist.

- [ ] **Step 3: Add the validated environment fields and RSS opt-in**

Add to `envSchema`:

```typescript
GADGET_TELEGRAM_BOT_TOKEN: z.string().default('test-gadget-token'),
GADGET_TELEGRAM_CHAT_ID: z.string().default('test-gadget-chat-id'),
GADGET_MAX_ARTICLES: z.coerce.number().int().min(1).max(50).default(12),
GADGET_HISTORY_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
GADGET_HISTORY_PATH: z.string().min(1).default('data/gadget-sent-history.json'),
```

Add to `RssSourceConfig`:

```typescript
includeUnmatched?: boolean;
```

Change the RSS crawler's final filter to:

```typescript
.filter(({ article }) => source.includeUnmatched || article.topics.length > 0);
```

Create `src/config/gadget-sources.ts`:

```typescript
import type { RssSourceConfig } from '../types/source';

export const gadgetSources: RssSourceConfig[] = [
  {
    id: 'vnexpress-tech',
    name: 'VnExpress Khoa học Công nghệ',
    kind: 'rss',
    enabled: true,
    includeUnmatched: true,
    homepageUrl: 'https://vnexpress.net/khoa-hoc-cong-nghe',
    feedUrl: 'https://vnexpress.net/rss/khoa-hoc-cong-nghe.rss',
  },
  {
    id: 'thanhnien-products',
    name: 'Thanh Niên Sản phẩm Công nghệ',
    kind: 'rss',
    enabled: true,
    includeUnmatched: true,
    homepageUrl: 'https://thanhnien.vn/cong-nghe/san-pham.htm',
    feedUrl: 'https://thanhnien.vn/rss/cong-nghe/san-pham.rss',
  },
  {
    id: 'tuoitre-tech',
    name: 'Tuổi Trẻ Công nghệ',
    kind: 'rss',
    enabled: true,
    includeUnmatched: true,
    homepageUrl: 'https://tuoitre.vn/cong-nghe.htm',
    feedUrl: 'https://tuoitre.vn/rss/cong-nghe.rss',
  },
  {
    id: 'ars-gadgets',
    name: 'Ars Technica Gear & Gadgets',
    kind: 'rss',
    enabled: true,
    includeUnmatched: true,
    homepageUrl: 'https://arstechnica.com/gadgets/',
    feedUrl: 'https://feeds.arstechnica.com/arstechnica/gadgets',
  },
  {
    id: 'macrumors-all',
    name: 'MacRumors',
    kind: 'rss',
    enabled: true,
    includeUnmatched: true,
    homepageUrl: 'https://www.macrumors.com',
    feedUrl: 'https://feeds.macrumors.com/MacRumors-All',
  },
  {
    id: 'tomshardware-all',
    name: "Tom's Hardware",
    kind: 'rss',
    enabled: true,
    includeUnmatched: true,
    homepageUrl: 'https://www.tomshardware.com',
    feedUrl: 'https://www.tomshardware.com/feeds/all',
  },
  {
    id: 'engadget-all',
    name: 'Engadget',
    kind: 'rss',
    enabled: true,
    includeUnmatched: true,
    homepageUrl: 'https://www.engadget.com',
    feedUrl: 'https://www.engadget.com/rss.xml',
  },
];
```

Add this helper alongside the existing editorial-provider helper in `tests/config/env.test.ts`:

```typescript
function readEnvValues(keys: string[]): Record<string, unknown> {
  const childEnv = { ...process.env };
  for (const key of keys) delete childEnv[key];
  const serializedKeys = JSON.stringify(keys);
  const script = [
    "import { env } from './src/config/env.ts';",
    `const keys = ${serializedKeys};`,
    'process.stdout.write(JSON.stringify(Object.fromEntries(keys.map((key) => [key, env[key as keyof typeof env]]))));',
  ].join(' ');
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--eval', script], {
    cwd: process.cwd(),
    env: childEnv,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
npx vitest run tests/config/env.test.ts tests/config/gadget-sources.test.ts tests/crawlers/rss.crawler.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/config/env.ts src/types/source.ts src/config/gadget-sources.ts src/crawlers/rss.crawler.ts tests/config/env.test.ts tests/config/gadget-sources.test.ts tests/crawlers/rss.crawler.test.ts
git commit -m "feat: configure gadget RSS sources"
```

### Task 2: Collect gadget feeds with failure counts

**Files:**
- Create: `src/services/gadget-source.service.ts`
- Create: `tests/services/gadget-source.service.test.ts`

- [ ] **Step 1: Write the failing collector tests**

```typescript
import { describe, expect, it, vi } from 'vitest';
import { GadgetSourceService } from '../../src/services/gadget-source.service';
import type { RssSourceConfig } from '../../src/types/source';

const sources: RssSourceConfig[] = [
  { id: 'one', name: 'One', kind: 'rss', enabled: true, includeUnmatched: true, homepageUrl: 'https://one.test', feedUrl: 'https://one.test/rss' },
  { id: 'two', name: 'Two', kind: 'rss', enabled: true, includeUnmatched: true, homepageUrl: 'https://two.test', feedUrl: 'https://two.test/rss' },
];

describe('GadgetSourceService', () => {
  it('keeps successful feeds and reports failed feeds', async () => {
    const fresh = {
      id: 'a', sourceId: 'one', sourceName: 'One', title: 'New GPU',
      url: 'https://one.test/a', collectedAt: '2026-08-10T00:00:00.000Z', topics: [],
    };
    const crawler = {
      crawl: vi.fn(async (source: RssSourceConfig) => {
        if (source.id === 'two') throw new Error('feed down');
        return [fresh];
      }),
    };
    const service = new GadgetSourceService(sources, crawler, 14, () => new Date('2026-08-10T01:00:00.000Z'));

    await expect(service.collectLatest()).resolves.toEqual({
      articles: [fresh],
      successfulSourceCount: 1,
      failedSourceCount: 1,
    });
  });

  it('reports all-source failure without throwing away the counts', async () => {
    const crawler = { crawl: vi.fn().mockRejectedValue(new Error('down')) };
    const service = new GadgetSourceService(sources, crawler, 14);

    await expect(service.collectLatest()).resolves.toEqual({
      articles: [],
      successfulSourceCount: 0,
      failedSourceCount: 2,
    });
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx vitest run tests/services/gadget-source.service.test.ts
```

Expected: FAIL because `GadgetSourceService` does not exist.

- [ ] **Step 3: Implement the collector**

Create `src/services/gadget-source.service.ts` with this public contract:

```typescript
import { gadgetSources } from '../config/gadget-sources';
import { env } from '../config/env';
import { RssCrawler } from '../crawlers/rss.crawler';
import type { NewsCrawler } from '../crawlers/crawler.types';
import type { Article } from '../types/article';
import type { RssSourceConfig } from '../types/source';
import { dedupeArticles, isAllowedArticle } from './article.service';

export interface GadgetCollectionResult {
  articles: Article[];
  successfulSourceCount: number;
  failedSourceCount: number;
}

export class GadgetSourceService {
  constructor(
    private readonly sources: RssSourceConfig[] = gadgetSources,
    private readonly crawler: NewsCrawler<RssSourceConfig> = new RssCrawler(),
    private readonly maxArticleAgeDays = env.MAX_ARTICLE_AGE_DAYS,
    private readonly now = () => new Date(),
  ) {}

  async collectLatest(): Promise<GadgetCollectionResult> {
    const enabled = this.sources.filter((source) => source.enabled);
    const settled = await Promise.allSettled(enabled.map((source) => this.crawler.crawl(source)));
    const articles: Article[] = [];
    let successfulSourceCount = 0;
    let failedSourceCount = 0;

    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successfulSourceCount += 1;
        articles.push(...result.value);
        return;
      }
      failedSourceCount += 1;
      console.error(`Failed to crawl gadget source ${enabled[index].id}`, result.reason);
    });

    const oldestAllowed = this.now().getTime() - this.maxArticleAgeDays * 86_400_000;
    const fresh = articles.filter((article) => {
      const timestamp = new Date(article.publishedAt ?? article.collectedAt).getTime();
      return Number.isFinite(timestamp) && timestamp >= oldestAllowed;
    });
    fresh.sort((left, right) =>
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

- [ ] **Step 4: Run the test and verify GREEN**

Run:

```bash
npx vitest run tests/services/gadget-source.service.test.ts
```

Expected: PASS, with the expected logged error suppressed by a test spy where necessary.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/services/gadget-source.service.ts tests/services/gadget-source.service.test.ts
git commit -m "feat: collect gadget feeds independently"
```

### Task 3: Classify, rank, and balance gadget articles

**Files:**
- Create: `src/types/gadget.ts`
- Create: `src/config/gadget-topics.ts`
- Create: `src/services/gadget-selection.service.ts`
- Create: `tests/services/gadget-selection.service.test.ts`

- [ ] **Step 1: Write failing classification and selection tests**

Create fixtures with current timestamps and assert these behaviors:

```typescript
it.each([
  ['Apple unveils iPhone 18 Pro', 'apple'],
  ['Samsung Galaxy tablet launches', 'mobile'],
  ['New gaming laptop arrives', 'computers'],
  ['Nvidia GPU and GDDR7 memory tested', 'components'],
  ['OLED monitor and wireless earbuds reviewed', 'av-accessories'],
  ['Smart home camera gains Matter support', 'smart-devices'],
])('classifies %s as %s', (title, topic) => {
  const result = service.select([article({ title })], new Set());
  expect(result.selected[0].topic).toBe(topic);
});

it('rejects generic software and company news', () => {
  const result = service.select([
    article({ title: 'Company reports quarterly revenue' }),
    article({ title: 'New AI model API released for developers' }),
  ], new Set());
  expect(result.selected).toEqual([]);
});

it('canonicalizes, removes sent URLs, caps sources, balances categories, and returns at most 12', () => {
  const input = buildBalancedFixtureWithTrackingDuplicates();
  const result = service.select(input, new Set(['https://example.com/already-sent']));

  expect(result.selected).toHaveLength(12);
  expect(result.skippedSeenCount).toBe(1);
  expect(new Set(result.selected.map((entry) => entry.article.url)).size).toBe(12);
  for (const sourceId of new Set(result.selected.map((entry) => entry.article.sourceId))) {
    expect(result.selected.filter((entry) => entry.article.sourceId === sourceId)).toHaveLength(2);
  }
});
```

The fixture helper must include `https://example.com/item?utm_source=rss#section` and `https://example.com/item` to prove canonical dedupe, 13 or more relevant articles across at least six source IDs, and a previously sent canonical URL.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx vitest run tests/services/gadget-selection.service.test.ts
```

Expected: FAIL because the gadget types, topic config, and selection service do not exist.

- [ ] **Step 3: Create the gadget contracts and category config**

Use these contracts in `src/types/gadget.ts`:

```typescript
import type { Article } from './article';

export type GadgetTopicKey =
  | 'mobile'
  | 'apple'
  | 'computers'
  | 'components'
  | 'av-accessories'
  | 'smart-devices';

export interface GadgetTopicDefinition {
  key: GadgetTopicKey;
  label: string;
  icon: string;
  keywords: string[];
  fallbackImageUrl: string;
  fallbackWhyImportant: string;
}

export interface GadgetDigestEntry {
  article: Article;
  topic: GadgetTopicKey;
  score: number;
}

export interface GadgetSelectionResult {
  selected: GadgetDigestEntry[];
  eligibleCount: number;
  skippedSeenCount: number;
}

export interface GadgetMessage {
  text: string;
  url: string;
  imageUrl?: string;
  article: Article;
  topic: GadgetTopicKey;
}
```

Create `src/config/gadget-topics.ts`:

```typescript
import type { GadgetTopicDefinition, GadgetTopicKey } from '../types/gadget';

export const gadgetTopics: GadgetTopicDefinition[] = [
  {
    key: 'mobile',
    label: 'Điện thoại & Máy tính bảng',
    icon: '📱',
    keywords: ['smartphone', 'phone', 'android', 'galaxy', 'pixel', 'tablet', 'điện thoại', 'máy tính bảng'],
    fallbackImageUrl: 'https://placehold.co/1200x630/1d4ed8/ffffff.png?text=Mobile',
    fallbackWhyImportant: 'Thiết bị di động mới có thể ảnh hưởng đến lựa chọn mua, nâng cấp và khả năng tương thích hệ sinh thái.',
  },
  {
    key: 'apple',
    label: 'Apple',
    icon: '🍎',
    keywords: ['apple', 'iphone', 'ipad', 'macbook', 'mac', 'airpods', 'apple watch'],
    fallbackImageUrl: 'https://placehold.co/1200x630/111827/ffffff.png?text=Apple',
    fallbackWhyImportant: 'Thay đổi trong hệ sinh thái Apple có thể ảnh hưởng đến quyết định mua, nâng cấp và khả năng tương thích thiết bị.',
  },
  {
    key: 'computers',
    label: 'Laptop & Máy tính',
    icon: '💻',
    keywords: ['laptop', 'notebook', 'desktop', 'pc', 'workstation', 'máy tính'],
    fallbackImageUrl: 'https://placehold.co/1200x630/0f766e/ffffff.png?text=Computers',
    fallbackWhyImportant: 'Sản phẩm máy tính mới có thể thay đổi lựa chọn cấu hình, hiệu năng và chi phí nâng cấp.',
  },
  {
    key: 'components',
    label: 'Linh kiện',
    icon: '🧩',
    keywords: ['cpu', 'gpu', 'chip', 'processor', 'graphics card', 'ram', 'memory', 'ssd', 'storage', 'intel', 'amd', 'nvidia', 'qualcomm'],
    fallbackImageUrl: 'https://placehold.co/1200x630/7c3aed/ffffff.png?text=Components',
    fallbackWhyImportant: 'Thông số linh kiện có thể ảnh hưởng trực tiếp đến hiệu năng, giá thành và quyết định nâng cấp.',
  },
  {
    key: 'av-accessories',
    label: 'Màn hình, Âm thanh & Phụ kiện',
    icon: '🎧',
    keywords: ['monitor', 'display', 'tv', 'screen', 'headphones', 'earbuds', 'speaker', 'keyboard', 'mouse', 'dock', 'charger', 'màn hình', 'tai nghe', 'loa', 'bàn phím', 'chuột'],
    fallbackImageUrl: 'https://placehold.co/1200x630/be123c/ffffff.png?text=Accessories',
    fallbackWhyImportant: 'Phụ kiện và thiết bị nghe nhìn mới có thể cải thiện trải nghiệm, kết nối và hiệu quả sử dụng.',
  },
  {
    key: 'smart-devices',
    label: 'Thiết bị thông minh',
    icon: '⌚',
    keywords: ['smartwatch', 'wearable', 'smart home', 'camera', 'router', 'console', 'vr', 'ar', 'gadget', 'đồng hồ thông minh', 'nhà thông minh'],
    fallbackImageUrl: 'https://placehold.co/1200x630/a16207/ffffff.png?text=Smart+Devices',
    fallbackWhyImportant: 'Thiết bị thông minh mới có thể mở rộng khả năng kết nối, giải trí và tự động hóa trong đời sống.',
  },
];

export const gadgetSourceAffinity: Record<string, GadgetTopicKey[]> = {
  'vnexpress-tech': ['mobile', 'apple', 'computers', 'smart-devices'],
  'thanhnien-products': ['mobile', 'apple', 'av-accessories', 'smart-devices'],
  'tuoitre-tech': ['mobile', 'computers', 'smart-devices'],
  'ars-gadgets': ['computers', 'components', 'av-accessories', 'smart-devices'],
  'macrumors-all': ['apple'],
  'tomshardware-all': ['computers', 'components', 'av-accessories'],
  'engadget-all': ['mobile', 'apple', 'computers', 'av-accessories', 'smart-devices'],
};
```

- [ ] **Step 4: Implement deterministic selection**

`GadgetSelectionService.select(articles, seenUrls)` must:

```typescript
export class GadgetSelectionService {
  constructor(
    private readonly maxArticles = env.GADGET_MAX_ARTICLES,
    private readonly now = () => new Date(),
  ) {}

  select(articles: Article[], seenUrls: ReadonlySet<string>): GadgetSelectionResult {
    const canonical = canonicalizeAndDedupe(articles);
    let skippedSeenCount = 0;
    const ranked: RankedGadgetEntry[] = [];

    canonical.forEach((article, index) => {
      if (seenUrls.has(article.url)) {
        skippedSeenCount += 1;
        return;
      }
      const topic = classifyGadgetArticle(article);
      if (!topic) return;
      ranked.push({ article, topic, score: scoreArticle(article, topic, this.now()), index });
    });

    ranked.sort((left, right) => right.score - left.score || left.index - right.index);
    const selected = pickBalanced(ranked, this.maxArticles);
    return { selected, eligibleCount: ranked.length, skippedSeenCount };
  }
}
```

Add these imports, internal type, and helpers in the same file:

```typescript
import { env } from '../config/env';
import { gadgetSourceAffinity, gadgetTopics } from '../config/gadget-topics';
import type { Article } from '../types/article';
import type { GadgetDigestEntry, GadgetSelectionResult, GadgetTopicKey } from '../types/gadget';
import { normalizeUrl } from '../utils/normalize-url';
import { includesKeyword } from '../utils/text';

interface RankedGadgetEntry extends GadgetDigestEntry {
  index: number;
}

function canonicalizeAndDedupe(articles: Article[]): Article[] {
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

function classifyGadgetArticle(article: Article): GadgetTopicKey | undefined {
  const apple = gadgetTopics.find((topic) => topic.key === 'apple');
  if (apple && keywordHits(article, apple.keywords) > 0) return 'apple';

  let best: { key: GadgetTopicKey; hits: number } | undefined;
  for (const topic of gadgetTopics) {
    if (topic.key === 'apple') continue;
    const hits = keywordHits(article, topic.keywords);
    if (hits > 0 && (!best || hits > best.hits)) best = { key: topic.key, hits };
  }
  return best?.key;
}

function keywordHits(article: Article, keywords: string[]): number {
  const searchable = `${article.title} ${article.summary ?? ''}`;
  return keywords.filter((keyword) => includesKeyword(searchable, keyword)).length;
}

function scoreArticle(article: Article, topic: GadgetTopicKey, now: Date): number {
  const definition = gadgetTopics.find((candidate) => candidate.key === topic);
  if (!definition) return 0;
  const titleHits = definition.keywords.filter((keyword) => includesKeyword(article.title, keyword)).length;
  const summaryHits = definition.keywords.filter((keyword) => includesKeyword(article.summary ?? '', keyword)).length;
  const affinity = (gadgetSourceAffinity[article.sourceId] ?? []).includes(topic) ? 25 : 0;
  const published = new Date(article.publishedAt ?? article.collectedAt).getTime();
  const ageDays = Math.max(0, Math.floor((now.getTime() - published) / 86_400_000));
  const freshness = Math.max(0, 14 - ageDays);
  return titleHits * 100 + summaryHits * 10 + affinity + freshness;
}

function pickBalanced(ranked: RankedGadgetEntry[], limit: number): GadgetDigestEntry[] {
  const selected: RankedGadgetEntry[] = [];
  const urls = new Set<string>();
  const sourceCounts = new Map<string, number>();
  const tryPick = (entry: RankedGadgetEntry) => {
    if (selected.length >= limit || urls.has(entry.article.url)) return;
    const count = sourceCounts.get(entry.article.sourceId) ?? 0;
    if (count >= 2) return;
    selected.push(entry);
    urls.add(entry.article.url);
    sourceCounts.set(entry.article.sourceId, count + 1);
  };

  for (const topic of gadgetTopics) {
    let categoryCount = 0;
    for (const entry of ranked) {
      if (entry.topic !== topic.key || categoryCount >= 2) continue;
      const before = selected.length;
      tryPick(entry);
      if (selected.length > before) categoryCount += 1;
    }
  }
  for (const entry of ranked) tryPick(entry);
  return selected.map(({ article, topic, score }) => ({ article, topic, score }));
}
```

- [ ] **Step 5: Run selection tests and verify GREEN**

Run:

```bash
npx vitest run tests/services/gadget-selection.service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/types/gadget.ts src/config/gadget-topics.ts src/services/gadget-selection.service.ts tests/services/gadget-selection.service.test.ts
git commit -m "feat: select balanced gadget news"
```

### Task 4: Persist 30-day sent history atomically

**Files:**
- Create: `src/services/sent-history.store.ts`
- Create: `tests/services/sent-history.store.test.ts`

- [ ] **Step 1: Write failing file-store tests**

Use `mkdtemp(join(tmpdir(), 'gadget-history-'))` per test and clean only that returned directory. Assert:

```typescript
it('treats a missing file as empty and persists canonical timestamps', async () => {
  expect(await store.seenUrls()).toEqual(new Set());
  await store.mark('https://example.com/device?utm_source=rss');
  expect(await store.seenUrls()).toEqual(new Set(['https://example.com/device']));
});

it('removes entries older than 30 days', async () => {
  await writeFile(historyPath, JSON.stringify({
    version: 1,
    sent: {
      'https://example.com/old': '2026-06-01T00:00:00.000Z',
      'https://example.com/fresh': '2026-08-09T00:00:00.000Z',
    },
  }));
  expect(await store.seenUrls()).toEqual(new Set(['https://example.com/fresh']));
});

it('preserves malformed data under a corrupt suffix and starts empty', async () => {
  await writeFile(historyPath, '{broken');
  expect(await store.seenUrls()).toEqual(new Set());
  expect((await readdir(directory)).some((name) => name.startsWith('history.json.corrupt-'))).toBe(true);
});
```

Also spy on `rename` through an injected filesystem adapter or assert that no temporary file remains after `mark`, proving the same-directory write-and-rename path completed.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx vitest run tests/services/sent-history.store.test.ts
```

Expected: FAIL because `SentHistoryStore` does not exist.

- [ ] **Step 3: Implement the versioned store**

Create `src/services/sent-history.store.ts` with:

```typescript
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { env } from '../config/env';
import { normalizeUrl } from '../utils/normalize-url';

interface HistoryDocument {
  version: 1;
  sent: Record<string, string>;
}

export class SentHistoryStore {
  constructor(
    private readonly filePath = env.GADGET_HISTORY_PATH,
    private readonly retentionDays = env.GADGET_HISTORY_RETENTION_DAYS,
    private readonly now = () => new Date(),
  ) {}

  async seenUrls(): Promise<Set<string>> {
    return new Set(Object.keys((await this.load()).sent));
  }

  async mark(inputUrl: string): Promise<void> {
    const document = await this.load();
    document.sent[normalizeUrl(inputUrl)] = this.now().toISOString();
    await this.save(document);
  }

  private async load(): Promise<HistoryDocument> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (!isHistoryDocument(parsed)) throw new Error('Invalid gadget history schema');
      return pruneHistory(parsed, this.now(), this.retentionDays);
    } catch (error) {
      if (isMissingFile(error)) return { version: 1, sent: {} };
      await mkdir(dirname(this.filePath), { recursive: true });
      const corruptPath = `${this.filePath}.corrupt-${this.now().toISOString().replace(/[:.]/g, '-')}`;
      await rename(this.filePath, corruptPath);
      console.warn(`Invalid gadget history moved to ${corruptPath}`, error);
      return { version: 1, sent: {} };
    }
  }

  private async save(document: HistoryDocument): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, this.filePath);
  }
}
```

Add these pure helpers below the class:

```typescript
function isHistoryDocument(value: unknown): value is HistoryDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as { version?: unknown; sent?: unknown };
  if (candidate.version !== 1 || !candidate.sent || typeof candidate.sent !== 'object' || Array.isArray(candidate.sent)) {
    return false;
  }
  return Object.entries(candidate.sent).every(([url, timestamp]) =>
    typeof url === 'string' && typeof timestamp === 'string',
  );
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function pruneHistory(document: HistoryDocument, now: Date, retentionDays: number): HistoryDocument {
  const cutoff = now.getTime() - retentionDays * 86_400_000;
  const sent = Object.fromEntries(Object.entries(document.sent).filter(([, timestamp]) => {
    const value = new Date(timestamp).getTime();
    return Number.isFinite(value) && value >= cutoff;
  }));
  return { version: 1, sent };
}
```

- [ ] **Step 4: Run history tests and verify GREEN**

Run:

```bash
npx vitest run tests/services/sent-history.store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/services/sent-history.store.ts tests/services/sent-history.store.test.ts
git commit -m "feat: persist gadget sent history"
```

### Task 5: Reuse editorial and rich article rendering for gadget topics

**Files:**
- Create: `src/services/article-message.service.ts`
- Modify: `src/services/digest.service.ts`
- Modify: `src/services/article-editorial.types.ts`
- Modify: `src/services/article-editorial.service.ts`
- Create: `src/services/gadget-message.service.ts`
- Modify: `tests/services/digest.service.test.ts`
- Modify: `tests/services/article-editorial.service.test.ts`
- Create: `tests/services/gadget-message.service.test.ts`

- [ ] **Step 1: Write failing compatibility and gadget-message tests**

Keep an existing tech-message snapshot/assertion and add:

```typescript
it('uses a custom gadget editorial context without changing TopicKey', async () => {
  const editor = new ArticleEditorialService({ generate: vi.fn().mockResolvedValue('{}') });
  const result = await editor.editArticle(article, {
    key: 'components',
    fallbackWhyImportant: 'Thông số linh kiện có thể ảnh hưởng trực tiếp đến hiệu năng và quyết định nâng cấp.',
  });
  expect(result.whyImportant).toContain('hiệu năng');
});
```

```typescript
it('edits and renders gadget messages in selection order', async () => {
  const editor = {
    editArticle: vi.fn().mockResolvedValue({
      title: 'GPU mới ra mắt',
      summary: 'Mẫu GPU mới có bộ nhớ nhanh hơn.',
      whyImportant: 'Người dùng PC có thêm lựa chọn nâng cấp.',
      actionLevel: 'monitor' as const,
      actionText: 'Theo dõi benchmark độc lập.',
    }),
  };
  const service = new GadgetMessageService(editor);
  const messages = await service.buildMessages([{ article, topic: 'components', score: 100 }]);

  expect(messages[0]).toMatchObject({ url: article.url, article, topic: 'components' });
  expect(messages[0].text).toContain('🧩  <b>LINH KIỆN UPDATE</b>');
  expect(messages[0].text).toContain('GPU mới ra mắt');
  expect(messages[0].imageUrl).toMatch(/^https:\/\/placehold\.co\//);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npx vitest run tests/services/article-editorial.service.test.ts tests/services/digest.service.test.ts tests/services/gadget-message.service.test.ts
```

Expected: FAIL because custom editorial contexts, generic rendering, and `GadgetMessageService` do not exist.

- [ ] **Step 3: Generalize editorial topic input without changing tech callers**

Add to `article-editorial.types.ts`:

```typescript
export interface EditorialTopicContext {
  key: string;
  fallbackWhyImportant: string;
}
```

Change `ArticleEditorialInput.topic` from `TopicKey` to `string`. In `ArticleEditorialService`, accept `TopicKey | EditorialTopicContext`, resolve string topics through the existing `fallbackWhyImportant` record, send only the resolved `key` to generators, and use the resolved fallback text in `createFallbackEditorial`. Existing calls such as `editArticle(article, 'security')` and `createFallbackEditorial(article, 'cloud')` must compile and return identical content.

- [ ] **Step 4: Extract the generic article renderer and build gadget messages**

Create `src/services/article-message.service.ts` with exports:

```typescript
export interface ArticleMessagePresentation {
  label: string;
  icon: string;
  fallbackImageUrl: string;
}

export function renderArticleMessageWithPresentation(
  article: Article,
  presentation: ArticleMessagePresentation,
  editorial: ArticleEditorial,
): string;

export function getArticleMessageImageUrl(
  article: Article,
  fallbackImageUrl: string,
): string | undefined;
```

Move the existing HTML layout, action-level presentation, Vietnam date formatting, text truncation, escaping, and HTTPS image validation into this module unchanged. `DigestService.renderArticleMessage(article, topic, editorial)` becomes a wrapper that looks up the existing topic label/icon/image and delegates. Its private image helper delegates to `getArticleMessageImageUrl`.

Create `src/services/gadget-message.service.ts`:

```typescript
import { gadgetTopics } from '../config/gadget-topics';
import type { Article } from '../types/article';
import type { GadgetDigestEntry, GadgetMessage, GadgetTopicKey } from '../types/gadget';
import { ArticleEditorialService } from './article-editorial.service';
import type { ArticleEditorial, EditorialTopicContext } from './article-editorial.types';
import { getArticleMessageImageUrl, renderArticleMessageWithPresentation } from './article-message.service';

interface GadgetArticleEditor {
  editArticle(article: Article, topic: EditorialTopicContext): Promise<ArticleEditorial>;
}

export class GadgetMessageService {
  constructor(private readonly editor: GadgetArticleEditor = new ArticleEditorialService()) {}

  async buildMessages(entries: GadgetDigestEntry[]): Promise<GadgetMessage[]> {
    return Promise.all(entries.map(async (entry) => {
      const topic = getTopic(entry.topic);
      const editorial = await this.editor.editArticle(entry.article, {
        key: topic.key,
        fallbackWhyImportant: topic.fallbackWhyImportant,
      });
      return {
        text: renderArticleMessageWithPresentation(entry.article, topic, editorial),
        url: entry.article.url,
        imageUrl: getArticleMessageImageUrl(entry.article, topic.fallbackImageUrl),
        article: entry.article,
        topic: entry.topic,
      };
    }));
  }
}

function getTopic(key: GadgetTopicKey) {
  const topic = gadgetTopics.find((candidate) => candidate.key === key);
  if (!topic) throw new Error(`Unknown gadget topic: ${key}`);
  return topic;
}
```

- [ ] **Step 5: Run focused and provider tests and verify GREEN**

Run:

```bash
npx vitest run tests/services/article-editorial.service.test.ts tests/services/digest.service.test.ts tests/services/digest-message-editorial.service.test.ts tests/services/google-article-editorial.generator.test.ts tests/services/openai-article-editorial.generator.test.ts tests/services/codex-article-editorial.generator.test.ts tests/services/gadget-message.service.test.ts
```

Expected: PASS with unchanged tech message rendering.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/services/article-message.service.ts src/services/digest.service.ts src/services/article-editorial.types.ts src/services/article-editorial.service.ts src/services/gadget-message.service.ts tests/services/digest.service.test.ts tests/services/article-editorial.service.test.ts tests/services/gadget-message.service.test.ts
git commit -m "feat: render gadget editorial messages"
```

### Task 6: Track successful Telegram delivery per article

**Files:**
- Modify: `src/services/telegram.service.ts`
- Create: `src/services/gadget-delivery.service.ts`
- Modify: `tests/services/telegram.service.test.ts`
- Create: `tests/services/gadget-delivery.service.test.ts`

- [ ] **Step 1: Write failing Telegram callback and delivery tests**

```typescript
it('calls onSent after each successful article and not after a failed article', async () => {
  const sendMessage = vi.fn()
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(new Error('telegram down'));
  const onSent = vi.fn();
  const service = new TelegramService({ telegram: { sendMessage } }, 'chat-id', 3900, '');
  const messages = [
    { text: 'one', url: 'https://example.com/one' },
    { text: 'two', url: 'https://example.com/two' },
  ];

  await expect(service.sendMessages(messages, onSent)).rejects.toThrow('telegram down');
  expect(onSent).toHaveBeenCalledOnce();
  expect(onSent).toHaveBeenCalledWith(messages[0]);
});
```

```typescript
it('marks history only after each Telegram message succeeds', async () => {
  const telegram = {
    sendMessages: vi.fn(async (messages, onSent) => {
      await onSent(messages[0]);
      throw new Error('second failed');
    }),
  };
  const history = { mark: vi.fn().mockResolvedValue(undefined) };
  const service = new GadgetDeliveryService(telegram, history);

  await expect(service.send(messages)).rejects.toThrow('second failed');
  expect(history.mark).toHaveBeenCalledWith(messages[0].url);
  expect(history.mark).not.toHaveBeenCalledWith(messages[1].url);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npx vitest run tests/services/telegram.service.test.ts tests/services/gadget-delivery.service.test.ts
```

Expected: FAIL because `sendMessages` has no callback/minimal contract and `GadgetDeliveryService` does not exist.

- [ ] **Step 3: Add the minimal Telegram message contract, factory, and callback**

In `telegram.service.ts`, replace the `DigestMessage` dependency with:

```typescript
export interface TelegramMessage {
  text: string;
  url: string;
  imageUrl?: string;
}

export function createTelegramService(botToken: string, chatId: string): TelegramService {
  return new TelegramService(new Telegraf(botToken) as unknown as TelegramClientLike, chatId);
}
```

Change the batch method to:

```typescript
async sendMessages(
  messages: TelegramMessage[],
  onSent?: (message: TelegramMessage) => void | Promise<void>,
): Promise<void> {
  const validMessages = messages.filter((message) => message.text.trim());
  if (validMessages.length === 0) return;

  await this.bot.telegram.sendMessage(this.chatId, triggerSeparator, {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });

  for (const message of validMessages) {
    await this.sendDigest(message.text, message.url, message.imageUrl);
    await onSent?.(message);
  }
}
```

Structural typing keeps existing `DigestMessage[]` callers valid.

- [ ] **Step 4: Implement the gadget delivery adapter**

```typescript
// src/services/gadget-delivery.service.ts
import type { GadgetMessage } from '../types/gadget';
import type { TelegramMessage } from './telegram.service';

interface GadgetTelegramSender {
  sendMessages(
    messages: TelegramMessage[],
    onSent?: (message: TelegramMessage) => void | Promise<void>,
  ): Promise<void>;
}

interface GadgetHistoryWriter {
  mark(url: string): Promise<void>;
}

export class GadgetDeliveryService {
  constructor(
    private readonly telegram: GadgetTelegramSender,
    private readonly history: GadgetHistoryWriter,
  ) {}

  async send(messages: GadgetMessage[]): Promise<void> {
    await this.telegram.sendMessages(messages, (message) => this.history.mark(message.url));
  }
}
```

- [ ] **Step 5: Run delivery tests and verify GREEN**

Run:

```bash
npx vitest run tests/services/telegram.service.test.ts tests/services/gadget-delivery.service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add src/services/telegram.service.ts src/services/gadget-delivery.service.ts tests/services/telegram.service.test.ts tests/services/gadget-delivery.service.test.ts
git commit -m "feat: track gadget Telegram deliveries"
```

### Task 7: Compose the flow and expose the guarded endpoint

**Files:**
- Create: `src/services/gadget-flow.service.ts`
- Modify: `src/controllers/telegram.controller.ts`
- Modify: `src/routes/telegram.routes.ts`
- Create: `tests/services/gadget-flow.service.test.ts`
- Create: `tests/routes/telegram-gadgets.routes.test.ts`

- [ ] **Step 1: Write failing orchestration tests**

Test a successful flow, no-new flow, and all-source failure:

```typescript
it('collects, filters history, builds messages, and delivers them', async () => {
  source.collectLatest.mockResolvedValue({ articles: [article], successfulSourceCount: 6, failedSourceCount: 1 });
  history.seenUrls.mockResolvedValue(new Set());
  selection.select.mockReturnValue({ selected: [entry], eligibleCount: 1, skippedSeenCount: 0 });
  messages.buildMessages.mockResolvedValue([message]);

  await expect(flow.run()).resolves.toEqual({
    sent: true,
    collectedCount: 1,
    eligibleCount: 1,
    skippedSeenCount: 0,
    messageCount: 1,
    language: 'vi',
    channel: 'telegram-gadgets',
  });
  expect(delivery.send).toHaveBeenCalledWith([message]);
});

it('does not build or send when no unseen relevant article exists', async () => {
  source.collectLatest.mockResolvedValue({ articles: [article], successfulSourceCount: 7, failedSourceCount: 0 });
  history.seenUrls.mockResolvedValue(new Set([article.url]));
  selection.select.mockReturnValue({ selected: [], eligibleCount: 0, skippedSeenCount: 1 });

  await expect(flow.run()).resolves.toMatchObject({ sent: false, reason: 'no_new_articles', messageCount: 0 });
  expect(delivery.send).not.toHaveBeenCalled();
});

it('throws AllGadgetSourcesFailedError when every feed fails', async () => {
  source.collectLatest.mockResolvedValue({ articles: [], successfulSourceCount: 0, failedSourceCount: 7 });
  await expect(flow.run()).rejects.toBeInstanceOf(AllGadgetSourcesFailedError);
});
```

- [ ] **Step 2: Run the service test and verify RED**

Run:

```bash
npx vitest run tests/services/gadget-flow.service.test.ts
```

Expected: FAIL because the flow service does not exist.

- [ ] **Step 3: Implement composition and production factory**

Create `src/services/gadget-flow.service.ts`:

```typescript
import { env } from '../config/env';
import type { Article } from '../types/article';
import type { GadgetMessage, GadgetSelectionResult } from '../types/gadget';
import { GadgetDeliveryService } from './gadget-delivery.service';
import { GadgetMessageService } from './gadget-message.service';
import { GadgetSelectionService } from './gadget-selection.service';
import { type GadgetCollectionResult, GadgetSourceService } from './gadget-source.service';
import { SentHistoryStore } from './sent-history.store';
import { createTelegramService } from './telegram.service';

interface GadgetCollector {
  collectLatest(): Promise<GadgetCollectionResult>;
}
interface GadgetHistoryReader {
  seenUrls(): Promise<Set<string>>;
}
interface GadgetSelector {
  select(articles: Article[], seenUrls: ReadonlySet<string>): GadgetSelectionResult;
}
interface GadgetMessageBuilder {
  buildMessages(entries: GadgetSelectionResult['selected']): Promise<GadgetMessage[]>;
}
interface GadgetDelivery {
  send(messages: GadgetMessage[]): Promise<void>;
}

export interface GadgetFlowResponse {
  sent: boolean;
  reason?: 'no_new_articles';
  collectedCount: number;
  eligibleCount: number;
  skippedSeenCount: number;
  messageCount: number;
  language: 'vi';
  channel: 'telegram-gadgets';
}

export class AllGadgetSourcesFailedError extends Error {
  constructor() {
    super('All gadget sources failed');
    this.name = 'AllGadgetSourcesFailedError';
  }
}

export class GadgetFlowService {
  constructor(
    private readonly source: GadgetCollector,
    private readonly history: GadgetHistoryReader,
    private readonly selection: GadgetSelector,
    private readonly messages: GadgetMessageBuilder,
    private readonly delivery: GadgetDelivery,
  ) {}

  async run(): Promise<GadgetFlowResponse> {
    const collected = await this.source.collectLatest();
    if (collected.successfulSourceCount === 0) throw new AllGadgetSourcesFailedError();
    const seenUrls = await this.history.seenUrls();
    const result = this.selection.select(collected.articles, seenUrls);
    const common = {
      collectedCount: collected.articles.length,
      eligibleCount: result.eligibleCount,
      skippedSeenCount: result.skippedSeenCount,
      language: 'vi' as const,
      channel: 'telegram-gadgets' as const,
    };
    if (result.selected.length === 0) {
      return { sent: false, reason: 'no_new_articles', messageCount: 0, ...common };
    }
    const messages = await this.messages.buildMessages(result.selected);
    await this.delivery.send(messages);
    return { sent: true, messageCount: messages.length, ...common };
  }
}

export function createGadgetFlowService(): GadgetFlowService {
  const source = new GadgetSourceService();
  const history = new SentHistoryStore();
  const selection = new GadgetSelectionService();
  const messages = new GadgetMessageService();
  const telegram = createTelegramService(env.GADGET_TELEGRAM_BOT_TOKEN, env.GADGET_TELEGRAM_CHAT_ID);
  const delivery = new GadgetDeliveryService(telegram, history);
  return new GadgetFlowService(source, history, selection, messages, delivery);
}
```

- [ ] **Step 4: Write failing route tests including the concurrency guard**

Mock `createGadgetFlowService` before importing `createApp`. Assert:

```typescript
it('returns the flow response', async () => {
  runMock.mockResolvedValue(successResponse);
  const response = await request(createApp()).post('/telegram/send-gadgets');
  expect(response.status).toBe(200);
  expect(response.body).toEqual(successResponse);
});

it('returns 503 when every gadget source fails', async () => {
  runMock.mockRejectedValue(new AllGadgetSourcesFailedError());
  const response = await request(createApp()).post('/telegram/send-gadgets');
  expect(response.status).toBe(503);
  expect(response.body).toEqual({ error: 'All gadget sources failed' });
});

it('returns 409 while another gadget run is active', async () => {
  let release!: () => void;
  runMock.mockReturnValue(new Promise((resolve) => { release = () => resolve(successResponse); }));
  const first = request(createApp()).post('/telegram/send-gadgets').then((response) => response);
  await vi.waitFor(() => expect(runMock).toHaveBeenCalledOnce());
  const second = await request(createApp()).post('/telegram/send-gadgets');
  expect(second.status).toBe(409);
  release();
  await first;
});
```

- [ ] **Step 5: Run route tests and verify RED**

Run:

```bash
npx vitest run tests/routes/telegram-gadgets.routes.test.ts
```

Expected: FAIL with 404 because the route is not registered.

- [ ] **Step 6: Add the controller and route**

In `telegram.controller.ts`, create one production gadget flow and guard it:

```typescript
const gadgetFlowService = createGadgetFlowService();
let gadgetDigestRunning = false;

export async function sendGadgets(_req: Request, res: Response) {
  if (gadgetDigestRunning) {
    res.status(409).json({ error: 'Gadget digest is already running' });
    return;
  }

  gadgetDigestRunning = true;
  try {
    res.json(await gadgetFlowService.run());
  } catch (error) {
    if (error instanceof AllGadgetSourcesFailedError) {
      res.status(503).json({ error: 'All gadget sources failed' });
      return;
    }
    throw error;
  } finally {
    gadgetDigestRunning = false;
  }
}
```

Register:

```typescript
telegramRoutes.post('/telegram/send-gadgets', sendGadgets);
```

- [ ] **Step 7: Run flow, route, and regression tests and verify GREEN**

Run:

```bash
npx vitest run tests/services/gadget-flow.service.test.ts tests/routes/telegram-gadgets.routes.test.ts tests/routes/telegram-jobs.routes.test.ts tests/routes/news.routes.test.ts
```

Expected: PASS; existing `/telegram/send-digest` and jobs behavior remain unchanged.

- [ ] **Step 8: Commit Task 7**

```bash
git add src/services/gadget-flow.service.ts src/controllers/telegram.controller.ts src/routes/telegram.routes.ts tests/services/gadget-flow.service.test.ts tests/routes/telegram-gadgets.routes.test.ts
git commit -m "feat: expose gadget Telegram endpoint"
```

### Task 8: Runtime storage, documentation, and local secret configuration

**Files:**
- Modify: `.env.example`
- Modify: `.gitignore`
- Modify: `Dockerfile`
- Modify: `README.md`
- Create: `tests/config/gadget-runtime.test.ts`
- Modify ignored file: `.env`

- [ ] **Step 1: Write a failing runtime-documentation test**

```typescript
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('gadget runtime configuration', () => {
  it('documents gadget env, writable data storage, and the endpoint without a scheduler', () => {
    const envExample = readFileSync('.env.example', 'utf8');
    const dockerfile = readFileSync('Dockerfile', 'utf8');
    const readme = readFileSync('README.md', 'utf8');
    const gitignore = readFileSync('.gitignore', 'utf8');

    expect(envExample).toContain('GADGET_TELEGRAM_BOT_TOKEN=replace_me');
    expect(envExample).toContain('GADGET_TELEGRAM_CHAT_ID=replace_me');
    expect(envExample).toContain('GADGET_MAX_ARTICLES=12');
    expect(envExample).toContain('GADGET_HISTORY_RETENTION_DAYS=30');
    expect(envExample).toContain('GADGET_HISTORY_PATH=data/gadget-sent-history.json');
    expect(dockerfile).toContain('mkdir -p /app/data');
    expect(readme).toContain('POST /telegram/send-gadgets');
    expect(readme).toContain("curl -X POST http://localhost:3000/telegram/send-gadgets");
    expect(gitignore).toContain('data/');
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx vitest run tests/config/gadget-runtime.test.ts
```

Expected: FAIL because runtime config and documentation are absent.

- [ ] **Step 3: Update runtime files**

Add this block to `.env.example` and the README env example:

```env
# Consumer gadget news Telegram flow (POST /telegram/send-gadgets)
GADGET_TELEGRAM_BOT_TOKEN=replace_me
GADGET_TELEGRAM_CHAT_ID=replace_me
GADGET_MAX_ARTICLES=12
GADGET_HISTORY_RETENTION_DAYS=30
GADGET_HISTORY_PATH=data/gadget-sent-history.json
```

Add `data/` to `.gitignore`. Before `USER node` in the runtime Docker stage, add:

```dockerfile
RUN mkdir -p /app/data && chown node:node /app/data
```

Document that the API has no scheduler, list the seven sources and six categories, show success/no-new responses, show the curl command, and show a persistent Docker volume such as:

```bash
docker run -v tech-news-gadget-data:/app/data -p 3000:3000 --env-file .env tech-news-telegram
```

- [ ] **Step 4: Configure the ignored local `.env` securely**

Set `GADGET_TELEGRAM_BOT_TOKEN` from the bot credential explicitly authorized by bố in this conversation, set `GADGET_TELEGRAM_CHAT_ID=1290050401`, and add the three approved non-secret defaults. Do not stage `.env`, print its values, or copy the token into any tracked file.

- [ ] **Step 5: Run the runtime test and verify GREEN**

Run:

```bash
npx vitest run tests/config/gadget-runtime.test.ts
git status --short --ignored .env
```

Expected: test PASS and `.env` shown only as ignored (`!! .env`).

- [ ] **Step 6: Commit tracked Task 8 files**

```bash
git add .env.example .gitignore Dockerfile README.md tests/config/gadget-runtime.test.ts
git commit -m "docs: configure gadget flow runtime"
```

### Task 9: Full verification and one live endpoint call

**Files:**
- Verify only; no planned tracked edits.
- Runtime output: ignored `data/gadget-sent-history.json` after successful delivery.

- [ ] **Step 1: Run the complete automated verification suite**

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: all Vitest tests pass, ESLint reports no errors, TypeScript build exits 0, and `git diff --check` emits no output.

- [ ] **Step 2: Verify secrets are not tracked**

```bash
git status --short
git ls-files .env data/gadget-sent-history.json
git grep -n 'GADGET_TELEGRAM_BOT_TOKEN=' -- ':!*.example' ':!docs/superpowers/**' || true
```

Expected: `.env` and runtime history are absent from tracked-file output; no tracked production file contains an assigned gadget token.

- [ ] **Step 3: Start the built application for the live check**

```bash
npm start
```

Expected: server listens on the configured `PORT` without environment validation errors. Keep this process in a separate terminal/session.

- [ ] **Step 4: Trigger one live gadget delivery**

```bash
curl -fsS -X POST http://127.0.0.1:3000/telegram/send-gadgets | jq
```

Expected: HTTP 200 with `channel: "telegram-gadgets"`, `messageCount` between 1 and 12, and the same number of gadget messages visible in Telegram chat `1290050401` after one separator.

- [ ] **Step 5: Verify history suppression without sending duplicates**

```bash
curl -fsS -X POST http://127.0.0.1:3000/telegram/send-gadgets | jq
```

Expected: previously delivered URLs increase `skippedSeenCount`; if no newer eligible article appeared, response contains `sent: false`, `reason: "no_new_articles"`, and `messageCount: 0`.

- [ ] **Step 6: Record final repository state**

```bash
git status --short
git log --oneline -10
```

Expected: no unintended tracked changes; ignored `.env` and `data/` do not appear in normal status.
