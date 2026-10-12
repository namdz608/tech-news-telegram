import { afterEach, describe, expect, it, vi } from 'vitest';
import { crawlTopcv } from '../../src/crawlers/vn-jobs/topcv.adapter';
import * as flare from '../../src/crawlers/vn-jobs/flaresolverr';
import { CrawlHtmlClient } from '../../src/services/crawl-html-client';

afterEach(() => vi.restoreAllMocks());

describe('TopCV native fallback through Reader wrapper', () => {
  it.each([false, true])('still reaches FlareSolverr when Reader cannot supply HTML (enabled: %s)', async (enabled) => {
    const solver = vi.spyOn(flare, 'fetchHtmlViaFlareSolverr').mockResolvedValue({ status: 200, data: '<div class="job-item-search-result"><h3 class="title"><a href="https://www.topcv.vn/viec-lam/devops/123.html">DevOps Engineer</a></h3><a class="company">Example</a></div>' });
    const native = { get: async () => ({ data: '<html>Cloudflare blocked</html>', headers: {}, status: 403 }) };
    const reader = { retrieve: vi.fn(async () => { throw new Error('jina-reader'); }) };
    const client = new CrawlHtmlClient(native, reader, enabled);
    const jobs = await crawlTopcv('devops', { get: async (url) => {
      const response = await client.get(url);
      return { ...response, data: String(response.data) };
    } });
    expect(solver).toHaveBeenCalledTimes(1);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe('DevOps Engineer');
  });
});
