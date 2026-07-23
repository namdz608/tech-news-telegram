/**
 * Chạy tiến trình Codex CLI với timeout, thu stdout và chuyển lỗi thành rejection.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { spawn } from 'node:child_process';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { tmpdir } from 'node:os';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { join } from 'node:path';

/**
 * Interface `CodexRunner` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - `src/services/codex-article-editorial.generator.ts`
 * - `src/services/codex-exec.runner.ts`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
export interface CodexRunner {
  /**
   * Hàm `run` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/services/codex-article-editorial.generator.ts`
   * - `src/services/codex-exec.runner.ts`
   * - `tests/services/codex-article-editorial.generator.test.ts`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  run(prompt: string, input: string, timeoutMs: number): Promise<string>;
}

/**
 * Class `CodexExecRunner` đóng gói trách nhiệm chính của module.
 *
 * Được sử dụng tại:
 * - `src/services/codex-article-editorial.generator.ts`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
export class CodexExecRunner implements CodexRunner {
  /**
   * Hàm `run` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/services/codex-article-editorial.generator.ts`
   * - `src/services/codex-exec.runner.ts`
   * - `tests/services/codex-article-editorial.generator.test.ts`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  run(prompt: string, input: string, timeoutMs: number): Promise<string> {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return new Promise((resolve, reject) => {
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const outputDir = mkdtempSync(join(tmpdir(), 'tech-news-codex-'));
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const outputFile = join(outputDir, 'translation.txt');
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const cleanup = () => rmSync(outputDir, { recursive: true, force: true });
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const child = spawn(
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        'codex',
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        [
          // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
          'exec',
          // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
          '--ephemeral',
          // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
          '--sandbox',
          // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
          'read-only',
          // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
          '--skip-git-repo-check',
          // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
          '--output-last-message',
          // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
          outputFile,
          // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
          prompt,
        ],
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        {
          // Gán field cấu trúc để tạo object đúng contract.
          cwd: process.cwd(),
          // Gán field cấu trúc để tạo object đúng contract.
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );

      // Khởi tạo trạng thái cục bộ sẽ được cập nhật có kiểm soát.
      let stdout = '';
      // Khởi tạo trạng thái cục bộ sẽ được cập nhật có kiểm soát.
      let stderr = '';
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const timeout = setTimeout(() => {
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        child.kill('SIGTERM');
        /**
         * Hàm `cleanup` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
         *
         * Được sử dụng tại:
         * - `src/services/codex-exec.runner.ts`
         */
        // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
        cleanup();
        /**
         * Hàm `reject` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
         *
         * Được sử dụng tại:
         * - `src/services/codex-exec.runner.ts`
         * - `tests/services/source.service.test.ts`
         * - `tests/utils/reddit-dns.test.ts`
         */
        // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
        reject(new Error(`Codex translation timed out after ${timeoutMs}ms`));
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      }, timeoutMs);

      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      child.stdout.setEncoding('utf8');
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      child.stderr.setEncoding('utf8');
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      child.stdout.on('data', (chunk) => {
        // Cập nhật trạng thái cục bộ từ kết quả vừa tính.
        stdout += chunk;
      });
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      child.stderr.on('data', (chunk) => {
        // Cập nhật trạng thái cục bộ từ kết quả vừa tính.
        stderr += chunk;
      });
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      child.on('error', (error) => {
        /**
         * Hàm `clearTimeout` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
         *
         * Được sử dụng tại:
         * - `src/services/codex-exec.runner.ts`
         */
        // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
        clearTimeout(timeout);
        /**
         * Hàm `cleanup` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
         *
         * Được sử dụng tại:
         * - `src/services/codex-exec.runner.ts`
         */
        // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
        cleanup();
        /**
         * Hàm `reject` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
         *
         * Được sử dụng tại:
         * - `src/services/codex-exec.runner.ts`
         * - `tests/services/source.service.test.ts`
         * - `tests/utils/reddit-dns.test.ts`
         */
        // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
        reject(error);
      });
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      child.on('close', (code) => {
        /**
         * Hàm `clearTimeout` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
         *
         * Được sử dụng tại:
         * - `src/services/codex-exec.runner.ts`
         */
        // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
        clearTimeout(timeout);
        // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
        if (code === 0) {
          // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
          const finalMessage = existsSync(outputFile) ? readFileSync(outputFile, 'utf8') : stdout;
          /**
           * Hàm `cleanup` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
           *
           * Được sử dụng tại:
           * - `src/services/codex-exec.runner.ts`
           */
          // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
          cleanup();
          /**
           * Hàm `resolve` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
           *
           * Được sử dụng tại:
           * - `src/services/codex-exec.runner.ts`
           * - `src/services/google-article-editorial.generator.ts`
           * - `src/services/translation.types.ts`
           * - `tests/crawlers/github-repos.crawler.test.ts`
           * - `tests/utils/reddit-dns.test.ts`
           */
          // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
          resolve(finalMessage);
          // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
          return;
        }

        /**
         * Hàm `cleanup` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
         *
         * Được sử dụng tại:
         * - `src/services/codex-exec.runner.ts`
         */
        // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
        cleanup();
        /**
         * Hàm `reject` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
         *
         * Được sử dụng tại:
         * - `src/services/codex-exec.runner.ts`
         * - `tests/services/source.service.test.ts`
         * - `tests/utils/reddit-dns.test.ts`
         */
        // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
        reject(new Error(`Codex translation failed with exit code ${code}: ${stderr.trim()}`));
      });

      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      child.stdin.end(input);
    });
  }
}
