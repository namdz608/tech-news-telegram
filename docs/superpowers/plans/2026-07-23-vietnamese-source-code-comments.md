# Vietnamese Source Code Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bổ sung comment tiếng Việt gần như từng dòng cho toàn bộ 41 file trong `src/`, mô tả luồng dữ liệu và liệt kê mọi call site hiện tại trong cả `src/` lẫn `tests/`.

**Architecture:** Chỉ chèn comment, tuyệt đối không xóa hoặc sửa dòng executable. Mỗi file có header mô tả vai trò trong luồng; mỗi type/class/hàm có JSDoc về contract và call sites; mỗi cụm 1–3 dòng có inline comment giải thích mục đích, nhánh lỗi và fallback.

**Tech Stack:** TypeScript, JSDoc tiếng Việt, CodeGraph, ESLint, Vitest, TypeScript compiler

---

## Hợp đồng comment áp dụng cho mọi task

- Header file nêu đầu vào, đầu ra, bước trước và bước sau trong luồng.
- JSDoc cho mọi type, interface, class, method và function, gồm tham số, kết quả, side effect và fallback.
- Mục `Được sử dụng tại:` ghi đường dẫn và symbol của mọi caller trong `src/` và `tests/`; helper nội bộ ghi rõ caller cùng file, entry point ghi rõ không có caller trực tiếp.
- Inline comment đứng trước gần như từng câu lệnh hoặc cụm tối đa ba dòng, giải thích lý do và biến đổi dữ liệu.
- Mỗi `if`, `switch`, vòng lặp, `try/catch`, early return và fallback có comment riêng.
- Chỉ thêm dòng comment hoặc dòng trống; không xóa, thay thế hay định dạng lại dòng code hiện có.

### Task 1: Entry point, app, routes, controllers và middleware

**Files:**
- Modify: `src/server.ts`
- Modify: `src/app.ts`
- Modify: `src/routes/index.ts`
- Modify: `src/routes/health.routes.ts`
- Modify: `src/routes/news.routes.ts`
- Modify: `src/routes/telegram.routes.ts`
- Modify: `src/controllers/health.controller.ts`
- Modify: `src/controllers/news.controller.ts`
- Modify: `src/controllers/telegram.controller.ts`
- Modify: `src/middlewares/request-log.middleware.ts`
- Modify: `src/middlewares/error.middleware.ts`

- [ ] Dùng CodeGraph đọc source/callers của toàn bộ symbol trong 11 file và ghi lại luồng `server → app → routes → controllers → services`.
- [ ] Chèn comment theo hợp đồng, bao gồm vòng đời request, response, middleware order và error propagation.
- [ ] Chạy `npm run build && npm run lint && npm test -- tests/routes` và yêu cầu exit code `0`.
- [ ] Chạy kiểm tra diff chỉ-addition; không được có dòng source bị xóa.
- [ ] Commit đúng 11 file với message `docs: explain application request flow`.

### Task 2: Config và domain types

**Files:**
- Modify: `src/config/env.ts`
- Modify: `src/config/sources.ts`
- Modify: `src/config/topic-images.ts`
- Modify: `src/config/topics.ts`
- Modify: `src/types/article.ts`
- Modify: `src/types/source.ts`
- Modify: `src/types/topic.ts`
- Modify: `src/services/article-editorial.types.ts`
- Modify: `src/services/translation.types.ts`

- [ ] Dùng CodeGraph lấy mọi reference tới env field, config collection, type và interface trong 9 file.
- [ ] Chèn comment theo hợp đồng, giải thích validation/default, discriminated unions và quan hệ giữa topic/source/article/editorial/translation.
- [ ] Chạy `npm run build && npm run lint && npm test -- tests/config` và yêu cầu exit code `0`.
- [ ] Chạy kiểm tra diff chỉ-addition; không được có dòng source bị xóa.
- [ ] Commit đúng 9 file với message `docs: explain configuration and domain types`.

### Task 3: Crawlers

**Files:**
- Modify: `src/crawlers/crawler.types.ts`
- Modify: `src/crawlers/index.ts`
- Modify: `src/crawlers/rss.crawler.ts`
- Modify: `src/crawlers/html.crawler.ts`
- Modify: `src/crawlers/x-search.crawler.ts`
- Modify: `src/crawlers/github-repos.crawler.ts`

