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
 * - `src/services/telegram.service.ts`
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
 * - `src/services/telegram.service.ts`
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
 * - `src/services/telegram.service.ts`
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
 * - `src/services/telegram.service.ts`
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
 * - `src/services/telegram.service.ts`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface TelegramClientLike {
  // Gán field cấu trúc để tạo object đúng contract.
  telegram: {
    /**
     * Hàm `sendMessage` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - `src/services/telegram.service.ts`
     * - `tests/services/telegram.service.test.ts`
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
 * - `src/crawlers/github-repos.crawler.ts`
 * - `src/crawlers/html.crawler.ts`
 * - `src/crawlers/rss.crawler.ts`
 * - `src/crawlers/x-search.crawler.ts`
 * - `src/services/telegram.service.ts`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface HttpClientLike {
  /**
   * Hàm `get` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/crawlers/github-repos.crawler.ts`
   * - `src/crawlers/html.crawler.ts`
   * - `src/crawlers/rss.crawler.ts`
   * - `src/crawlers/x-search.crawler.ts`
   * - `src/routes/health.routes.ts`
   * - `src/routes/news.routes.ts`
   * - `src/services/digest.service.ts`
   * - `src/services/google-translation.service.ts`
   * - `src/services/telegram.service.ts`
   * - `tests/crawlers/github-repos.crawler.test.ts`
   * - `tests/crawlers/html.crawler.test.ts`
   * - `tests/crawlers/rss.crawler.test.ts`
   * - `tests/crawlers/x-search.crawler.test.ts`
   * - `tests/routes/health.routes.test.ts`
   * - `tests/routes/news.routes.test.ts`
   * - `tests/services/google-translation.service.test.ts`
   * - `tests/services/telegram.service.test.ts`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  get(url: string, options: { responseType: 'arraybuffer' }): Promise<{ data: ArrayBuffer | Buffer }>;
}

/**
 * Class `TelegramService` đóng gói trách nhiệm chính của module.
 *
 * Được sử dụng tại:
 * - `src/controllers/telegram.controller.ts`
 * - `tests/services/telegram.service.test.ts`
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
   * - `src/controllers/telegram.controller.ts`
   * - `src/routes/telegram.routes.ts`
   * - `src/services/telegram.service.ts`
   * - `tests/services/telegram.service.test.ts`
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
   * - `src/controllers/telegram.controller.ts`
   * - `tests/services/telegram.service.test.ts`
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
   * - `src/services/telegram.service.ts`
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
   * - `src/services/telegram.service.ts`
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
   * - `src/services/telegram.service.ts`
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
 * - `src/services/telegram.service.ts`
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
 * - `src/crawlers/github-repos.crawler.ts`
 * - `src/services/telegram.service.ts`
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
 * - `src/services/telegram.service.ts`
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
