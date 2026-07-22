# ESLint 10 Flat Config Design

## Mục tiêu

Khôi phục lệnh `npm run lint` cho project TypeScript đang dùng ESLint 10 bằng flat config chính thức, với bộ rule recommended tối thiểu.

## Nguyên nhân

Project có script `eslint src tests --ext .ts` và dependency ESLint 10 nhưng không có `eslint.config.js`, `eslint.config.mjs` hoặc `eslint.config.cjs`. ESLint dừng ở bước tìm cấu hình trước khi parse source code.

## Thiết kế

- Cài dev dependencies `@eslint/js` và `typescript-eslint`.
- Tạo `eslint.config.mjs` tại project root.
- Dùng `defineConfig()`, `js.configs.recommended` và `tseslint.configs.recommended`.
- Chỉ lint `src/**/*.ts` và `tests/**/*.ts`.
- Ignore `dist/**`, `node_modules/**`, `.codegraph/**` và `.superpowers/**`.
- Không bật typed linting hoặc stylistic rules trong thay đổi này.
- Giữ nguyên script `npm run lint` nếu script hiện tại hoạt động với flat config mới.

## TDD và kiểm chứng

- Trước implementation, thêm test subprocess chạy ESLint trên một fixture TypeScript hợp lệ và xác nhận exit code 0; test phải fail do thiếu flat config.
- Sau khi thêm dependencies/config, test subprocess phải pass.
- Chạy `npm run lint`; sửa riêng các lỗi recommended rule phát hiện trong source/test hiện tại.
- Chạy lại `npm test`, `npm run build` và `npm run lint`.

## Ngoài phạm vi

- Không bật type-aware rules.
- Không áp Prettier hoặc rule định dạng.
- Không sửa logic ứng dụng ngoài những lỗi lint bắt buộc.
- Không đổi major version các dependency hiện có.
