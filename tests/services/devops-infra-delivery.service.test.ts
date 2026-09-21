import { describe, expect, it, vi } from 'vitest';
import {
  DevopsInfraDeliveryError,
  DevopsInfraDeliveryService,
} from '../../src/services/devops-infra-delivery.service';
import type { DevopsInfraMessage } from '../../src/types/devops-infra';

const messages: DevopsInfraMessage[] = [
  {
    text: 'message one SECRET-COPY',
    url: 'https://example.com/one?token=SECRET-URL',
    imageUrl: 'https://cdn.example.com/one.png',
  },
  {
    text: 'message two SECRET-COPY',
    url: 'https://example.com/two?token=SECRET-URL',
  },
];

describe('DevopsInfraDeliveryService', () => {
  it('sends sequentially and marks each URL only after its send succeeds', async () => {
    const events: string[] = [];
    const telegram = {
      sendDigest: vi.fn(async (_text: string, url?: string) => {
        events.push(`send:${url}`);
      }),
    };
    const history = {
      mark: vi.fn(async (url: string) => {
        events.push(`mark:${url}`);
      }),
    };

    await new DevopsInfraDeliveryService(telegram, history).send(messages);

    expect(telegram.sendDigest.mock.calls).toEqual([
      [messages[0].text, messages[0].url, messages[0].imageUrl, 'Xem thread gốc'],
      [messages[1].text, messages[1].url, undefined, 'Xem thread gốc'],
    ]);
    expect(events).toEqual([
      `send:${messages[0].url}`,
      `mark:${messages[0].url}`,
      `send:${messages[1].url}`,
      `mark:${messages[1].url}`,
    ]);
  });

  it('leaves message two unmarked and throws a safe error when its send fails', async () => {
    const failure = Object.assign(new Error('SECRET-COPY SECRET-URL'), {
      name: 'AxiosError',
      response: { status: 429, data: 'SECRET-COPY' },
    });
    const telegram = {
      sendDigest: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(failure),
    };
    const history = { mark: vi.fn().mockResolvedValue(undefined) };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const caught = await new DevopsInfraDeliveryService(telegram, history)
        .send(messages)
        .catch((error: unknown) => error);

      expect(caught).toMatchObject({
        name: 'DevopsInfraDeliveryError',
        code: 'telegram-send-failed',
        message: 'telegram-send-failed',
      });
      expect(caught).toBeInstanceOf(DevopsInfraDeliveryError);
      expect((caught as Error).cause).toBeUndefined();
      expect(history.mark.mock.calls).toEqual([[messages[0].url]]);
      expect(warn.mock.calls).toEqual([
        ['Devops-infra Telegram send failed', 'AxiosError', 429],
      ]);
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/SECRET-COPY|SECRET-URL/);
    } finally {
      warn.mockRestore();
    }
  });

  it('throws a safe mark error and does not continue delivery', async () => {
    const telegram = { sendDigest: vi.fn().mockResolvedValue(undefined) };
    const history = {
      mark: vi.fn().mockRejectedValue(new TypeError('SECRET-URL')),
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const caught = await new DevopsInfraDeliveryService(telegram, history)
        .send(messages)
        .catch((error: unknown) => error);

      expect(caught).toMatchObject({
        name: 'DevopsInfraDeliveryError',
        code: 'sent-history-mark-failed',
      });
      expect(telegram.sendDigest).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls).toEqual([
        ['Devops-infra history mark failed', 'TypeError'],
      ]);
      expect(JSON.stringify(warn.mock.calls)).not.toContain('SECRET-URL');
    } finally {
      warn.mockRestore();
    }
  });
});
