/**
 * Chạy tiến trình Codex CLI với timeout, thu stdout và chuyển lỗi thành rejection.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp { spawn } từ `node:child_process` để dùng đúng dependency/type thay vì tự triển khai lại.
import { spawn } from 'node:child_process';
// Nạp { existsSync, mkdtempSync, readFileSync, rmSync } từ `node:fs` để dùng đúng dependency/type thay vì tự triển khai lại.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
// Nạp { tmpdir } từ `node:os` để dùng đúng dependency/type thay vì tự triển khai lại.
import { tmpdir } from 'node:os';
// Nạp { join } từ `node:path` để dùng đúng dependency/type thay vì tự triển khai lại.
import { join } from 'node:path';

/**
 * Interface `CodexRunner` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/services/codex-article-editorial.generator.ts`
 * - `src/services/codex-exec.runner.ts`
 */
// Mở khai báo `export interface CodexRunner` để compiler kiểm tra contract cho mọi consumer.
export interface CodexRunner {
  run(prompt: string, input: string, timeoutMs: number): Promise<string>;
}

/**
 * Class `CodexExecRunner` sở hữu vòng đời dependency và điều phối các bước codex exec runner.
 *
 * Được sử dụng tại:
 * - `src/services/codex-article-editorial.generator.ts`
 */
// Mở khai báo `export class CodexExecRunner implements CodexRunner` để compiler kiểm tra contract cho mọi consumer.
export class CodexExecRunner implements CodexRunner {
  /**
   * Hàm `run` chạy dependency tiến trình và thu kết quả bất đồng bộ; kết quả được trả cho caller theo kiểu khai báo.
   *
   * Được sử dụng tại:
   * - `src/services/codex-exec.runner.ts`
   * - `src/services/codex-article-editorial.generator.ts`
   */
  // Mở method `run` để chạy dependency tiến trình và thu kết quả bất đồng bộ.
  run(prompt: string, input: string, timeoutMs: number): Promise<string> {
    // Trả `new Promise((resolve, reject) => {` cho caller và kết thúc nhánh hiện tại.
    return new Promise((resolve, reject) => {
      // Tính `outputDir` từ `mkdtempSync(join(tmpdir(), 'tech-news-codex-'));` và giữ bất biến trong phạm vi hiện tại.
      const outputDir = mkdtempSync(join(tmpdir(), 'tech-news-codex-'));
      // Tính `outputFile` từ `join(outputDir, 'translation.txt');` và giữ bất biến trong phạm vi hiện tại.
      const outputFile = join(outputDir, 'translation.txt');
      // Tính `cleanup` từ `() => rmSync(outputDir, { recursive: true, force: true });` và giữ bất biến trong phạm vi hiện tại.
      const cleanup = () => rmSync(outputDir, { recursive: true, force: true });
      // Tính `child` từ `spawn(` và giữ bất biến trong phạm vi hiện tại.
      const child = spawn(
        // Thêm giá trị `'codex',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
        'codex',
        [
          // Thêm giá trị `'exec',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
          'exec',
          // Thêm giá trị `'--ephemeral',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
          '--ephemeral',
          // Thêm giá trị `'--sandbox',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
          '--sandbox',
          // Thêm giá trị `'read-only',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
          'read-only',
          // Thêm giá trị `'--skip-git-repo-check',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
          '--skip-git-repo-check',
          // Thêm giá trị `'--output-last-message',` vào cấu hình hoặc nội dung đầu ra đang xây dựng.
          '--output-last-message',
          // Đưa giá trị `outputFile` vào field cùng tên của object đang tạo.
          outputFile,
          // Đưa giá trị `prompt` vào field cùng tên của object đang tạo.
          prompt,
        ],
        {
          // Gán field `cwd` từ `process.cwd(),` để object khớp contract.
          cwd: process.cwd(),
          // Gán field `stdio` từ `['pipe', 'pipe', 'pipe'],` để object khớp contract.
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );

      // Khởi tạo trạng thái `stdout`; các nhánh bên dưới sẽ cập nhật nó có kiểm soát.
      let stdout = '';
      // Khởi tạo trạng thái `stderr`; các nhánh bên dưới sẽ cập nhật nó có kiểm soát.
      let stderr = '';
      // Tính `timeout` từ `setTimeout(() => {` và giữ bất biến trong phạm vi hiện tại.
      const timeout = setTimeout(() => {
        // Yêu cầu dừng tiến trình con vì đã vượt quá timeout cho phép.
        child.kill('SIGTERM');
        // Xóa thư mục/tài nguyên tạm để cả nhánh thành công lẫn lỗi không để lại rác.
        cleanup();
        // Reject Promise bằng `reject(new Error(`Codex translation timed out after ${timeoutMs}ms`));` để caller đi vào fallback có log.
        reject(new Error(`Codex translation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      // Gọi `child.stdout.setEncoding` với `'utf8'` để hoàn tất side effect/bước xử lý hiện tại.
      child.stdout.setEncoding('utf8');
      // Gọi `child.stderr.setEncoding` với `'utf8'` để hoàn tất side effect/bước xử lý hiện tại.
      child.stderr.setEncoding('utf8');
      // Đăng ký handler cho sự kiện 'data' của `child.stdout`.
      child.stdout.on('data', (chunk) => {
        // Cập nhật `stdout` bằng `chunk;` cho bước kế tiếp.
        stdout += chunk;
      });
      // Đăng ký handler cho sự kiện 'data' của `child.stderr`.
      child.stderr.on('data', (chunk) => {
        // Cập nhật `stderr` bằng `chunk;` cho bước kế tiếp.
        stderr += chunk;
      });
      // Đăng ký handler cho sự kiện 'error' của `child`.
      child.on('error', (error) => {
        // Hủy timer vì tiến trình đã kết thúc, tránh callback timeout chạy muộn.
        clearTimeout(timeout);
        // Xóa thư mục/tài nguyên tạm để cả nhánh thành công lẫn lỗi không để lại rác.
        cleanup();
        // Reject Promise bằng `reject(error);` để caller đi vào fallback có log.
        reject(error);
      });
      // Đăng ký handler cho sự kiện 'close' của `child`.
      child.on('close', (code) => {
        // Hủy timer vì tiến trình đã kết thúc, tránh callback timeout chạy muộn.
        clearTimeout(timeout);
        // Nếu `code === 0` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
        if (code === 0) {
          // Tính `finalMessage` từ `existsSync(outputFile) ? readFileSync(outputFile, 'utf8') : stdout;` và giữ bất biến trong phạm vi hiện tại.
          const finalMessage = existsSync(outputFile) ? readFileSync(outputFile, 'utf8') : stdout;
          // Xóa thư mục/tài nguyên tạm để cả nhánh thành công lẫn lỗi không để lại rác.
          cleanup();
          // Resolve Promise bằng `resolve(finalMessage);` để trả output cho caller.
          resolve(finalMessage);
          // Trả quyền điều khiển cho caller và kết thúc nhánh hiện tại.
          return;
        }

        // Xóa thư mục/tài nguyên tạm để cả nhánh thành công lẫn lỗi không để lại rác.
        cleanup();
        // Reject Promise bằng `reject(new Error(`Codex translation failed with exit code ${code}: ${stderr.trim()}`));` để caller đi vào fallback có log.
        reject(new Error(`Codex translation failed with exit code ${code}: ${stderr.trim()}`));
      });

      // Gửi toàn bộ input qua stdin rồi đóng stream để Codex bắt đầu xử lý.
      child.stdin.end(input);
    });
  }
}
