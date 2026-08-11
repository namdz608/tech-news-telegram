import { expect, it, vi } from 'vitest';
import { TrackedTelegramDeliveryService } from '../../src/services/tracked-telegram-delivery.service';

it('marks only messages acknowledged by Telegram', async () => {
  const messages = [
    { text: 'one', url: 'https://example.com/one' },
    { text: 'two', url: 'https://example.com/two' },
  ];
  const telegram = {
    sendMessages: vi.fn(async (batch, onSent) => {
      await onSent?.(batch[0]);
      throw new Error('second failed');
    }),
  };
  const history = { mark: vi.fn().mockResolvedValue(undefined) };
  const delivery = new TrackedTelegramDeliveryService(telegram, history);

  await expect(delivery.send(messages)).rejects.toThrow('second failed');
  expect(history.mark).toHaveBeenCalledWith(messages[0].url);
  expect(history.mark).not.toHaveBeenCalledWith(messages[1].url);
});
