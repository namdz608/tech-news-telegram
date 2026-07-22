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
  });

  it('returns the original text when response segments are not strings', async () => {
    const http = {
      get: vi.fn().mockResolvedValue({
        data: [[[123]]],
      }),
    };
    const service = new GoogleTranslationService('vi', http as never);

    await expect(service.translateDigest('Tech news digest')).resolves.toBe('Tech news digest');
  });
});
