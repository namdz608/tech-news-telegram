import type { TelegramMessage } from './telegram.service';

interface TelegramSender {
  sendMessages(
    messages: TelegramMessage[],
    onSent?: (message: TelegramMessage) => void | Promise<void>,
  ): Promise<void>;
}

interface HistoryWriter {
  mark(url: string): Promise<void>;
}

export class TrackedTelegramDeliveryService<
  TMessage extends TelegramMessage = TelegramMessage,
> {
  constructor(
    private readonly telegram: TelegramSender,
    private readonly history: HistoryWriter,
  ) {}

  async send(messages: TMessage[]): Promise<void> {
    await this.telegram.sendMessages(messages, (message) => this.history.mark(message.url));
  }
}
