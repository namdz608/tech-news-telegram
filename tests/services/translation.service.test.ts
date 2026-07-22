import { describe, expect, it, vi } from 'vitest';
import { GoogleTranslationService } from '../../src/services/google-translation.service';
import { createDefaultTranslator, TranslationService } from '../../src/services/translation.service';

describe('TranslationService', () => {
  it('uses Google as the only default digest translator', () => {
    expect(createDefaultTranslator()).toBeInstanceOf(GoogleTranslationService);
  });

  it('delegates digest translation to the selected provider', async () => {
    const provider = {
      translateDigest: vi.fn().mockResolvedValue('Bản tin công nghệ'),
    };

    const result = await new TranslationService(provider).translateDigest('Tech News Digest');

    expect(result).toBe('Bản tin công nghệ');
    expect(provider.translateDigest).toHaveBeenCalledWith('Tech News Digest');
  });

  it('protects URLs from being changed by the translation provider', async () => {
    const url =
      'https://aws.amazon.com/blogs/aws/try-the-new-console-experience-in-amazon-bedrock-optimized-for-anthropic-and-openai-tuning/';
    const provider = {
      translateDigest: vi.fn(async (input: string) =>
        input.replace('Tech News Digest', 'Bản tin công nghệ').replace('AI security update', 'Cập nhật bảo mật AI'),
      ),
    };

    const result = await new TranslationService(provider).translateDigest(`Tech News Digest\nAI security update\n${url}`);
    const protectedInput = provider.translateDigest.mock.calls[0][0];

    expect(protectedInput).not.toContain(url);
    expect(result).toContain(url);
    expect(result).toContain('Bản tin công nghệ');
    expect(result).toContain('Cập nhật bảo mật AI');
  });

  it('returns the original digest when the provider fails', async () => {
    const provider = {
      translateDigest: vi.fn().mockRejectedValue(new Error('provider failed')),
    };

    await expect(new TranslationService(provider).translateDigest('Tech News Digest')).resolves.toBe('Tech News Digest');
  });
});
