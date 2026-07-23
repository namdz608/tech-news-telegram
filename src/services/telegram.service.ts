import axios from 'axios';
import { Telegraf } from 'telegraf';
import { env } from '../config/env';
import { redditHttpsAgent } from '../utils/reddit-dns';
import type { DigestMessage } from './digest.service';

const triggerSeparator = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

interface InlineKeyboardButton {
  text: string;
  url: string;
}

interface SendMessageOptions {
  parse_mode?: 'HTML' | 'MarkdownV2';
  disable_web_page_preview?: boolean;
  message_effect_id?: string;
  reply_markup?: {
    inline_keyboard: InlineKeyboardButton[][];
  };
}

interface SendPhotoOptions {
  caption?: string;
  parse_mode?: 'HTML' | 'MarkdownV2';
  message_effect_id?: string;
  reply_markup?: {
    inline_keyboard: InlineKeyboardButton[][];
  };
}

interface TelegramPhotoUpload {
  source: Buffer;
  filename: string;
}

interface TelegramClientLike {
  telegram: {
    sendMessage(chatId: string, message: string, options: SendMessageOptions): Promise<unknown>;
    sendPhoto?(chatId: string, photo: string | TelegramPhotoUpload, options: SendPhotoOptions): Promise<unknown>;
  };
}

interface HttpClientLike {
  get(url: string, options: { responseType: 'arraybuffer' }): Promise<{ data: ArrayBuffer | Buffer }>;
}

export class TelegramService {
  private effectSupported: boolean;
  private readonly photoCaptionMaxLength = 1000;

  constructor(
    private readonly bot: TelegramClientLike = new Telegraf(env.TELEGRAM_BOT_TOKEN) as unknown as TelegramClientLike,
    private readonly chatId = env.TELEGRAM_CHAT_ID,
    private readonly maxMessageLength = 3900,
    private readonly messageEffectId = env.TELEGRAM_MESSAGE_EFFECT_ID,
    private readonly http: HttpClientLike = axios.create({
      timeout: env.REQUEST_TIMEOUT_MS,
      headers: {
        'User-Agent': env.USER_AGENT,
      },
      httpsAgent: redditHttpsAgent,
    }),
  ) {
    this.effectSupported = Boolean(messageEffectId);
  }

  async sendDigest(message: string, url?: string, imageUrl?: string): Promise<void> {
    if (imageUrl && message.length > this.photoCaptionMaxLength) {
      await this.sendPhotoOnly(imageUrl);
      await this.sendDigest(message, url);
      return;
    }

    const chunks = splitTelegramMessage(
      message,
      imageUrl ? Math.min(this.maxMessageLength, this.photoCaptionMaxLength) : this.maxMessageLength,
    );

    for (let index = 0; index < chunks.length; index += 1) {
      const isLastChunk = index === chunks.length - 1;
      await this.sendChunk(chunks[index], isLastChunk ? url : undefined, isLastChunk ? imageUrl : undefined);
    }
  }

  async sendMessages(messages: DigestMessage[]): Promise<void> {
    const validMessages = messages.filter((message) => message.text.trim());

    if (validMessages.length === 0) {
      return;
    }

    await this.bot.telegram.sendMessage(this.chatId, triggerSeparator, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });

    for (const message of validMessages) {
      await this.sendDigest(message.text, message.url, message.imageUrl);
    }
  }

  private async sendPhotoOnly(imageUrl: string): Promise<void> {
    if (!this.bot.telegram.sendPhoto) {
      return;
    }

    try {
      const photo = await this.downloadPhoto(imageUrl);
      await this.bot.telegram.sendPhoto(this.chatId, photo, {});
    } catch (error) {
      console.warn(`Failed to send Telegram photo, sending text only: ${formatErrorMessage(error)}`);
    }
  }

  private async sendChunk(chunk: string, url?: string, imageUrl?: string): Promise<void> {
    const baseOptions: SendMessageOptions = {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    };

    if (url) {
      baseOptions.reply_markup = {
        inline_keyboard: [[{ text: '🔎 Xem bài gốc', url }]],
      };
    }

    if (imageUrl && this.bot.telegram.sendPhoto) {
      try {
        const { disable_web_page_preview: _disablePreview, ...photoOptions } = baseOptions;
        const photo = await this.downloadPhoto(imageUrl);
        await this.bot.telegram.sendPhoto(this.chatId, photo, {
          ...photoOptions,
          caption: chunk,
        });
        return;
      } catch (error) {
        console.warn(`Failed to send Telegram photo, falling back to text: ${formatErrorMessage(error)}`);
      }
    }

    if (this.effectSupported) {
      try {
        await this.bot.telegram.sendMessage(this.chatId, chunk, {
          ...baseOptions,
          message_effect_id: this.messageEffectId,
        });
        return;
      } catch (error) {
        this.effectSupported = false;
        console.warn('Message effect not supported for this chat, falling back to plain send', error);
      }
    }

    await this.bot.telegram.sendMessage(this.chatId, chunk, baseOptions);
  }

  private async downloadPhoto(imageUrl: string): Promise<TelegramPhotoUpload> {
    const response = await this.http.get(imageUrl, { responseType: 'arraybuffer' });
    const data = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);

    return {
      source: data,
      filename: getImageFilename(imageUrl),
    };
  }
}

function splitTelegramMessage(message: string, maxLength: number): string[] {
  if (message.length <= maxLength) {
    return [message];
  }

  const chunks: string[] = [];
  let current = '';

  for (const line of message.split('\n')) {
    const candidate = current ? `${current}\n${line}` : line;

    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = '';
    }

    if (line.length <= maxLength) {
      current = line;
      continue;
    }

    for (let index = 0; index < line.length; index += maxLength) {
      chunks.push(line.slice(index, index + maxLength));
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'unknown error';
}

function getImageFilename(imageUrl: string): string {
  try {
    const pathname = new URL(imageUrl).pathname;
    const filename = pathname.split('/').filter(Boolean).pop();

    if (filename && /\.[a-z0-9]{2,5}$/i.test(filename)) {
      return filename;
    }
  } catch {
    return 'photo.jpg';
  }

  return 'photo.jpg';
}
