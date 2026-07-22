# Telegram Trigger Separator Design

## Mục tiêu

Mỗi lần trigger một batch gửi Telegram, gửi đúng một tin phân cách trước bài tin đầu tiên để người đọc nhận biết ranh giới giữa các lần chạy.

## Nội dung separator

Tin phân cách có nội dung cố định:

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Điểm chèn

`TelegramService.sendMessages(messages)` chịu trách nhiệm gửi separator. Controller tiếp tục chỉ gọi `sendMessages()` và không biết chi tiết trình bày Telegram.

Luồng mới:

1. Loại các `DigestMessage` có `text.trim()` rỗng.
2. Nếu không còn message hợp lệ, kết thúc mà không gọi Telegram.
3. Gửi separator một lần bằng `bot.telegram.sendMessage()` với `parse_mode: 'HTML'` và `disable_web_page_preview: true`.
4. Gửi tuần tự từng message hợp lệ bằng `sendDigest()` như hiện tại.

Separator không có inline keyboard, ảnh hoặc message effect.

## Xử lý lỗi

Nếu Telegram từ chối separator, promise của `sendMessages()` reject và batch dừng. Hành vi này nhất quán với lỗi gửi text cuối cùng hiện tại và ngăn một batch mới xuất hiện mà không có dấu phân cách.

## Kiểm chứng

- Hai bài hợp lệ tạo thứ tự gọi `separator → bài 1 → bài 2`.
- Mỗi lần gọi `sendMessages()` chỉ tạo một separator.
- Message rỗng bị bỏ qua.
- Batch rỗng hoặc chỉ chứa message rỗng không gửi separator.
- Test hiện có về ảnh, chunking, fallback và effect tiếp tục pass.
- `npm test`, `npm run build` và `npm run lint` thành công sau khi hoàn tất các lỗi lint đang mở.

## Ngoài phạm vi

- Không thêm separator vào `POST /news/digest` vì endpoint này chỉ trả JSON.
- Không thay nội dung từng bài.
- Không thêm env cho separator trong lần thay đổi này.
