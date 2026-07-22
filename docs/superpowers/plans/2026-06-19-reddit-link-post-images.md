# Reddit Link Post Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use an external article's Open Graph image for Reddit RSS link posts when Reddit does not provide a direct image.

**Architecture:** Keep `Article.url` pointing at the Reddit post. Extend `RssCrawler` so Reddit RSS items can supply an alternate image lookup URL parsed from item `content`; only the image enrichment fetch follows that external URL. Existing source image extraction, topic fallback images, and Telegram sending remain unchanged.

**Tech Stack:** TypeScript, Vitest, Cheerio, existing `RssCrawler` HTTP abstraction.

---

## File Structure

- Modify: `tests/crawlers/rss.crawler.test.ts`
  - Adds three focused crawler tests for Reddit external image enrichment and non-Reddit behavior.
- Modify: `src/crawlers/rss.crawler.ts`
  - Adds item-aware image enrichment, Reddit external link extraction, and Reddit hostname filtering.

---

### Task 1: Add Failing RSS Crawler Tests

**Files:**
- Test: `tests/crawlers/rss.crawler.test.ts`

- [ ] **Step 1: Write the failing tests**

Append these tests inside the existing `describe('RssCrawler', () => { ... })` block, after the current Open Graph image test:

```typescript
  it('uses an external article Open Graph image for Reddit link posts without direct images', async () => {
    const requestedUrls: string[] = [];
    const parser = {
      parseURL: async () => ({
        items: [
          {
            title: 'Exclusive: AI scholar Dean Ball says he is heading to OpenAI',
            link: 'https://www.reddit.com/r/OpenAI/comments/1u9a5zr/exclusive_ai_scholar_dean_ball_says_hes_heading/',
            contentSnippet: 'OpenAI policy update',
            content: `
              <table>
                <tr>
                  <td>
                    <span><a href="https://www.axios.com/2026/06/18/dean-ball-openai">[link]</a></span>
                    <span><a href="https://www.reddit.com/r/OpenAI/comments/1u9a5zr/exclusive_ai_scholar_dean_ball_says_hes_heading/">[comments]</a></span>
                  </td>
                </tr>
              </table>
            `,
            isoDate: '2026-06-19T00:00:00.000Z',
          },
        ],
      }),
    };
    const http = {
      get: async (url: string) => {
        requestedUrls.push(url);
        return {
          data: `
            <html>
              <head>
                <meta property="og:image" content="https://static.axios.com/openai-dean-ball.jpg" />
              </head>
            </html>
          `,
        };
      },
    };

    const articles = await new RssCrawler(parser, http).crawl({
      id: 'reddit-openai',
      name: 'Reddit r/OpenAI',
      kind: 'rss',
      enabled: true,
      homepageUrl: 'https://www.reddit.com/r/OpenAI',
      feedUrl: 'https://www.reddit.com/r/OpenAI/.rss?limit=10',
      defaultTopics: ['ai'],
    });

    expect(requestedUrls).toEqual(['https://www.axios.com/2026/06/18/dean-ball-openai']);
    expect(articles[0]).toMatchObject({
      url: 'https://www.reddit.com/r/OpenAI/comments/1u9a5zr/exclusive_ai_scholar_dean_ball_says_hes_heading/',
      imageUrl: 'https://static.axios.com/openai-dean-ball.jpg',
    });
  });

  it('does not fetch an external Reddit link-post article when the RSS item already has an image', async () => {
    const parser = {
      parseURL: async () => ({
        items: [
          {
            title: 'GPT 4.5 benchmark image',
            link: 'https://www.reddit.com/r/OpenAI/comments/1u9uaxb/gpt_45_in_minebench_refused_to_generate_the_given/',
            contentSnippet: 'OpenAI benchmark screenshot',
            content: `
              <table>
                <tr>
                  <td>
                    <img src="https://preview.redd.it/2quws2u6o68h1.gif?width=640" />
                    <span><a href="https://i.redd.it/2quws2u6o68h1.gif">[link]</a></span>
                    <span><a href="https://www.reddit.com/r/OpenAI/comments/1u9uaxb/gpt_45_in_minebench_refused_to_generate_the_given/">[comments]</a></span>
                  </td>
                </tr>
              </table>
            `,
            isoDate: '2026-06-19T00:00:00.000Z',
          },
        ],
      }),
    };
    const http = {
      get: async () => {
        throw new Error('external article should not be fetched');
      },
    };

    const articles = await new RssCrawler(parser, http).crawl({
      id: 'reddit-openai',
      name: 'Reddit r/OpenAI',
      kind: 'rss',
      enabled: true,
      homepageUrl: 'https://www.reddit.com/r/OpenAI',
      feedUrl: 'https://www.reddit.com/r/OpenAI/.rss?limit=10',
      defaultTopics: ['ai'],
    });

    expect(articles[0].imageUrl).toBe('https://preview.redd.it/2quws2u6o68h1.gif?width=640');
  });

  it('does not use Reddit-specific external link parsing for non-Reddit RSS sources', async () => {
    const requestedUrls: string[] = [];
    const parser = {
      parseURL: async () => ({
        items: [
          {
            title: 'OpenAI releases a Kubernetes security tool',
            link: 'https://example.com/post',
            contentSnippet: 'AI and k8s security update',
            content: '<p><a href="https://external.example.com/article">[link]</a></p>',
            isoDate: '2026-06-19T00:00:00.000Z',
          },
        ],
      }),
    };
    const http = {
      get: async (url: string) => {
        requestedUrls.push(url);
        return {
          data: `
            <html>
              <head>
                <meta property="og:image" content="https://example.com/source-page.jpg" />
              </head>
            </html>
          `,
        };
      },
    };

    const articles = await new RssCrawler(parser, http).crawl({
      id: 'hn-rss',
      name: 'Hacker News',
      kind: 'rss',
      enabled: true,
      homepageUrl: 'https://news.ycombinator.com',
      feedUrl: 'https://hnrss.org/frontpage',
    });

    expect(requestedUrls).toEqual(['https://example.com/post']);
    expect(articles[0].imageUrl).toBe('https://example.com/source-page.jpg');
  });
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
npm test -- tests/crawlers/rss.crawler.test.ts
```

