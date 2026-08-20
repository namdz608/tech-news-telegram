import type { PoliticsMessage } from '../types/gold-politics';

interface GoldPoliticsTelegramLike {
  sendDigest(message: string, url?: string, imageUrl?: string, buttonText?: string): Promise<void>;
}

interface GoldPoliticsHistoryLike {
  mark(url: string): Promise<void>;
}

export class GoldPoliticsDeliveryError extends Error {
  constructor(readonly code: 'telegram-send-failed' | 'sent-history-mark-failed') {
    super(code);
    this.name = 'GoldPoliticsDeliveryError';
  }
}

export class GoldPoliticsDeliveryService {
  constructor(
    private readonly telegram: GoldPoliticsTelegramLike,
    private readonly history: GoldPoliticsHistoryLike,
  ) {}

  async send(priceMessage: string, newsMessages: readonly PoliticsMessage[]): Promise<void> {
    try {
      await this.telegram.sendDigest(priceMessage);
    } catch (error) {
      logSafeDeliveryFailure('Gold politics Telegram send failed', error);
      // eslint-disable-next-line preserve-caught-error -- do not leak Telegram transport details
      throw new GoldPoliticsDeliveryError('telegram-send-failed');
    }
    for (const message of newsMessages) {
      try {
        await this.telegram.sendDigest(message.text, message.url, undefined, '🔎 Xem nguồn gốc');
      } catch (error) {
        logSafeDeliveryFailure('Gold politics Telegram send failed', error);
        // eslint-disable-next-line preserve-caught-error -- do not leak Telegram transport details
        throw new GoldPoliticsDeliveryError('telegram-send-failed');
      }
      try {
        await this.history.mark(message.url);
      } catch (error) {
        logSafeDeliveryFailure('Gold politics history mark failed', error);
        // eslint-disable-next-line preserve-caught-error -- do not leak history store details
        throw new GoldPoliticsDeliveryError('sent-history-mark-failed');
      }
    }
  }
}

function logSafeDeliveryFailure(prefix: string, error: unknown): void {
  const name = error instanceof Error ? error.name : 'unknown';
  const status = axiosLikeStatus(error);
  if (status === undefined) {
    console.warn(prefix, name);
    return;
  }
  console.warn(prefix, name, status);
}

function axiosLikeStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const response = (error as { response?: unknown }).response;
  if (typeof response !== 'object' || response === null) {
    return undefined;
  }
  const status = (response as { status?: unknown }).status;
  if (typeof status !== 'number' || !Number.isFinite(status)) {
    return undefined;
  }
  return status;
}
