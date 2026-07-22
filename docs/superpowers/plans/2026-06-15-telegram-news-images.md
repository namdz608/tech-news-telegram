# Telegram News Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send each Telegram article message with an illustrative image, using source images when available and topic fallback images otherwise.

**Architecture:** Carry `imageUrl` through `Article` and `DigestMessage`. Crawlers populate source image URLs best-effort, `DigestService` chooses fallback topic images, and `TelegramService` sends photo messages with captions while falling back to text if Telegram rejects the image.

**Tech Stack:** TypeScript, Telegraf, Axios, Cheerio, rss-parser, Vitest.

---

## File Structure

- Modify `src/types/article.ts`: add optional `imageUrl`.
- Create `src/config/topic-images.ts`: stable HTTPS fallback image URL per topic.
- Modify `src/services/digest.service.ts`: add `DigestMessage.imageUrl` and attach article/fallback image.
- Modify `src/services/telegram.service.ts`: support `sendPhoto` for messages with images and fallback to `sendMessage`.
- Modify `src/crawlers/rss.crawler.ts`: extract enclosure/media/content image URLs.
- Modify `src/crawlers/html.crawler.ts`: support optional source selector `image`.
- Modify `src/types/source.ts`: add optional HTML image selector.
- Modify `src/config/sources.ts`: configure The Hacker News image selector.
- Modify `src/crawlers/github-repos.crawler.ts`: map `owner.avatar_url` to `Article.imageUrl`.
- Update tests under `tests/services` and `tests/crawlers`.
- Update `.env.example` and `README.md` only if docs need a short behavior note. No new env variable is required.

---

### Task 1: Add Image URL To Digest Messages With Topic Fallback

**Files:**
- Modify: `src/types/article.ts`
- Create: `src/config/topic-images.ts`
- Modify: `src/services/digest.service.ts`
- Modify: `tests/services/digest.service.test.ts`

- [ ] **Step 1: Write failing DigestService tests**

Append these tests inside `describe('DigestService', () => { ... })` in `tests/services/digest.service.test.ts`:

```ts
  it('uses the article image url when building telegram messages', () => {
    const messages = new DigestService(10).buildDigestMessages([
      {
        id: 'https://example.com/ai',
        sourceId: 'hn',
        sourceName: 'Hacker News',
        title: 'New AI model released',
        url: 'https://example.com/ai',
        imageUrl: 'https://example.com/article-image.png',
        collectedAt: '2026-06-09T00:00:00.000Z',
        topics: ['ai'],
      },
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0].imageUrl).toBe('https://example.com/article-image.png');
  });

  it('uses a topic fallback image when an article has no image', () => {
    const messages = new DigestService(10).buildDigestMessages([
      {
        id: 'https://example.com/security',
        sourceId: 'google-security-blog',
        sourceName: 'Google Security Blog',
        title: 'Security vulnerability update',
        url: 'https://example.com/security',
        collectedAt: '2026-06-09T00:00:00.000Z',
        topics: ['security'],
      },
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0].imageUrl).toBe('https://placehold.co/1200x630/991b1b/ffffff.png?text=Security');
  });
```

- [ ] **Step 2: Run DigestService tests to verify failure**

Run:

```bash
npx vitest run tests/services/digest.service.test.ts
```

Expected: FAIL because `Article.imageUrl` and `DigestMessage.imageUrl` do not exist yet.

- [ ] **Step 3: Add optional image field to Article**

In `src/types/article.ts`, add `imageUrl?: string;` after `summary?: string;`:

```ts
export interface Article {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  summary?: string;
  imageUrl?: string;
  author?: string;
  publishedAt?: string;
  collectedAt: string;
  topics: TopicKey[];
}
```

- [ ] **Step 4: Add topic fallback image config**

Create `src/config/topic-images.ts`:

```ts
import type { TopicKey } from '../types/topic';

export const topicImageUrls: Record<TopicKey, string> = {
  ai: 'https://placehold.co/1200x630/312e81/ffffff.png?text=AI',
  k8s: 'https://placehold.co/1200x630/075985/ffffff.png?text=Kubernetes',
  security: 'https://placehold.co/1200x630/991b1b/ffffff.png?text=Security',
  devops: 'https://placehold.co/1200x630/166534/ffffff.png?text=DevOps',
  cloud: 'https://placehold.co/1200x630/0369a1/ffffff.png?text=Cloud',
};
```

- [ ] **Step 5: Carry image URL through DigestService**

In `src/services/digest.service.ts`, import topic images:

```ts
import { topicImageUrls } from '../config/topic-images';
```

Change `DigestMessage`:

```ts
export interface DigestMessage {
  text: string;
  url: string;
  imageUrl?: string;
}
```

In `buildDigestMessages`, change the `messages.push` block to:

