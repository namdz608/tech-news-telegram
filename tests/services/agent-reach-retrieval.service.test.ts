import { describe, expect, it, vi } from 'vitest';
import { JinaReaderService, AgentReachRetrievalService } from '../../src/services/agent-reach-retrieval.service';
import { SafeWebRetrievalService, createSafeWebRetrievalDependencies, isPublicHttpUrl } from '../../src/services/safe-web-retrieval.service';

const URL = 'https://kubernetes.io/blog/post';
const BODY = 'Kubernetes fixes a controller race condition. '.repeat(8);
function setup(payload: unknown = { code: 200, data: { url: URL, title: 'Controller fix', content: BODY } }) {
  const http = { get: vi.fn(async () => ({ data: payload, headers: { 'content-type': 'application/json' } })) };
  const policy = { assertPublicUrl: vi.fn(async (url: string) => url) };
  return { http, policy, reader: new JinaReaderService(http, policy, { apiKey: '', timeoutMs: 5000 }) };
}

describe('Jina Reader', () => {
  it('accepts an article about signing container images', async () => {
    const { reader } = setup({ code: 200, data: { url: URL, title: 'Signing container images with Cosign', text: BODY } });
    expect(await reader.retrieve(URL)).toMatchObject({ text: BODY, retrievalBackend: 'jina' });
  });
  it('reads format-specific text envelopes returned by the live Jina API', async () => {
    const { reader } = setup({ code: 200, data: { url: URL, title: 'Controller fix', text: BODY } });
    expect(await reader.retrieve(URL)).toMatchObject({ text: BODY, contentType: 'text/plain' });
  });
  it('reads format-specific HTML envelopes returned by the live Jina API', async () => {
    const html = '<html><body><article>Original HTML</article></body></html>';
    const { reader } = setup({ code: 200, data: { url: URL, title: 'Controller fix', html } });
    expect(await reader.retrieve(URL, 'html')).toMatchObject({ text: html, contentType: 'text/html' });
  });
  it('reads a verified source and returns its URL rather than the proxy URL', async () => {
    const { reader, http, policy } = setup();
    expect(await reader.retrieve(URL)).toMatchObject({ finalUrl: URL, contentType: 'text/plain', text: BODY, retrievalBackend: 'jina' });
    expect(policy.assertPublicUrl).toHaveBeenCalledWith(URL);
    expect(http.get.mock.calls[0][0]).toBe(`https://r.jina.ai/${URL}`);
    expect(http.get.mock.calls[0][1].headers).toMatchObject({ Accept: 'application/json', 'X-Return-Format': 'text' });
  });

  it('can return HTML for existing selectors without substituting a text summary', async () => {
    const html = '<html><table><tr><td>SJC 1L</td><td>143000</td></tr></table></html>';
    const { reader, http } = setup({ code: 200, data: { url: URL, title: 'Prices', content: html } });
    expect(await reader.retrieve(URL, 'html')).toMatchObject({ text: html, contentType: 'text/html' });
    expect(http.get.mock.calls[0][1].headers['X-No-Cache']).toBe('true');
  });

  it.each(['https://reddit.com/r/devops', 'https://x.com/one', 'https://www.facebook.com/one', 'https://instagram.com/one', 'https://www.linkedin.com/jobs/view/123', 'https://discord.com/channels/123', 'https://discord.gg/invite', 'https://www.tiktok.com/@user', 'https://publisher.example.com/login'])('does not proxy login-backed social URLs: %s', async (url) => {
    const { reader, http } = setup();
    await expect(reader.retrieve(url)).rejects.toThrow('unsupported-reader-source');
    expect(http.get).not.toHaveBeenCalled();
  });

  it('rejects an unsafe target before contacting the proxy', async () => {
    const { reader, http, policy } = setup();
    policy.assertPublicUrl.mockRejectedValue(new Error('unsafe-address'));
    await expect(reader.retrieve('http://127.0.0.1/secret')).rejects.toThrow('unsafe-address');
    expect(http.get).not.toHaveBeenCalled();
  });

  it.each([
    { code: 429, data: { url: URL, content: BODY } },
    { code: 200, data: { url: URL, content: BODY, httpStatus: 403 } },
    { code: 200, data: { url: URL, content: '' } },
    { code: 200, data: { url: URL, title: 'Just a moment...', content: 'Verify you are human '.repeat(20) } },
    { code: 200, data: { url: 'https://another.example/login', content: BODY } },
    { code: 200, data: { url: URL, content: 'x'.repeat(600_000) } },
    '<html>Rate limited</html>',
  ])('rejects unusable responses without leaking their bodies', async (payload) => {
    await expect(setup(payload).reader.retrieve(URL)).rejects.toThrow('jina-reader');
  });

  it('keeps credentials out of errors', async () => {
    const { reader, http } = setup();
    http.get.mockRejectedValue(new Error('Bearer private-key'));
    await expect(reader.retrieve(URL)).rejects.toThrow(/^jina-reader$/);
  });
});

