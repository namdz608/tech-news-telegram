# Emoji Telegram Message Design

## Goal

Làm mỗi tin Telegram bắt mắt và dễ quét hơn bằng emoji, phân cấp nội dung rõ ràng và khoảng trắng hợp lý, trong khi vẫn giữ mỗi bài là một tin riêng kèm ảnh.

## Message Layout

Code dựng caption HTML theo thứ tự cố định:

```text
<topic emoji>  <TOPIC> UPDATE
━━━━━━━━━━━━━━━━

📰  <title>

📅 Công bố: <date>

📝 Tóm tắt
<summary>

🎯 Vì sao đáng chú ý?
<why important>

⚡ Mức hành động
<severity emoji> <UPPERCASE LEVEL> — <action text>

🏢 Nguồn: <source name>
```

Các nhãn, emoji và HTML do code kiểm soát. Nội dung động tiếp tục được escape trước khi gửi Telegram.

## Topic Presentation

Giữ emoji hiện có theo chủ đề:

- AI: `🤖`
- Kubernetes: `☸️`
- Security: `🔐`
- DevOps: `🛠️`
- Cloud: `☁️`

Header dùng tên chủ đề in hoa và hậu tố `UPDATE`, ví dụ `🔐  SECURITY UPDATE`. Không thêm nhiều emoji trang trí khác vào header để tránh rối mắt.

## Action Presentation

Ba mức hành động giữ nguyên ý nghĩa nhưng nhãn được in hoa:

- `urgent`: `🔴 KHẨN CẤP`
- `high`: `🟠 CAO`
- `monitor`: `🟡 THEO DÕI`

Emoji mức độ nằm ở đầu dòng hành động để người đọc nhận ra độ ưu tiên ngay cả khi chỉ lướt qua tin.

## Telegram Button

Đổi nút inline từ `🔗 Đọc chi tiết` thành `🔎 Xem bài gốc`. URL và hành vi mở link giữ nguyên.

## Data Flow and Fallbacks

Luồng editorial hiện tại không thay đổi: provider tạo nội dung có cấu trúc, code kiểm tra/fallback và `DigestService` render HTML. Mọi fallback vẫn phải có đủ ngày, tóm tắt, lý do đáng chú ý, mức hành động và nguồn.

Việc chọn bài, thứ tự chủ đề, chọn ảnh, gửi ảnh và fallback sang text không thay đổi.

## Length Handling

Giữ các giới hạn nội dung hiện tại. Nếu caption vượt giới hạn ảnh, `TelegramService` tiếp tục gửi ảnh riêng rồi gửi toàn bộ phần text với nút `🔎 Xem bài gốc`; không cắt bỏ mục bắt buộc.

## Testing

Kiểm thử xác nhận:

- Header có đúng emoji chủ đề và hậu tố `UPDATE`.
- Các mục xuất hiện đúng thứ tự: tiêu đề, công bố, tóm tắt, lý do đáng chú ý, mức hành động và nguồn.
- Nhãn mức hành động dùng emoji và chữ in hoa đúng mapping.
- Nội dung động vẫn được escape HTML.
- Nút inline hiển thị `🔎 Xem bài gốc` cho cả gửi ảnh và gửi text fallback.
- Hành vi caption dài, URL, ảnh và fallback hiện có tiếp tục hoạt động.

## Out of Scope

- Thay đổi nội dung editorial hoặc cách chọn mức hành động.
- Thay đổi lịch gửi tin hay số lượng bài.
- Gộp nhiều bài trong một message.
- Thêm ảnh, sticker, animation hoặc Telegram message effect mới.
