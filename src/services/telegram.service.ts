/**
 * Chia message, tải ảnh và gửi Telegram với các fallback ảnh/effect/text.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp axios từ `axios` để dùng đúng dependency/type thay vì tự triển khai lại.
import axios from 'axios';
// Nạp { Telegraf } từ `telegraf` để dùng đúng dependency/type thay vì tự triển khai lại.
import { Telegraf } from 'telegraf';
// Nạp { env } từ `../config/env` để dùng đúng dependency/type thay vì tự triển khai lại.
import { env } from '../config/env';
// Nạp { redditHttpsAgent } từ `../utils/reddit-dns` để dùng đúng dependency/type thay vì tự triển khai lại.
import { redditHttpsAgent } from '../utils/reddit-dns';
// Nạp { DigestMessage } từ `./digest.service` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { DigestMessage } from './digest.service';

// Tính `triggerSeparator` từ `'━━━━━━━━━━━━━━━━━━━━━━━━━━━━';` và giữ bất biến trong phạm vi hiện tại.
const triggerSeparator = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

/**
 * Interface `InlineKeyboardButton` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/services/telegram.service.ts`
 */
// Mở khai báo `interface InlineKeyboardButton` để compiler kiểm tra contract cho mọi consumer.
interface InlineKeyboardButton {
  // Gán field `text` từ `string;` để object khớp contract.
  text: string;
  // Gán field `url` từ `string;` để object khớp contract.
  url: string;
}

/**
 * Interface `SendMessageOptions` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/services/telegram.service.ts`
 */
// Mở khai báo `interface SendMessageOptions` để compiler kiểm tra contract cho mọi consumer.
interface SendMessageOptions {
  // Gán field `parse_mode?` từ `'HTML' | 'MarkdownV2';` để object khớp contract.
  parse_mode?: 'HTML' | 'MarkdownV2';
  // Gán field `disable_web_page_preview?` từ `boolean;` để object khớp contract.
  disable_web_page_preview?: boolean;
  // Gán field `message_effect_id?` từ `string;` để object khớp contract.
  message_effect_id?: string;
  // Gán field `reply_markup?` từ `{` để object khớp contract.
  reply_markup?: {
    // Gán field `inline_keyboard` từ `InlineKeyboardButton[][];` để object khớp contract.
    inline_keyboard: InlineKeyboardButton[][];
  };
}

/**
 * Interface `SendPhotoOptions` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/services/telegram.service.ts`
 */
// Mở khai báo `interface SendPhotoOptions` để compiler kiểm tra contract cho mọi consumer.
interface SendPhotoOptions {
  // Gán field `caption?` từ `string;` để object khớp contract.
  caption?: string;
  // Gán field `parse_mode?` từ `'HTML' | 'MarkdownV2';` để object khớp contract.
  parse_mode?: 'HTML' | 'MarkdownV2';
  // Gán field `message_effect_id?` từ `string;` để object khớp contract.
  message_effect_id?: string;
  // Gán field `reply_markup?` từ `{` để object khớp contract.
  reply_markup?: {
    // Gán field `inline_keyboard` từ `InlineKeyboardButton[][];` để object khớp contract.
    inline_keyboard: InlineKeyboardButton[][];
  };
}

/**
 * Interface `TelegramPhotoUpload` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/services/telegram.service.ts`
 */
// Mở khai báo `interface TelegramPhotoUpload` để compiler kiểm tra contract cho mọi consumer.
interface TelegramPhotoUpload {
  // Gán field `source` từ `Buffer;` để object khớp contract.
  source: Buffer;
  // Gán field `filename` từ `string;` để object khớp contract.
  filename: string;
}

/**
 * Interface `TelegramClientLike` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/services/telegram.service.ts`
 */
// Mở khai báo `interface TelegramClientLike` để compiler kiểm tra contract cho mọi consumer.
interface TelegramClientLike {
  // Gán field `telegram` từ `{` để object khớp contract.
  telegram: {
    // Gán field `sendMessage(chatId` từ `string, message: string, options: SendMessageOptions): Promise<unknown>;` để object khớp contract.
    sendMessage(chatId: string, message: string, options: SendMessageOptions): Promise<unknown>;
    // Gán field `sendPhoto?(chatId` từ `string, photo: string | TelegramPhotoUpload, options: SendPhotoOptions): Promise<unknown>;` để object khớp contract.
    sendPhoto?(chatId: string, photo: string | TelegramPhotoUpload, options: SendPhotoOptions): Promise<unknown>;
  };
}

