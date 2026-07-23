/**
 * Chia message, tải ảnh và gửi Telegram với các fallback ảnh/effect/text.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import axios from 'axios';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { Telegraf } from 'telegraf';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { env } from '../config/env';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { redditHttpsAgent } from '../utils/reddit-dns';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { DigestMessage } from './digest.service';

// Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
const triggerSeparator = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

/**
 * Interface `InlineKeyboardButton` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - `src/services/telegram.service.ts:19`
 * - `src/services/telegram.service.ts:28`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface InlineKeyboardButton {
  // Gán field cấu trúc để tạo object đúng contract.
  text: string;
  // Gán field cấu trúc để tạo object đúng contract.
  url: string;
}

/**
 * Interface `SendMessageOptions` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - `src/services/telegram.service.ts:39`
 * - `src/services/telegram.service.ts:117`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface SendMessageOptions {
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  parse_mode?: 'HTML' | 'MarkdownV2';
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  disable_web_page_preview?: boolean;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  message_effect_id?: string;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  reply_markup?: {
    // Gán field cấu trúc để tạo object đúng contract.
    inline_keyboard: InlineKeyboardButton[][];
  };
}

/**
 * Interface `SendPhotoOptions` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - `src/services/telegram.service.ts:40`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface SendPhotoOptions {
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  caption?: string;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  parse_mode?: 'HTML' | 'MarkdownV2';
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  message_effect_id?: string;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  reply_markup?: {
    // Gán field cấu trúc để tạo object đúng contract.
    inline_keyboard: InlineKeyboardButton[][];
  };
}

/**
 * Interface `TelegramPhotoUpload` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - `src/services/telegram.service.ts:40`
 * - `src/services/telegram.service.ts:158`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface TelegramPhotoUpload {
  // Gán field cấu trúc để tạo object đúng contract.
  source: Buffer;
  // Gán field cấu trúc để tạo object đúng contract.
  filename: string;
}

/**
 * Interface `TelegramClientLike` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - `src/services/telegram.service.ts:53`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface TelegramClientLike {
  // Gán field cấu trúc để tạo object đúng contract.
  telegram: {
    /**
     * Hàm `sendMessage` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - `src/services/telegram.service.ts:93`
     * - `src/services/telegram.service.ts:144`
     * - `src/services/telegram.service.ts:155`
     * - `tests/services/telegram.service.test.ts:25`
     * - `tests/services/telegram.service.test.ts:27`
     * - `tests/services/telegram.service.test.ts:39`
     * - `tests/services/telegram.service.test.ts:40`
     * - `tests/services/telegram.service.test.ts:48`
     * - `tests/services/telegram.service.test.ts:50`
     * - `tests/services/telegram.service.test.ts:61`
     * - `tests/services/telegram.service.test.ts:65`
     * - `tests/services/telegram.service.test.ts:69`
     * - `tests/services/telegram.service.test.ts:79`
     * - `tests/services/telegram.service.test.ts:86`
     * - `tests/services/telegram.service.test.ts:90`
     * - `tests/services/telegram.service.test.ts:100`
     * - `tests/services/telegram.service.test.ts:108`
     * - `tests/services/telegram.service.test.ts:115`
     * - `tests/services/telegram.service.test.ts:126`
     * - `tests/services/telegram.service.test.ts:127`
     * - `tests/services/telegram.service.test.ts:134`
     * - `tests/services/telegram.service.test.ts:138`
     * - `tests/services/telegram.service.test.ts:148`
     * - `tests/services/telegram.service.test.ts:158`
     * - `tests/services/telegram.service.test.ts:168`
     * - `tests/services/telegram.service.test.ts:196`
     * - `tests/services/telegram.service.test.ts:197`
     * - `tests/services/telegram.service.test.ts:204`
     * - `tests/services/telegram.service.test.ts:215`
     * - `tests/services/telegram.service.test.ts:240`
     * - `tests/services/telegram.service.test.ts:250`
     * - `tests/services/telegram.service.test.ts:260`
     * - `tests/services/telegram.service.test.ts:291`
     * - `tests/services/telegram.service.test.ts:292`
     * - `tests/services/telegram.service.test.ts:296`
     * - `tests/services/telegram.service.test.ts:306`
     * - `tests/services/telegram.service.test.ts:315`
     * - `tests/services/telegram.service.test.ts:340`
     * - `tests/services/telegram.service.test.ts:350`
     * - `tests/services/telegram.service.test.ts:354`
     * - `tests/services/telegram.service.test.ts:364`
     * - `tests/services/telegram.service.test.ts:365`
     */
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    sendMessage(chatId: string, message: string, options: SendMessageOptions): Promise<unknown>;
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    sendPhoto?(chatId: string, photo: string | TelegramPhotoUpload, options: SendPhotoOptions): Promise<unknown>;
  };
}

