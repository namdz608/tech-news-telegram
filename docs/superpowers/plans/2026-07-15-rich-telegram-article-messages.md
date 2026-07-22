# Rich Telegram Article Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gửi mỗi bài thành một Telegram message riêng, luôn có ngày công bố, tóm tắt, lý do quan trọng, mức hành động, nguồn và nút đọc bài.

**Architecture:** Giữ `DigestService` phụ trách chọn bài và render HTML, nhưng gắn `Article` cùng topic vào từng `DigestMessage`. Một `ArticleEditorialService` mới gọi generator Codex/OpenAI để nhận JSON có cấu trúc, kiểm tra kết quả và dùng fallback xác định; `editDigestMessages` giữ thứ tự bài rồi render caption cuối cùng. Google/none và mọi lỗi provider đi thẳng vào fallback đầy đủ.

**Tech Stack:** TypeScript 6, Node.js, Vitest, OpenAI Responses API, Codex CLI, Telegram HTML.

---

## File Structure

- Create `src/services/article-editorial.types.ts`: schema nội bộ và interface generator.
- Create `src/services/article-editorial.service.ts`: prompt input, parse/validate JSON, fallback theo topic và chọn provider.
- Create `src/services/codex-article-editorial.generator.ts`: adapter Codex CLI.
- Create `src/services/openai-article-editorial.generator.ts`: adapter OpenAI Responses API.
- Modify `src/services/digest.service.ts`: metadata message, renderer HTML đầy đủ và format ngày.
- Replace `src/services/digest-message-translation.service.ts` with `src/services/digest-message-editorial.service.ts`: orchestration bất đồng bộ giữ thứ tự.
- Modify `src/controllers/news.controller.ts`, `src/controllers/telegram.controller.ts`, `src/services/scheduler.service.ts`: dùng editorial flow cho message riêng.
- Create `tests/services/article-editorial.service.test.ts`: validation/fallback.
- Create `tests/services/codex-article-editorial.generator.test.ts` and `tests/services/openai-article-editorial.generator.test.ts`: contract provider.
- Modify `tests/services/digest.service.test.ts`: cấu trúc caption và ngày.
- Replace `tests/services/digest-message-translation.service.test.ts` with `tests/services/digest-message-editorial.service.test.ts`: thứ tự và render.
- Modify `README.md`: mô tả nội dung bắt buộc.

### Task 1: Define editorial schema and deterministic fallback

**Files:**
- Create: `src/services/article-editorial.types.ts`
- Create: `src/services/article-editorial.service.ts`
- Test: `tests/services/article-editorial.service.test.ts`

- [ ] **Step 1: Write failing tests for valid JSON, partial JSON, invalid JSON and provider failure**

```ts
import { describe, expect, it, vi } from 'vitest';
import { ArticleEditorialService } from '../../src/services/article-editorial.service';

const article = {
  id: 'https://example.com/cve',
  sourceId: 'security-source',
  sourceName: 'Security Source',
  title: 'Critical gateway vulnerability',
  url: 'https://example.com/cve',
  summary: 'A gateway vulnerability is being actively exploited.',
  publishedAt: '2026-07-14T09:00:00.000Z',
  collectedAt: '2026-07-15T09:00:00.000Z',
  topics: ['security' as const],
};

describe('ArticleEditorialService', () => {
  it('accepts a complete structured editorial response', async () => {
    const generator = { generate: vi.fn().mockResolvedValue(JSON.stringify({
      title: 'Lỗ hổng nghiêm trọng trên gateway',
      summary: 'Lỗ hổng đang bị khai thác thực tế.',
      whyImportant: 'Gateway thường được mở trực tiếp ra Internet.',
      actionLevel: 'urgent',
      actionText: 'Kiểm tra phơi nhiễm và vá ngay.',
    })) };

    await expect(new ArticleEditorialService(generator).editArticle(article, 'security')).resolves.toEqual({
      title: 'Lỗ hổng nghiêm trọng trên gateway',
      summary: 'Lỗ hổng đang bị khai thác thực tế.',
      whyImportant: 'Gateway thường được mở trực tiếp ra Internet.',
      actionLevel: 'urgent',
      actionText: 'Kiểm tra phơi nhiễm và vá ngay.',
    });
  });

  it.each(['not json', '{"summary":"","actionLevel":"critical"}'])('fills every field from fallback for %s', async (output) => {
    const service = new ArticleEditorialService({ generate: vi.fn().mockResolvedValue(output) });
    const result = await service.editArticle(article, 'security');

    expect(result.title).toBeTruthy();
    expect(result.summary).toBeTruthy();
    expect(result.whyImportant).toBeTruthy();
    expect(result.actionLevel).toBe('monitor');
    expect(result.actionText).toBeTruthy();
  });

  it('uses fallback when the generator fails', async () => {
    const service = new ArticleEditorialService({ generate: vi.fn().mockRejectedValue(new Error('timeout')) });
    await expect(service.editArticle(article, 'security')).resolves.toMatchObject({
      title: article.title,
      summary: article.summary,
      actionLevel: 'monitor',
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/services/article-editorial.service.test.ts`

