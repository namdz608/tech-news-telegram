# App Flow Infographic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tạo infographic PNG đẹp, chi tiết, mô tả toàn bộ luồng chạy hiện tại của Tech News Telegram cho developer.

**Architecture:** Một ảnh dọc duy nhất biểu diễn entrypoints, pipeline dữ liệu, các provider bên ngoài và nhánh fallback. Nội dung ảnh được đối chiếu với source code, sau đó ảnh sinh ra được kiểm tra trực quan và kiểm tra định dạng trước khi bàn giao.

**Tech Stack:** OpenAI built-in image generation, PNG, TypeScript/Express source code làm nguồn sự thật.

---

### Task 1: Sinh infographic

**Files:**
- Create: `docs/tech-news-telegram-app-flow.png`

- [x] **Step 1: Soạn prompt chính xác**

Dùng nội dung trong `docs/superpowers/specs/2026-07-22-app-flow-infographic-design.md`; yêu cầu infographic kỹ thuật khổ dọc, nền tối, sáu tầng, nhánh fallback và tên symbol chính xác.

- [x] **Step 2: Sinh ảnh**

Dùng built-in image generation với taxonomy `infographic-diagram`, không dùng ảnh tham chiếu.

- [x] **Step 3: Đưa ảnh vào repo**

Sao chép output được chọn thành `docs/tech-news-telegram-app-flow.png`, không ghi đè asset khác.

### Task 2: Kiểm chứng và bàn giao

**Files:**
- Verify: `docs/tech-news-telegram-app-flow.png`

- [x] **Step 1: Kiểm tra file**

Run: `file docs/tech-news-telegram-app-flow.png`

Expected: kết quả nhận diện là PNG image data và có kích thước hợp lệ.

- [x] **Step 2: Kiểm tra trực quan**

Mở ảnh ở độ chi tiết gốc; xác nhận đủ sáu tầng, bốn endpoint, pipeline chính, nhánh fallback, không có chữ rác hoặc component không tồn tại.

- [x] **Step 3: Chỉnh một vòng nếu cần**

Nếu kiểm tra trực quan phát hiện sai chữ hoặc thiếu luồng, tạo lại với prompt chỉ rõ đúng lỗi đó rồi kiểm tra lại.

- [x] **Step 4: Chạy kiểm tra hồi quy repo**

Run: `npm test && npm run build`

Expected: test suite và TypeScript build đều thành công; asset tài liệu không ảnh hưởng ứng dụng.
