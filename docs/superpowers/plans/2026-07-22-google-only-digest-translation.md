# Google-only Digest Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Luôn dịch digest bằng Google, tách lựa chọn editorial sang `EDITORIAL_PROVIDER`, và xóa các implementation dịch Codex/OpenAI/None.

**Architecture:** `TranslationService` giữ wrapper bảo vệ markup/fallback nhưng mặc định inject `GoogleTranslationService`. Editorial tiếp tục hỗ trợ bốn chế độ qua `EDITORIAL_PROVIDER`; runner Codex được tách khỏi implementation dịch bị xóa để editorial Codex không đổi hành vi.

**Tech Stack:** TypeScript 6, Express 5, Vitest 4, Zod 4, Axios.

---

> Repo đang ở nhánh `master` chưa có commit đầu tiên. Không tạo commit trong kế hoạch này nếu bố chưa yêu cầu khởi tạo lịch sử Git.

### Task 1: Tách cấu hình editorial khỏi digest translation

**Files:**
- Modify: `src/config/env.ts`
- Modify: `src/services/article-editorial.service.ts`
- Create: `tests/config/env.test.ts`

- [ ] **Step 1: Viết test đỏ cho schema editorial provider**

Tạo `tests/config/env.test.ts` dùng subprocess để module env được parse mới cho từng case:

```ts
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function readEditorialProvider(value?: string): string {
  const childEnv = { ...process.env };
  delete childEnv.EDITORIAL_PROVIDER;
  if (value) childEnv.EDITORIAL_PROVIDER = value;

  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--eval', "import { env } from './src/config/env.ts'; process.stdout.write(env.EDITORIAL_PROVIDER)"],
    { cwd: process.cwd(), env: childEnv, encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout;
}

describe('env config', () => {
  it('accepts the editorial provider independently', () => {
    expect(readEditorialProvider('codex')).toBe('codex');
  });

  it('defaults the editorial provider to google', () => {
    expect(readEditorialProvider()).toBe('google');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx vitest run tests/config/env.test.ts`

Expected: FAIL vì `EDITORIAL_PROVIDER` chưa có trong schema.

- [ ] **Step 3: Thay schema và consumer**

Trong `src/config/env.ts`, thay:

```ts
TRANSLATION_PROVIDER: z.enum(['openai', 'codex', 'google', 'none']).default('openai'),
```

bằng:

```ts
EDITORIAL_PROVIDER: z.enum(['openai', 'codex', 'google', 'none']).default('google'),
```

Xóa `CODEX_TRANSLATION_CHUNK_CHARS` và `CODEX_TRANSLATION_CONCURRENCY`. Trong `createDefaultGenerator()`, thay mọi `env.TRANSLATION_PROVIDER` bằng `env.EDITORIAL_PROVIDER`.

- [ ] **Step 4: Chạy test cấu hình và editorial**

Run: `npx vitest run tests/config/env.test.ts tests/services/article-editorial.service.test.ts`

Expected: PASS.

### Task 2: Làm Google thành translator mặc định duy nhất

**Files:**
- Modify: `src/services/translation.service.ts`
- Test: `tests/services/translation.service.test.ts`

- [ ] **Step 1: Viết test đỏ cho default translator factory**

Export factory nhỏ để test không gọi mạng:

```ts
import { createDefaultTranslator } from '../../src/services/translation.service';
import { GoogleTranslationService } from '../../src/services/google-translation.service';

it('uses Google as the only default digest translator', () => {
  expect(createDefaultTranslator()).toBeInstanceOf(GoogleTranslationService);
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx vitest run tests/services/translation.service.test.ts`

Expected: FAIL vì factory chưa export và còn phân nhánh bằng env.

- [ ] **Step 3: Thu gọn implementation**

`src/services/translation.service.ts` chỉ import Google và interface:

```ts
import { GoogleTranslationService } from './google-translation.service';
import type { DigestTranslator } from './translation.types';

export function createDefaultTranslator(): DigestTranslator {
  return new GoogleTranslationService();
}
```

