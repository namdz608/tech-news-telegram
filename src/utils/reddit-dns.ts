/**
 * Cung cấp DNS lookup fallback cho các hostname Reddit khi resolver chính lỗi.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { lookup as nodeLookup } from 'node:dns';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { Agent } from 'node:https';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { LookupFunction } from 'node:net';

// Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
const redditFastlyAlias = 'reddit.map.fastly.net';
// Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
const redditDualstackFastlyAlias = 'dualstack.reddit.map.fastly.net';
// Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
const systemLookup = nodeLookup as LookupFunction;

/**
 * Hàm `createRedditAwareLookup` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/crawlers/rss.crawler.ts`
 * - `src/utils/reddit-dns.ts`
 * - `tests/utils/reddit-dns.test.ts`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
export function createRedditAwareLookup(baseLookup: LookupFunction = systemLookup): LookupFunction {
  /**
   * Hàm `return` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/app.ts`
   * - `src/crawlers/github-repos.crawler.ts`
   * - `src/crawlers/html.crawler.ts`
   * - `src/crawlers/index.ts`
   * - `src/crawlers/rss.crawler.ts`
   * - `src/crawlers/x-search.crawler.ts`
   * - `src/services/article-editorial.service.ts`
   * - `src/services/article.service.ts`
   * - `src/services/codex-article-editorial.generator.ts`
   * - `src/services/codex-exec.runner.ts`
   * - `src/services/digest-message-editorial.service.ts`
   * - `src/services/digest.service.ts`
   * - `src/services/google-article-editorial.generator.ts`
   * - `src/services/google-translation.service.ts`
   * - `src/services/openai-article-editorial.generator.ts`
   * - `src/services/source.service.ts`
   * - `src/services/telegram.service.ts`
   * - `src/services/translation.service.ts`
   * - `src/utils/normalize-url.ts`
   * - `src/utils/reddit-dns.ts`
   * - `src/utils/text.ts`
   * - `tests/config/env.test.ts`
   * - `tests/crawlers/github-repos.crawler.test.ts`
   * - `tests/crawlers/rss.crawler.test.ts`
   * - `tests/utils/reddit-dns.test.ts`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  return (hostname, options, callback) => {
    /**
     * Hàm `baseLookup` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - `src/utils/reddit-dns.ts`
     */
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    baseLookup(hostname, options, (error, address, family) => {
      // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
      if (!error) {
        /**
         * Hàm `callback` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
         *
         * Được sử dụng tại:
         * - `src/utils/reddit-dns.ts`
         * - `tests/utils/reddit-dns.test.ts`
         */
        // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
        callback(null, address, family);
        // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
        return;
      }

      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const fallbackAlias = error.code === 'ENOTFOUND' ? getRedditFallbackAlias(hostname) : undefined;

      // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
      if (!fallbackAlias) {
        /**
         * Hàm `callback` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
         *
         * Được sử dụng tại:
         * - `src/utils/reddit-dns.ts`
         * - `tests/utils/reddit-dns.test.ts`
         */
        // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
        callback(error, address, family);
        // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
        return;
      }

      /**
       * Hàm `baseLookup` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
       *
       * Được sử dụng tại:
       * - `src/utils/reddit-dns.ts`
       */
      // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
      baseLookup(fallbackAlias, options, callback);
    });
  };
}

/**
 * Hàm `createRedditHttpsAgent` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/utils/reddit-dns.ts`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
export function createRedditHttpsAgent(baseLookup: LookupFunction = systemLookup): Agent {
  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return new Agent({ lookup: createRedditAwareLookup(baseLookup) });
}

/**
 * Hàm `redditHttpsAgent` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/crawlers/rss.crawler.ts`
 * - `src/services/telegram.service.ts`
 * - `tests/crawlers/rss.crawler.test.ts`
 * - `tests/services/telegram.service.test.ts`
 */
// Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
export const redditHttpsAgent = createRedditHttpsAgent();

/**
 * Hàm `getRedditFallbackAlias` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/utils/reddit-dns.ts`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function getRedditFallbackAlias(hostname: string): string | undefined {
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const normalized = hostname.toLowerCase().replace(/\.$/, '');

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (isHostnameInFamily(normalized, 'reddit.com')) {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return redditFastlyAlias;
  }

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (isHostnameInFamily(normalized, 'redd.it') || isHostnameInFamily(normalized, 'redditstatic.com')) {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return redditDualstackFastlyAlias;
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return undefined;
}

/**
 * Hàm `isHostnameInFamily` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/utils/reddit-dns.ts`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function isHostnameInFamily(hostname: string, root: string): boolean {
  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return hostname === root || hostname.endsWith(`.${root}`);
}
