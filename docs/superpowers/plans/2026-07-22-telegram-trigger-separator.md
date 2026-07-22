# Telegram Trigger Separator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gửi đúng một tin `━━━━━━━━━━━━━━━━━━━━━━━━━━━━` trước mỗi batch Telegram có ít nhất một bài hợp lệ.

**Architecture:** `TelegramService.sendMessages()` lọc message rỗng, gửi separator bằng Telegram `sendMessage`, sau đó gọi `sendDigest()` tuần tự cho từng bài. Controller và các API khác không thay đổi.

**Tech Stack:** TypeScript, Telegraf, Vitest.

---

> Repo đang ở nhánh `master` chưa có commit đầu tiên. Không tạo commit nếu bố chưa yêu cầu khởi tạo lịch sử Git.

### Task 1: Test đỏ cho separator theo batch

**Files:**
- Modify: `tests/services/telegram.service.test.ts`

- [ ] **Step 1: Thêm test thứ tự và số lần separator**

```ts
it('sends one separator before each non-empty message batch', async () => {
  const sendMessage = vi.fn().mockResolvedValue({});
  const service = new TelegramService(
    { telegram: { sendMessage } },
    'chat-id',
    3900,
    '',
  );
  const messages = [
    { text: 'first', url: 'https://example.com/1', article, topic: 'ai' as const },
    { text: 'second', url: 'https://example.com/2', article, topic: 'ai' as const },
  ];

  await service.sendMessages(messages);

  expect(sendMessage).toHaveBeenCalledTimes(3);
  expect(sendMessage.mock.calls.map((call) => call[1])).toEqual([
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'first',
    'second',
  ]);
});
```

- [ ] **Step 2: Thêm test batch rỗng**

```ts
it('does not send a separator for an empty message batch', async () => {
  const sendMessage = vi.fn().mockResolvedValue({});
  const service = new TelegramService(
    { telegram: { sendMessage } },
    'chat-id',
    3900,
    '',
  );

  await service.sendMessages([]);
  await service.sendMessages([
    { text: '   ', url: 'https://example.com/a', article, topic: 'ai' },
  ]);

  expect(sendMessage).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Chạy test để xác nhận RED**

Run: `npx vitest run tests/services/telegram.service.test.ts`

Expected: test separator FAIL vì hiện tại chỉ gửi hai bài; test batch rỗng PASS.

### Task 2: Triển khai separator một lần

**Files:**
- Modify: `src/services/telegram.service.ts`
- Modify: `tests/services/telegram.service.test.ts`

- [ ] **Step 1: Thêm hằng và lọc batch**

Thêm gần đầu file:

```ts
const triggerSeparator = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
```

Thay `sendMessages()` bằng:

```ts
async sendMessages(messages: DigestMessage[]): Promise<void> {
  const validMessages = messages.filter((message) => message.text.trim());

  if (validMessages.length === 0) {
    return;
  }

  await this.bot.telegram.sendMessage(this.chatId, triggerSeparator, {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });

  for (const message of validMessages) {
    await this.sendDigest(message.text, message.url, message.imageUrl);
  }
}
```

- [ ] **Step 2: Cập nhật assertion của test cũ**

Các test gọi `sendMessages()` phải tính thêm lần gọi separator. Với test ảnh thành công, thay `expect(sendMessage).not.toHaveBeenCalled()` bằng assertion separator. Với fallback text, xác nhận separator là call đầu và bài text là call sau. Test `sendDigest()` trực tiếp không đổi.

- [ ] **Step 3: Chạy test Telegram để xác nhận GREEN**

Run: `npx vitest run tests/services/telegram.service.test.ts`

Expected: toàn bộ test trong file PASS.

### Task 3: Full verification cùng cleanup translation/ESLint

**Files:**
- Verify: toàn bộ repository

- [ ] **Step 1: Chạy test và build**

Run: `npm test && npm run build`

Expected: toàn bộ test pass và TypeScript build exit 0.

- [ ] **Step 2: Chạy lint**

Run: `npm run lint`

Expected: flat config được load; ba lỗi lint đã biết phải được xử lý trong checkpoint riêng đã được bố cho phép trước khi có thể exit 0.

- [ ] **Step 3: Kiểm tra phạm vi**

Run: `git status --short`

Expected: các file translation/config/ESLint/Telegram/docs trong các kế hoạch đã duyệt; không có thay đổi ngoài phạm vi.
