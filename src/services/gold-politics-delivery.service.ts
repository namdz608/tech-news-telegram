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
    } catch {
      throw new GoldPoliticsDeliveryError('telegram-send-failed');
    }
    for (const message of newsMessages) {
      try {
        await this.telegram.sendDigest(message.text, message.url, undefined, '🔎 Xem nguồn gốc');
      } catch {
        throw new GoldPoliticsDeliveryError('telegram-send-failed');
      }
      try {
        await this.history.mark(message.url);
      } catch {
        throw new GoldPoliticsDeliveryError('sent-history-mark-failed');
      }
    }
  }
}