Expected: FAIL because `article-editorial.service.ts` does not exist.

- [ ] **Step 3: Add the editorial types**

```ts
import type { TopicKey } from '../types/topic';

export type ActionLevel = 'urgent' | 'high' | 'monitor';

export interface ArticleEditorial {
  title: string;
  summary: string;
  whyImportant: string;
  actionLevel: ActionLevel;
  actionText: string;
}

export interface ArticleEditorialInput {
  title: string;
  summary?: string;
  sourceName: string;
  topic: TopicKey;
  publishedAt?: string;
  collectedAt: string;
}

export interface ArticleEditorialGenerator {
  generate(input: ArticleEditorialInput): Promise<string>;
}
```

- [ ] **Step 4: Implement parsing, validation and topic fallback**

Implement `ArticleEditorialService.editArticle(article, topic)` so it:

```ts
const fallback = createFallbackEditorial(article, topic);
if (!this.generator) return fallback;

try {
  const raw = await this.generator.generate({
    title: article.title,
    summary: article.summary,
    sourceName: article.sourceName,
    topic,
    publishedAt: article.publishedAt,
    collectedAt: article.collectedAt,
  });
  const parsed = parseJsonObject(raw);
  return {
    title: cleanString(parsed.title) || fallback.title,
    summary: cleanString(parsed.summary) || fallback.summary,
    whyImportant: cleanString(parsed.whyImportant) || fallback.whyImportant,
    actionLevel: isActionLevel(parsed.actionLevel) ? parsed.actionLevel : fallback.actionLevel,
    actionText: cleanString(parsed.actionText) || fallback.actionText,
  };
} catch (error) {
  console.warn('Article editorial generation failed, using fallback', error);
  return fallback;
}
```

`parseJsonObject` must strip an optional fenced block with `/^```(?:json)?\s*|\s*```$/g`, parse JSON, and reject arrays/null. `cleanString` must use `compactText`. `createFallbackEditorial` must export a complete editorial object, default to `monitor`, use the original summary or `Nguồn chưa cung cấp mô tả chi tiết cho bản tin này.`, and use a `Record<TopicKey, string>` for a concrete `whyImportant` sentence per topic.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `npm test -- tests/services/article-editorial.service.test.ts`

Expected: PASS.

### Task 2: Add Codex and OpenAI structured editorial generators

**Files:**
- Create: `src/services/codex-article-editorial.generator.ts`
- Create: `src/services/openai-article-editorial.generator.ts`
- Modify: `src/services/article-editorial.service.ts`
- Test: `tests/services/codex-article-editorial.generator.test.ts`
- Test: `tests/services/openai-article-editorial.generator.test.ts`

- [ ] **Step 1: Write failing provider contract tests**

Codex test:

```ts
it('requests JSON-only Vietnamese editorial content', async () => {
  const runner = { run: vi.fn().mockResolvedValue('{"title":"Tin"}') };
  const generator = new CodexArticleEditorialGenerator(runner, 12345);
  const result = await generator.generate(input);

  expect(result).toBe('{"title":"Tin"}');
  expect(runner.run).toHaveBeenCalledWith(
    expect.stringContaining('actionLevel'),
    JSON.stringify(input),
    12345,
  );
  expect(runner.run.mock.calls[0][0]).toContain('Không bịa');
});
```

