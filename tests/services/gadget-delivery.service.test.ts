import { describe, expect, it, vi } from 'vitest';
import { GadgetDeliveryService } from '../../src/services/gadget-delivery.service';
import type { GadgetMessage } from '../../src/types/gadget';
import type { TelegramMessage } from '../../src/services/telegram.service';

const messages = [
  { text: 'one', url: 'https://example.com/one' },
  { text: 'two', url: 'https://example.com/two' },
] as GadgetMessage[];

describe('GadgetDeliveryService', () => {
  it('marks history only after each Telegram message succeeds', async () => {
    const telegram = {
      sendMessages: vi.fn(
        async (
          batch: TelegramMessage[],
          onSent?: (message: TelegramMessage) => void | Promise<void>,
        ) => {
        await onSent?.(batch[0]);
        throw new Error('second failed');
        },
      ),
    };
    const history = { mark: vi.fn().mockResolvedValue(undefined) };
    const service = new GadgetDeliveryService(telegram, history);

    await expect(service.send(messages)).rejects.toThrow('second failed');
    expect(history.mark).toHaveBeenCalledWith(messages[0].url);
    expect(history.mark).not.toHaveBeenCalledWith(messages[1].url);
  });
});
