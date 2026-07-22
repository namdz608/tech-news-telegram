# Google-only Digest Translation Design

## Mục tiêu

Đơn giản hóa phần dịch digest để luôn dùng Google Translate, xóa các implementation dịch Codex/OpenAI/None không còn cần thiết, đồng thời giữ nguyên khả năng chọn Codex/OpenAI/Google/None cho phần biên tập từng bài.

## Kiến trúc đích

`TranslationService` tiếp tục chịu trách nhiệm bảo vệ HTML entity, tag và URL, gọi một `DigestTranslator`, khôi phục markup và trả digest gốc khi provider lỗi. Default translator của lớp này luôn là `GoogleTranslationService`; không còn nhánh chọn provider cho dịch digest.

Phần editorial dùng biến mới `EDITORIAL_PROVIDER` với các giá trị `codex | openai | google | none`. `ArticleEditorialService` đọc biến này để chọn generator. Biến cũ `TRANSLATION_PROVIDER` bị loại bỏ để tên cấu hình phản ánh đúng trách nhiệm.

`CodexExecRunner` và `CodexRunner` được chuyển khỏi `codex-translation.service.ts` sang `codex-exec.runner.ts`. `CodexArticleEditorialGenerator` import runner từ file mới. Sau khi chuyển, toàn bộ implementation `CodexTranslationService` có thể xóa.

## File thay đổi

### Tạo mới

- `src/services/codex-exec.runner.ts`: chứa `CodexRunner` và `CodexExecRunner` dùng cho editorial Codex.

### Sửa

- `src/services/translation.service.ts`: default trực tiếp là `GoogleTranslationService`; giữ constructor injection, bảo vệ markup và fallback.
- `src/services/codex-article-editorial.generator.ts`: đổi import runner sang file mới.
- `src/services/article-editorial.service.ts`: dùng `env.EDITORIAL_PROVIDER`.
- `src/config/env.ts`: thêm `EDITORIAL_PROVIDER`; bỏ `TRANSLATION_PROVIDER`, `CODEX_TRANSLATION_CHUNK_CHARS`, `CODEX_TRANSLATION_CONCURRENCY`; giữ `CODEX_TRANSLATION_TIMEOUT_MS` vì runner Codex vẫn cần timeout.
- `.env.example`: thay cấu hình provider bằng `EDITORIAL_PROVIDER` và xóa env Codex translation không dùng.
- `.env`: chỉ thay khóa `TRANSLATION_PROVIDER=google` bằng `EDITORIAL_PROVIDER=google`; không đọc hoặc thay đổi các secret khác.
- `README.md`: mô tả Google là dịch vụ dịch digest cố định và `EDITORIAL_PROVIDER` chỉ chọn bộ biên tập.
- `tests/services/translation.service.test.ts`: giữ test injection, markup và fallback; bổ sung test chứng minh default factory không còn phân nhánh theo env nếu có thể kiểm tra ổn định mà không gọi mạng.
- Các test editorial/config liên quan: đổi tên env và kỳ vọng provider.

### Xóa

- `src/services/openai-translation.service.ts`
- `src/services/noop-translation.service.ts`
- `src/services/codex-translation.service.ts`
- `tests/services/openai-translation.service.test.ts`
- `tests/services/codex-translation.service.test.ts`; các test trong file này chỉ kiểm tra hành vi dịch Codex bị loại bỏ, không kiểm tra độc lập `CodexExecRunner`.

`src/services/google-translation.service.ts` và `src/services/translation.types.ts` được giữ lại. Interface `DigestTranslator` vẫn cần cho dependency injection và unit test.

## Luồng chạy sau thay đổi

`POST /news/digest` → `createDigest()` → `DigestService.buildDigest()` → `TranslationService.translateDigest()` → `GoogleTranslationService.translateDigest()` → translated digest. Nếu Google lỗi, `GoogleTranslationService` hoặc wrapper trả digest gốc.

Luồng message editorial độc lập: controller → `editDigestMessages()` → `ArticleEditorialService` → generator được chọn bởi `EDITORIAL_PROVIDER` → fallback editorial nếu generator lỗi.

## Migration cấu hình

- `.env` đang dùng `TRANSLATION_PROVIDER=google`; sau thay đổi, digest vẫn dùng Google mà không cần biến này.
- Để giữ hành vi editorial hiện tại, cấu hình tương đương là `EDITORIAL_PROVIDER=google`.
- Schema có default `EDITORIAL_PROVIDER=google` để hành vi mặc định khớp môi trường hiện tại.
- Không tự động đọc alias `TRANSLATION_PROVIDER`; cấu hình cũ bị loại bỏ rõ ràng để tránh duy trì hai tên cho cùng một trách nhiệm.

## Xử lý lỗi

- Google Translate lỗi hoặc trả dữ liệu không hợp lệ: giữ digest gốc.
- Editorial provider lỗi: giữ cơ chế fallback hiện có.
- Codex runner timeout: giữ `CODEX_TRANSLATION_TIMEOUT_MS` trong lần thay đổi này để tránh mở rộng phạm vi; việc đổi tên timeout có thể thực hiện riêng sau.

## Kiểm chứng

- Test `TranslationService` xác nhận input rỗng, bảo vệ/khôi phục markup và fallback khi translator ném lỗi.
- Test Google translator tiếp tục xác nhận dịch, chia chunk và fallback.
- Test editorial xác nhận lựa chọn generator theo `EDITORIAL_PROVIDER`.
- `rg` không còn import/reference tới ba translation implementation bị xóa hoặc các env bị loại bỏ.
- `npm test`, `npm run build` và `npm run lint` thành công.

## Ngoài phạm vi

- Không thay đổi nội dung prompt editorial.
- Không thay đổi API response hay Telegram formatting.
- Không thay Google endpoint hoặc thêm provider dịch mới.
- Không đổi tên `CODEX_TRANSLATION_TIMEOUT_MS` trong lần này.