OpenAI test:

```ts
it('requests JSON-only Vietnamese editorial content through Responses API', async () => {
  const create = vi.fn().mockResolvedValue({ output_text: '{"title":"Tin"}' });
  const generator = new OpenAIArticleEditorialGenerator({ responses: { create } }, 'test-model');

  await expect(generator.generate(input)).resolves.toBe('{"title":"Tin"}');
  expect(create).toHaveBeenCalledWith({
    model: 'test-model',
    instructions: expect.stringContaining('actionLevel'),
    input: JSON.stringify(input),
  });
});
```

Both files define `input` with title, summary, sourceName, topic, publishedAt and collectedAt.

- [ ] **Step 2: Run both tests and verify RED**

Run: `npm test -- tests/services/codex-article-editorial.generator.test.ts tests/services/openai-article-editorial.generator.test.ts`

Expected: FAIL because both generator modules are missing.

- [ ] **Step 3: Implement the shared editorial instructions and Codex adapter**

Export `articleEditorialInstructions` from `article-editorial.types.ts` with these requirements:

```ts
export const articleEditorialInstructions = [
  'Biên tập một tin công nghệ bằng tiếng Việt tự nhiên, súc tích.',
  'Chỉ trả về một JSON object với đúng các khóa: title, summary, whyImportant, actionLevel, actionText.',
  'actionLevel chỉ được là urgent, high hoặc monitor.',
  'Tóm tắt và nhận định chỉ được dựa trên dữ kiện đầu vào. Không bịa CVE, phiên bản, số liệu, tổ chức, trạng thái khai thác hoặc phạm vi ảnh hưởng.',
  'Nếu dữ kiện chưa đủ để kết luận mạnh, chọn monitor và đề xuất kiểm tra mức độ liên quan hoặc theo dõi nguồn chính thức.',
  'Không dùng Markdown và không thêm giải thích ngoài JSON.',
].join('\n');
```

`CodexArticleEditorialGenerator` reuses `CodexRunner` and `CodexExecRunner` from `codex-translation.service.ts`, sends the shared instructions, `JSON.stringify(input)`, the configured timeout, and returns the trimmed runner output.

- [ ] **Step 4: Implement the OpenAI adapter**

`OpenAIArticleEditorialGenerator` mirrors the existing `OpenAITranslationService` client abstraction, calls `responses.create` with `articleEditorialInstructions`, returns `output_text?.trim() ?? ''`, and uses `env.OPENAI_MODEL` by default.

- [ ] **Step 5: Wire the configured generator**

In `article-editorial.service.ts`, add `createDefaultGenerator()`:

```ts
if (env.TRANSLATION_PROVIDER === 'codex') return new CodexArticleEditorialGenerator();
if (env.TRANSLATION_PROVIDER === 'openai') return new OpenAIArticleEditorialGenerator();
return undefined;
```

The default constructor uses this function. Google and none therefore use deterministic fallback without a failing external call.

- [ ] **Step 6: Run provider and service tests and verify GREEN**

Run: `npm test -- tests/services/article-editorial.service.test.ts tests/services/codex-article-editorial.generator.test.ts tests/services/openai-article-editorial.generator.test.ts`

Expected: PASS.

### Task 3: Render the mandatory Telegram structure

**Files:**
- Modify: `src/services/digest.service.ts`
- Modify: `tests/services/digest.service.test.ts`

- [ ] **Step 1: Replace compact-message expectations with failing rich-message expectations**

Add a test that calls `buildDigestMessages` for a Security article and asserts:

```ts
expect(message.text).toContain('🔐 <b>SECURITY</b>');
expect(message.text).toContain('<b>Critical &lt;gateway&gt; vulnerability</b>');
expect(message.text).toContain('<b>Công bố:</b> 14/07/2026');
expect(message.text).toContain('A gateway vulnerability is being actively exploited.');
expect(message.text).toContain('<b>Vì sao quan trọng:</b>');
expect(message.text).toContain('<b>Mức hành động:</b> 🟡 <b>Theo dõi</b>');
expect(message.text).toContain('📰 <i>Nguồn: Security Source</i>');
expect(message.url).toBe(article.url);
expect(message.article).toEqual(article);
expect(message.topic).toBe('security');
```

