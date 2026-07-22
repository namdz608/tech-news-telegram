# App Flow Infographic Design

## Mục tiêu

Tạo một ảnh PNG độ phân giải cao trong `docs/` để developer hiểu và lần ngược toàn bộ luồng chạy hiện tại của Tech News Telegram.

## Bố cục v2

Infographic kỹ thuật khổ dọc, nền tối, chia thành hai cột:

- Cột trái giữ pipeline sáu tầng: Express, nguồn, lọc, chọn bản tin, biên tập/dịch và Telegram.
- Cột phải là `ROUTE → CONTROLLER → SERVICE`, chứa sequence tuần tự của từng endpoint.

Các nhánh lỗi/fallback nằm cạnh pipeline. Dải cuối ảnh liệt kê nhóm biến môi trường chi phối luồng.

## Độ chi tiết

Mỗi khối chính ghi tên class/method hoặc file tương ứng. Sơ đồ phản ánh đúng năm hành vi API hiện có:

- `GET /health`: `healthRoutes` → `getHealth()` → trả `{ status: 'ok' }`.
- `GET /news/sources`: `newsRoutes` → `listSources()` → `config/sources` → trả cấu hình nguồn.
- `GET /news/latest`: thu thập và trả articles.
- `POST /news/digest`: thu thập, tạo digest/messages, dịch/biên tập rồi trả JSON.
- `POST /telegram/send-digest`: thu thập, tạo và biên tập messages rồi gửi Telegram.

## Sequence chi tiết

- `GET /news/latest`: `newsRoutes` → `getLatestNews()` → `SourceService.collectLatest()` → crawlers → filter/sort/dedupe → `res.json({ articles })`.
- `POST /news/digest`: `newsRoutes` → `createDigest()` → `SourceService.collectLatest()` → `DigestService.buildDigest()` + `buildDigestMessages()` → `TranslationService.translateDigest()` + `editDigestMessages(..., ArticleEditorialService)` → response JSON.
- `POST /telegram/send-digest`: `telegramRoutes` → controller `sendDigest()` → `SourceService.collectLatest()` → `DigestService.buildDigestMessages()` → `editDigestMessages(..., ArticleEditorialService)` → `TelegramService.sendMessages()` → Telegram API → response JSON.

Không mô tả scheduler vì entrypoint hiện tại chỉ khởi động Express server.

## Nhánh lỗi

- Một crawler lỗi: ghi log và trả mảng rỗng cho riêng nguồn đó.
- Dịch lỗi: giữ nguyên digest.
- AI editorial lỗi hoặc dữ liệu không đủ: dùng nội dung fallback.
- Tải/gửi ảnh lỗi: gửi text.
- Telegram message effect không hỗ trợ: tắt effect và gửi thường.

## Tiêu chí hoàn thành

- File `docs/tech-news-telegram-app-flow-v2.png` mở được.
- Chữ tiếng Việt và tên symbol quan trọng đọc được ở kích thước đầy đủ.
- Có đủ năm endpoint và route thật là `/news/sources`, không phải `/sources`.
- Mỗi endpoint có chuỗi route → controller → service/response theo đúng thứ tự.
- Không thêm component không tồn tại trong runtime hiện tại.
- Luồng chính và các fallback khớp code hiện tại.
- Chỉ xóa `docs/tech-news-telegram-app-flow.png` sau khi v2 vượt kiểm tra.
