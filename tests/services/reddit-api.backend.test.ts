import { describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env';
import { RedditApiBackend } from '../../src/services/reddit-api.backend';

const TOKEN = 'test-reddit-access-token';
const CONFIG = {
  headers: {
    Accept: 'application/json',
    'User-Agent': 'web:tech-news-telegram:1.0',
  },
  params: { limit: 10 },
};
const RESPONSE = {
  data: { data: { children: [] } },
  headers: { 'content-type': 'application/json' },
  status: 200,
};

describe('RedditApiBackend', () => {
  it('does not make HTTP requests without an access token', async () => {
    const http = { get: vi.fn() };
    const backend = new RedditApiBackend(' ', http);
    expect(backend.isEnabled()).toBe(false);
    await expect(
      backend.get('https://www.reddit.com/search.json', CONFIG),
    ).rejects.toEqual(new Error('reddit-api'));
    expect(http.get).not.toHaveBeenCalled();
  });

  it.each([
    [
      'https://www.reddit.com/search.json?q=kubernetes',
      'https://oauth.reddit.com/search.json?q=kubernetes',
    ],
    [
      'https://old.reddit.com/r/devops/new.json',
      'https://oauth.reddit.com/r/devops/new.json',
    ],
    [
      'https://reddit.com/r/devops/comments/abc/post.json',
      'https://oauth.reddit.com/r/devops/comments/abc/post.json',
    ],
    [
      'https://oauth.reddit.com/r/devops/new.json',
      'https://oauth.reddit.com/r/devops/new.json',
    ],
  ])('authenticates %s only at the OAuth origin', async (source, target) => {
    const http = { get: vi.fn().mockResolvedValue(RESPONSE) };
    const backend = new RedditApiBackend(TOKEN, http);
    expect(backend.isEnabled()).toBe(true);
    await expect(backend.get(source, CONFIG)).resolves.toEqual(RESPONSE);
    expect(http.get).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        headers: { ...CONFIG.headers, Authorization: `Bearer ${TOKEN}` },
        params: CONFIG.params,
        timeout: env.REQUEST_TIMEOUT_MS,
        maxRedirects: 0,
        maxContentLength: 512 * 1024,
        maxBodyLength: 512 * 1024,
      }),
    );
  });

  it.each([
    'https://attacker.example/search.json',
    'http://127.0.0.1/search',
    'https://user:secret@www.reddit.com/search.json',
    'https://oauth.reddit.com.attacker.example/search.json',
    'https://arbitrary.reddit.com/search.json',
    'http://www.reddit.com/search.json',
    'https://www.reddit.com:8443/search.json',
  ])('blocks token exfiltration via %s before HTTP', async (url) => {
    const http = { get: vi.fn() };
    await expect(
      new RedditApiBackend(TOKEN, http).get(url, CONFIG),
    ).rejects.toEqual(new Error('reddit-api'));
    expect(http.get).not.toHaveBeenCalled();
  });

  it.each([301, 401, 403, 429])(
    'does not follow, retry, or retain details of HTTP %s',
    async (status) => {
      const secretError = Object.assign(new Error(`body-${TOKEN}`), {
        config: { headers: { Authorization: TOKEN } },
        response: {
          status,
          data: 'private body',
          headers: { location: 'https://attacker.example' },
        },
      });
      const http = { get: vi.fn().mockRejectedValue(secretError) };
      await expect(
        new RedditApiBackend(TOKEN, http).get(
          'https://www.reddit.com/search.json',
          CONFIG,
        ),
      ).rejects.toEqual(new Error('reddit-api'));
      expect(http.get).toHaveBeenCalledTimes(1);
      const resolvedError = {
        get: vi.fn().mockResolvedValue({ ...RESPONSE, status }),
      };
      await expect(
        new RedditApiBackend(TOKEN, resolvedError).get(
          'https://www.reddit.com/search.json',
          CONFIG,
        ),
      ).rejects.toEqual(new Error('reddit-api'));
    },
  );
});
