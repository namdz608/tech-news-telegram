import type { GadgetMessage } from '../types/gadget';
import type { TelegramMessage } from './telegram.service';

interface GadgetTelegramSender {
  sendMessages(
    messages: TelegramMessage[],
    onSent?: (message: TelegramMessage) => void | Promise<void>,
  ): Promise<void>;
}

interface GadgetHistoryWriter {
  mark(url: string): Promise<void>;
}

export class GadgetDeliveryService {
  constructor(
    private readonly telegram: GadgetTelegramSender,
    private readonly history: GadgetHistoryWriter,
  ) {}

  async send(messages: GadgetMessage[]): Promise<void> {
    await this.telegram.sendMessages(messages, (message) => this.history.mark(message.url));
  }
}