- [ ] Dùng CodeGraph lấy source và caller của mọi crawler class, mapping helper, HTTP helper và factory.
- [ ] Chèn comment theo hợp đồng, mô tả request, parse/map, normalize, error-to-empty-list fallback và dữ liệu `Article`.
- [ ] Chạy `npm run build && npm run lint && npm test -- tests/crawlers` và yêu cầu exit code `0`.
- [ ] Chạy kiểm tra diff chỉ-addition; không được có dòng source bị xóa.
- [ ] Commit đúng 6 file với message `docs: explain crawler data flows`.

### Task 4: Article, source và digest

**Files:**
- Modify: `src/services/article.service.ts`
- Modify: `src/services/source.service.ts`
- Modify: `src/services/digest.service.ts`
- Modify: `src/services/digest-message-editorial.service.ts`

- [ ] Dùng CodeGraph lấy source/caller của toàn bộ filtering, dedupe, freshness, scoring, balancing, grouping, rendering và editorial orchestration helper.
- [ ] Chèn comment theo hợp đồng, mô tả luồng `Article[] → lọc/dedupe → chọn cân bằng → DigestMessage[]`.
- [ ] Chạy `npm run build && npm run lint && npm test -- tests/services/article.service.test.ts tests/services/source.service.test.ts tests/services/digest.service.test.ts tests/services/digest-message-editorial.service.test.ts` và yêu cầu exit code `0`.
- [ ] Chạy kiểm tra diff chỉ-addition; không được có dòng source bị xóa.
- [ ] Commit đúng 4 file với message `docs: explain article and digest pipeline`.

### Task 5: Biên tập, provider AI và dịch

**Files:**
- Modify: `src/services/article-editorial.service.ts`
- Modify: `src/services/codex-article-editorial.generator.ts`
- Modify: `src/services/codex-exec.runner.ts`
- Modify: `src/services/openai-article-editorial.generator.ts`
- Modify: `src/services/google-article-editorial.generator.ts`
- Modify: `src/services/google-translation.service.ts`
- Modify: `src/services/translation.service.ts`

- [ ] Dùng CodeGraph lấy source/caller cho provider selection, prompt/response schema, subprocess/HTTP call, structured parse, retry và fallback.
- [ ] Chèn comment theo hợp đồng, mô tả luồng biên tập và dịch, bao gồm lỗi provider và fallback không làm mất tin.
- [ ] Chạy `npm run build && npm run lint && npm test -- tests/services/article-editorial.service.test.ts tests/services/codex-article-editorial.generator.test.ts tests/services/google-article-editorial.generator.test.ts tests/services/openai-article-editorial.generator.test.ts tests/services/google-translation.service.test.ts tests/services/translation.service.test.ts` và yêu cầu exit code `0`.
- [ ] Chạy kiểm tra diff chỉ-addition; không được có dòng source bị xóa.
- [ ] Commit đúng 7 file với message `docs: explain editorial and translation flows`.

### Task 6: Telegram và utilities

**Files:**
- Modify: `src/services/telegram.service.ts`
- Modify: `src/utils/normalize-url.ts`
- Modify: `src/utils/reddit-dns.ts`
- Modify: `src/utils/text.ts`

- [ ] Dùng CodeGraph lấy source/caller của gửi message/photo, chunking, effect fallback, URL normalization, DNS fallback và text compaction.
- [ ] Chèn comment theo hợp đồng, mô tả luồng gửi Telegram cùng mọi fallback và utility consumer.
- [ ] Chạy `npm run build && npm run lint && npm test -- tests/services/telegram.service.test.ts tests/utils/reddit-dns.test.ts` và yêu cầu exit code `0`.
- [ ] Chạy kiểm tra diff chỉ-addition; không được có dòng source bị xóa.
- [ ] Commit đúng 4 file với message `docs: explain Telegram and utility flows`.

### Task 7: Kiểm chứng toàn codebase

- [ ] Xác nhận đủ 41 file bằng `test "$(rg --files src | wc -l)" -eq 41`.
- [ ] Xác nhận mỗi file có comment bằng cách duyệt toàn bộ danh sách `rg --files src`.
- [ ] Đối chiếu lại CodeGraph để phát hiện JSDoc call-site thiếu hoặc sai.
- [ ] Chạy `npm test && npm run build && npm run lint`; cả ba lệnh phải exit code `0`, test suite phải đạt 22 files và 88 tests.
- [ ] Kiểm tra toàn bộ diff từ base chỉ có dòng thêm; không có dòng source bị xóa hoặc sửa.
- [ ] Xác nhận `git status --short` không đưa các file đang bị xóa sẵn của bố vào commit.

