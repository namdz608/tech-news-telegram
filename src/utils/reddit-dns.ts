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
 * - `src/crawlers/rss.crawler.ts:24`
 * - `src/crawlers/rss.crawler.ts:207`
 * - `src/utils/reddit-dns.ts:30`
 * - `tests/utils/reddit-dns.test.ts:4`
 * - `tests/utils/reddit-dns.test.ts:11`
 * - `tests/utils/reddit-dns.test.ts:19`
 * - `tests/utils/reddit-dns.test.ts:46`
 * - `tests/utils/reddit-dns.test.ts:59`
 * - `tests/utils/reddit-dns.test.ts:72`
 * - `tests/utils/reddit-dns.test.ts:86`
 * - `tests/utils/reddit-dns.test.ts:106`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
export function createRedditAwareLookup(baseLookup: LookupFunction = systemLookup): LookupFunction {
  /**
   * Hàm `return` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/app.ts:38`
   * - `src/crawlers/github-repos.crawler.ts:195`
   * - `src/crawlers/github-repos.crawler.ts:205`
   * - `src/crawlers/github-repos.crawler.ts:243`
   * - `src/crawlers/github-repos.crawler.ts:247`
   * - `src/crawlers/github-repos.crawler.ts:252`
   * - `src/crawlers/github-repos.crawler.ts:283`
   * - `src/crawlers/github-repos.crawler.ts:300`
   * - `src/crawlers/github-repos.crawler.ts:304`
   * - `src/crawlers/github-repos.crawler.ts:318`
   * - `src/crawlers/github-repos.crawler.ts:349`
   * - `src/crawlers/github-repos.crawler.ts:363`
   * - `src/crawlers/github-repos.crawler.ts:367`
   * - `src/crawlers/github-repos.crawler.ts:446`
   * - `src/crawlers/github-repos.crawler.ts:460`
   * - `src/crawlers/github-repos.crawler.ts:484`
   * - `src/crawlers/github-repos.crawler.ts:492`
   * - `src/crawlers/github-repos.crawler.ts:496`
   * - `src/crawlers/github-repos.crawler.ts:514`
   * - `src/crawlers/github-repos.crawler.ts:518`
   * - `src/crawlers/html.crawler.ts:203`
   * - `src/crawlers/html.crawler.ts:260`
   * - `src/crawlers/html.crawler.ts:289`
   * - `src/crawlers/html.crawler.ts:314`
   * - `src/crawlers/html.crawler.ts:322`
   * - `src/crawlers/html.crawler.ts:326`
   * - `src/crawlers/index.ts:26`
   * - `src/crawlers/rss.crawler.ts:300`
   * - `src/crawlers/rss.crawler.ts:334`
   * - `src/crawlers/rss.crawler.ts:348`
   * - `src/crawlers/rss.crawler.ts:357`
   * - `src/crawlers/rss.crawler.ts:373`
   * - `src/crawlers/rss.crawler.ts:377`
   * - `src/crawlers/rss.crawler.ts:410`
   * - `src/crawlers/rss.crawler.ts:424`
   * - `src/crawlers/rss.crawler.ts:430`
   * - `src/crawlers/rss.crawler.ts:480`
   * - `src/crawlers/rss.crawler.ts:494`
   * - `src/crawlers/rss.crawler.ts:498`
   * - `src/crawlers/rss.crawler.ts:512`
   * - `src/crawlers/rss.crawler.ts:539`
   * - `src/crawlers/rss.crawler.ts:558`
   * - `src/crawlers/rss.crawler.ts:564`
   * - `src/crawlers/rss.crawler.ts:568`
   * - `src/crawlers/rss.crawler.ts:572`
   * - `src/crawlers/rss.crawler.ts:587`
   * - `src/crawlers/rss.crawler.ts:620`
   * - `src/crawlers/rss.crawler.ts:628`
   * - `src/crawlers/rss.crawler.ts:632`
   * - `src/crawlers/x-search.crawler.ts:237`
   * - `src/crawlers/x-search.crawler.ts:438`
   * - `src/crawlers/x-search.crawler.ts:453`
   * - `src/crawlers/x-search.crawler.ts:492`
   * - `src/crawlers/x-search.crawler.ts:496`
   * - `src/crawlers/x-search.crawler.ts:527`
   * - `src/crawlers/x-search.crawler.ts:546`
   * - `src/crawlers/x-search.crawler.ts:550`
   * - `src/services/article-editorial.service.ts:101`
   * - `src/services/article-editorial.service.ts:125`
   * - `src/services/article-editorial.service.ts:142`
   * - `src/services/article-editorial.service.ts:158`
   * - `src/services/article-editorial.service.ts:164`
   * - `src/services/article-editorial.service.ts:170`
   * - `src/services/article-editorial.service.ts:174`
   * - `src/services/article-editorial.service.ts:188`
   * - `src/services/article-editorial.service.ts:234`
   * - `src/services/article-editorial.service.ts:250`
   * - `src/services/article-editorial.service.ts:262`
   * - `src/services/article.service.ts:50`
   * - `src/services/article.service.ts:86`
   * - `src/services/article.service.ts:132`
   * - `src/services/article.service.ts:138`
   * - `src/services/article.service.ts:145`
   * - `src/services/article.service.ts:159`
   * - `src/services/article.service.ts:163`
   * - `src/services/codex-article-editorial.generator.ts:71`
   * - `src/services/codex-exec.runner.ts:62`
   * - `src/services/codex-exec.runner.ts:226`
   * - `src/services/digest-message-editorial.service.ts:53`
   * - `src/services/digest.service.ts:198`
   * - `src/services/digest.service.ts:262`
   * - `src/services/digest.service.ts:292`
   * - `src/services/digest.service.ts:326`
   * - `src/services/digest.service.ts:379`
   * - `src/services/digest.service.ts:402`
   * - `src/services/digest.service.ts:440`
   * - `src/services/digest.service.ts:483`
   * - `src/services/digest.service.ts:508`
   * - `src/services/digest.service.ts:605`
   * - `src/services/digest.service.ts:644`
   * - `src/services/digest.service.ts:658`
   * - `src/services/digest.service.ts:670`
   * - `src/services/digest.service.ts:694`
   * - `src/services/digest.service.ts:702`
   * - `src/services/digest.service.ts:706`
   * - `src/services/digest.service.ts:725`
   * - `src/services/digest.service.ts:734`
   * - `src/services/digest.service.ts:738`
   * - `src/services/digest.service.ts:757`
   * - `src/services/digest.service.ts:761`
   * - `src/services/digest.service.ts:787`
   * - `src/services/digest.service.ts:799`
   * - `src/services/digest.service.ts:842`
   * - `src/services/google-article-editorial.generator.ts:113`
   * - `src/services/google-translation.service.ts:70`
   * - `src/services/google-translation.service.ts:86`
   * - `src/services/google-translation.service.ts:92`
   * - `src/services/google-translation.service.ts:137`
   * - `src/services/google-translation.service.ts:141`
   * - `src/services/google-translation.service.ts:156`
   * - `src/services/google-translation.service.ts:207`
   * - `src/services/openai-article-editorial.generator.ts:106`
   * - `src/services/source.service.ts:98`
   * - `src/services/source.service.ts:104`
   * - `src/services/source.service.ts:110`
   * - `src/services/source.service.ts:114`
   * - `src/services/source.service.ts:120`
   * - `src/services/source.service.ts:134`
   * - `src/services/source.service.ts:138`
   * - `src/services/source.service.ts:155`
   * - `src/services/source.service.ts:161`
   * - `src/services/telegram.service.ts:308`
   * - `src/services/telegram.service.ts:350`
   * - `src/services/telegram.service.ts:379`
   * - `src/services/telegram.service.ts:436`
   * - `src/services/telegram.service.ts:456`
   * - `src/services/telegram.service.ts:485`
   * - `src/services/telegram.service.ts:505`
   * - `src/services/telegram.service.ts:556`
   * - `src/services/telegram.service.ts:573`
   * - `src/services/telegram.service.ts:577`
   * - `src/services/telegram.service.ts:598`
   * - `src/services/telegram.service.ts:603`
   * - `src/services/telegram.service.ts:607`
   * - `src/services/translation.service.ts:23`
   * - `src/services/translation.service.ts:90`
   * - `src/services/translation.service.ts:101`
   * - `src/services/translation.service.ts:107`
   * - `src/services/translation.service.ts:158`
   * - `src/services/translation.service.ts:163`
   * - `src/services/translation.service.ts:192`
   * - `src/utils/normalize-url.ts:37`
   * - `src/utils/reddit-dns.ts:14`
   * - `src/utils/reddit-dns.ts:21`
   * - `src/utils/reddit-dns.ts:30`
   * - `src/utils/reddit-dns.ts:39`
   * - `src/utils/reddit-dns.ts:43`
   * - `src/utils/reddit-dns.ts:46`
   * - `src/utils/reddit-dns.ts:50`
   * - `src/utils/text.ts:2`
   * - `src/utils/text.ts:6`
   * - `src/utils/text.ts:17`
   * - `src/utils/text.ts:20`
   * - `src/utils/text.ts:24`
   * - `tests/config/env.test.ts:27`
   * - `tests/crawlers/github-repos.crawler.test.ts:6`
   * - `tests/crawlers/github-repos.crawler.test.ts:29`
   * - `tests/crawlers/github-repos.crawler.test.ts:49`
   * - `tests/crawlers/github-repos.crawler.test.ts:82`
   * - `tests/crawlers/rss.crawler.test.ts:229`
   * - `tests/crawlers/rss.crawler.test.ts:288`
   * - `tests/crawlers/rss.crawler.test.ts:342`
   * - `tests/crawlers/rss.crawler.test.ts:378`
   * - `tests/utils/reddit-dns.test.ts:40`
   * - `tests/utils/reddit-dns.test.ts:100`
   * - `tests/utils/reddit-dns.test.ts:113`
   * - `tests/utils/reddit-dns.test.ts:117`
   * - `tests/utils/reddit-dns.test.ts:126`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  return (hostname, options, callback) => {
    /**
     * Hàm `baseLookup` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - `src/utils/reddit-dns.ts:9`
     * - `src/utils/reddit-dns.ts:24`
     * - `src/utils/reddit-dns.ts:29`
     * - `src/utils/reddit-dns.ts:30`
     */
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    baseLookup(hostname, options, (error, address, family) => {
      // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
      if (!error) {
        /**
         * Hàm `callback` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
         *
         * Được sử dụng tại:
         * - `src/utils/reddit-dns.ts:10`
         * - `src/utils/reddit-dns.ts:20`
         * - `src/utils/reddit-dns.ts:24`
         * - `tests/utils/reddit-dns.test.ts:14`
         * - `tests/utils/reddit-dns.test.ts:16`
         * - `tests/utils/reddit-dns.test.ts:35`
         * - `tests/utils/reddit-dns.test.ts:39`
         * - `tests/utils/reddit-dns.test.ts:43`
         * - `tests/utils/reddit-dns.test.ts:54`
         * - `tests/utils/reddit-dns.test.ts:56`
         * - `tests/utils/reddit-dns.test.ts:67`
         * - `tests/utils/reddit-dns.test.ts:69`
         * - `tests/utils/reddit-dns.test.ts:80`
         * - `tests/utils/reddit-dns.test.ts:83`
         * - `tests/utils/reddit-dns.test.ts:97`
         * - `tests/utils/reddit-dns.test.ts:99`
         * - `tests/utils/reddit-dns.test.ts:103`
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
         * - `src/utils/reddit-dns.ts:10`
         * - `src/utils/reddit-dns.ts:13`
         * - `src/utils/reddit-dns.ts:24`
         * - `tests/utils/reddit-dns.test.ts:14`
         * - `tests/utils/reddit-dns.test.ts:16`
         * - `tests/utils/reddit-dns.test.ts:35`
         * - `tests/utils/reddit-dns.test.ts:39`
         * - `tests/utils/reddit-dns.test.ts:43`
         * - `tests/utils/reddit-dns.test.ts:54`
         * - `tests/utils/reddit-dns.test.ts:56`
         * - `tests/utils/reddit-dns.test.ts:67`
         * - `tests/utils/reddit-dns.test.ts:69`
         * - `tests/utils/reddit-dns.test.ts:80`
         * - `tests/utils/reddit-dns.test.ts:83`
         * - `tests/utils/reddit-dns.test.ts:97`
         * - `tests/utils/reddit-dns.test.ts:99`
         * - `tests/utils/reddit-dns.test.ts:103`
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
       * - `src/utils/reddit-dns.ts:9`
       * - `src/utils/reddit-dns.ts:11`
       * - `src/utils/reddit-dns.ts:29`
       * - `src/utils/reddit-dns.ts:30`
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
 * - `src/utils/reddit-dns.ts:33`
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
 * - `src/crawlers/rss.crawler.ts:24`
 * - `src/crawlers/rss.crawler.ts:222`
 * - `src/services/telegram.service.ts:14`
 * - `src/services/telegram.service.ts:276`
 * - `tests/crawlers/rss.crawler.test.ts:4`
 * - `tests/crawlers/rss.crawler.test.ts:25`
 * - `tests/services/telegram.service.test.ts:3`
 * - `tests/services/telegram.service.test.ts:21`
 */
// Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
export const redditHttpsAgent = createRedditHttpsAgent();

/**
 * Hàm `getRedditFallbackAlias` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/utils/reddit-dns.ts:17`
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
 * - `src/utils/reddit-dns.ts:38`
 * - `src/utils/reddit-dns.ts:42`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function isHostnameInFamily(hostname: string, root: string): boolean {
  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return hostname === root || hostname.endsWith(`.${root}`);
}
