# Rich Telegram Article Messages Design

## Goal

Mỗi bài viết được gửi thành một tin Telegram riêng kèm ảnh, nhưng nội dung phải đầy đủ tối thiểu như mẫu đã duyệt: chủ đề, tiêu đề, ngày công bố, tóm tắt, lý do quan trọng, mức hành động, nguồn và nút mở bài gốc.

## Scope

Thay đổi chỉ áp dụng cho luồng `buildDigestMessages` dùng bởi API gửi Telegram, lịch chạy tự động và preview tin. Luồng `buildDigest` dạng bản tin gộp được giữ nguyên.

Mỗi bài vẫn là một Telegram message riêng. Cơ chế chọn bài, cân bằng chủ đề, chọn ảnh, tải ảnh và fallback sang text không thay đổi.

## Required Message Structure

Mỗi tin phải được code dựng theo một cấu trúc HTML cố định:

```text
<topic icon> <TOPIC>
━━━━━━━━━━━━━━

<title>

Công bố: <d/m/yyyy hoặc Không rõ>
<summary>

Vì sao quan trọng: <impact>

Mức hành động: <severity icon> <severity label> — <recommended action>

Nguồn: <source name>
```

URL bài viết không cần lặp lại trong caption vì `TelegramService` tiếp tục gắn nút `🔗 Đọc chi tiết` bên dưới tin.

Các trường bắt buộc:

- `Công bố`: ưu tiên `Article.publishedAt`; nếu không có hoặc không hợp lệ thì dùng `Article.collectedAt`; nếu cả hai không hợp lệ thì hiển thị `Không rõ`.
- Tóm tắt: 1–2 câu tiếng Việt, nêu sự kiện hoặc thay đổi chính và đối tượng bị ảnh hưởng.
- `Vì sao quan trọng`: 1–2 câu giải thích tác động thực tế, không chỉ lặp lại tóm tắt.
- `Mức hành động`: một trong `🔴 Khẩn cấp`, `🟠 Cao`, hoặc `🟡 Theo dõi`, theo sau là hành động cụ thể.
- `Nguồn`: giữ nguyên tên nguồn từ `Article.sourceName`.

Tiêu đề, nội dung và tên nguồn phải được escape trước khi đưa vào HTML Telegram. Các nhãn tiếng Việt và cấu trúc HTML do code kiểm soát, không giao cho mô hình tự định dạng.

## Editorial Data Model

Thêm một kiểu dữ liệu biên tập có cấu trúc, độc lập với HTML:

```ts
type ActionLevel = 'urgent' | 'high' | 'monitor';

interface ArticleEditorial {
  title: string;
  summary: string;
  whyImportant: string;
  actionLevel: ActionLevel;
  actionText: string;
}
```

Mô hình ngôn ngữ chỉ tạo `ArticleEditorial`. `DigestService` nhận dữ liệu đã biên tập và chịu trách nhiệm dựng HTML cuối cùng. Cách tách này ngăn mô hình làm mất nhãn, thẻ HTML, nguồn hoặc nút đọc bài.

## Data Flow

1. `DigestService` tiếp tục chọn và cân bằng bài theo chủ đề.
2. Mỗi `DigestMessage` mang đủ metadata cần biên tập: bài gốc, chủ đề được gán, URL và ảnh.
3. Dịch vụ biên tập gửi tiêu đề, summary, chủ đề, nguồn và ngày của một bài cho provider đang cấu hình.
4. Provider trả về dữ liệu có cấu trúc gồm tiêu đề tiếng Việt, tóm tắt, lý do quan trọng, mức hành động và hành động đề xuất.
5. Dữ liệu được kiểm tra; trường rỗng hoặc giá trị mức hành động không hợp lệ được thay bằng fallback xác định.
6. Code dựng caption HTML theo mẫu bắt buộc rồi chuyển cho `TelegramService`.