describe('Agent Reach retrieval routing', () => {
  it('uses Reader when a public article returns an HTTP 200 bot challenge', async () => {
    const direct = { retrieve: vi.fn(async () => ({ finalUrl: URL, contentType: 'text/html', text: '<title>Just a moment...</title><body>Verify you are human</body>' })) };
    const reader = setup().reader;
    const spy = vi.spyOn(reader, 'retrieve');
    expect(await new AgentReachRetrievalService(direct, reader, true).retrieve(URL)).toMatchObject({ text: BODY, retrievalBackend: 'jina' });
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('does not use Reader for a bot challenge on an authentication form', async () => {
    const direct = { retrieve: vi.fn(async () => ({ finalUrl: URL, contentType: 'text/html', text: '<title>Just a moment...</title><body>Verify you are human<form><input type="password"></form></body>' })) };
    const reader = setup().reader;
    const spy = vi.spyOn(reader, 'retrieve');
    await expect(new AgentReachRetrievalService(direct, reader, true).retrieve(URL)).rejects.toThrow('unavailable-source-content');
    expect(spy).not.toHaveBeenCalled();
  });
  it('keeps the Reader kill switch for HTTP 200 challenges', async () => {
    const direct = { retrieve: vi.fn(async () => ({ finalUrl: URL, contentType: 'text/html', text: '<title>Just a moment...</title><body>Verify you are human</body>' })) };
    const reader = setup().reader;
    const spy = vi.spyOn(reader, 'retrieve');
    await expect(new AgentReachRetrievalService(direct, reader, false).retrieve(URL)).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
  it('does not mistake a Signing article title for a Sign in page', async () => {
    const content = { finalUrl: URL, contentType: 'text/html', text: `<title>Signing container images with Cosign</title><article>${BODY}</article>` };
    const direct = { retrieve: vi.fn(async () => content) };
    const reader = setup().reader;
    const spy = vi.spyOn(reader, 'retrieve');
    expect(await new AgentReachRetrievalService(direct, reader, true).retrieve(URL)).toMatchObject({ ...content, retrievalBackend: 'direct' });
    expect(spy).not.toHaveBeenCalled();
  });
  it.each([
    { finalUrl: 'https://publisher.example.com/login', contentType: 'text/html', text: '<title>Login</title><body>Welcome back to our subscriber portal. Access your account to continue reading exclusive stories.</body>' },
    { finalUrl: 'https://www.topcv.vn/dang-nhap', contentType: 'text/html', text: '<title>Đăng nhập tài khoản - TopCV</title><body>Chào mừng bạn quay trở lại. Đăng nhập để sử dụng dịch vụ dành cho người tìm việc.</body>' },
    { finalUrl: 'https://publisher.example.com/users/sign_in', contentType: 'text/html', text: '<title>Welcome back</title><body>Continue to read subscriber stories.<form><input type="password"></form></body>' },
    { finalUrl: URL, contentType: 'text/html', text: '<title>Welcome back</title><body>Continue to read subscriber stories.<form><input type="password"></form></body>' },
    { finalUrl: URL, contentType: 'text/html', text: '<title>Authentication required</title><body>Access your account to continue reading exclusive stories.</body>' },
  ])('rejects native authentication pages without reader fallback', async (content) => {
    const direct = { retrieve: vi.fn(async () => content) };
    const reader = setup().reader;
    const spy = vi.spyOn(reader, 'retrieve');
    await expect(new AgentReachRetrievalService(direct, reader, true).retrieve(URL)).rejects.toThrow('unavailable-source-content');
    expect(spy).not.toHaveBeenCalled();
  });
  it('rejects a successful direct response redirected to a social login page', async () => {
    const direct = { retrieve: vi.fn(async () => ({ finalUrl: 'https://x.com/i/flow/login', contentType: 'text/html', text: '<article>Happening now. Join today.</article>' })) };
    const reader = setup().reader;
    const spy = vi.spyOn(reader, 'retrieve');
    await expect(new AgentReachRetrievalService(direct, reader, true).retrieve(URL)).rejects.toThrow('unsupported-reader-source');
    expect(spy).not.toHaveBeenCalled();
  });
  it('rejects a social target before making a native request', async () => {
    const direct = { retrieve: vi.fn() };
    await expect(new AgentReachRetrievalService(direct, setup().reader, true).retrieve('https://x.com/i/flow/login')).rejects.toThrow('unsupported-reader-source');
    expect(direct.retrieve).not.toHaveBeenCalled();
  });
  it('enforces optional URL policy before following redirects', async () => {
    const deps = createSafeWebRetrievalDependencies();
    deps.lookup = async () => [{ address: '8.8.8.8', family: 4 }];
    deps.request = vi.fn(async () => ({ statusCode: 302, headers: { location: 'https://x.com/i/flow/login' }, body: (async function* () {})(), destroy: vi.fn() }));
    const direct = new SafeWebRetrievalService(deps, { timeoutMs: 5000, maxBytes: 512 * 1024, maxRedirects: 3, userAgent: 'test', allowUrl: (url) => url.hostname !== 'x.com' });
    await expect(new AgentReachRetrievalService(direct, setup().reader, true).retrieve(URL)).rejects.toThrow('unsafe-url');
    expect(deps.request).toHaveBeenCalledTimes(1);
  });
  it.each(['http://192.0.0.1/', 'http://198.18.0.1/', 'http://127.0.0.1/', 'http://[fec0::1]/', 'http://[2001:2::1]/', 'http://[100::1]/', 'http://[3fff::1]/', 'https://example.internal/', 'https://user:password@example.com/'])('rejects non-public search targets %s', (url) => {
    expect(isPublicHttpUrl(url)).toBe(false);
  });
  it.each(['https://kubernetes.io/blog/', 'https://[2606:4700:4700::1111]/path'])('allows public search targets %s', (url) => {
    expect(isPublicHttpUrl(url)).toBe(true);
  });
  it('keeps a successful direct response', async () => {
    const direct = { retrieve: vi.fn(async () => ({ finalUrl: URL, contentType: 'text/html', text: '<article>source</article>' })) };
    const jina = setup().reader;
    const spy = vi.spyOn(jina, 'retrieve');
    expect(await new AgentReachRetrievalService(direct, jina, true).retrieve(URL)).toMatchObject({ retrievalBackend: 'direct' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('falls back after a transport or status failure', async () => {
    const direct = { retrieve: vi.fn(async () => { throw new Error('unexpected-status'); }) };
    expect(await new AgentReachRetrievalService(direct, setup().reader, true).retrieve(URL)).toMatchObject({ text: BODY, retrievalBackend: 'jina' });
  });

  it.each(['unsafe-url', 'unsafe-address', 'redirect-limit', 'response-too-large', 'unsupported-content-type'])('does not bypass the direct policy: %s', async (code) => {
    const direct = { retrieve: vi.fn(async () => { throw new Error(code); }) };
    const reader = setup().reader;
    const spy = vi.spyOn(reader, 'retrieve');
    await expect(new AgentReachRetrievalService(direct, reader, true).retrieve(URL)).rejects.toThrow(code);
    expect(spy).not.toHaveBeenCalled();
  });

  it('honors the kill switch', async () => {
    const direct = { retrieve: vi.fn(async () => { throw new Error('unexpected-status'); }) };
    const reader = setup().reader;
    const spy = vi.spyOn(reader, 'retrieve');
    await expect(new AgentReachRetrievalService(direct, reader, false).retrieve(URL)).rejects.toThrow('unexpected-status');
    expect(spy).not.toHaveBeenCalled();
  });

  it('validates DNS without requesting the target', async () => {
    const deps = createSafeWebRetrievalDependencies();
    deps.lookup = async () => [{ address: '8.8.8.8', family: 4 }];
    deps.request = vi.fn();
    const service = new SafeWebRetrievalService(deps);
    expect(await service.assertPublicUrl(URL)).toBe(URL);
    await expect(service.assertPublicUrl('http://127.0.0.1/private')).rejects.toThrow('unsafe-address');
    expect(deps.request).not.toHaveBeenCalled();
  });
});