/**
 * Interface `HttpClientLike` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts:35`
 * - `src/crawlers/github-repos.crawler.ts:123`
 * - `src/crawlers/html.crawler.ts:41`
 * - `src/crawlers/html.crawler.ts:112`
 * - `src/crawlers/rss.crawler.ts:117`
 * - `src/crawlers/rss.crawler.ts:213`
 * - `src/crawlers/x-search.crawler.ts:37`
 * - `src/crawlers/x-search.crawler.ts:168`
 * - `src/services/telegram.service.ts:57`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface HttpClientLike {
  /**
   * Hàm `get` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/crawlers/github-repos.crawler.ts:37`
   * - `src/crawlers/github-repos.crawler.ts:224`
   * - `src/crawlers/html.crawler.ts:93`
   * - `src/crawlers/html.crawler.ts:179`
   * - `src/crawlers/rss.crawler.ts:169`
   * - `src/crawlers/rss.crawler.ts:371`
   * - `src/crawlers/x-search.crawler.ts:89`
   * - `src/crawlers/x-search.crawler.ts:241`
   * - `src/crawlers/x-search.crawler.ts:446`
   * - `src/routes/health.routes.ts:18`
   * - `src/routes/news.routes.ts:19`
   * - `src/routes/news.routes.ts:21`
   * - `src/services/digest.service.ts:222`
   * - `src/services/digest.service.ts:303`
   * - `src/services/digest.service.ts:779`
   * - `src/services/google-translation.service.ts:105`
   * - `src/services/telegram.service.ts:159`
   * - `tests/crawlers/github-repos.crawler.test.ts:27`
   * - `tests/crawlers/github-repos.crawler.test.ts:92`
   * - `tests/crawlers/github-repos.crawler.test.ts:93`
   * - `tests/crawlers/github-repos.crawler.test.ts:106`
   * - `tests/crawlers/github-repos.crawler.test.ts:138`
   * - `tests/crawlers/github-repos.crawler.test.ts:153`
   * - `tests/crawlers/github-repos.crawler.test.ts:169`
   * - `tests/crawlers/github-repos.crawler.test.ts:172`
   * - `tests/crawlers/html.crawler.test.ts:24`
   * - `tests/crawlers/html.crawler.test.ts:49`
   * - `tests/crawlers/rss.crawler.test.ts:179`
   * - `tests/crawlers/rss.crawler.test.ts:227`
   * - `tests/crawlers/rss.crawler.test.ts:286`
   * - `tests/crawlers/rss.crawler.test.ts:340`
   * - `tests/crawlers/rss.crawler.test.ts:376`
   * - `tests/crawlers/x-search.crawler.test.ts:18`
   * - `tests/crawlers/x-search.crawler.test.ts:53`
   * - `tests/crawlers/x-search.crawler.test.ts:91`
   * - `tests/crawlers/x-search.crawler.test.ts:97`
   * - `tests/routes/health.routes.test.ts:7`
   * - `tests/routes/news.routes.test.ts:7`
   * - `tests/services/google-translation.service.test.ts:7`
   * - `tests/services/google-translation.service.test.ts:18`
   * - `tests/services/telegram.service.test.ts:161`
   * - `tests/services/telegram.service.test.ts:188`
   * - `tests/services/telegram.service.test.ts:207`
   * - `tests/services/telegram.service.test.ts:253`
   * - `tests/services/telegram.service.test.ts:309`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  get(url: string, options: { responseType: 'arraybuffer' }): Promise<{ data: ArrayBuffer | Buffer }>;
}

/**
 * Class `TelegramService` đóng gói trách nhiệm chính của module.
 *
 * Được sử dụng tại:
 * - `src/controllers/telegram.controller.ts:12`
 * - `src/controllers/telegram.controller.ts:19`
 * - `tests/services/telegram.service.test.ts:2`
 * - `tests/services/telegram.service.test.ts:5`
 * - `tests/services/telegram.service.test.ts:18`
 * - `tests/services/telegram.service.test.ts:26`
 * - `tests/services/telegram.service.test.ts:49`
 * - `tests/services/telegram.service.test.ts:66`
 * - `tests/services/telegram.service.test.ts:87`
 * - `tests/services/telegram.service.test.ts:112`
 * - `tests/services/telegram.service.test.ts:135`
 * - `tests/services/telegram.service.test.ts:165`
 * - `tests/services/telegram.service.test.ts:212`
 * - `tests/services/telegram.service.test.ts:257`
 * - `tests/services/telegram.service.test.ts:312`
 * - `tests/services/telegram.service.test.ts:351`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
export class TelegramService {
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  private effectSupported: boolean;
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  private readonly photoCaptionMaxLength = 1000;

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  constructor(
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    private readonly bot: TelegramClientLike = new Telegraf(env.TELEGRAM_BOT_TOKEN) as unknown as TelegramClientLike,
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    private readonly chatId = env.TELEGRAM_CHAT_ID,
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    private readonly maxMessageLength = 3900,
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    private readonly messageEffectId = env.TELEGRAM_MESSAGE_EFFECT_ID,
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    private readonly http: HttpClientLike = axios.create({
      // Gán field cấu trúc để tạo object đúng contract.
      timeout: env.REQUEST_TIMEOUT_MS,
      // Gán field cấu trúc để tạo object đúng contract.
      headers: {
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        'User-Agent': env.USER_AGENT,
      },
      // Gán field cấu trúc để tạo object đúng contract.
      httpsAgent: redditHttpsAgent,
    }),
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  ) {
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    this.effectSupported = Boolean(messageEffectId);
  }

  /**
   * Hàm `sendDigest` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/controllers/telegram.controller.ts:29`
   * - `src/routes/telegram.routes.ts:8`
   * - `src/routes/telegram.routes.ts:18`
   * - `src/services/telegram.service.ts:71`
   * - `src/services/telegram.service.ts:99`
   * - `tests/services/telegram.service.test.ts:77`
   * - `tests/services/telegram.service.test.ts:98`
   * - `tests/services/telegram.service.test.ts:123`
   * - `tests/services/telegram.service.test.ts:124`
   * - `tests/services/telegram.service.test.ts:362`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  async sendDigest(message: string, url?: string, imageUrl?: string): Promise<void> {
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (imageUrl && message.length > this.photoCaptionMaxLength) {
      // Chờ side effect bất đồng bộ hoàn tất trước khi tiếp tục.
      await this.sendPhotoOnly(imageUrl);
      // Chờ side effect bất đồng bộ hoàn tất trước khi tiếp tục.
      await this.sendDigest(message, url);
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return;
    }

    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const chunks = splitTelegramMessage(
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      message,
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      imageUrl ? Math.min(this.maxMessageLength, this.photoCaptionMaxLength) : this.maxMessageLength,
    );

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    for (let index = 0; index < chunks.length; index += 1) {
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const isLastChunk = index === chunks.length - 1;
      // Chờ side effect bất đồng bộ hoàn tất trước khi tiếp tục.
      await this.sendChunk(chunks[index], isLastChunk ? url : undefined, isLastChunk ? imageUrl : undefined);
    }
  }

  /**
   * Hàm `sendMessages` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/controllers/telegram.controller.ts:37`
   * - `tests/services/telegram.service.test.ts:37`
   * - `tests/services/telegram.service.test.ts:56`
   * - `tests/services/telegram.service.test.ts:57`
   * - `tests/services/telegram.service.test.ts:146`
   * - `tests/services/telegram.service.test.ts:178`
   * - `tests/services/telegram.service.test.ts:226`
   * - `tests/services/telegram.service.test.ts:280`
   * - `tests/services/telegram.service.test.ts:326`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  async sendMessages(messages: DigestMessage[]): Promise<void> {
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const validMessages = messages.filter((message) => message.text.trim());

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (validMessages.length === 0) {
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return;
    }

    // Chờ side effect bất đồng bộ hoàn tất trước khi tiếp tục.
    await this.bot.telegram.sendMessage(this.chatId, triggerSeparator, {
      // Gán field cấu trúc để tạo object đúng contract.
      parse_mode: 'HTML',
      // Gán field cấu trúc để tạo object đúng contract.
      disable_web_page_preview: true,
    });

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    for (const message of validMessages) {
      // Chờ side effect bất đồng bộ hoàn tất trước khi tiếp tục.
      await this.sendDigest(message.text, message.url, message.imageUrl);
    }
  }

  /**
   * Hàm `sendPhotoOnly` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/services/telegram.service.ts:70`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  private async sendPhotoOnly(imageUrl: string): Promise<void> {
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (!this.bot.telegram.sendPhoto) {
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return;
    }

    // Bắt đầu thao tác có thể lỗi để bảo vệ toàn bộ pipeline.
    try {
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const photo = await this.downloadPhoto(imageUrl);
      // Chờ side effect bất đồng bộ hoàn tất trước khi tiếp tục.
      await this.bot.telegram.sendPhoto(this.chatId, photo, {});
    // Thu lỗi từ thao tác trước và chuyển sang fallback an toàn.
    } catch (error) {
      // Ghi thông tin chẩn đoán mà không thay đổi dữ liệu nghiệp vụ.
      console.warn(`Failed to send Telegram photo, sending text only: ${formatErrorMessage(error)}`);
    }
  }

  /**
   * Hàm `sendChunk` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/services/telegram.service.ts:82`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  private async sendChunk(chunk: string, url?: string, imageUrl?: string): Promise<void> {
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const baseOptions: SendMessageOptions = {
      // Gán field cấu trúc để tạo object đúng contract.
      parse_mode: 'HTML',
      // Gán field cấu trúc để tạo object đúng contract.
      disable_web_page_preview: true,
    };

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (url) {
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      baseOptions.reply_markup = {
        // Gán field cấu trúc để tạo object đúng contract.
        inline_keyboard: [[{ text: '🔎 Xem bài gốc', url }]],
      };
    }

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (imageUrl && this.bot.telegram.sendPhoto) {
      // Bắt đầu thao tác có thể lỗi để bảo vệ toàn bộ pipeline.
      try {
        // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
        const { disable_web_page_preview: _disablePreview, ...photoOptions } = baseOptions;
        // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
        const photo = await this.downloadPhoto(imageUrl);
        // Chờ side effect bất đồng bộ hoàn tất trước khi tiếp tục.
        await this.bot.telegram.sendPhoto(this.chatId, photo, {
          // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
          ...photoOptions,
          // Gán field cấu trúc để tạo object đúng contract.
          caption: chunk,
        });
        // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
        return;
      // Thu lỗi từ thao tác trước và chuyển sang fallback an toàn.
      } catch (error) {
        // Ghi thông tin chẩn đoán mà không thay đổi dữ liệu nghiệp vụ.
        console.warn(`Failed to send Telegram photo, falling back to text: ${formatErrorMessage(error)}`);
      }
    }

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (this.effectSupported) {
      // Bắt đầu thao tác có thể lỗi để bảo vệ toàn bộ pipeline.
      try {
        // Chờ side effect bất đồng bộ hoàn tất trước khi tiếp tục.
        await this.bot.telegram.sendMessage(this.chatId, chunk, {
          // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
          ...baseOptions,
          // Gán field cấu trúc để tạo object đúng contract.
          message_effect_id: this.messageEffectId,
        });
        // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
        return;
      // Thu lỗi từ thao tác trước và chuyển sang fallback an toàn.
      } catch (error) {
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        this.effectSupported = false;
        // Ghi thông tin chẩn đoán mà không thay đổi dữ liệu nghiệp vụ.
        console.warn('Message effect not supported for this chat, falling back to plain send', error);
      }
    }

    // Chờ side effect bất đồng bộ hoàn tất trước khi tiếp tục.
    await this.bot.telegram.sendMessage(this.chatId, chunk, baseOptions);
  }

  /**
   * Hàm `downloadPhoto` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/services/telegram.service.ts:109`
   * - `src/services/telegram.service.ts:131`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  private async downloadPhoto(imageUrl: string): Promise<TelegramPhotoUpload> {
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const response = await this.http.get(imageUrl, { responseType: 'arraybuffer' });
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const data = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);

    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return {
      // Gán field cấu trúc để tạo object đúng contract.
      source: data,
      // Gán field cấu trúc để tạo object đúng contract.
      filename: getImageFilename(imageUrl),
    };
  }
}

/**
 * Hàm `splitTelegramMessage` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/telegram.service.ts:75`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function splitTelegramMessage(message: string, maxLength: number): string[] {
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (message.length <= maxLength) {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return [message];
  }

  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const chunks: string[] = [];
  // Khởi tạo trạng thái cục bộ sẽ được cập nhật có kiểm soát.
  let current = '';

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  for (const line of message.split('\n')) {
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const candidate = current ? `${current}\n${line}` : line;

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (candidate.length <= maxLength) {
      // Cập nhật trạng thái cục bộ từ kết quả vừa tính.
      current = candidate;
      // Điều khiển vòng lặp sau khi nhánh hiện tại đã xử lý xong.
      continue;
    }

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (current) {
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      chunks.push(current);
      // Cập nhật trạng thái cục bộ từ kết quả vừa tính.
      current = '';
    }

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (line.length <= maxLength) {
      // Cập nhật trạng thái cục bộ từ kết quả vừa tính.
      current = line;
      // Điều khiển vòng lặp sau khi nhánh hiện tại đã xử lý xong.
      continue;
    }

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    for (let index = 0; index < line.length; index += maxLength) {
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      chunks.push(line.slice(index, index + maxLength));
    }
  }

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (current) {
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    chunks.push(current);
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return chunks;
}

/**
 * Hàm `formatErrorMessage` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts:203`
 * - `src/crawlers/github-repos.crawler.ts:510`
 * - `src/services/telegram.service.ts:112`
 * - `src/services/telegram.service.ts:138`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function formatErrorMessage(error: unknown): string {
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (error instanceof Error) {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return error.message;
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return 'unknown error';
}

/**
 * Hàm `getImageFilename` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/telegram.service.ts:164`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function getImageFilename(imageUrl: string): string {
  // Bắt đầu thao tác có thể lỗi để bảo vệ toàn bộ pipeline.
  try {
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const pathname = new URL(imageUrl).pathname;
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const filename = pathname.split('/').filter(Boolean).pop();

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (filename && /\.[a-z0-9]{2,5}$/i.test(filename)) {
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return filename;
    }
  // Thu lỗi từ thao tác trước và chuyển sang fallback an toàn.
  } catch {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return 'photo.jpg';
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return 'photo.jpg';
}