/**
 * Interface `HttpClientLike` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/services/telegram.service.ts`
 */
// Mở khai báo `interface HttpClientLike` để compiler kiểm tra contract cho mọi consumer.
interface HttpClientLike {
  // Gán field `get(url` từ `string, options: { responseType: 'arraybuffer' }): Promise<{ data: ArrayBuffer | Buffer…` để object khớp contract.
  get(url: string, options: { responseType: 'arraybuffer' }): Promise<{ data: ArrayBuffer | Buffer }>;
}

/**
 * Class `TelegramService` sở hữu vòng đời dependency và điều phối các bước telegram service.
 *
 * Được sử dụng tại:
 * - `src/controllers/telegram.controller.ts`
 * - `tests/services/telegram.service.test.ts`
 */
// Mở khai báo `export class TelegramService` để compiler kiểm tra contract cho mọi consumer.
export class TelegramService {
  // Gán field `private effectSupported` từ `boolean;` để object khớp contract.
  private effectSupported: boolean;
  private readonly photoCaptionMaxLength = 1000;

  constructor(
    // Gán field `private readonly bot` từ `TelegramClientLike = new Telegraf(env.TELEGRAM_BOT_TOKEN) as unknown as TelegramClientL…` để object khớp contract.
    private readonly bot: TelegramClientLike = new Telegraf(env.TELEGRAM_BOT_TOKEN) as unknown as TelegramClientLike,
    private readonly chatId = env.TELEGRAM_CHAT_ID,
    private readonly maxMessageLength = 3900,
    private readonly messageEffectId = env.TELEGRAM_MESSAGE_EFFECT_ID,
    // Gán field `private readonly http` từ `HttpClientLike = axios.create({` để object khớp contract.
    private readonly http: HttpClientLike = axios.create({
      // Gán field `timeout` từ `env.REQUEST_TIMEOUT_MS,` để object khớp contract.
      timeout: env.REQUEST_TIMEOUT_MS,
      // Gán field `headers` từ `{` để object khớp contract.
      headers: {
        // Gán field `User-Agent` từ `env.USER_AGENT,` để object khớp contract.
        'User-Agent': env.USER_AGENT,
      },
      // Gán field `httpsAgent` từ `redditHttpsAgent,` để object khớp contract.
      httpsAgent: redditHttpsAgent,
    }),
  ) {
    // Cập nhật `this.effectSupported` bằng `Boolean(messageEffectId);` cho bước kế tiếp.
    this.effectSupported = Boolean(messageEffectId);
  }

  /**
   * Hàm `sendDigest` gửi dữ liệu ra Telegram theo đúng thứ tự; kết quả được trả cho caller theo kiểu khai báo.
   *
   * Được sử dụng tại:
   * - `src/services/telegram.service.ts`
   * - `tests/services/telegram.service.test.ts`
   */
  // Mở method `sendDigest` để gửi dữ liệu ra Telegram theo đúng thứ tự.
  async sendDigest(message: string, url?: string, imageUrl?: string): Promise<void> {
    // Nếu `imageUrl && message.length > this.photoCaptionMaxLength` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (imageUrl && message.length > this.photoCaptionMaxLength) {
      // Chờ `this.sendPhotoOnly(imageUrl);` hoàn tất để giữ đúng thứ tự side effect.
      await this.sendPhotoOnly(imageUrl);
      // Chờ `this.sendDigest(message, url);` hoàn tất để giữ đúng thứ tự side effect.
      await this.sendDigest(message, url);
      // Trả quyền điều khiển cho caller và kết thúc nhánh hiện tại.
      return;
    }

    // Tính `chunks` từ `splitTelegramMessage(` và giữ bất biến trong phạm vi hiện tại.
    const chunks = splitTelegramMessage(
      // Đưa giá trị `message` vào field cùng tên của object đang tạo.
      message,
      // Gán field `imageUrl ? Math.min(this.maxMessageLength, this.photoCaptionMaxLength) ` từ `this.maxMessageLength,` để object khớp contract.
      imageUrl ? Math.min(this.maxMessageLength, this.photoCaptionMaxLength) : this.maxMessageLength,
    );

