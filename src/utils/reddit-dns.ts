/**
 * Cung cấp DNS lookup fallback cho các hostname Reddit khi resolver chính lỗi.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp { lookup as nodeLookup } từ `node:dns` để dùng đúng dependency/type thay vì tự triển khai lại.
import { lookup as nodeLookup } from 'node:dns';
// Nạp { Agent } từ `node:https` để dùng đúng dependency/type thay vì tự triển khai lại.
import { Agent } from 'node:https';
// Nạp { LookupFunction } từ `node:net` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { LookupFunction } from 'node:net';

// Tính `redditFastlyAlias` từ `'reddit.map.fastly.net';` và giữ bất biến trong phạm vi hiện tại.
const redditFastlyAlias = 'reddit.map.fastly.net';
// Tính `redditDualstackFastlyAlias` từ `'dualstack.reddit.map.fastly.net';` và giữ bất biến trong phạm vi hiện tại.
const redditDualstackFastlyAlias = 'dualstack.reddit.map.fastly.net';
// Tính `systemLookup` từ `nodeLookup as LookupFunction;` và giữ bất biến trong phạm vi hiện tại.
const systemLookup = nodeLookup as LookupFunction;

/**
 * Hàm `createRedditAwareLookup` tạo cấu trúc đầu ra từ cấu hình/dữ liệu đầu vào; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/crawlers/rss.crawler.ts`
 * - `src/utils/reddit-dns.ts`
 * - `tests/utils/reddit-dns.test.ts`
 */
// Mở thân hàm `createRedditAwareLookup` với input/output được TypeScript kiểm tra.
export function createRedditAwareLookup(baseLookup: LookupFunction = systemLookup): LookupFunction {
  // Trả `(hostname, options, callback) => {` cho caller và kết thúc nhánh hiện tại.
  return (hostname, options, callback) => {
    // Tạo callback nhận `baseLookup(hostname, options, (error, address, family)` để xử lý từng kết quả trong collection/promise.
    baseLookup(hostname, options, (error, address, family) => {
      // Nếu `!error` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
      if (!error) {
        // Gọi `callback` với `null, address, family` để hoàn tất side effect/bước xử lý hiện tại.
        callback(null, address, family);
        // Trả quyền điều khiển cho caller và kết thúc nhánh hiện tại.
        return;
      }

      // Tính `fallbackAlias` từ `error.code === 'ENOTFOUND' ? getRedditFallbackAlias(hostname) : undefined;` và giữ bất biến trong phạm vi hiện tại.
      const fallbackAlias = error.code === 'ENOTFOUND' ? getRedditFallbackAlias(hostname) : undefined;

      // Nếu `!fallbackAlias` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
      if (!fallbackAlias) {
        // Gọi `callback` với `error, address, family` để hoàn tất side effect/bước xử lý hiện tại.
        callback(error, address, family);
        // Trả quyền điều khiển cho caller và kết thúc nhánh hiện tại.
        return;
      }

      // Gọi `baseLookup` với `fallbackAlias, options, callback` để hoàn tất side effect/bước xử lý hiện tại.
      baseLookup(fallbackAlias, options, callback);
    });
  };
}

/**
 * Hàm `createRedditHttpsAgent` tạo cấu trúc đầu ra từ cấu hình/dữ liệu đầu vào; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/utils/reddit-dns.ts`
 */
// Mở thân hàm `createRedditHttpsAgent` với input/output được TypeScript kiểm tra.
export function createRedditHttpsAgent(baseLookup: LookupFunction = systemLookup): Agent {
  // Trả `new Agent({ lookup: createRedditAwareLookup(baseLookup) });` cho caller và kết thúc nhánh hiện tại.
  return new Agent({ lookup: createRedditAwareLookup(baseLookup) });
}

/**
 * Hằng `redditHttpsAgent` lưu reddit https agent để các consumer dùng chung một nguồn dữ liệu.
 *
 * Được sử dụng tại:
 * - `src/crawlers/rss.crawler.ts`
 * - `src/services/telegram.service.ts`
 * - `tests/crawlers/rss.crawler.test.ts`
 * - `tests/services/telegram.service.test.ts`
 */
// Tính `redditHttpsAgent` từ `createRedditHttpsAgent();` và giữ bất biến trong phạm vi hiện tại.
export const redditHttpsAgent = createRedditHttpsAgent();

/**
 * Hàm `getRedditFallbackAlias` lấy giá trị dẫn xuất an toàn; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/utils/reddit-dns.ts`
 */
// Mở thân hàm `getRedditFallbackAlias` với input/output được TypeScript kiểm tra.
function getRedditFallbackAlias(hostname: string): string | undefined {
  // Tính `normalized` từ `hostname.toLowerCase().replace(/\.$/, '');` và giữ bất biến trong phạm vi hiện tại.
  const normalized = hostname.toLowerCase().replace(/\.$/, '');

  // Nếu `isHostnameInFamily(normalized, 'reddit.com')` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (isHostnameInFamily(normalized, 'reddit.com')) {
    // Trả `redditFastlyAlias;` cho caller và kết thúc nhánh hiện tại.
    return redditFastlyAlias;
  }

  // Nếu `isHostnameInFamily(normalized, 'redd.it') || isHostnameInFamily(normalized, 'redditstat…` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (isHostnameInFamily(normalized, 'redd.it') || isHostnameInFamily(normalized, 'redditstatic.com')) {
    // Trả `redditDualstackFastlyAlias;` cho caller và kết thúc nhánh hiện tại.
    return redditDualstackFastlyAlias;
  }

  // Trả `undefined;` cho caller và kết thúc nhánh hiện tại.
  return undefined;
}

/**
 * Hàm `isHostnameInFamily` kiểm tra điều kiện và trả boolean; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/utils/reddit-dns.ts`
 */
// Mở thân hàm `isHostnameInFamily` với input/output được TypeScript kiểm tra.
function isHostnameInFamily(hostname: string, root: string): boolean {
  // Trả `hostname === root || hostname.endsWith(`.${root}`);` cho caller và kết thúc nhánh hiện tại.
  return hostname === root || hostname.endsWith(`.${root}`);
}
