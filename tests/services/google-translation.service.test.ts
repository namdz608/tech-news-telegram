import { describe, expect, it, vi } from 'vitest';
import { GoogleTranslationService } from '../../src/services/google-translation.service';

describe('GoogleTranslationService', () => {
  it('returns translated text from string response segments', async () => {
    const http = {
      get: vi.fn().mockResolvedValue({
        data: [[['Bản tin công nghệ'], [' mới nhất']]],
      }),
    };
    const service = new GoogleTranslationService('vi', http as never);

    await expect(service.translateDigest('Tech news digest')).resolves.toBe('Bản tin công nghệ mới nhất');
    await expect(service.translateDigestVerified('Tech news digest')).resolves.toEqual({
      text: 'Bản tin công nghệ mới nhất',
      succeeded: true,
    });
  });

  it('returns the original text when response segments are not strings', async () => {
    const http = {
      get: vi.fn().mockResolvedValue({
        data: [[[123]]],
      }),
    };
    const service = new GoogleTranslationService('vi', http as never);

    await expect(service.translateDigest('Tech news digest')).resolves.toBe('Tech news digest');
    await expect(service.translateDigestVerified('Tech news digest')).resolves.toEqual({
      text: 'Tech news digest',
      succeeded: false,
    });
  });

  it('logs only a constant message when translation fails with a sensitive error', async () => {
    const sensitive = new Error(
      'Authorization: Bearer 123456:ABC-TOKEN chat_id=-100123 allegation: received bribes BRAVE_KEY=search-secret',
    );
    const http = { get: vi.fn().mockRejectedValue(sensitive) };
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const service = new GoogleTranslationService('vi', http as never);
      await expect(service.translateDigestVerified('Tech news digest')).resolves.toEqual({
        text: 'Tech news digest',
        succeeded: false,
      });
      expect(error).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledWith('Google Translate failed');
      const logged = JSON.stringify(error.mock.calls);
      expect(logged).not.toContain('123456:ABC-TOKEN');
      expect(logged).not.toContain('-100123');
      expect(logged).not.toContain('Authorization');
      expect(logged).not.toContain('BRAVE_KEY');
      expect(logged).not.toContain('received bribes');
    } finally {
      error.mockRestore();
    }
  });
});
