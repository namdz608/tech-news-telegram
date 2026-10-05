import { describe, expect, it, vi } from 'vitest';
import { DevopsJobsTextTranslator } from '../../src/services/devops-jobs-translator';

describe('DevopsJobsTextTranslator', () => {
  it('keeps the Google translation when it succeeds', async () => {
    const http = { get: vi.fn() };
    const translator = new DevopsJobsTextTranslator(
      { translateDigestVerified: async () => ({ text: 'Kỹ sư DevOps', succeeded: true }) },
      http,
    );
    await expect(translator.translateDigestVerified('DevOps Engineer'))
      .resolves.toEqual({ text: 'Kỹ sư DevOps', succeeded: true });
    expect(http.get).not.toHaveBeenCalled();
  });

  it('falls back to MyMemory when Google fails', async () => {
    const http = {
      get: vi.fn().mockResolvedValue({
        data: { responseStatus: 200, responseData: { translatedText: 'Kỹ sư DevOps' } },
      }),
    };
    const translator = new DevopsJobsTextTranslator(
      { translateDigestVerified: async (text: string) => ({ text, succeeded: false }) },
      http,
    );
    await expect(translator.translateDigestVerified('DevOps Engineer'))
      .resolves.toEqual({ text: 'Kỹ sư DevOps', succeeded: true });
  });

  it('keeps the source text when the fallback quota warning is returned', async () => {
    const http = {
      get: vi.fn().mockResolvedValue({
        data: {
          responseStatus: 200,
          responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS' },
        },
      }),
    };
    const translator = new DevopsJobsTextTranslator(
      { translateDigestVerified: async (text: string) => ({ text, succeeded: false }) },
      http,
    );
    await expect(translator.translateDigestVerified('DevOps Engineer'))
      .resolves.toEqual({ text: 'DevOps Engineer', succeeded: false });
  });
});