```ts
        messages.push({
          text: renderArticleMessage(entry.article, topic.key),
          url: entry.article.url,
          imageUrl: getMessageImageUrl(entry.article, topic.key),
        });
```

Add this helper near `renderArticleMessage`:

```ts
function getMessageImageUrl(article: Article, topic: TopicKey): string | undefined {
  return normalizeImageUrl(article.imageUrl) ?? topicImageUrls[topic];
}

function normalizeImageUrl(imageUrl?: string): string | undefined {
  const trimmed = imageUrl?.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 6: Run DigestService tests to verify pass**

Run:

```bash
npx vitest run tests/services/digest.service.test.ts
```

Expected: PASS.

---

### Task 2: Send Telegram Photos With Text Fallback

**Files:**
- Modify: `src/services/telegram.service.ts`
- Modify: `tests/services/telegram.service.test.ts`

- [ ] **Step 1: Write failing TelegramService tests**

Add these tests inside `describe('TelegramService', () => { ... })` in `tests/services/telegram.service.test.ts`:

```ts
  it('sends a photo with caption when an image url is provided', async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    const sendPhoto = vi.fn().mockResolvedValue({});
    const service = new TelegramService(
      {
        telegram: {
          sendMessage,
          sendPhoto,
        },
      },
      'chat-id',
      3900,
      '',
    );

    await service.sendMessages([
      {
        text: 'hello',
        url: 'https://example.com/a',
        imageUrl: 'https://example.com/image.png',
      },
    ]);

    expect(sendPhoto).toHaveBeenCalledWith('chat-id', 'https://example.com/image.png', {
      caption: 'hello',
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '🔗 Đọc chi tiết', url: 'https://example.com/a' }]],
      },
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('falls back to text when sending a photo fails', async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    const sendPhoto = vi.fn().mockRejectedValue(new Error('photo rejected'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = new TelegramService(
      {
        telegram: {
          sendMessage,
          sendPhoto,
        },
      },
      'chat-id',
      3900,
      '',
    );

    try {
      await service.sendMessages([
        {
          text: 'hello',
          url: 'https://example.com/a',
          imageUrl: 'https://example.com/image.png',
        },
      ]);
    } finally {
      warn.mockRestore();
    }

    expect(sendPhoto).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith('chat-id', 'hello', {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{ text: '🔗 Đọc chi tiết', url: 'https://example.com/a' }]],
      },
    });
  });
```

- [ ] **Step 2: Run TelegramService tests to verify failure**

Run:

```bash
npx vitest run tests/services/telegram.service.test.ts
```

Expected: FAIL because `sendPhoto` is not part of the test client type and `TelegramService` ignores `imageUrl`.

- [ ] **Step 3: Extend Telegram client type**

In `src/services/telegram.service.ts`, add photo option type:

```ts
interface SendPhotoOptions {
  caption?: string;
  parse_mode?: 'HTML' | 'MarkdownV2';
  message_effect_id?: string;
  reply_markup?: {
    inline_keyboard: InlineKeyboardButton[][];
  };
}
```

Update `TelegramClientLike`:

```ts
interface TelegramClientLike {
  telegram: {
    sendMessage(chatId: string, message: string, options: SendMessageOptions): Promise<unknown>;
    sendPhoto?(chatId: string, photo: string, options: SendPhotoOptions): Promise<unknown>;
  };
}
```

- [ ] **Step 4: Add photo sending path**

Change `sendMessages` in `src/services/telegram.service.ts` to:

```ts
  async sendMessages(messages: DigestMessage[]): Promise<void> {
    for (const message of messages) {
      if (!message.text.trim()) {
        continue;
      }

      await this.sendDigest(message.text, message.url, message.imageUrl);
    }
  }
```

Change `sendDigest` signature and logic:

```ts
  async sendDigest(message: string, url?: string, imageUrl?: string): Promise<void> {
    const chunks = splitTelegramMessage(message, imageUrl ? Math.min(this.maxMessageLength, 1000) : this.maxMessageLength);

    for (let index = 0; index < chunks.length; index += 1) {
      const isLastChunk = index === chunks.length - 1;
      await this.sendChunk(chunks[index], isLastChunk ? url : undefined, isLastChunk ? imageUrl : undefined);
    }
  }
