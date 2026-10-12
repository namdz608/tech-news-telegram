import { describe, expect, it, vi } from 'vitest';
import { HtmlCrawler } from '../../src/crawlers/html.crawler';
import type { HtmlSourceConfig } from '../../src/types/source';

describe('HtmlCrawler', () => {
  it('uses Reader HTML for discovery when the native list request fails', async () => {
    const direct = { get: vi.fn(async () => { throw new Error('403'); }) };
    const reader = { retrieve: vi.fn(async (url: string) => ({ finalUrl: url, contentType: 'text/html', text: '<article><a href="/ai">AI model update</a><time datetime="2026-07-12T09:00:00.000Z"></time></article>' })) };
    const source: HtmlSourceConfig = {
      id: 'html-fallback', name: 'HTML fallback', kind: 'html', enabled: true,
      homepageUrl: 'https://example.com', listUrl: 'https://example.com/news',
      selectors: { item: 'article', title: 'a', url: 'a', publishedAt: 'time' },
    };
    const articles = await new HtmlCrawler(direct, reader, true).crawl(source);
    expect(reader.retrieve).toHaveBeenCalledWith(source.listUrl, 'html');
    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({ url: 'https://example.com/ai', title: 'AI model update', publishedAt: '2026-07-12T09:00:00.000Z', sourceTextStatus: 'incomplete' });
  });
  it('maps selected HTML cards into normalized matching articles', async () => {
    const source: HtmlSourceConfig = {
      id: 'test-html',
      name: 'Test HTML',
      kind: 'html',
      enabled: true,
      homepageUrl: 'https://example.com',
      listUrl: 'https://example.com/news',
      selectors: {
        item: '.post',
        title: '.title',
        url: 'a',
        summary: '.summary',
        publishedAt: 'time',
      },
    };

    const crawler = new HtmlCrawler({
      get: async () => ({
        data: `
          <article class="post">
            <a href="/ai-security-k8s"><h2 class="title">AI security for Kubernetes</h2></a>
            <p class="summary">Security guidance for k8s clusters</p>
            <time datetime="2026-06-09T00:00:00.000Z">Jun 9</time>
          </article>
        `,
      }),
    });

    const articles = await crawler.crawl(source);

    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({
      sourceId: 'test-html',
      sourceName: 'Test HTML',
      title: 'AI security for Kubernetes',
      url: 'https://example.com/ai-security-k8s',
      topics: expect.arrayContaining(['ai', 'k8s', 'security']),
    });
  });

  it('extracts an image url with the configured image selector', async () => {
    const http = {
      get: async () => ({
        data: `
          <article class="post">
            <a class="title" href="/ai">AI security update</a>
            <p class="summary">OpenAI security details</p>
            <img src="/image.png" />
          </article>
        `,
      }),
    };

    const articles = await new HtmlCrawler(http).crawl({
      id: 'html-one',
      name: 'HTML One',
      kind: 'html',
      enabled: true,
      homepageUrl: 'https://example.com',
      listUrl: 'https://example.com/news',
      selectors: {
        item: '.post',
        title: '.title',
        url: '.title',
        summary: '.summary',
        image: 'img',
      },
    });

    expect(articles[0].imageUrl).toBe('https://example.com/image.png');
  });
});