    // Lặp theo `let index = 0; index < chunks.length; index += 1` để xử lý đủ từng phần tử/trạng thái.
    for (let index = 0; index < chunks.length; index += 1) {
      // Tính `isLastChunk` từ `index === chunks.length - 1;` và giữ bất biến trong phạm vi hiện tại.
      const isLastChunk = index === chunks.length - 1;
      // Chờ `this.sendChunk(chunks[index], isLastChunk ? url : undefined, isLastChunk ? imageUrl : u…` hoàn tất để giữ đúng thứ tự side effect.
      await this.sendChunk(chunks[index], isLastChunk ? url : undefined, isLastChunk ? imageUrl : undefined);
    }
  }

  /**
   * Hàm `sendMessages` gửi dữ liệu ra Telegram theo đúng thứ tự; kết quả được trả cho caller theo kiểu khai báo.
   *
   * Được sử dụng tại:
   * - `tests/services/telegram.service.test.ts`
   * - `src/controllers/telegram.controller.ts`
   */
  // Mở method `sendMessages` để gửi dữ liệu ra Telegram theo đúng thứ tự.
  async sendMessages(messages: DigestMessage[]): Promise<void> {
    // Tính `validMessages` từ `messages.filter((message) => message.text.trim());` và giữ bất biến trong phạm vi hiện tại.
    const validMessages = messages.filter((message) => message.text.trim());

    // Nếu `validMessages.length === 0` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (validMessages.length === 0) {
      // Trả quyền điều khiển cho caller và kết thúc nhánh hiện tại.
      return;
    }

    // Chờ `this.bot.telegram.sendMessage(this.chatId, triggerSeparator, {` hoàn tất để giữ đúng thứ tự side effect.
    await this.bot.telegram.sendMessage(this.chatId, triggerSeparator, {
      // Gán field `parse_mode` từ `'HTML',` để object khớp contract.
      parse_mode: 'HTML',
      // Gán field `disable_web_page_preview` từ `true,` để object khớp contract.
      disable_web_page_preview: true,
    });

    // Lặp theo `const message of validMessages` để xử lý đủ từng phần tử/trạng thái.
    for (const message of validMessages) {
      // Chờ `this.sendDigest(message.text, message.url, message.imageUrl);` hoàn tất để giữ đúng thứ tự side effect.
      await this.sendDigest(message.text, message.url, message.imageUrl);
    }
  }

  /**
   * Hàm `sendPhotoOnly` gửi dữ liệu ra Telegram theo đúng thứ tự; kết quả được trả cho caller theo kiểu khai báo.
   *
   * Được sử dụng tại:
   * - `src/services/telegram.service.ts`
   */
  // Mở method `sendPhotoOnly` để gửi dữ liệu ra Telegram theo đúng thứ tự.
  private async sendPhotoOnly(imageUrl: string): Promise<void> {
    // Nếu `!this.bot.telegram.sendPhoto` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (!this.bot.telegram.sendPhoto) {
      // Trả quyền điều khiển cho caller và kết thúc nhánh hiện tại.
      return;
    }

    // Cô lập thao tác có thể lỗi để module còn cơ hội log và trả fallback an toàn.
    try {
      // Tính `photo` từ `await this.downloadPhoto(imageUrl);` và giữ bất biến trong phạm vi hiện tại.
      const photo = await this.downloadPhoto(imageUrl);
      // Chờ `this.bot.telegram.sendPhoto(this.chatId, photo, {});` hoàn tất để giữ đúng thứ tự side effect.
      await this.bot.telegram.sendPhoto(this.chatId, photo, {});
    // Bắt lỗi từ khối try, không để một dependency ngoài làm hỏng toàn bộ đợt xử lý.
    } catch (error) {
      // Ghi sự kiện `console.warn(`Failed to send Telegram photo, sending text only: ${formatErrorMessage(er…` phục vụ chẩn đoán mà không đổi kết quả nghiệp vụ.
      console.warn(`Failed to send Telegram photo, sending text only: ${formatErrorMessage(error)}`);
    }
  }

  /**
   * Hàm `sendChunk` gửi dữ liệu ra Telegram theo đúng thứ tự; kết quả được trả cho caller theo kiểu khai báo.
   *
   * Được sử dụng tại:
   * - `src/services/telegram.service.ts`
   */
  // Mở method `sendChunk` để gửi dữ liệu ra Telegram theo đúng thứ tự.
  private async sendChunk(chunk: string, url?: string, imageUrl?: string): Promise<void> {
    // Gán field `const baseOptions` từ `SendMessageOptions = {` để object khớp contract.
    const baseOptions: SendMessageOptions = {
      // Gán field `parse_mode` từ `'HTML',` để object khớp contract.
      parse_mode: 'HTML',
      // Gán field `disable_web_page_preview` từ `true,` để object khớp contract.
      disable_web_page_preview: true,
    };

    // Nếu `url` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (url) {
      // Cập nhật `baseOptions.reply_markup` bằng `{` cho bước kế tiếp.
      baseOptions.reply_markup = {
        // Gán field `inline_keyboard` từ `[[{ text: '🔎 Xem bài gốc', url }]],` để object khớp contract.
        inline_keyboard: [[{ text: '🔎 Xem bài gốc', url }]],
      };
    }

    // Nếu `imageUrl && this.bot.telegram.sendPhoto` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (imageUrl && this.bot.telegram.sendPhoto) {
      // Cô lập thao tác có thể lỗi để module còn cơ hội log và trả fallback an toàn.
      try {
        // Gán field `const { disable_web_page_preview` từ `_disablePreview, ...photoOptions } = baseOptions;` để object khớp contract.
        const { disable_web_page_preview: _disablePreview, ...photoOptions } = baseOptions;
        // Tính `photo` từ `await this.downloadPhoto(imageUrl);` và giữ bất biến trong phạm vi hiện tại.
        const photo = await this.downloadPhoto(imageUrl);
        // Chờ `this.bot.telegram.sendPhoto(this.chatId, photo, {` hoàn tất để giữ đúng thứ tự side effect.
        await this.bot.telegram.sendPhoto(this.chatId, photo, {
          ...photoOptions,
          // Gán field `caption` từ `chunk,` để object khớp contract.
          caption: chunk,
        });
        // Trả quyền điều khiển cho caller và kết thúc nhánh hiện tại.
        return;
      // Bắt lỗi từ khối try, không để một dependency ngoài làm hỏng toàn bộ đợt xử lý.
      } catch (error) {
        // Ghi sự kiện `console.warn(`Failed to send Telegram photo, falling back to text: ${formatErrorMessage…` phục vụ chẩn đoán mà không đổi kết quả nghiệp vụ.
        console.warn(`Failed to send Telegram photo, falling back to text: ${formatErrorMessage(error)}`);
      }
    }

    // Nếu `this.effectSupported` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (this.effectSupported) {
      // Cô lập thao tác có thể lỗi để module còn cơ hội log và trả fallback an toàn.
      try {
        // Chờ `this.bot.telegram.sendMessage(this.chatId, chunk, {` hoàn tất để giữ đúng thứ tự side effect.
        await this.bot.telegram.sendMessage(this.chatId, chunk, {
          ...baseOptions,
          // Gán field `message_effect_id` từ `this.messageEffectId,` để object khớp contract.
          message_effect_id: this.messageEffectId,
        });
        // Trả quyền điều khiển cho caller và kết thúc nhánh hiện tại.
        return;
      // Bắt lỗi từ khối try, không để một dependency ngoài làm hỏng toàn bộ đợt xử lý.
      } catch (error) {
        // Cập nhật `this.effectSupported` bằng `false;` cho bước kế tiếp.
        this.effectSupported = false;
        // Ghi sự kiện `console.warn('Message effect not supported for this chat, falling back to plain send', …` phục vụ chẩn đoán mà không đổi kết quả nghiệp vụ.
        console.warn('Message effect not supported for this chat, falling back to plain send', error);
      }
    }

    // Chờ `this.bot.telegram.sendMessage(this.chatId, chunk, baseOptions);` hoàn tất để giữ đúng thứ tự side effect.
    await this.bot.telegram.sendMessage(this.chatId, chunk, baseOptions);
  }

  /**
   * Hàm `downloadPhoto` lấy dữ liệu từ dependency bên ngoài; kết quả được trả cho caller theo kiểu khai báo.
   *
   * Được sử dụng tại:
   * - `src/services/telegram.service.ts`
   */
  // Mở method `downloadPhoto` để lấy dữ liệu từ dependency bên ngoài.
  private async downloadPhoto(imageUrl: string): Promise<TelegramPhotoUpload> {
    // Tính `response` từ `await this.http.get(imageUrl, { responseType: 'arraybuffer' });` và giữ bất biến trong phạm vi hiện tại.
    const response = await this.http.get(imageUrl, { responseType: 'arraybuffer' });
    // Tính `data` từ `Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);` và giữ bất biến trong phạm vi hiện tại.
    const data = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);

    // Trả `{` cho caller và kết thúc nhánh hiện tại.
    return {
      // Gán field `source` từ `data,` để object khớp contract.
      source: data,
      // Gán field `filename` từ `getImageFilename(imageUrl),` để object khớp contract.
      filename: getImageFilename(imageUrl),
    };
  }
}