Add two date cases: missing `publishedAt` uses `collectedAt`, and both invalid produce `Không rõ`.

- [ ] **Step 2: Run the digest test and verify RED**

Run: `npm test -- tests/services/digest.service.test.ts`

Expected: FAIL because the current message omits the mandatory fields and metadata.

- [ ] **Step 3: Extend `DigestMessage` and render fallbacks**

Change the interface to:

```ts
export interface DigestMessage {
  text: string;
  url: string;
  imageUrl?: string;
  article: Article;
  topic: TopicKey;
}
```

In `buildDigestMessages`, create `fallback = createFallbackEditorial(entry.article, topic.key)`, call the exported `renderArticleMessage(article, topic, fallback)`, and attach `article` plus `topic`.

Export `renderArticleMessage(article, topic, editorial)`. Use `escapeHtml` on every dynamic field and fixed limits of 360 characters for summary, 320 for `whyImportant`, and 240 for `actionText`. Map levels exactly:

```ts
const actionPresentation = {
  urgent: { icon: '🔴', label: 'Khẩn cấp' },
  high: { icon: '🟠', label: 'Cao' },
  monitor: { icon: '🟡', label: 'Theo dõi' },
} as const;
```

Render these lines in order:

```ts
`${topicIcon(topic)} <b>${escapeHtml(topicLabel)}</b>`,
'━━━━━━━━━━━━━━',
'',
`<b>${escapeHtml(editorial.title)}</b>`,
'',
`<b>Công bố:</b> ${formatArticleDate(article)}`,
escapeHtml(summary),
'',
`<b>Vì sao quan trọng:</b> ${escapeHtml(whyImportant)}`,
'',
`<b>Mức hành động:</b> ${action.icon} <b>${action.label}</b> — ${escapeHtml(actionText)}`,
'',
`📰 <i>Nguồn: ${escapeHtml(article.sourceName)}</i>`,
```

`formatArticleDate` tries `publishedAt`, then `collectedAt`, rejects invalid dates, and formats with `Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' })`.

- [ ] **Step 4: Update existing message/image tests for required metadata without changing selection semantics**

Keep all existing ranking, source diversity, image URL and empty-list expectations. Where a test constructs a literal `DigestMessage`, add the new metadata only if TypeScript requires it; do not weaken assertions.

- [ ] **Step 5: Run digest tests and verify GREEN**

Run: `npm test -- tests/services/digest.service.test.ts`

Expected: PASS.

### Task 4: Edit messages concurrently and wire all entry points

**Files:**
- Delete: `src/services/digest-message-translation.service.ts`
- Create: `src/services/digest-message-editorial.service.ts`
- Delete: `tests/services/digest-message-translation.service.test.ts`
- Create: `tests/services/digest-message-editorial.service.test.ts`
- Modify: `src/controllers/news.controller.ts`
- Modify: `src/controllers/telegram.controller.ts`
- Modify: `src/services/scheduler.service.ts`

- [ ] **Step 1: Write the failing orchestration test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { editDigestMessages } from '../../src/services/digest-message-editorial.service';

it('edits every message while preserving order, URL and image', async () => {
  const editor = {
    editArticle: vi.fn(async (article) => ({
      title: `VI ${article.title}`,
      summary: `Tóm tắt ${article.title}`,
      whyImportant: `Quan trọng ${article.title}`,
      actionLevel: 'high' as const,
      actionText: `Kiểm tra ${article.title}`,
    })),
  };

  const result = await editDigestMessages(messages, editor);

  expect(result.map((message) => message.article.id)).toEqual(['first', 'second']);
  expect(result[0].text).toContain('<b>VI First</b>');
  expect(result[0].text).toContain('<b>Mức hành động:</b> 🟠 <b>Cao</b>');
  expect(result[0].url).toBe(messages[0].url);
  expect(result[0].imageUrl).toBe(messages[0].imageUrl);
});
```

Construct `messages` through `new DigestService(10).buildDigestMessages(...)` so the test exercises real metadata and renderer boundaries.

- [ ] **Step 2: Run the orchestration test and verify RED**

Run: `npm test -- tests/services/digest-message-editorial.service.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement editorial orchestration**

