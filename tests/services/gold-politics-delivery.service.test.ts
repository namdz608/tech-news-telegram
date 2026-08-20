import { describe, expect, it, vi } from 'vitest';
import {
  GoldPoliticsDeliveryError,
  GoldPoliticsDeliveryService,
} from '../../src/services/gold-politics-delivery.service';
import type { PoliticsMessage } from '../../src/types/gold-politics';

const news = [
  { text: 'news one', url: 'https://one.example/story' },
  { text: 'news two', url: 'https://two.example/story' },
] as PoliticsMessage[];

const sensitiveFailure = {
  botToken: '123456:ABC-TOKEN',
  chatId: '-100123',
  headers: { Authorization: 'Bearer 123456:ABC-TOKEN' },
  allegation: 'received bribes from official X',
};

function leakSurface(value: unknown): string {
  const error = value as { cause?: unknown; message?: string; stack?: string };
  return [
    JSON.stringify(value),
    JSON.stringify(error?.cause),
    String(value),
    error?.message ?? '',
    error?.stack ?? '',
  ].join('\n');
}

function assertNoSensitiveLeak(value: unknown): void {
  const surface = leakSurface(value);
  expect(surface).not.toContain('123456:ABC-TOKEN');
  expect(surface).not.toContain('-100123');
  expect(surface).not.toContain('Authorization');
  expect(surface).not.toContain('received bribes');
}

function assertSafeDeliveryError(
  error: unknown,
  code: 'telegram-send-failed' | 'sent-history-mark-failed',
): void {
  expect(error).toBeInstanceOf(GoldPoliticsDeliveryError);
  expect(error).toMatchObject({
    name: 'GoldPoliticsDeliveryError',
    code,
    message: code,
  });
  expect((error as Error).cause).toBeUndefined();
  assertNoSensitiveLeak(error);
}

describe('GoldPoliticsDeliveryService', () => {
  it('sends price first then each news with the source button and marks only news urls', async () => {
    const telegram = {
      sendDigest: vi.fn().mockResolvedValue(undefined),
      sendMessages: vi.fn(),
    };
    const history = { mark: vi.fn().mockResolvedValue(undefined) };
    const service = new GoldPoliticsDeliveryService(telegram, history);

    await service.send('price html', news);

    expect(telegram.sendDigest.mock.calls).toEqual([
      ['price html'],
      ['news one', 'https://one.example/story', undefined, '🔎 Xem nguồn gốc'],
      ['news two', 'https://two.example/story', undefined, '🔎 Xem nguồn gốc'],
    ]);
    expect(history.mark.mock.calls).toEqual([
      ['https://one.example/story'],
      ['https://two.example/story'],
    ]);
    expect(telegram.sendMessages).not.toHaveBeenCalled();
  });

  it('marks only the first news url when the second news send fails', async () => {
    const telegram = {
      sendDigest: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(sensitiveFailure),
      sendMessages: vi.fn(),
    };
    const history = { mark: vi.fn().mockResolvedValue(undefined) };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const service = new GoldPoliticsDeliveryService(telegram, history);

    try {
      const failure = await service.send('price html', news).catch((caught: unknown) => caught);
      assertSafeDeliveryError(failure, 'telegram-send-failed');
      expect(telegram.sendDigest.mock.calls).toEqual([
        ['price html'],
        ['news one', 'https://one.example/story', undefined, '🔎 Xem nguồn gốc'],
        ['news two', 'https://two.example/story', undefined, '🔎 Xem nguồn gốc'],
      ]);
      expect(history.mark.mock.calls).toEqual([['https://one.example/story']]);
      expect(telegram.sendMessages).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(errorLog).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
      assertNoSensitiveLeak(warn.mock.calls);
      assertNoSensitiveLeak(errorLog.mock.calls);
      assertNoSensitiveLeak(log.mock.calls);
    } finally {
      warn.mockRestore();
      errorLog.mockRestore();
      log.mockRestore();
    }
  });

  it('does not send news or mark history when the price send fails', async () => {
    const telegram = {
      sendDigest: vi.fn().mockRejectedValue(sensitiveFailure),
      sendMessages: vi.fn(),
    };
    const history = { mark: vi.fn().mockResolvedValue(undefined) };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const service = new GoldPoliticsDeliveryService(telegram, history);

    try {
      const failure = await service.send('price html', news).catch((caught: unknown) => caught);
      assertSafeDeliveryError(failure, 'telegram-send-failed');
      expect(telegram.sendDigest.mock.calls).toEqual([['price html']]);
      expect(history.mark).not.toHaveBeenCalled();
      expect(telegram.sendMessages).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(errorLog).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      errorLog.mockRestore();
      log.mockRestore();
    }
  });

  it('throws sent-history-mark-failed after Telegram accepted the news, allowing at-least-once retry', async () => {
    const telegram = {
      sendDigest: vi.fn().mockResolvedValue(undefined),
      sendMessages: vi.fn(),
    };
    const history = { mark: vi.fn().mockRejectedValue(sensitiveFailure) };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const service = new GoldPoliticsDeliveryService(telegram, history);

    try {
      const failure = await service.send('price html', news).catch((caught: unknown) => caught);
      assertSafeDeliveryError(failure, 'sent-history-mark-failed');
      expect(telegram.sendDigest.mock.calls).toEqual([
        ['price html'],
        ['news one', 'https://one.example/story', undefined, '🔎 Xem nguồn gốc'],
      ]);
      expect(history.mark.mock.calls).toEqual([['https://one.example/story']]);
      expect(telegram.sendMessages).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(errorLog).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
      assertNoSensitiveLeak(warn.mock.calls);
      assertNoSensitiveLeak(errorLog.mock.calls);
      assertNoSensitiveLeak(log.mock.calls);
    } finally {
      warn.mockRestore();
      errorLog.mockRestore();
      log.mockRestore();
    }
  });
});