```

Change `sendChunk` signature and add photo branch before message-effect branch:

```ts
  private async sendChunk(chunk: string, url?: string, imageUrl?: string): Promise<void> {
    const baseOptions: SendMessageOptions = {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    };

    if (url) {
      baseOptions.reply_markup = {
        inline_keyboard: [[{ text: '🔗 Đọc chi tiết', url }]],
      };
    }

    if (imageUrl && this.bot.telegram.sendPhoto) {
      try {
        const { disable_web_page_preview: _disablePreview, ...photoOptions } = baseOptions;
        await this.bot.telegram.sendPhoto(this.chatId, imageUrl, {
          ...photoOptions,
          caption: chunk,
        });
        return;
      } catch (error) {
        console.warn(`Failed to send Telegram photo, falling back to text: ${formatErrorMessage(error)}`);
      }
    }
```

Keep the existing message-effect branch after this new block.

Add helper at the bottom:

```ts
function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'unknown error';
}
```

- [ ] **Step 5: Run TelegramService tests to verify pass**

Run:

```bash
npx vitest run tests/services/telegram.service.test.ts
```

Expected: PASS.

---

### Task 3: Extract Source Images From Crawlers

**Files:**
- Modify: `src/crawlers/rss.crawler.ts`
- Modify: `src/crawlers/html.crawler.ts`
- Modify: `src/types/source.ts`
- Modify: `src/config/sources.ts`
- Modify: `src/crawlers/github-repos.crawler.ts`
- Modify: `tests/crawlers/rss.crawler.test.ts`
- Modify: `tests/crawlers/html.crawler.test.ts`
- Modify: `tests/crawlers/github-repos.crawler.test.ts`

- [ ] **Step 1: Add failing RSS image extraction test**

In `tests/crawlers/rss.crawler.test.ts`, add an RSS item with an image and assert `imageUrl`.

Use this test:

```ts
  it('extracts an image url from RSS enclosures', async () => {
    const parser = {
      parseURL: async () => ({
        items: [
          {
            title: 'AI model launch',
            link: 'https://example.com/ai',
            contentSnippet: 'OpenAI model update',
            isoDate: '2026-06-09T00:00:00.000Z',
            enclosure: {
              url: 'https://example.com/image.png',
              type: 'image/png',
            },
          },
        ],
      }),
    };

    const articles = await new RssCrawler(parser).crawl({
      id: 'rss-one',
      name: 'RSS One',
      kind: 'rss',
      enabled: true,
      homepageUrl: 'https://example.com',
      feedUrl: 'https://example.com/feed.xml',
    });

    expect(articles[0].imageUrl).toBe('https://example.com/image.png');
  });
```

- [ ] **Step 2: Add failing HTML image extraction test**

In `tests/crawlers/html.crawler.test.ts`, add or update a source with `selectors.image: 'img'` and assert `imageUrl`.

Use this test:

```ts
  it('extracts an image url with the configured image selector', async () => {
    const http = {
      get: async () => ({
        data: `
          <article class="post">
            <a class="title" href="/ai">AI security update</a>
            <p class="summary">OpenAI security details</p>
            <img src="/image.png" />
          </article>
        `,
      }),
    };

    const articles = await new HtmlCrawler(http).crawl({
      id: 'html-one',
      name: 'HTML One',
      kind: 'html',
      enabled: true,
      homepageUrl: 'https://example.com',
      listUrl: 'https://example.com/news',
      selectors: {
        item: '.post',
        title: '.title',
        url: '.title',
        summary: '.summary',
        image: 'img',
      },
    });

    expect(articles[0].imageUrl).toBe('https://example.com/image.png');
  });
```

- [ ] **Step 3: Update GitHub crawler test**

In `tests/crawlers/github-repos.crawler.test.ts`, add `avatar_url` to the owner of the primary repo:

```ts
owner: {
  login: 'example',
  avatar_url: 'https://avatars.githubusercontent.com/u/123?v=4',
},
```

Add to the first article expectation:

```ts
imageUrl: 'https://avatars.githubusercontent.com/u/123?v=4',
```

- [ ] **Step 4: Run crawler tests to verify failure**

Run:

```bash
npx vitest run tests/crawlers/rss.crawler.test.ts tests/crawlers/html.crawler.test.ts tests/crawlers/github-repos.crawler.test.ts
```

Expected: FAIL because crawler implementations do not map images yet.

- [ ] **Step 5: Implement RSS image extraction**

In `src/crawlers/rss.crawler.ts`, extend `RssItemLike`:

```ts
  enclosure?: {
    url?: string;
    type?: string;
  };
  mediaContent?: {
    $?: {
      url?: string;
      medium?: string;
      type?: string;
    };
  }[];
```

Add `imageUrl: extractImageUrl(item),` to the returned article.

Add helpers:

```ts
function extractImageUrl(item: RssItemLike): string | undefined {
  const candidates = [
    item.enclosure?.type?.startsWith('image/') ? item.enclosure.url : undefined,
    ...(item.mediaContent ?? []).map((media) =>
      media.$?.medium === 'image' || media.$?.type?.startsWith('image/') ? media.$.url : undefined,
    ),
    extractFirstImageFromHtml(item.content),
  ];

  return candidates.map(normalizeImageUrl).find(Boolean);
}

function extractFirstImageFromHtml(html?: string): string | undefined {
  if (!html) {
    return undefined;
  }

  return html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
}

