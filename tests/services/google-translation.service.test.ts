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
    const service = new GoogleTranslationService('vi', http as never, { retries: 0 });

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
      const service = new GoogleTranslationService('vi', http as never, { retries: 0 });
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

  it('retries a failed unofficial translate call before giving up', async () => {
    const http = {
      get: vi.fn()
        .mockRejectedValueOnce(new Error('temporarily unavailable'))
        .mockResolvedValueOnce({
          data: [[['Toàn quyền cho cơ quan cạnh tranh Anh']]],
        }),
    };
    const sleep = vi.fn().mockResolvedValue(undefined);
    const service = new GoogleTranslationService('vi', http as never, {
      retries: 1,
      retryDelayMs: 250,
      sleep,
    });

    await expect(
      service.translateDigestVerified("All power to the UK competition watchdog"),
    ).resolves.toEqual({
      text: 'Toàn quyền cho cơ quan cạnh tranh Anh',
      succeeded: true,
    });
    expect(http.get).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it('posts long source text instead of putting it in the query string', async () => {
    const source = `${'verificationState: reported\n'.repeat(80)}summary: The CMA is investigating drip pricing.`;
    const http = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({
        data: [[['CMA đang điều tra định giá nhỏ giọt.']]],
      }),
    };
    const service = new GoogleTranslationService('vi', http as never, { retries: 0 });

    await expect(service.translateDigestVerified(source)).resolves.toEqual({
      text: 'CMA đang điều tra định giá nhỏ giọt.',
      succeeded: true,
    });
    expect(http.get).not.toHaveBeenCalled();
    expect(http.post).toHaveBeenCalledTimes(1);
    const [, body, config] = http.post.mock.calls[0] as [
      string,
      string,
      { params: Record<string, string> },
    ];
    expect(new URLSearchParams(body).get('q')).toContain('drip pricing');
    expect(config.params).toMatchObject({ client: 'gtx', sl: 'auto', tl: 'vi', dt: 't' });
  });

  it('keeps unofficial translate requests to a small in-flight limit', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const http = {
      get: vi.fn(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return { data: [[['ok']]] };
      }),
    };
    const service = new GoogleTranslationService('vi', http as never, {
      retries: 0,
      maxConcurrent: 2,
    });

    await Promise.all([
      service.translateDigestVerified('one'),
      service.translateDigestVerified('two'),
      service.translateDigestVerified('three'),
      service.translateDigestVerified('four'),
    ]);

    expect(http.get).toHaveBeenCalledTimes(4);
    expect(maxInFlight).toBe(2);
  });
});
