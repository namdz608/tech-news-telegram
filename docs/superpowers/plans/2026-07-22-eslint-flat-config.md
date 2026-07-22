# ESLint 10 Flat Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Làm `npm run lint` hoạt động trên source và test TypeScript bằng ESLint 10 flat config recommended.

**Architecture:** Một `eslint.config.mjs` ở project root kết hợp recommended JavaScript và TypeScript configs, cùng global ignores cho output/tooling. Một integration test chạy ESLint bằng subprocess để chứng minh config được tìm thấy và parse được TypeScript.

**Tech Stack:** ESLint 10, `@eslint/js`, `typescript-eslint`, Vitest 4.

---

> Repo đang ở nhánh `master` chưa có commit đầu tiên. Không tạo commit nếu bố chưa yêu cầu khởi tạo lịch sử Git.

### Task 1: Test đỏ cho ESLint flat config

**Files:**
- Create: `tests/config/eslint-config.test.ts`

- [ ] **Step 1: Viết integration test**

```ts
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('ESLint config', () => {
  it('lints a TypeScript source file with the project flat config', () => {
    const result = spawnSync(
      process.execPath,
      ['./node_modules/eslint/bin/eslint.js', 'src/config/env.ts'],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận RED**

Run: `npx vitest run tests/config/eslint-config.test.ts`

Expected: FAIL với thông báo không tìm thấy `eslint.config.js|mjs|cjs`.

### Task 2: Thêm dependencies và flat config

**Files:**
- Create: `eslint.config.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Cài tooling chính thức**

Run: `npm install --save-dev @eslint/js typescript-eslint`

Expected: command exit 0; hai package xuất hiện trong `devDependencies` và lockfile được cập nhật.

- [ ] **Step 2: Tạo flat config**

```js
// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist/**', 'node_modules/**', '.codegraph/**', '.superpowers/**']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
  },
]);
```

- [ ] **Step 3: Chạy test để xác nhận GREEN**

Run: `npx vitest run tests/config/eslint-config.test.ts`

Expected: PASS.

### Task 3: Kiểm chứng lint toàn repo

**Files:**
- Verify: `src/**/*.ts`
- Verify: `tests/**/*.ts`

- [ ] **Step 1: Chạy lint**

Run: `npm run lint`

Expected: exit code 0. Nếu recommended rules phát hiện lỗi source có sẵn, dừng và báo chính xác rule/file trước khi mở rộng sửa code.

- [ ] **Step 2: Chạy full verification**

Run: `npm test && npm run build && npm run lint`

Expected: toàn bộ test pass; TypeScript build và ESLint đều exit code 0.

- [ ] **Step 3: Kiểm tra phạm vi**

Run: `git status --short`

Expected: có `eslint.config.mjs`, test config, package manifests, các file translation/config/docs từ kế hoạch trước; không có thay đổi ngoài phạm vi.
