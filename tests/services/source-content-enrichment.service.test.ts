import { describe, expect, it, vi } from 'vitest';
import { SourceContentEnrichmentService } from '../../src/services/source-content-enrichment.service';

const BODY = 'Kubernetes v1.35 fixed the controller race condition; users should verify the rollout. '.repeat(10);
const input = (url = 'https://kubernetes.io/blog/fix') => ({
  title: 'Kubernetes fix', url, summary: 'Short RSS excerpt', publishedAt: '2026-10-09T02:00:00.000Z',
  author: 'Maintainer', company: 'Example', salary: '1000 USD', sourceTextStatus: 'search-excerpt' as const,
});
const config = { enabled: true, maxItems: 2, concurrency: 2, maxChars: 4000 };
const reader = () => ({ retrieve: vi.fn(async (url: string) => ({ finalUrl: url, contentType: 'text/html', text: `<nav>menu</nav><article>${BODY}</article><footer>advertisement</footer>`, retrievalBackend: 'direct' as const })) });

describe('source content enrichment', () => {
  it.each(['https://kubernetes.io/', 'https://kubernetes.io/blog/', 'https://other.example.com/unrelated-story'])('keeps the original excerpt after a redirect to unrelated content: %s', async (finalUrl) => {
    const retrieval = { retrieve: vi.fn(async () => ({ finalUrl, contentType: 'text/html', text: `<title>Latest headlines</title><main>${BODY}</main>` })) };
    const original = input();
    expect(await new SourceContentEnrichmentService(retrieval, config).enrich([original])).toEqual([original]);
  });
  it('allows HTTPS, www, tracking and trailing-slash normalization for the same article', async () => {
    const original = input('http://www.kubernetes.io/blog/fix/?utm_source=rss');
    const retrieval = { retrieve: vi.fn(async () => ({ finalUrl: 'https://kubernetes.io/blog/fix', contentType: 'text/html', text: `<article>${BODY}</article>` })) };
    const [result] = await new SourceContentEnrichmentService(retrieval, config).enrich([original]);
    expect(result).toMatchObject({ url: original.url, title: original.title, publishedAt: original.publishedAt, summary: BODY.trim(), sourceTextStatus: 'full' });
  });
  it('allows a changed article URL when the article heading identifies the original story', async () => {
    const original = input();
    const retrieval = { retrieve: vi.fn(async () => ({ finalUrl: 'https://kubernetes.io/blog/canonical-fix', contentType: 'text/html', text: `<article><h1>${original.title}</h1><p>${BODY}</p></article>` })) };
    const [result] = await new SourceContentEnrichmentService(retrieval, config).enrich([original]);
    expect(result).toMatchObject({ url: original.url, publishedAt: original.publishedAt, sourceTextStatus: 'full' });
    expect(result.summary).toContain(BODY.trim());
  });
  it('does not replace an excerpt with a subscriber login page', async () => {
    const retrieval = { retrieve: vi.fn(async () => ({ finalUrl: 'https://publisher.example.com/login', contentType: 'text/html', text: '<title>Login</title><body>Welcome back to our subscriber portal. Access your account to continue reading exclusive stories. New members can register for full access.<form>Email Password</form></body>' })) };
    expect(await new SourceContentEnrichmentService(retrieval, config).enrich([input()])).toEqual([input()]);
  });
  it('preserves native structured job descriptions, including bounded native parser output', async () => {
    const retrieval = reader();
    const originals = [
      { ...input(), summary: BODY, jobDetails: { description: BODY }, sourceTextStatus: 'full' as const },
      { ...input('https://jobs.example.com/detail'), summary: `${BODY}…`, jobDetails: { description: `${BODY}…` }, sourceTextStatus: 'incomplete' as const, retrievalBackend: 'direct' as const },
      { ...input('https://jobs.example.com/jina-detail'), summary: `${BODY}…`, jobDetails: { description: `${BODY}…` }, sourceTextStatus: 'incomplete' as const, retrievalBackend: 'jina' as const },
    ];
    expect(await new SourceContentEnrichmentService(retrieval, config).enrich(originals)).toEqual(originals);
    expect(retrieval.retrieve).not.toHaveBeenCalled();
  });
  it('preserves the source excerpt when the final URL is a social login page', async () => {
    const retrieval = { retrieve: vi.fn(async () => ({ finalUrl: 'https://x.com/i/flow/login', contentType: 'text/html', text: '<html><title>X. It’s what’s happening</title><body>Happening now. Join today. Sign in with Google or Apple. By signing up, you agree to Terms of Service and Privacy Policy.</body></html>' })) };
    expect(await new SourceContentEnrichmentService(retrieval, config).enrich([input()])).toEqual([input()]);
  });
  it('extracts article content, preserves source identity/date and distinguishes full text', async () => {
    const original = input();
    const [result] = await new SourceContentEnrichmentService(reader(), config).enrich([original]);
    expect(result).toMatchObject({ ...original, summary: BODY.trim(), sourceTextStatus: 'full', retrievalBackend: 'direct' });
    expect(result.summary).not.toContain('advertisement');
    expect(original.summary).toBe('Short RSS excerpt');
  });

  it('enriches job descriptions and infra bodies without overwriting salary, company or answers', async () => {
    const job = { ...input(), description: 'short JD' };
    const infra = { ...input('https://kubernetes.io/blog/infra'), body: '', answers: [{ body: 'Original comment' }] };
    const results = await new SourceContentEnrichmentService(reader(), config).enrich([job, infra]);
    expect(results[0]).toMatchObject({ description: BODY.trim(), salary: job.salary, company: job.company });
    expect(results[1]).toMatchObject({ body: BODY.trim(), answers: infra.answers });
  });

  it('deduplicates requests and obeys a budget of unique URLs', async () => {
    const retrieval = reader();
    const inputs = [input(), input(), input('https://kubernetes.io/second'), input('https://kubernetes.io/third')];
    const result = await new SourceContentEnrichmentService(retrieval, config).enrich(inputs);
    expect(retrieval.retrieve).toHaveBeenCalledTimes(2);
    expect(result[1].summary).toBe(BODY.trim());
    expect(result[3]).toEqual(inputs[3]);
  });

  it('isolates retrieval failure and preserves the excerpt status', async () => {
    const retrieval = reader();
    retrieval.retrieve.mockRejectedValueOnce(new Error('jina-reader'));
    const originals = [input(), input('https://kubernetes.io/second')];
    const result = await new SourceContentEnrichmentService(retrieval, config).enrich(originals);
    expect(result[0]).toEqual(originals[0]);
    expect(result[1].sourceTextStatus).toBe('full');
  });

  it.each(['<html><title>Just a moment...</title><body>Verify you are human</body></html>', '<html><nav>menu '.repeat(20) + '</nav></html>', '{"code":429,"message":"quota"}'])('does not promote navigation or error pages to full content', async (text) => {
    const retrieval = { retrieve: vi.fn(async () => ({ finalUrl: input().url, contentType: 'text/html', text })) };
    expect(await new SourceContentEnrichmentService(retrieval, config).enrich([input()])).toEqual([input()]);
  });

  it('does not route social threads or repository metadata through a web reader', async () => {
    const retrieval = reader();
    const originals = [input('https://www.reddit.com/r/devops/comments/123'), input('https://x.com/user/status/123'), input('https://github.com/user/repo')];
    expect(await new SourceContentEnrichmentService(retrieval, config).enrich(originals)).toEqual(originals);
    expect(retrieval.retrieve).not.toHaveBeenCalled();
  });

  it('does not retrieve already full infra content', async () => {
    const retrieval = reader();
    const original = { ...input(), body: BODY, sourceTextStatus: 'full' as const };
    expect(await new SourceContentEnrichmentService(retrieval, config).enrich([original])).toEqual([original]);
    expect(retrieval.retrieve).not.toHaveBeenCalled();
  });

  it('honors the kill switch and marks truncated source text incomplete', async () => {
    const retrieval = reader();
    expect(await new SourceContentEnrichmentService(retrieval, { ...config, enabled: false }).enrich([input()])).toEqual([input()]);
    expect(retrieval.retrieve).not.toHaveBeenCalled();
    const [truncated] = await new SourceContentEnrichmentService(retrieval, { ...config, maxChars: 100 }).enrich([input()]);
    expect(truncated.summary?.length).toBe(100);
    expect(truncated.sourceTextStatus).toBe('incomplete');
  });
});
