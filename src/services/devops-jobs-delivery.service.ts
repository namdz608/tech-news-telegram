import type { DevopsJobsMessage } from '../types/devops-jobs';

interface DevopsJobsTelegramLike {
  sendDigest(
    message: string,
    url?: string,
    imageUrl?: string,
    buttonText?: string,
  ): Promise<void>;
}

interface DevopsJobsHistoryLike {
  mark(url: string): Promise<void>;
}

export class DevopsJobsDeliveryService {
  constructor(
    private readonly telegram: DevopsJobsTelegramLike,
    private readonly history: DevopsJobsHistoryLike,
  ) {}

  async send(messages: readonly DevopsJobsMessage[]): Promise<void> {
    for (const message of messages) {
      await this.telegram.sendDigest(message.text, message.url, undefined, 'Xem tin gốc');
      await this.history.mark(message.url);
    }
  }
}