Giữ nguyên constructor injection, `protectMarkup()`, `restoreMarkup()` và catch trả digest gốc.

- [ ] **Step 4: Chạy test translation wrapper**

Run: `npx vitest run tests/services/translation.service.test.ts tests/services/google-translation.service.test.ts`

Expected: PASS.

### Task 3: Tách Codex runner và xóa translator cũ

**Files:**
- Create: `src/services/codex-exec.runner.ts`
- Modify: `src/services/codex-article-editorial.generator.ts`
- Delete: `src/services/codex-translation.service.ts`
- Delete: `src/services/openai-translation.service.ts`
- Delete: `src/services/noop-translation.service.ts`
- Delete: `tests/services/codex-translation.service.test.ts`
- Delete: `tests/services/openai-translation.service.test.ts`
- Test: `tests/services/codex-article-editorial.generator.test.ts`

- [ ] **Step 1: Tạo file runner từ code hiện tại**

Chuyển nguyên `CodexRunner` và `CodexExecRunner` (imports `child_process`, `fs`, `os`, `path`) sang `src/services/codex-exec.runner.ts`. Không chuyển `CodexTranslationService`, hàm chia chunk hay concurrency mapper.

- [ ] **Step 2: Đổi import editorial Codex**

Trong `src/services/codex-article-editorial.generator.ts` dùng:

```ts
import { CodexExecRunner, type CodexRunner } from './codex-exec.runner';
```

- [ ] **Step 3: Chạy test editorial Codex trước khi xóa file cũ**

Run: `npx vitest run tests/services/codex-article-editorial.generator.test.ts`

Expected: PASS, chứng minh editorial dùng runner mới.

- [ ] **Step 4: Xóa implementation và test dịch cũ**

Xóa đúng năm file được liệt kê ở mục Files. Không xóa `openai-article-editorial.generator.ts`, `google-article-editorial.generator.ts` hoặc `codex-article-editorial.generator.ts`.

- [ ] **Step 5: Kiểm tra reference chết**

Run:

```bash
rg -n "CodexTranslationService|OpenAITranslationService|NoopTranslationService|codex-translation\.service|openai-translation\.service|noop-translation\.service" src tests
```

Expected: không có kết quả.

### Task 4: Migration env và tài liệu

**Files:**
- Modify: `.env`
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Cập nhật env không đụng secret**

Trong `.env` và `.env.example`, thay duy nhất:

```env
TRANSLATION_PROVIDER=google
```

bằng:

```env
EDITORIAL_PROVIDER=google
```

Xóa `CODEX_TRANSLATION_CHUNK_CHARS` và `CODEX_TRANSLATION_CONCURRENCY`; giữ `CODEX_TRANSLATION_TIMEOUT_MS`.

- [ ] **Step 2: Cập nhật README**

Mô tả rõ: digest luôn dùng Google Translate; `EDITORIAL_PROVIDER` chọn `codex | openai | google | none`; cập nhật block env tương ứng và xóa mô tả provider dịch cũ.

- [ ] **Step 3: Kiểm tra cấu hình cũ đã biến mất**

Run:

```bash
rg -n "TRANSLATION_PROVIDER|CODEX_TRANSLATION_CHUNK_CHARS|CODEX_TRANSLATION_CONCURRENCY" src tests README.md .env.example
```

Expected: không có kết quả.

### Task 5: Kiểm chứng toàn bộ

**Files:**
- Verify: toàn bộ repository

- [ ] **Step 1: Chạy test**

Run: `npm test`

Expected: toàn bộ test pass, 0 failures.

- [ ] **Step 2: Chạy build**

Run: `npm run build`

Expected: exit code 0, không có TypeScript error.

- [ ] **Step 3: Chạy lint**

Run: `npm run lint`

Expected: exit code 0, không có ESLint error.

- [ ] **Step 4: Kiểm tra phạm vi xóa**

Run: `git status --short`

Expected: chỉ các file translation/config/docs/test trong kế hoạch và các asset tài liệu đã có từ yêu cầu trước; không có thay đổi ngoài phạm vi.