/**
 * Hàm `splitTelegramMessage` chia nội dung theo giới hạn của API đích; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/telegram.service.ts`
 */
// Mở thân hàm `splitTelegramMessage` với input/output được TypeScript kiểm tra.
function splitTelegramMessage(message: string, maxLength: number): string[] {
  // Nếu `message.length <= maxLength` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (message.length <= maxLength) {
    // Trả `[message];` cho caller và kết thúc nhánh hiện tại.
    return [message];
  }

  // Gán field `const chunks` từ `string[] = [];` để object khớp contract.
  const chunks: string[] = [];
  // Khởi tạo trạng thái `current`; các nhánh bên dưới sẽ cập nhật nó có kiểm soát.
  let current = '';

  // Lặp theo `const line of message.split('\n')` để xử lý đủ từng phần tử/trạng thái.
  for (const line of message.split('\n')) {
    // Tính `candidate` từ `current ? `${current}\n${line}` : line;` và giữ bất biến trong phạm vi hiện tại.
    const candidate = current ? `${current}\n${line}` : line;

    // Nếu `candidate.length <= maxLength` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (candidate.length <= maxLength) {
      // Cập nhật `current` bằng `candidate;` cho bước kế tiếp.
      current = candidate;
      // Dùng `continue;` để bỏ qua/kết thúc vòng lặp sau khi điều kiện hiện tại đã rõ.
      continue;
    }

    // Nếu `current` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (current) {
      // Gọi `chunks.push` với `current` để hoàn tất side effect/bước xử lý hiện tại.
      chunks.push(current);
      // Cập nhật `current` bằng `'';` cho bước kế tiếp.
      current = '';
    }

    // Nếu `line.length <= maxLength` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (line.length <= maxLength) {
      // Cập nhật `current` bằng `line;` cho bước kế tiếp.
      current = line;
      // Dùng `continue;` để bỏ qua/kết thúc vòng lặp sau khi điều kiện hiện tại đã rõ.
      continue;
    }

    // Lặp theo `let index = 0; index < line.length; index += maxLength` để xử lý đủ từng phần tử/trạng thái.
    for (let index = 0; index < line.length; index += maxLength) {
      // Gọi `chunks.push` với `line.slice(index, index + maxLength)` để hoàn tất side effect/bước xử lý hiện tại.
      chunks.push(line.slice(index, index + maxLength));
    }
  }

  // Nếu `current` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (current) {
    // Gọi `chunks.push` với `current` để hoàn tất side effect/bước xử lý hiện tại.
    chunks.push(current);
  }

  // Trả `chunks;` cho caller và kết thúc nhánh hiện tại.
  return chunks;
}

