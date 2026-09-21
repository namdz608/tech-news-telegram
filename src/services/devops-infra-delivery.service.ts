import type { DevopsInfraMessage } from '../types/devops-infra';

interface DevopsInfraTelegramLike {
  sendDigest(
    message: string,
    url?: string,
    imageUrl?: string,
    buttonText?: string,
  ): Promise<void>;
}

interface DevopsInfraHistoryLike {
  mark(url: string): Promise<void>;
}

export class DevopsInfraDeliveryError extends Error {
  constructor(readonly code: 'telegram-send-failed' | 'sent-history-mark-failed') {
    super(code);
    this.name = 'DevopsInfraDeliveryError';
  }
}

export class DevopsInfraDeliveryService {
  constructor(
    private readonly telegram: DevopsInfraTelegramLike,
    private readonly history: DevopsInfraHistoryLike,
  ) {}

  async send(messages: readonly DevopsInfraMessage[]): Promise<void> {
    for (const message of messages) {
      try {
        await this.telegram.sendDigest(
          message.text,
          message.url,
          message.imageUrl,
          'Xem thread gốc',
        );
      } catch (error) {
        logSafeFailure('Devops-infra Telegram send failed', error);
        throw new DevopsInfraDeliveryError('telegram-send-failed');
      }

      try {
        await this.history.mark(message.url);
      } catch (error) {
        logSafeFailure('Devops-infra history mark failed', error);
        throw new DevopsInfraDeliveryError('sent-history-mark-failed');
      }
    }
  }
}

function logSafeFailure(prefix: string, error: unknown): void {
  const name = error instanceof Error ? error.name : 'unknown';
  const status = axiosLikeStatus(error);
  if (status === undefined) {
    console.warn(prefix, name);
    return;
  }
  console.warn(prefix, name, status);
}

function axiosLikeStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const response = (error as { response?: unknown }).response;
  if (typeof response !== 'object' || response === null) return undefined;
  const status = (response as { status?: unknown }).status;
  return typeof status === 'number' && Number.isFinite(status) ? status : undefined;
}
