# Politics RSS Text and Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decode Vietnamese RSS text correctly and attach an article or category-fallback image to every Gold/Politics news message.

**Architecture:** Normalize RSS text once at ingestion, then preserve `Article.imageUrl` through the existing spread-based classification and selection pipeline. The message builder selects a validated article image or category fallback, and delivery forwards it to the existing Telegram photo path.

**Tech Stack:** TypeScript, Cheerio, Vitest, Telegraf

---

### Task 1: Decode RSS text at ingestion

**Files:**
- Modify: `src/crawlers/rss.crawler.ts:181-188`
- Test: `tests/crawlers/rss.crawler.test.ts`

- [ ] **Step 1: Write the failing crawler test**

Add a test whose parser returns:

```ts
{
  title: 'Nhiều b&aacute;c sĩ giỏi tuyến huyện bỏ l&ecirc;n thành phố',
  link: 'https://thanhnien.vn/example.htm',
  contentSnippet: 'Đ&acirc;y l&agrave; nội dung &#039;thử nghiệm&#039;.',
}
```

Assert the resulting article title is `Nhiều bác sĩ giỏi tuyến huyện bỏ lên thành phố` and summary is `Đây là nội dung 'thử nghiệm'.`.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/crawlers/rss.crawler.test.ts`

Expected: FAIL because title and summary still contain `&...;` references.

- [ ] **Step 3: Add minimal normalization**

Replace the title/summary normalization with:

```ts
const title = normalizeRssText(item.title ?? '');
const summary = boundNormalizedSummary(
  normalizeRssText(item.contentSnippet ?? item.content ?? ''),
  source.boundedFeedFetch === true,
);
```

Add:

```ts
function normalizeRssText(value: string): string {
  return compactText(cheerio.load(value, undefined, false).text());
}
```

This decodes entities and extracts inert text before Telegram escaping.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test -- tests/crawlers/rss.crawler.test.ts`

Expected: PASS.

```bash
git add src/crawlers/rss.crawler.ts tests/crawlers/rss.crawler.test.ts
git commit -m "fix: decode RSS text entities"
```

### Task 2: Preserve and select Politics images

**Files:**
- Create: `src/config/gold-politics-images.ts`
- Modify: `src/services/politics-rss.adapter.ts:70-95`
- Modify: `src/types/gold-politics.ts:267-271`
- Modify: `src/services/gold-politics-message.service.ts:1-12,83-92`
- Test: `tests/services/politics-rss.adapter.test.ts`
- Test: `tests/services/gold-politics-message.service.test.ts`

- [ ] **Step 1: Write failing adapter and message tests**

Change the adapter assertion to require:

```ts
expect(result.items[0]?.imageUrl).toBe('https://vnexpress.net/photo.jpg');
```

In message tests, verify an HTTPS article image is preferred:

```ts
const input = candidate({
  imageUrl: 'https://images.example.com/article.jpg',
  primaryCategory: 'vietnam-politics',
});
const [message] = await new GoldPoliticsMessageService(editorial).buildNewsMessages([input]);
expect(message.imageUrl).toBe('https://images.example.com/article.jpg');
```

Add a second assertion using `imageUrl: 'http://unsafe.example/image.jpg'` and require the configured fallback for that category.

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- tests/services/politics-rss.adapter.test.ts tests/services/gold-politics-message.service.test.ts
```

Expected: FAIL because the adapter drops `imageUrl` and messages do not expose one.

- [ ] **Step 3: Add category fallbacks and propagate the image**

Create `src/config/gold-politics-images.ts`:

```ts
import type { PoliticsCategory } from '../types/gold-politics';

export const goldPoliticsFallbackImageUrls: Record<PoliticsCategory, string> = {
  'gold-market': 'https://placehold.co/1200x630/b45309/ffffff.png?text=Gold+Market',
  'vietnam-politics': 'https://placehold.co/1200x630/b91c1c/ffffff.png?text=Vietnam+Politics',
  'international-politics': 'https://placehold.co/1200x630/1d4ed8/ffffff.png?text=World+Politics',
  'leader-controversy': 'https://placehold.co/1200x630/7e22ce/ffffff.png?text=Leadership+Watch',
};
```

Add `imageUrl: article.imageUrl` in `mapRssArticle`. Add `imageUrl?: string` to `PoliticsMessage`. In `GoldPoliticsMessageService`, import `goldPoliticsFallbackImageUrls` and `getArticleMessageImageUrl`, then return:

```ts
imageUrl: getArticleMessageImageUrl(
  item,
  goldPoliticsFallbackImageUrls[item.primaryCategory],
),
```

- [ ] **Step 4: Verify GREEN and commit**

Run:

```bash
npm test -- tests/services/politics-rss.adapter.test.ts tests/services/gold-politics-message.service.test.ts
```

Expected: PASS.

```bash
git add src/config/gold-politics-images.ts src/services/politics-rss.adapter.ts src/types/gold-politics.ts src/services/gold-politics-message.service.ts tests/services/politics-rss.adapter.test.ts tests/services/gold-politics-message.service.test.ts
git commit -m "feat: attach images to politics messages"
```

### Task 3: Forward images to Telegram and verify the suite

**Files:**
- Modify: `src/services/gold-politics-delivery.service.ts:31-37`
- Test: `tests/services/gold-politics-delivery.service.test.ts`

- [ ] **Step 1: Write the failing delivery test**

Give each `news` fixture an `imageUrl`, then require calls shaped like:

```ts
['news one', 'https://one.example/story', 'https://images.example/one.jpg', '🔎 Xem nguồn gốc']
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/services/gold-politics-delivery.service.test.ts`

Expected: FAIL because delivery currently passes `undefined`.

- [ ] **Step 3: Forward the selected image**

Change the news delivery call to:

```ts
await this.telegram.sendDigest(
  message.text,
  message.url,
  message.imageUrl,
  '🔎 Xem nguồn gốc',
);
```

- [ ] **Step 4: Verify GREEN, then full verification**

Run:

```bash
npm test -- tests/services/gold-politics-delivery.service.test.ts
npm test
npm run lint
npm run build
git diff --check
```

Expected: all commands pass without errors or warnings introduced by this change.

- [ ] **Step 5: Commit**

```bash
git add src/services/gold-politics-delivery.service.ts tests/services/gold-politics-delivery.service.test.ts
git commit -m "fix: forward politics images to Telegram"
```