```ts
import type { ArticleEditorial } from './article-editorial.types';
import type { DigestMessage } from './digest.service';
import { renderArticleMessage } from './digest.service';

interface ArticleEditor {
  editArticle(article: DigestMessage['article'], topic: DigestMessage['topic']): Promise<ArticleEditorial>;
}

export async function editDigestMessages(
  messages: DigestMessage[],
  editorialService: ArticleEditor,
): Promise<DigestMessage[]> {
  return Promise.all(messages.map(async (message) => ({
    ...message,
    text: renderArticleMessage(
      message.article,
      message.topic,
      await editorialService.editArticle(message.article, message.topic),
    ),
  })));
}
```

`Promise.all` is required so provider calls remain concurrent while array order remains stable.

- [ ] **Step 4: Replace message translation wiring**

At module scope in both controllers, instantiate `ArticleEditorialService`. In `SchedulerService`, replace the `TranslationService` constructor dependency used for messages with `ArticleEditorialService`. Replace every:

```ts
translateDigestMessages(messages, translationService)
```

with:

```ts
editDigestMessages(messages, articleEditorialService)
```

Keep `TranslationService` only in `news.controller.ts` for the legacy combined `digest` response. Rename local output variables from `translatedMessages` to `editedMessages` and keep response JSON keys `messages` and `messageCount` stable.

- [ ] **Step 5: Run orchestration, controller compile and scheduler-related tests**

Run: `npm test -- tests/services/digest-message-editorial.service.test.ts tests/routes/news.routes.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: TypeScript exits 0 with no stale import of `digest-message-translation.service`.

### Task 5: Preserve Telegram behavior and document the output

**Files:**
- Modify: `tests/services/telegram.service.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Add required `article` and `topic` metadata to Telegram test fixtures**

Define one shared fixture near the top of the test:

```ts
const article = {
  id: 'https://example.com/a',
  sourceId: 'example',
  sourceName: 'Example',
  title: 'Example article',
  url: 'https://example.com/a',
  collectedAt: '2026-07-15T00:00:00.000Z',
  topics: ['ai' as const],
};
```

Add `article, topic: 'ai'` to each literal passed to `sendMessages`. Assertions about photo upload, caption overflow, inline button and text fallback remain unchanged.

- [ ] **Step 2: Run Telegram tests**

Run: `npm test -- tests/services/telegram.service.test.ts`

Expected: PASS; caption over 1000 characters still sends the photo separately and preserves the complete text message.

- [ ] **Step 3: Document the mandatory message fields**

Add a `## Nội Dung Mỗi Tin Telegram` section after `## Ảnh Minh Họa Telegram`:

```md
## Nội Dung Mỗi Tin Telegram

Mỗi bài được gửi thành một tin riêng kèm ảnh và luôn có: chủ đề, tiêu đề, ngày công bố, tóm tắt, lý do quan trọng, mức hành động, tên nguồn và nút `Đọc chi tiết`. Codex/OpenAI biên tập phần nội dung dưới dạng dữ liệu có cấu trúc; code dựng HTML cố định. Nếu provider lỗi hoặc dữ liệu nguồn chưa đủ, app dùng nội dung fallback ở mức `🟡 Theo dõi` nên không bỏ trống mục nào và không tự gắn cảnh báo khẩn cấp.
```

- [ ] **Step 4: Run complete verification**

Run: `npm test`

Expected: all Vitest suites pass.

Run: `npm run build`

Expected: TypeScript exits 0.

Run: `rg "digest-message-translation|translateDigestMessages" src tests`

Expected: no matches.

- [ ] **Step 5: Review the generated example manually**

Run a focused test or temporary REPL call that prints one Security message and confirm it visibly contains, in order: topic, title, `Công bố`, summary, `Vì sao quan trọng`, `Mức hành động`, `Nguồn`; confirm `message.url` remains available for the inline button. Do not send a live Telegram message during verification.

## Commit Notes

The workspace currently has no `.git` directory, so commit steps cannot run. If Git metadata is restored later, commit after each green task using scoped messages such as `feat: add structured article editorial`, `feat: render rich telegram article messages`, and `docs: describe rich telegram messages`.