Expected: the first new test fails because `requestedUrls` contains the Reddit post URL instead of the Axios URL. The other tests may pass or fail depending on current behavior, but at least the external Reddit image behavior must be red.

---

### Task 2: Implement Reddit External Image Lookup

**Files:**
- Modify: `src/crawlers/rss.crawler.ts`

- [ ] **Step 1: Update article mapping to keep RSS item context for enrichment**

Replace the current `const articles = feed.items ... return Promise.all(articles.map(...))` block in `crawl()` with:

```typescript
    const articles = feed.items
      .filter((item) => item.title && item.link)
      .map((item) => {
        const title = compactText(item.title ?? '');
        const summary = compactText(item.contentSnippet ?? item.content ?? '');
        const url = normalizeUrl(item.link ?? '');
        const topics = [...new Set([...(source.defaultTopics ?? []), ...matchTopics({ title, summary })])];

        return {
          article: {
            id: url,
            sourceId: source.id,
            sourceName: source.name,
            title,
            url,
            summary,
            imageUrl: extractImageUrl(item),
            author: item.creator,
            publishedAt: item.isoDate,
            collectedAt: new Date().toISOString(),
            topics,
          },
          item,
        };
      })
      .filter(({ article }) => article.topics.length > 0);

    return Promise.all(articles.map(({ article, item }) => this.withArticlePageImage(article, item)));
```

- [ ] **Step 2: Change image enrichment to accept the RSS item**

Replace `withArticlePageImage` with:

```typescript
  private async withArticlePageImage(article: Article, item: RssItemLike): Promise<Article> {
    if (article.imageUrl) {
      return article;
    }

    const imageLookupUrl = getImageLookupUrl(article, item);
    const imageUrl = await this.fetchArticleImageUrl(imageLookupUrl);

    return imageUrl ? { ...article, imageUrl } : article;
  }
```

- [ ] **Step 3: Add Reddit external URL helpers**

Add these helper functions near the bottom of `src/crawlers/rss.crawler.ts`, before `normalizeImageUrl`:

```typescript
function getImageLookupUrl(article: Article, item: RssItemLike): string {
  if (!article.sourceId.startsWith('reddit-')) {
    return article.url;
  }

  return extractExternalRedditLink(item.content) ?? article.url;
}

function extractExternalRedditLink(html?: string): string | undefined {
  if (!html) {
    return undefined;
  }

  const $ = cheerio.load(html);
  const candidates: string[] = [];

  $('a[href]').each((_index, element) => {
    const href = $(element).attr('href');

    if (href) {
      candidates.push(href);
    }
  });

  return candidates.map(normalizeExternalRedditLink).find(Boolean);
}

function normalizeExternalRedditLink(href: string): string | undefined {
  try {
    const url = new URL(href.trim());

    if (url.protocol !== 'https:') {
      return undefined;
    }

    if (isRedditHostname(url.hostname)) {
      return undefined;
    }

    return url.toString();
  } catch {
    return undefined;
  }
}

function isRedditHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^www\./, '');
  return normalized === 'reddit.com' || normalized === 'old.reddit.com' || normalized === 'new.reddit.com' || normalized === 'redd.it' || normalized === 'i.redd.it';
}
```

- [ ] **Step 4: Run the crawler tests to verify GREEN**

Run:

```bash
npm test -- tests/crawlers/rss.crawler.test.ts
```

Expected: all `RssCrawler` tests pass.

---

### Task 3: Full Verification

**Files:**
- Verify: `src/crawlers/rss.crawler.ts`
- Verify: `tests/crawlers/rss.crawler.test.ts`

- [ ] **Step 1: Run the full test suite**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Run the TypeScript build**

Run:

```bash
npm run build
```

Expected: TypeScript compiles without errors.

- [ ] **Step 3: Check git availability**

Run:

```bash
git status --short
```

Expected in this workspace: `fatal: not a git repository (or any of the parent directories): .git`. Do not attempt a commit unless the workspace is later initialized as a git repository.

---

## Self-Review

- Spec coverage: The plan keeps Telegram detail links on Reddit, only follows external links for Reddit image enrichment, preserves existing image-first behavior, and leaves Cloudflare failures as best-effort fallback.
- Placeholder scan: No placeholders remain.
- Type consistency: The plan keeps `RssItemLike`, `Article`, and existing helper names consistent with `src/crawlers/rss.crawler.ts`.
