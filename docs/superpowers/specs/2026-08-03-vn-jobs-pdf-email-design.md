# Jobs digest → PDF → Email (SMTP)

**Date:** 2026-08-03  
**Status:** Approved direction (awaiting spec review)  
**Endpoint:** `POST /telegram/send-jobs` (URL giữ nguyên)

## Goal

Khi crawl tin tuyển dụng VN, **không gửi Telegram**. Thay vào đó:

1. Crawl + lọc như hiện tại (`role`, `experienceYears`, `limit`, Hà Nội, …)
2. Tổng hợp toàn bộ job đã chọn vào **một file PDF**
3. Gửi PDF qua **email SMTP** (`nodemailer`)

Luồng tech digest (`POST /telegram/send-digest`) **không đổi** — vẫn Telegram.

## Out of scope

- Gửi song song Telegram + mail
- Puppeteer / HTML-to-PDF
- UI cấu hình SMTP
- Đổi path endpoint (giữ `/telegram/send-jobs` để tương thích)

## Flow

```
POST /telegram/send-jobs?role=…&experienceYears=…&limit=…
  → parseJobSendParams
  → VnJobsCrawler.crawl({ role, experienceYears, maxResults: limit })
  → nếu 0 article: JSON { sent: false | true?, articleCount: 0, … } không gửi mail
  → buildJobsPdf(articles) → Buffer
  → EmailService.sendJobsPdf({ to, subject, pdf, meta })
  → JSON summary (không messageCount Telegram)
```

## PDF content

Một file, tên ví dụ: `vn-jobs-{role}-{yyyyMMdd-HHmm}.pdf`

Header:

- Tiêu đề: `Tin tuyển dụng — {role}`
- Filters: experience, limit, thời điểm tạo
- Số job trong file

Mỗi job (theo thứ tự digest hiện tại):

1. STT + Title  
2. Công ty  
3. Mô tả công việc (giữ xuống dòng / bullet nếu có)  
4. Kỹ năng cần có  
5. Mức lương  
6. Địa điểm  
7. Nguồn + URL  

Thư viện: **pdfkit** (layout text đơn giản, không browser).

## Email

- Library: **nodemailer**
- Transport: SMTP từ env
- To: `MAIL_TO` (bắt buộc khi gửi)
- From: `MAIL_FROM` (fallback `SMTP_USER`)
- Subject: `[VN Jobs] {role} — {N} tin — {date}`
- Body text ngắn: số tin, role, filter; PDF đính kèm
- Khi thiếu SMTP/MAIL_TO → `503` hoặc `500` với message rõ (không silent fail)

## Env

```bash
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false   # true nếu port 465
SMTP_USER=
SMTP_PASS=
MAIL_FROM=          # optional; default SMTP_USER
MAIL_TO=            # recipient(s), comma-separated OK
```

Defaults an toàn cho test: host/user/pass/to rỗng → service báo chưa cấu hình; unit test mock transporter.

## API response (success)

```json
{
  "sent": true,
  "channel": "email",
  "articleCount": 10,
  "matchedCount": 18,
  "limit": 10,
  "role": "devops",
  "experienceYears": "2-5",
  "crawledCounts": { "topcv": 41, "itviec": 20, "vietnamworks": 16 },
  "boardCounts": { "topcv": 12, "itviec": 5, "vietnamworks": 4 },
  "mailTo": "you@example.com",
  "pdfFileName": "vn-jobs-devops-20260803-1530.pdf",
  "language": "vi"
}
```

Bỏ `messageCount` (Telegram). Empty crawl: `sent: false`, `articleCount: 0`, không gọi SMTP.

## Files to add/change

| File | Change |
|------|--------|
| `src/config/env.ts`, `.env.example` | SMTP + MAIL_* |
| `src/services/jobs-pdf.service.ts` | build PDF buffer |
| `src/services/email.service.ts` | nodemailer send with attachment |
| `src/controllers/telegram.controller.ts` | `sendJobs` → PDF + email |
| `README.md` | document jobs email flow |
| tests | pdf builder + email mock + route asserts no Telegram |

## Dependencies

- `pdfkit` + `@types/pdfkit`
- `nodemailer` + `@types/nodemailer`

## Test plan

- [ ] `buildJobsPdf` tạo buffer bắt đầu bằng `%PDF` và chứa title job
- [ ] `EmailService` gọi `sendMail` với attachment `contentType: application/pdf` khi SMTP cấu hình
- [ ] `POST /telegram/send-jobs` không gọi `TelegramService.sendMessages`
- [ ] Missing `MAIL_TO` / `SMTP_HOST` → lỗi rõ ràng
- [ ] Empty crawl → không gửi mail
- [ ] Full suite xanh