Việc biên tập nhiều bài tiếp tục chạy đồng thời với giới hạn concurrency hiện có. Thứ tự message đầu ra phải giống thứ tự đầu vào.

## Provider Behavior

Codex và OpenAI được yêu cầu trả về dữ liệu JSON đúng schema, viết tiếng Việt tự nhiên và dựa hoàn toàn trên dữ kiện có trong bài gốc. Không được bịa phiên bản, CVE, số liệu, tổ chức bị ảnh hưởng hoặc trạng thái khai thác.

Nếu thông tin nguồn không đủ để kết luận mạnh, provider phải chọn `monitor` và viết hành động thận trọng như kiểm tra mức độ liên quan hoặc theo dõi thông báo chính thức.

Google Translate và provider `none` không thể tự suy luận phần nhận định. Google vẫn dịch tiêu đề và tóm tắt để giữ hành vi tiếng Việt hiện có, sau đó hệ thống dùng fallback xác định cho phần nhận định. Provider `none` dùng toàn bộ fallback thay vì gửi tin thiếu mục.

## Deterministic Fallbacks

Nếu provider lỗi, timeout, trả JSON sai hoặc bỏ trống trường:

- `title`: dùng `Article.title`.
- `summary`: dùng `Article.summary`; nếu không có, dùng câu `Nguồn chưa cung cấp mô tả chi tiết cho bản tin này.`
- `whyImportant`: dùng câu theo chủ đề, ví dụ Security nhấn mạnh việc kiểm tra mức độ phơi nhiễm; các chủ đề khác nhấn mạnh việc đánh giá tác động tới hệ thống hoặc quy trình đang sử dụng.
- `actionLevel`: mặc định `monitor` để tránh gắn mức khẩn cấp khi không đủ bằng chứng.
- `actionText`: yêu cầu kiểm tra mức độ liên quan và theo dõi thông báo chính thức từ nguồn.

Fallback phải vẫn tạo đủ tất cả nhãn bắt buộc và không làm gián đoạn các bài còn lại.

## Telegram Length Handling

Caption ảnh Telegram hiện được giới hạn ở 1000 ký tự trong ứng dụng. Nội dung biên tập phải được giới hạn theo từng trường để caption thông thường vừa với ảnh.

Nếu caption hoàn chỉnh vẫn vượt giới hạn, giữ nguyên hành vi hiện tại: gửi ảnh riêng rồi gửi toàn bộ nội dung dạng text kèm nút `Đọc chi tiết`. Không được cắt mất một trong các mục bắt buộc chỉ để giữ caption trên ảnh.

## Testing

Kiểm thử tập trung sẽ xác nhận:

- Mỗi bài tạo đúng một message và luôn có `Công bố`, tóm tắt, `Vì sao quan trọng`, `Mức hành động`, `Nguồn` và URL cho nút đọc chi tiết.
- `publishedAt` được ưu tiên và định dạng theo ngày Việt Nam; `collectedAt` và `Không rõ` hoạt động đúng khi thiếu dữ liệu.
- Dữ liệu biên tập hợp lệ được render đúng và được escape HTML.
- Provider lỗi, JSON sai hoặc thiếu trường vẫn sinh message đầy đủ bằng fallback.
- Mức hành động không hợp lệ không được truyền ra Telegram.
- Thứ tự bài được giữ nguyên khi biên tập đồng thời.
- Tin dài tiếp tục dùng cơ chế gửi ảnh riêng và text đầy đủ.
- Các kiểm thử chọn bài, ảnh fallback và gửi Telegram hiện có tiếp tục pass.

## Out of Scope

- Gộp nhiều bài vào một Telegram message.
- Thay đổi thuật toán chọn hoặc xếp hạng bài.
- Thu thập toàn văn bài viết ngoài title và summary hiện có.
- Xác minh độc lập mọi nhận định bằng nguồn thứ hai.
- Thêm mức hành động ngoài ba mức đã định nghĩa.
