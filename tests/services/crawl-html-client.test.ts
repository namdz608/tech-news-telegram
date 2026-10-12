import { describe, expect, it, vi } from 'vitest';
import { CrawlHtmlClient } from '../../src/services/crawl-html-client';
import { parseSjcGoldQuote } from '../../src/services/gold-price/sjc.adapter';

const URL = 'https://www.sjc.com.vn/bieu-do-gia-vang';
const HTML = '<html><body>Đơn vị: nghìn VND/lượng. Cập nhật 09/10/2026 09:15:00 <table><tr><td>SJC 1L</td><td>143.000</td><td>146.000</td></tr></table></body></html>';
const reader = () => ({ retrieve: vi.fn(async (url: string) => ({ finalUrl: url, contentType: 'text/html', text: HTML })) });

describe('HTML fallback preserves source parsers', () => {
  it('keeps Reader fallback for an HTTP 403 Cloudflare Access denied response', async () => {
    const native = { get: async () => ({ status: 403, data: '<title>Access denied | www.topcv.vn used Cloudflare to restrict access</title><body>Error 1020. This security service has blocked your request.</body>', headers: { 'content-type': 'text/html' } }) };
    const jina = reader();
    expect(await new CrawlHtmlClient(native, jina, true).get(URL)).toMatchObject({ data: HTML, status: 200, retrievalBackend: 'jina' });
    expect(jina.retrieve).toHaveBeenCalledTimes(1);
  });
  it('does not send an HTTP 403 authentication form to Reader', async () => {
    const response = { status: 403, data: '<title>Welcome back</title><main><form><input type="password"></form></main>', headers: { 'content-type': 'text/html' } };
    const jina = reader();
    expect(await new CrawlHtmlClient({ get: async () => response }, jina, true).get(URL)).toEqual(response);
    expect(jina.retrieve).not.toHaveBeenCalled();
  });
  it('uses Reader HTML when a public page returns an HTTP 200 bot challenge', async () => {
    const native = { get: async () => ({ status: 200, data: '<title>Just a moment...</title><body>Verify you are human</body>', headers: { 'content-type': 'text/html' } }) };
    const jina = reader();
    const response = await new CrawlHtmlClient(native, jina, true).get(URL);
    expect(response).toMatchObject({ data: HTML, status: 200, retrievalBackend: 'jina' });
    expect(jina.retrieve).toHaveBeenCalledWith(URL, 'html');
  });
  it('does not proxy a login form returned with HTTP 200', async () => {
    const response = { status: 200, data: '<title>Login</title><body><form><input type="password"></form></body>', headers: { 'content-type': 'text/html' } };
    const jina = reader();
    expect(await new CrawlHtmlClient({ get: async () => response }, jina, true).get(URL)).toEqual(response);
    expect(jina.retrieve).not.toHaveBeenCalled();
  });
  it.each([false, true])('preserves the native challenge if Reader is disabled or fails (enabled: %s)', async (enabled) => {
    const response = { status: 200, data: '<title>Just a moment...</title><body>Verify you are human</body>', headers: { 'content-type': 'text/html' } };
    const jina = { retrieve: vi.fn(async () => { throw new Error('jina-reader'); }) };
    expect(await new CrawlHtmlClient({ get: async () => response }, jina, enabled).get(URL)).toEqual(response);
    expect(jina.retrieve).toHaveBeenCalledTimes(enabled ? 1 : 0);
  });
  it.each([false, true])('preserves native error responses for existing fallback parsers (Reader enabled: %s)', async (enabled) => {
    const response = { data: '<html>Cloudflare blocked</html>', headers: { 'content-type': 'text/html' }, status: 403 };
    const native = { get: vi.fn(async () => response) };
    const jina = { retrieve: vi.fn(async () => { throw new Error('jina-reader'); }) };
    expect(await new CrawlHtmlClient(native, jina, enabled).get('https://www.topcv.vn/jobs')).toEqual(response);
    expect(jina.retrieve).toHaveBeenCalledTimes(enabled ? 1 : 0);
  });
  it('records the Reader backend for downstream structured parsers', async () => {
    const direct = { get: vi.fn(async () => { throw new Error('403'); }) };
    const jina = { retrieve: vi.fn(async (url: string) => ({ finalUrl: url, text: '<article>Source</article>', contentType: 'text/html', retrievalBackend: 'jina' as const })) };
    const response = await new CrawlHtmlClient(direct, jina, true).get('https://example.com/jobs');
    expect(response).toMatchObject({ retrievalBackend: 'jina', data: '<article>Source</article>' });
  });
  it('returns direct HTML without an additional provider call', async () => {
    const native = { get: async () => ({ data: HTML, headers: { 'content-type': 'text/html' } }) };
    const jina = reader();
    expect((await new CrawlHtmlClient(native, jina, true).get(URL)).data).toBe(HTML);
    expect(jina.retrieve).not.toHaveBeenCalled();
  });

  it('keeps the original gold unit, table values and timestamp when native fetch fails', async () => {
    const native = { get: async () => { throw new Error('request blocked'); } };
    const jina = reader();
    const result = await new CrawlHtmlClient(native, jina, true).get(URL);
    expect(parseSjcGoldQuote(result.data)).toMatchObject({ quoteKind: 'buy-sell', buy: 143000, sell: 146000, sourceUnit: 'thousand-vnd-per-tael', sourceTimestamp: '2026-10-09T02:15:00.000Z' });
    expect(jina.retrieve).toHaveBeenCalledWith(URL, 'html');
  });

  it('keeps fail-closed gold parsing when reader returns no unit', async () => {
    const native = { get: async () => { throw new Error('request blocked'); } };
    const jina = reader();
    jina.retrieve.mockResolvedValue({ finalUrl: URL, contentType: 'text/html', text: HTML.replace('nghìn VND/lượng', 'unknown') });
    const result = await new CrawlHtmlClient(native, jina, true).get(URL);
    expect(() => parseSjcGoldQuote(result.data)).toThrow();
  });

  it('never replaces RSS/JSON endpoints or login-backed social pages with rendered HTML', async () => {
    const native = { get: async () => { throw new Error('native-failure'); } };
    const jina = reader();
    for (const url of ['https://example.com/feed.xml', 'https://example.com/api/data', 'https://example.com/jobs.json', 'https://www.reddit.com/r/devops']) {
      await expect(new CrawlHtmlClient(native, jina, true).get(url)).rejects.toThrow('native-failure');
    }
    expect(jina.retrieve).not.toHaveBeenCalled();
  });

  it('honors disable and rejects provider HTML reported as text', async () => {
    const native = { get: async () => { throw new Error('native-failure'); } };
    const jina = reader();
    await expect(new CrawlHtmlClient(native, jina, false).get(URL)).rejects.toThrow('native-failure');
    expect(jina.retrieve).not.toHaveBeenCalled();
    jina.retrieve.mockResolvedValue({ finalUrl: URL, contentType: 'text/plain', text: 'A summary of prices' });
    await expect(new CrawlHtmlClient(native, jina, true).get(URL)).rejects.toThrow('crawl-html');
  });
});