/**
 * Hàm `formatErrorMessage` định dạng dữ liệu thành chuỗi hiển thị ổn định; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/telegram.service.ts`
 */
// Mở thân hàm `formatErrorMessage` với input/output được TypeScript kiểm tra.
function formatErrorMessage(error: unknown): string {
  // Nếu `error instanceof Error` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (error instanceof Error) {
    // Trả `error.message;` cho caller và kết thúc nhánh hiện tại.
    return error.message;
  }

  // Trả `'unknown error';` cho caller và kết thúc nhánh hiện tại.
  return 'unknown error';
}

/**
 * Hàm `getImageFilename` lấy giá trị dẫn xuất an toàn; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/telegram.service.ts`
 */
// Mở thân hàm `getImageFilename` với input/output được TypeScript kiểm tra.
function getImageFilename(imageUrl: string): string {
  // Cô lập thao tác có thể lỗi để module còn cơ hội log và trả fallback an toàn.
  try {
    // Tính `pathname` từ `new URL(imageUrl).pathname;` và giữ bất biến trong phạm vi hiện tại.
    const pathname = new URL(imageUrl).pathname;
    // Tính `filename` từ `pathname.split('/').filter(Boolean).pop();` và giữ bất biến trong phạm vi hiện tại.
    const filename = pathname.split('/').filter(Boolean).pop();

    // Nếu `filename && /\.[a-z0-9]{2,5}$/i.test(filename)` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (filename && /\.[a-z0-9]{2,5}$/i.test(filename)) {
      // Trả `filename;` cho caller và kết thúc nhánh hiện tại.
      return filename;
    }
  // Bắt lỗi từ khối try, không để một dependency ngoài làm hỏng toàn bộ đợt xử lý.
  } catch {
    // Trả `'photo.jpg';` cho caller và kết thúc nhánh hiện tại.
    return 'photo.jpg';
  }

  // Trả `'photo.jpg';` cho caller và kết thúc nhánh hiện tại.
  return 'photo.jpg';
}
