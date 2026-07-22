# Emoji Telegram Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Làm mỗi Telegram article message bắt mắt hơn bằng bố cục emoji rõ ràng và đổi nút thành `🔎 Xem bài gốc`.

**Architecture:** Giữ nguyên data flow editorial và Telegram transport. Chỉ thay renderer HTML trong `DigestService` và label inline keyboard trong `TelegramService`; test khóa bố cục, thứ tự mục, escape HTML và mọi đường gửi ảnh/text.

**Tech Stack:** TypeScript, Vitest, Telegram HTML, Telegraf.

---

### Task 1: Render the emoji card layout

**Files:**
- Modify: `tests/services/digest.service.test.ts`
- Modify: `src/services/digest.service.ts`

- [ ] **Step 1: Update the renderer expectations before production code**

In the rich Security message test, assert:

```ts
expect(message.text).toContain('🔐  <b>SECURITY UPDATE</b>');
expect(message.text).toContain('📰  <b>Critical &lt;gateway&gt; vulnerability</b>');
expect(message.text).toContain('📅 <b>Công bố:</b> 14/07/2026');
expect(message.text).toContain('📝 <b>Tóm tắt</b>');
expect(message.text).toContain('🎯 <b>Vì sao đáng chú ý?</b>');
expect(message.text).toContain('⚡ <b>Mức hành động</b>');
expect(message.text).toContain('🟡 <b>THEO DÕI</b> —');
expect(message.text).toContain('🏢 <i>Nguồn: Security Source</i>');
```

Assert the indexes occur in this order: title, date, summary label, why label, action label, source.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/services/digest.service.test.ts`

Expected: FAIL because the old renderer has no `UPDATE`, summary label, section emojis or uppercase action label.

- [ ] **Step 3: Implement the new fixed renderer**

Change `renderArticleMessage` lines to:

```ts
`${topicIcon(topic)}  <b>${escapeHtml(`${topicLabel} UPDATE`)}</b>`,
'━━━━━━━━━━━━━━━━',
'',
`📰  <b>${escapeHtml(editorial.title)}</b>`,
'',
`📅 <b>Công bố:</b> ${formatArticleDate(article)}`,
'',
'📝 <b>Tóm tắt</b>',
escapeHtml(summary),
'',
'🎯 <b>Vì sao đáng chú ý?</b>',
escapeHtml(whyImportant),
'',
'⚡ <b>Mức hành động</b>',
`${action.icon} <b>${action.label}</b> — ${escapeHtml(actionText)}`,
'',
`🏢 <i>Nguồn: ${escapeHtml(article.sourceName)}</i>`,
```

Update `actionPresentation` labels to `KHẨN CẤP`, `CAO`, and `THEO DÕI`. Keep field limits, date fallback and HTML escaping unchanged.

- [ ] **Step 4: Run the digest tests and verify GREEN**

Run: `npm test -- tests/services/digest.service.test.ts`

Expected: all digest tests pass.

### Task 2: Rename the inline button and verify all send paths

**Files:**
- Modify: `tests/services/telegram.service.test.ts`
- Modify: `src/services/telegram.service.ts`
- Modify: `README.md`

- [ ] **Step 1: Change every inline keyboard expectation before production code**

Replace each expected button literal:

```ts
{ text: '🔗 Đọc chi tiết', url: 'https://example.com/a' }
```

with:

```ts
{ text: '🔎 Xem bài gốc', url: 'https://example.com/a' }
```

Keep coverage for plain text, photo caption, photo failure, download failure and overlong caption.

- [ ] **Step 2: Run the Telegram tests and verify RED**

Run: `npm test -- tests/services/telegram.service.test.ts`

Expected: FAIL because production still renders `🔗 Đọc chi tiết`.

- [ ] **Step 3: Implement the new button label**

In `TelegramService.sendChunk`, change only the label:

```ts
inline_keyboard: [[{ text: '🔎 Xem bài gốc', url }]],
```

- [ ] **Step 4: Update README example wording**

In `## Nội Dung Mỗi Tin Telegram`, replace the old button label with `Xem bài gốc` and mention the emoji section layout. No runtime behavior is changed in this step.

- [ ] **Step 5: Run complete verification**

Run: `npm test`

Expected: all Vitest tests pass.

Run: `npm run build`

Expected: TypeScript exits 0.

Run a local `DigestService` example and verify the visible order is topic update, title, publication date, summary, why important, action and source. Do not send a live Telegram message.

## Commit Notes

The workspace has no `.git` directory, so no commit or branch integration commands can run.
