import { describe, expect, it, vi } from 'vitest';
import { TelegramService } from '../../src/services/telegram.service';
import { redditHttpsAgent } from '../../src/utils/reddit-dns';

describe('TelegramService', () => {
  const imageBuffer = Buffer.from('image-bytes');
  const article = {
    id: 'https://example.com/a',
    sourceId: 'example',
    sourceName: 'Example',
    title: 'Example article',
    url: 'https://example.com/a',
    collectedAt: '2026-07-15T00:00:00.000Z',
    topics: ['ai' as const],
  };

  it('configures the default image downloader with Reddit-aware DNS', () => {
    const service = new TelegramService();
    const http = (service as unknown as { http: { defaults?: { httpsAgent?: unknown } } }).http;

    expect(http.defaults?.httpsAgent).toBe(redditHttpsAgent);
  });

  it('sends digest message to configured chat as HTML', async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    const service = new TelegramService(
      {
        telegram: {
          sendMessage,
        },
      },
      'chat-id',
      3900,
      '',
    );

    await service.sendDigest('hello');

    expect(sendMessage).toHaveBeenCalledWith('chat-id', 'hello', {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  });

  it('applies the message effect when configured', async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    const service = new TelegramService(
      {
        telegram: {
          sendMessage,
        },
      },
      'chat-id',
      3900,
      'effect-123',
    );

    await service.sendDigest('hello');

    expect(sendMessage).toHaveBeenCalledWith('chat-id', 'hello', {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      message_effect_id: 'effect-123',
    });
  });

  it('falls back to a plain send when the message effect is rejected', async () => {
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error('effect not allowed'))
      .mockResolvedValue({});
    const service = new TelegramService(
      {
        telegram: {
          sendMessage,
        },
      },
      'chat-id',
      3900,
      'effect-123',
    );

    await service.sendDigest('first');
    await service.sendDigest('second');

    expect(sendMessage).toHaveBeenCalledTimes(3);
    expect(sendMessage).toHaveBeenLastCalledWith('chat-id', 'second', {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  });

  it('attaches an inline button when a url is provided', async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    const service = new TelegramService(
      {
        telegram: {
          sendMessage,
        },
      },
      'chat-id',
      3900,
      '',
    );

    await service.sendMessages([{ text: 'hello', url: 'https://example.com/a', article, topic: 'ai' }]);

    expect(sendMessage).toHaveBeenCalledWith('chat-id', 'hello', {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{ text: '🔎 Xem bài gốc', url: 'https://example.com/a' }]],
      },
    });
  });

  it('sends a photo with caption when an image url is provided', async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    const sendPhoto = vi.fn().mockResolvedValue({});
    const http = {
      get: vi.fn().mockResolvedValue({
        data: imageBuffer,
      }),
    };
    const service = new TelegramService(
      {
        telegram: {
          sendMessage,
          sendPhoto,
        },
      },
      'chat-id',
      3900,
      '',
      http,
    );

    await service.sendMessages([
      {
        text: 'hello',
        url: 'https://example.com/a',
        imageUrl: 'https://example.com/image.png',
        article,
        topic: 'ai',
      },
    ]);

    expect(http.get).toHaveBeenCalledWith('https://example.com/image.png', { responseType: 'arraybuffer' });
    expect(sendPhoto).toHaveBeenCalledWith('chat-id', { source: imageBuffer, filename: 'image.png' }, {
      caption: 'hello',
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '🔎 Xem bài gốc', url: 'https://example.com/a' }]],
      },
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('falls back to text when sending a photo fails', async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    const sendPhoto = vi.fn().mockRejectedValue(new Error('photo rejected'));
    const http = {
      get: vi.fn().mockResolvedValue({
        data: imageBuffer,
      }),
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = new TelegramService(
      {
        telegram: {
          sendMessage,
          sendPhoto,
        },
      },
      'chat-id',
      3900,
      '',
      http,
    );

    try {
      await service.sendMessages([
        {
          text: 'hello',
          url: 'https://example.com/a',
          imageUrl: 'https://example.com/image.png',
          article,
          topic: 'ai',
        },
      ]);
    } finally {
      warn.mockRestore();
    }

    expect(sendPhoto).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith('chat-id', 'hello', {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{ text: '🔎 Xem bài gốc', url: 'https://example.com/a' }]],
      },
    });
  });

  it('sends the photo separately when an html caption would be too long', async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    const sendPhoto = vi.fn().mockResolvedValue({});
    const http = {
      get: vi.fn().mockResolvedValue({
        data: imageBuffer,
      }),
    };
    const service = new TelegramService(
      {
        telegram: {
          sendMessage,
          sendPhoto,
        },
      },
      'chat-id',
      3900,
      '',
      http,
    );
    const message = [
      '🛠️ <b>DEVOPS</b>',
      '━━━━━━━━━━━━━━',
      '',
      `<b>${'A'.repeat(1200)}</b>`,
      '',
      `<blockquote expandable>📝 ${'B'.repeat(1000)}</blockquote>`,
      '',
      '📰 <i>Blog CNCF</i>',
    ].join('\n');

    await service.sendMessages([
      {
        text: message,
        url: 'https://example.com/a',
        imageUrl: 'https://example.com/image.png',
        article,
        topic: 'ai',
      },
    ]);

    expect(sendPhoto).toHaveBeenCalledWith('chat-id', { source: imageBuffer, filename: 'image.png' }, {});
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith('chat-id', message, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{ text: '🔎 Xem bài gốc', url: 'https://example.com/a' }]],
      },
    });
  });

  it('falls back to text when downloading a photo fails', async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    const sendPhoto = vi.fn().mockResolvedValue({});
    const http = {
      get: vi.fn().mockRejectedValue(new Error('blocked image host')),
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = new TelegramService(
      {
        telegram: {
          sendMessage,
          sendPhoto,
        },
      },
      'chat-id',
      3900,
      '',
      http,
    );

    try {
      await service.sendMessages([
        {
          text: 'hello',
          url: 'https://example.com/a',
          imageUrl: 'https://example.com/image.png',
          article,
          topic: 'ai',
        },
      ]);
    } finally {
      warn.mockRestore();
    }

    expect(sendPhoto).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith('chat-id', 'hello', {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{ text: '🔎 Xem bài gốc', url: 'https://example.com/a' }]],
      },
    });
  });

  it('splits long digest messages into Telegram-safe chunks', async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    const service = new TelegramService(
      {
        telegram: {
          sendMessage,
        },
      },
      'chat-id',
      20,
      '',
    );

    await service.sendDigest(['line one is long', 'line two is long', 'line three is long'].join('\n'));

    expect(sendMessage).toHaveBeenCalledTimes(3);
    for (const call of sendMessage.mock.calls) {
      expect(call[1].length).toBeLessThanOrEqual(20);
    }
  });
});