function normalizeImageUrl(imageUrl?: string): string | undefined {
  const trimmed = imageUrl?.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 6: Implement HTML image selector**

In `src/types/source.ts`, add `image?: string;` to `HtmlSourceSelectors`:

```ts
export interface HtmlSourceSelectors {
  item: string;
  title: string;
  url: string;
  summary?: string;
  publishedAt?: string;
  image?: string;
}
```

In `src/crawlers/html.crawler.ts`, before pushing the article, compute image:

```ts
      const imageUrl = source.selectors.image
        ? normalizeImageUrl(item.find(source.selectors.image).first().attr('src'), source.homepageUrl)
        : undefined;
```

Add `imageUrl,` to the pushed article.

Add helper:

```ts
function normalizeImageUrl(imageUrl: string | undefined, baseUrl: string): string | undefined {
  const trimmed = imageUrl?.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(trimmed, baseUrl);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
```

In `src/config/sources.ts`, add the image selector for The Hacker News:

```ts
      image: 'img',
```

- [ ] **Step 7: Implement GitHub avatar mapping**

In `src/crawlers/github-repos.crawler.ts`, extend owner:

```ts
  owner?: {
    login?: string;
    avatar_url?: string;
  };
```

Add `imageUrl: normalizeImageUrl(repo.owner?.avatar_url),` to the article.

Add helper:

```ts
function normalizeImageUrl(imageUrl?: string): string | undefined {
  const trimmed = imageUrl?.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 8: Run crawler tests to verify pass**

Run:

```bash
npx vitest run tests/crawlers/rss.crawler.test.ts tests/crawlers/html.crawler.test.ts tests/crawlers/github-repos.crawler.test.ts
```

Expected: PASS.

---

### Task 4: Document Image Behavior

**Files:**
- Modify: `README.md`
- Test: `rg -n "ảnh|image|sendPhoto|GITHUB_TOKEN=.*[A-Za-z0-9_]{20,}" README.md docs src tests`

- [ ] **Step 1: Update README Telegram behavior**

Add this paragraph after the GitHub AI Repos section:

```md
## Ảnh Minh Họa Telegram

Mỗi tin Telegram dạng từng bài sẽ cố gửi kèm ảnh minh họa. App ưu tiên ảnh lấy từ nguồn tin, ví dụ ảnh trong RSS/HTML hoặc avatar owner của repo GitHub. Nếu bài không có ảnh, app dùng ảnh fallback theo topic như AI, Kubernetes, Security, DevOps hoặc Cloud. Nếu Telegram không tải được ảnh, app tự gửi lại tin dạng text để không mất bản tin.
```

- [ ] **Step 2: Run documentation scan**

Run:

```bash
rg -n "GITHUB_TOKEN=.*[A-Za-z0-9_]{20,}|g[h]p_|github[_]pat_" README.md docs src tests
```

Expected: no real token matches.

---

### Task 5: Full Verification And Smoke Check

**Files:**
- All changed files

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npx vitest run tests/services/digest.service.test.ts tests/services/telegram.service.test.ts tests/crawlers/rss.crawler.test.ts tests/crawlers/html.crawler.test.ts tests/crawlers/github-repos.crawler.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Run local digest image smoke test without sending Telegram**

Run:

```bash
npx tsx -e "import { SourceService } from './src/services/source.service'; import { DigestService } from './src/services/digest.service'; const sourceService = new SourceService(); const digestService = new DigestService(); sourceService.collectLatest().then((articles) => { const messages = digestService.buildDigestMessages(articles); console.log(JSON.stringify({ articleCount: articles.length, messageCount: messages.length, messagesWithImages: messages.filter((message) => Boolean(message.imageUrl)).length, firstImageUrl: messages[0]?.imageUrl ?? null }, null, 2)); process.exit(0); }).catch((error) => { console.log(JSON.stringify({ message: error.message }, null, 2)); process.exit(1); });"
```

Expected: `messagesWithImages` equals `messageCount` when there are messages.

- [ ] **Step 5: Run secret scan**

Run:

```bash
rg -n "GITHUB_TOKEN=.*[A-Za-z0-9_]{20,}|g[h]p_|github[_]pat_" . README.md docs src tests
```

Expected: no real token matches.

- [ ] **Step 6: Check workspace state**

Run:

```bash
git status --short 2>/dev/null || true
```

Expected in this workspace: no git status output because `/root/tech-news-telegram` is not a git repository.

---

## Self-Review

- Spec coverage: data model, source image extraction, topic fallback images, Telegram `sendPhoto`, text fallback, docs, tests, and verification are covered.
- Placeholder scan: no unresolved implementation notes remain.
- Type consistency: plan consistently uses `imageUrl` on `Article` and `DigestMessage`, optional `sendPhoto`, and `topicImageUrls`.
