import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { RssCrawler } from '../../src/crawlers/rss.crawler';
import type { RssSourceConfig } from '../../src/types/source';
import { redditHttpsAgent } from '../../src/utils/reddit-dns';

const MAX_FEED_BODY_BYTES = 512 * 1024;
const MAX_NORMALIZED_SUMMARY_CHARS = 4000;

function politicsRssSource(overrides: Partial<RssSourceConfig> = {}): RssSourceConfig {
  return {
    id: 'vnexpress-thoi-su',
    name: 'VnExpress Thời sự',
    kind: 'rss',
    enabled: true,
    homepageUrl: 'https://vnexpress.net/thoi-su',
    feedUrl: 'https://vnexpress.net/rss/thoi-su.rss',
    includeUnmatched: true,
    boundedFeedFetch: true,
    enrichArticlePage: false,
    maxItems: 20,
    ...overrides,
  };
}

async function withServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  run: (ctx: { origin: string; requests: string[] }) => Promise<void>,
): Promise<void> {
  const requests: string[] = [];
  const server = http.createServer((req, res) => {
    requests.push(`${req.method ?? 'GET'} ${req.url ?? '/'}`);
    handler(req, res);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  try {
    await run({ origin: `http://127.0.0.1:${port}`, requests });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe('RssCrawler', () => {
  it('retains unmatched articles only when the RSS source opts in', async () => {
    const parser = {
      parseURL: vi.fn().mockResolvedValue({
        items: [
          {
            title: 'New laptop with 32 GB RAM',
            link: 'https://example.com/laptop',
            contentSnippet: 'Consumer hardware announcement',
            enclosure: { url: 'https://example.com/laptop.jpg', type: 'image/jpeg' },
          },
        ],
      }),
    };
    const crawler = new RssCrawler(parser, { get: vi.fn() });
    const baseSource = {
      id: 'gadgets',
      name: 'Gadgets',
      kind: 'rss' as const,
      enabled: true,
      homepageUrl: 'https://example.com',
      feedUrl: 'https://example.com/feed.xml',
    };

    await expect(crawler.crawl(baseSource)).resolves.toEqual([]);
    await expect(crawler.crawl({ ...baseSource, includeUnmatched: true })).resolves.toEqual([
      expect.objectContaining({
        title: 'New laptop with 32 GB RAM',
        url: 'https://example.com/laptop',
        topics: [],
      }),
    ]);
  });

  it('configures default RSS clients with forum headers and Reddit-aware DNS', () => {
    const crawler = new RssCrawler();
    const parser = (
      crawler as unknown as {
        parser: {
          options?: {
            headers?: Record<string, string>;
            requestOptions?: { agent?: unknown; lookup?: unknown };
          };
        };
      }
    ).parser;
    const http = (crawler as unknown as { http: { defaults?: { httpsAgent?: unknown } } }).http;

    expect(parser.options?.headers?.['User-Agent']).toBeTruthy();
    expect(parser.options?.headers?.Accept).toContain('application/rss+xml');
    expect(parser.options?.requestOptions?.agent).toBeUndefined();
    expect(parser.options?.requestOptions?.lookup).toBeTypeOf('function');
    expect(http.defaults?.httpsAgent).toBe(redditHttpsAgent);
  });

  it('maps RSS items into normalized matching articles', async () => {
    const source: RssSourceConfig = {
      id: 'test-rss',
      name: 'Test RSS',
      kind: 'rss',
      enabled: true,
      homepageUrl: 'https://example.com',
      feedUrl: 'https://example.com/feed.xml',
    };

    const crawler = new RssCrawler({
      parseURL: async () => ({
        items: [
          {
            title: 'OpenAI releases a Kubernetes security tool',
            link: 'https://example.com/post?utm_source=newsletter',
            contentSnippet: 'AI and k8s security update',
            isoDate: '2026-06-09T00:00:00.000Z',
            creator: 'Jane',
          },
          {
            title: 'A cooking story',
            link: 'https://example.com/food',
            contentSnippet: 'No matching tech topic',
          },
        ],
      }),
    });

    const articles = await crawler.crawl(source);

    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({
      sourceId: 'test-rss',
      sourceName: 'Test RSS',
      title: 'OpenAI releases a Kubernetes security tool',
      url: 'https://example.com/post',
      topics: expect.arrayContaining(['ai', 'k8s', 'security']),
    });
  });

  it('decodes HTML entities in RSS titles and summaries', async () => {
    const crawler = new RssCrawler({
      parseURL: async () => ({
        items: [
          {
            title: 'Nhiều b&aacute;c sĩ giỏi tuyến huyện bỏ l&ecirc;n thành phố',
            link: 'https://thanhnien.vn/example.htm',
            contentSnippet: 'Đ&acirc;y l&agrave; nội dung &#039;thử nghiệm&#039;.',
          },
        ],
      }),
    });

    const articles = await crawler.crawl({
      id: 'thanhnien-thoi-su',
      name: 'Thanh Niên Thời sự',
      kind: 'rss',
      enabled: true,
      homepageUrl: 'https://thanhnien.vn/thoi-su.htm',
      feedUrl: 'https://thanhnien.vn/rss/thoi-su.rss',
      includeUnmatched: true,
      enrichArticlePage: false,
    });

    expect(articles[0]).toMatchObject({
      title: 'Nhiều bác sĩ giỏi tuyến huyện bỏ lên thành phố',
      summary: "Đây là nội dung 'thử nghiệm'.",
    });
  });

  it('uses source default topics for forum feeds with short post titles', async () => {
    const source: RssSourceConfig = {
      id: 'reddit-local-llama',
      name: 'Reddit r/LocalLLaMA',
      kind: 'rss',
      enabled: true,
      homepageUrl: 'https://www.reddit.com/r/LocalLLaMA',
      feedUrl: 'https://www.reddit.com/r/LocalLLaMA/.rss?limit=10',
      defaultTopics: ['ai'],
    };

    const crawler = new RssCrawler({
      parseURL: async () => ({
        items: [
          {
            title: "What's the lesson chat?",
            link: 'https://www.reddit.com/r/LocalLLaMA/comments/example/post/',
            contentSnippet: 'A community discussion without obvious topic keywords',
            isoDate: '2026-06-09T00:00:00.000Z',
            creator: '/u/jane',
          },
        ],
      }),
    });

    const articles = await crawler.crawl(source);

    expect(articles).toHaveLength(1);
    expect(articles[0].topics).toEqual(['ai']);
    expect(articles[0]).toMatchObject({
      sourceId: 'reddit-local-llama',
      sourceName: 'Reddit r/LocalLLaMA',
      title: "What's the lesson chat?",
    });
  });

  it('extracts an image url from RSS enclosures', async () => {
    const parser = {
      parseURL: async () => ({
        items: [
          {
            title: 'AI model launch',
            link: 'https://example.com/ai',
            contentSnippet: 'OpenAI model update',
            isoDate: '2026-06-09T00:00:00.000Z',
            enclosure: {
              url: 'https://example.com/image.png',
              type: 'image/png',
            },
          },
        ],
      }),
    };

    const articles = await new RssCrawler(parser).crawl({
      id: 'rss-one',
      name: 'RSS One',
      kind: 'rss',
      enabled: true,
      homepageUrl: 'https://example.com',
      feedUrl: 'https://example.com/feed.xml',
    });

    expect(articles[0].imageUrl).toBe('https://example.com/image.png');
  });

  it('decodes HTML entities in RSS image urls', async () => {
    const parser = {
      parseURL: async () => ({
        items: [
          {
            title: 'OpenAI benchmark image',
            link: 'https://www.reddit.com/r/OpenAI/comments/example/benchmark/',
            contentSnippet: 'OpenAI benchmark update',
            content:
              '<img src="https://preview.redd.it/example.png?width=640&amp;crop=smart&amp;auto=webp&amp;s=signature" />',
          },
        ],
      }),
    };

    const articles = await new RssCrawler(parser).crawl({
      id: 'reddit-openai',
      name: 'Reddit r/OpenAI',
      kind: 'rss',
      enabled: true,
      homepageUrl: 'https://www.reddit.com/r/OpenAI',
      feedUrl: 'https://www.reddit.com/r/OpenAI/.rss?limit=10',
      defaultTopics: ['ai'],
    });

    expect(articles[0].imageUrl).toBe(
      'https://preview.redd.it/example.png?width=640&crop=smart&auto=webp&s=signature',
    );
  });

  it('extracts an Open Graph image from the article page when the RSS item has no image', async () => {
    const parser = {
      parseURL: vi.fn().mockResolvedValue({
        items: [
          {
            title: 'External secrets for Kubernetes',
            link: 'https://example.com/kubernetes-secrets',
            contentSnippet: 'Kubernetes security and DevOps update',
            isoDate: '2026-06-09T00:00:00.000Z',
          },
        ],
      }),
      parseString: vi.fn(),
    };
    const http = {
      get: vi.fn().mockResolvedValue({
        data: `
          <html>
            <head>
              <meta property="og:image" content="https://example.com/article-diagram.jpg" />
            </head>
          </html>
        `,
      }),
    };
    const feedHttp = { get: vi.fn() };

    const articles = await new RssCrawler(parser, http, feedHttp).crawl({
      id: 'rss-one',
      name: 'RSS One',
      kind: 'rss',
      enabled: true,
      homepageUrl: 'https://example.com',
      feedUrl: 'https://example.com/feed.xml',
    });

    expect(parser.parseURL).toHaveBeenCalledTimes(1);
    expect(parser.parseURL).toHaveBeenCalledWith('https://example.com/feed.xml');
    expect(parser.parseString).not.toHaveBeenCalled();
    expect(feedHttp.get).not.toHaveBeenCalled();
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get).toHaveBeenCalledWith('https://example.com/kubernetes-secrets');
    expect(articles[0].imageUrl).toBe('https://example.com/article-diagram.jpg');
  });

  it('uses an external article Open Graph image for Reddit link posts without direct images', async () => {
    const requestedUrls: string[] = [];
    const parser = {
      parseURL: async () => ({
        items: [
          {
            title: 'Exclusive: AI scholar Dean Ball says he is heading to OpenAI',
            link: 'https://www.reddit.com/r/OpenAI/comments/1u9a5zr/exclusive_ai_scholar_dean_ball_says_hes_heading/?utm_source=feed#comments',
            contentSnippet: 'OpenAI policy update',
            content: `
              <table>
                <tr>
                  <td>
                    <span><a href="https://www.axios.com/2026/06/18/dean-ball-openai">[link]</a></span>
                    <span><a href="https://www.reddit.com/r/OpenAI/comments/1u9a5zr/exclusive_ai_scholar_dean_ball_says_hes_heading/">[comments]</a></span>
                  </td>
                </tr>
              </table>
            `,
            isoDate: '2026-06-19T00:00:00.000Z',
          },
        ],
      }),
    };
    const http = {
      get: async (url: string) => {
        requestedUrls.push(url);
        return {
          data: `
            <html>
              <head>
                <meta property="og:image" content="https://static.axios.com/openai-dean-ball.jpg" />
              </head>
            </html>
          `,
        };
      },
    };

    const articles = await new RssCrawler(parser, http).crawl({
      id: 'reddit-openai',
      name: 'Reddit r/OpenAI',
      kind: 'rss',
      enabled: true,
      homepageUrl: 'https://www.reddit.com/r/OpenAI',
      feedUrl: 'https://www.reddit.com/r/OpenAI/.rss?limit=10',
      defaultTopics: ['ai'],
    });

    expect(requestedUrls).toEqual(['https://www.axios.com/2026/06/18/dean-ball-openai']);
    expect(articles[0]).toMatchObject({
      url: 'https://www.reddit.com/r/OpenAI/comments/1u9a5zr/exclusive_ai_scholar_dean_ball_says_hes_heading',
      imageUrl: 'https://static.axios.com/openai-dean-ball.jpg',
    });
  });

  it('skips Reddit-owned subdomains when selecting an external article image for Reddit posts', async () => {
    const requestedUrls: string[] = [];
    const parser = {
      parseURL: async () => ({
        items: [
          {
            title: 'Dean Ball heads to OpenAI',
            link: 'https://www.reddit.com/r/OpenAI/comments/example/dean_ball_heads_to_openai/?utm_source=feed#comments',
            contentSnippet: 'OpenAI policy update',
            content: `
              <table>
                <tr>
                  <td>
                    <span><a href="https://preview.redd.it/not-the-article.jpg?width=640">[link]</a></span>
                    <span><a href="https://v.redd.it/not-the-article">[link]</a></span>
                    <span><a href="https://np.reddit.com/r/OpenAI/comments/example/not_external/">[link]</a></span>
                    <span><a href="https://www.axios.com/2026/06/18/dean-ball-openai">[link]</a></span>
                    <span><a href="https://www.reddit.com/r/OpenAI/comments/example/dean_ball_heads_to_openai/">[comments]</a></span>
                  </td>
                </tr>
              </table>
            `,
            isoDate: '2026-06-19T00:00:00.000Z',
          },
        ],
      }),
    };
    const http = {
      get: async (url: string) => {
        requestedUrls.push(url);
        return {
          data: `
            <html>
              <head>
                <meta property="og:image" content="https://static.axios.com/openai-dean-ball.jpg" />
              </head>
            </html>
          `,
        };
      },
    };

    const articles = await new RssCrawler(parser, http).crawl({
      id: 'reddit-openai',
      name: 'Reddit r/OpenAI',
      kind: 'rss',
      enabled: true,
      homepageUrl: 'https://www.reddit.com/r/OpenAI',
      feedUrl: 'https://www.reddit.com/r/OpenAI/.rss?limit=10',
      defaultTopics: ['ai'],
    });

    expect(requestedUrls).toEqual(['https://www.axios.com/2026/06/18/dean-ball-openai']);
    expect(articles[0].imageUrl).toBe('https://static.axios.com/openai-dean-ball.jpg');
  });

  it('does not fetch an external Reddit link-post article when the RSS item already has an image', async () => {
    const requestedUrls: string[] = [];
    const parser = {
      parseURL: async () => ({
        items: [
          {
            title: 'GPT 4.5 benchmark image',
            link: 'https://www.reddit.com/r/OpenAI/comments/1u9uaxb/gpt_45_in_minebench_refused_to_generate_the_given/',
            contentSnippet: 'OpenAI benchmark screenshot',
            content: `
              <table>
                <tr>
                  <td>
                    <img src="https://preview.redd.it/2quws2u6o68h1.gif?width=640" />
                    <span><a href="https://i.redd.it/2quws2u6o68h1.gif">[link]</a></span>
                    <span><a href="https://www.reddit.com/r/OpenAI/comments/1u9uaxb/gpt_45_in_minebench_refused_to_generate_the_given/">[comments]</a></span>
                  </td>
                </tr>
              </table>
            `,
            isoDate: '2026-06-19T00:00:00.000Z',
          },
        ],
      }),
    };
    const http = {
      get: async (url: string) => {
        requestedUrls.push(url);
        return { data: '<html></html>' };
      },
    };

    const articles = await new RssCrawler(parser, http).crawl({
      id: 'reddit-openai',
      name: 'Reddit r/OpenAI',
      kind: 'rss',
      enabled: true,
      homepageUrl: 'https://www.reddit.com/r/OpenAI',
      feedUrl: 'https://www.reddit.com/r/OpenAI/.rss?limit=10',
      defaultTopics: ['ai'],
    });

    expect(requestedUrls).toEqual([]);
    expect(articles[0].imageUrl).toBe('https://preview.redd.it/2quws2u6o68h1.gif?width=640');
  });

  it('does not use Reddit-specific external link parsing for non-Reddit RSS sources', async () => {
    const requestedUrls: string[] = [];
    const parser = {
      parseURL: async () => ({
        items: [
          {
            title: 'OpenAI releases a Kubernetes security tool',
            link: 'https://example.com/post',
            contentSnippet: 'AI and k8s security update',
            content: '<p><a href="https://external.example.com/article">[link]</a></p>',
            isoDate: '2026-06-19T00:00:00.000Z',
          },
        ],
      }),
    };
    const http = {
      get: async (url: string) => {
        requestedUrls.push(url);
        return {
          data: `
            <html>
              <head>
                <meta property="og:image" content="https://example.com/source-page.jpg" />
              </head>
            </html>
          `,
        };
      },
    };

    const articles = await new RssCrawler(parser, http).crawl({
      id: 'hn-rss',
      name: 'Hacker News',
      kind: 'rss',
      enabled: true,
      homepageUrl: 'https://news.ycombinator.com',
      feedUrl: 'https://hnrss.org/frontpage',
    });

    expect(requestedUrls).toEqual(['https://example.com/post']);
    expect(articles[0].imageUrl).toBe('https://example.com/source-page.jpg');
  });

  it('configures bounded feed HTTP with RSS headers, no redirects, and a 512 KiB cap', () => {
    const crawler = new RssCrawler();
    const feedHttp = (
      crawler as unknown as {
        feedHttp: {
          defaults?: {
            timeout?: number;
            maxRedirects?: number;
            maxContentLength?: number;
            maxBodyLength?: number;
            responseType?: string;
            headers?: Record<string, string>;
          };
        };
      }
    ).feedHttp;

    expect(feedHttp.defaults?.timeout).toBeGreaterThan(0);
    expect(feedHttp.defaults?.maxRedirects).toBe(0);
    expect(feedHttp.defaults?.maxContentLength).toBe(MAX_FEED_BODY_BYTES);
    expect(feedHttp.defaults?.maxBodyLength).toBe(MAX_FEED_BODY_BYTES);
    expect(feedHttp.defaults?.responseType).toBe('text');
    expect(feedHttp.defaults?.headers?.['User-Agent']).toBeTruthy();
    expect(feedHttp.defaults?.headers?.Accept).toContain('application/rss+xml');
  });

  it('fetches politics feeds once through the injected feed client and skips article-page enrichment', async () => {
    const xml = '<rss><channel><item><title>Budget</title></item></channel></rss>';
    const parser = {
      parseURL: vi.fn(),
      parseString: vi.fn().mockResolvedValue({
        items: [
          {
            title: 'Parliament debates the gold-reserve policy',
            link: 'https://vnexpress.net/politics/budget',
            contentSnippet: 'National assembly budget hearing',
            isoDate: '2026-08-19T00:00:00.000Z',
            creator: 'Hà Nội desk',
          },
        ],
      }),
    };
    const articleHttp = { get: vi.fn() };
    const feedHttp = {
      get: vi.fn().mockResolvedValue({
        data: xml,
        headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
      }),
    };

    const articles = await new RssCrawler(parser, articleHttp, feedHttp).crawl(politicsRssSource());

    expect(feedHttp.get).toHaveBeenCalledTimes(1);
    expect(feedHttp.get).toHaveBeenCalledWith('https://vnexpress.net/rss/thoi-su.rss');
    expect(parser.parseString).toHaveBeenCalledTimes(1);
    expect(parser.parseString).toHaveBeenCalledWith(xml);
    expect(parser.parseURL).not.toHaveBeenCalled();
    expect(articleHttp.get).not.toHaveBeenCalled();
    expect(articles).toEqual([
      expect.objectContaining({
        title: 'Parliament debates the gold-reserve policy',
        url: 'https://vnexpress.net/politics/budget',
        author: 'Hà Nội desk',
        publishedAt: '2026-08-19T00:00:00.000Z',
      }),
    ]);
  });

  it('extracts the widest Guardian media:content image from bounded RSS XML', async () => {
    const xml = `
      <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
        <channel>
          <title>Guardian World</title>
          <link>https://www.theguardian.com/world</link>
          <description>World news</description>
          <item>
            <title>Typhoon Narra floods southern China</title>
            <link>https://www.theguardian.com/world/typhoon-narra</link>
            <description>Flooding forces evacuations.</description>
            <pubDate>Wed, 26 Aug 2026 01:46:25 GMT</pubDate>
            <media:content width="140" url="https://i.guim.co.uk/flood.jpg?width=140&amp;quality=85" />
            <media:content width="700" url="https://i.guim.co.uk/flood.jpg?width=700&amp;quality=85" />
          </item>
        </channel>
      </rss>
    `;
    const articleHttp = { get: vi.fn() };
    const feedHttp = {
      get: vi.fn().mockResolvedValue({
        data: xml,
        headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
      }),
    };

    const articles = await new RssCrawler(undefined, articleHttp, feedHttp).crawl(
      politicsRssSource({
        id: 'guardian-world',
        feedUrl: 'https://www.theguardian.com/world/rss',
      }),
    );

    expect(articles[0]?.imageUrl).toBe(
      'https://i.guim.co.uk/flood.jpg?width=700&quality=85',
    );
    expect(articleHttp.get).not.toHaveBeenCalled();
  });

  it('extracts a BBC media:thumbnail image from bounded RSS XML', async () => {
    const xml = `
      <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
        <channel>
          <title>BBC World</title>
          <link>https://www.bbc.com/news/world</link>
          <description>World news</description>
          <item>
            <title>Nepal and Tibet floods</title>
            <link>https://www.bbc.co.uk/news/articles/example</link>
            <description>Scientists investigate the flooding.</description>
            <pubDate>Thu, 27 Aug 2026 01:00:00 GMT</pubDate>
            <media:thumbnail width="240" height="135" url="https://ichef.bbci.co.uk/flood.jpg" />
          </item>
        </channel>
      </rss>
    `;
    const articleHttp = { get: vi.fn() };
    const feedHttp = {
      get: vi.fn().mockResolvedValue({
        data: xml,
        headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
      }),
    };

    const articles = await new RssCrawler(undefined, articleHttp, feedHttp).crawl(
      politicsRssSource({
        id: 'bbc-world',
        feedUrl: 'https://feeds.bbci.co.uk/news/world/rss.xml',
      }),
    );

    expect(articles[0]?.imageUrl).toBe('https://ichef.bbci.co.uk/flood.jpg');
    expect(articleHttp.get).not.toHaveBeenCalled();
  });

  it('uses the opt-in DNS-over-HTTPS agent only for a bounded feed that requests it', async () => {
    const xml = '<rss><channel></channel></rss>';
    const parser = {
      parseURL: vi.fn(),
      parseString: vi.fn().mockResolvedValue({ items: [] }),
    };
    const articleHttp = { get: vi.fn() };
    const feedHttp = {
      get: vi.fn().mockResolvedValue({
        data: xml,
        headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
      }),
    };
    const httpsAgent = { kind: 'doh-fallback-agent' };
    const createDohFallbackAgent = vi.fn().mockReturnValue(httpsAgent);
    const crawler = new RssCrawler(parser, articleHttp, feedHttp, createDohFallbackAgent);

    await crawler.crawl(
      politicsRssSource({
        id: 'thoibao-de-chinh-tri',
        feedUrl: 'https://www.thoibao.de/blog/category/chinh-tri/feed',
        dnsOverHttpsFallback: true,
        feedUserAgent: 'Mozilla/5.0 (compatible; TechNewsTelegramBot/1.0)',
      }),
    );

    expect(createDohFallbackAgent).toHaveBeenCalledOnce();
    expect(createDohFallbackAgent).toHaveBeenCalledWith('www.thoibao.de');
    expect(feedHttp.get).toHaveBeenCalledWith(
      'https://www.thoibao.de/blog/category/chinh-tri/feed',
      {
        httpsAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TechNewsTelegramBot/1.0)',
        },
      },
    );
  });

  it('does not create a DNS-over-HTTPS agent for ordinary bounded feeds', async () => {
    const parser = {
      parseURL: vi.fn(),
      parseString: vi.fn().mockResolvedValue({ items: [] }),
    };
    const feedHttp = {
      get: vi.fn().mockResolvedValue({
        data: '<rss><channel></channel></rss>',
        headers: { 'content-type': 'application/rss+xml' },
      }),
    };
    const createDohFallbackAgent = vi.fn();
    const crawler = new RssCrawler(parser, { get: vi.fn() }, feedHttp, createDohFallbackAgent);

    await crawler.crawl(politicsRssSource());

    expect(createDohFallbackAgent).not.toHaveBeenCalled();
    expect(feedHttp.get).toHaveBeenCalledWith('https://vnexpress.net/rss/thoi-su.rss');
  });

  it('uses source-aware bounded networking to enrich an opted-in feed item from og:image', async () => {
    const parser = {
      parseURL: vi.fn(),
      parseString: vi.fn().mockResolvedValue({
        items: [
          {
            title: 'Quốc hội Việt Nam thảo luận chính sách quốc phòng',
            link: 'https://www.thoibao.de/blog/2026/08/chinh-sach-quoc-phong',
            contentSnippet: 'Tin chính trị Việt Nam.',
            isoDate: '2026-08-26T08:00:00.000Z',
          },
        ],
      }),
    };
    const articleHttp = { get: vi.fn() };
    const feedHttp = {
      get: vi.fn()
        .mockResolvedValueOnce({
          data: '<rss><channel></channel></rss>',
          headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
        })
        .mockResolvedValueOnce({
          data: '<html><head><meta property="og:image" content="https://www.thoibao.de/uploads/politics.jpg"></head></html>',
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    };
    const httpsAgent = { kind: 'doh-fallback-agent' };
    const createDohFallbackAgent = vi.fn().mockReturnValue(httpsAgent);
    const crawler = new RssCrawler(parser, articleHttp, feedHttp, createDohFallbackAgent);

    const articles = await crawler.crawl(
      politicsRssSource({
        id: 'thoibao-de-chinh-tri',
        feedUrl: 'https://www.thoibao.de/blog/category/chinh-tri/feed',
        dnsOverHttpsFallback: true,
        feedUserAgent: 'Mozilla/5.0 (compatible; TechNewsTelegramBot/1.0)',
        enrichArticlePage: true,
      }),
    );

    expect(articleHttp.get).not.toHaveBeenCalled();
    expect(feedHttp.get).toHaveBeenNthCalledWith(
      2,
      'https://www.thoibao.de/blog/2026/08/chinh-sach-quoc-phong',
      {
        httpsAgent,
        headers: {
          Accept: 'text/html, application/xhtml+xml;q=0.9, */*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (compatible; TechNewsTelegramBot/1.0)',
        },
      },
    );
    expect(articles[0]?.imageUrl).toBe('https://www.thoibao.de/uploads/politics.jpg');
  });

  it('uses the configured fallback image when bounded article-page enrichment fails', async () => {
    const parser = {
      parseURL: vi.fn(),
      parseString: vi.fn().mockResolvedValue({
        items: [
          {
            title: 'Quốc hội Việt Nam thảo luận chính sách quốc phòng',
            link: 'https://www.thoibao.de/blog/2026/08/chinh-sach-quoc-phong',
            contentSnippet: 'Tin chính trị Việt Nam.',
            isoDate: '2026-08-26T08:00:00.000Z',
          },
        ],
      }),
    };
    const feedHttp = {
      get: vi.fn()
        .mockResolvedValueOnce({
          data: '<rss><channel></channel></rss>',
          headers: { 'content-type': 'application/rss+xml' },
        })
        .mockRejectedValueOnce(new Error('article-page-unavailable')),
    };
    const crawler = new RssCrawler(
      parser,
      { get: vi.fn().mockRejectedValue(new Error('unexpected-client')) },
      feedHttp,
      vi.fn().mockReturnValue({ kind: 'doh-fallback-agent' }),
    );

    const articles = await crawler.crawl(
      politicsRssSource({
        id: 'thoibao-de-chinh-tri',
        feedUrl: 'https://www.thoibao.de/blog/category/chinh-tri/feed',
        dnsOverHttpsFallback: true,
        feedUserAgent: 'Mozilla/5.0 (compatible; TechNewsTelegramBot/1.0)',
        enrichArticlePage: true,
        fallbackImageUrl: 'https://www.thoibao.de/wp-content/uploads/2018/05/logotb3.jpg',
      }),
    );

    expect(articles[0]?.imageUrl).toBe(
      'https://www.thoibao.de/wp-content/uploads/2018/05/logotb3.jpg',
    );
  });

  it('rejects non-HTTP(S) and credentialed feed URLs without fetching', async () => {
    const parser = { parseURL: vi.fn(), parseString: vi.fn() };
    const articleHttp = { get: vi.fn() };
    const feedHttp = { get: vi.fn() };
    const crawler = new RssCrawler(parser, articleHttp, feedHttp);

    await expect(
      crawler.crawl(politicsRssSource({ feedUrl: 'file:///etc/passwd' })),
    ).rejects.toThrow();
    await expect(
      crawler.crawl(politicsRssSource({ feedUrl: 'ftp://example.com/feed.xml' })),
    ).rejects.toThrow();
    await expect(
      crawler.crawl(politicsRssSource({ feedUrl: 'https://user:pass@vnexpress.net/rss/thoi-su.rss' })),
    ).rejects.toThrow();

    expect(feedHttp.get).not.toHaveBeenCalled();
    expect(parser.parseURL).not.toHaveBeenCalled();
    expect(parser.parseString).not.toHaveBeenCalled();
    expect(articleHttp.get).not.toHaveBeenCalled();
  });

  it('rejects a 3xx feed response after one request and never contacts the Location target', async () => {
    const parser = { parseURL: vi.fn(), parseString: vi.fn() };
    const articleHttp = { get: vi.fn() };

    await withServer(
      (req, res) => {
        const path = (req.url ?? '/').split('?', 1)[0];
        if (path === '/feed.xml') {
          res.writeHead(302, { Location: '/secret-target' });
          res.end('redirect-body');
          return;
        }
        res.writeHead(200, { 'content-type': 'application/rss+xml' });
        res.end('<rss></rss>');
      },
      async ({ origin, requests }) => {
        const crawler = new RssCrawler(parser, articleHttp);
        await expect(
          crawler.crawl(politicsRssSource({ feedUrl: `${origin}/feed.xml` })),
        ).rejects.toThrow();
        expect(requests).toEqual(['GET /feed.xml']);
        expect(parser.parseURL).not.toHaveBeenCalled();
        expect(parser.parseString).not.toHaveBeenCalled();
        expect(articleHttp.get).not.toHaveBeenCalled();
      },
    );
  });

  it('rejects an oversize feed body after one request', async () => {
    const parser = { parseURL: vi.fn(), parseString: vi.fn() };
    const articleHttp = { get: vi.fn() };

    await withServer(
      (_req, res) => {
        const body = Buffer.alloc(MAX_FEED_BODY_BYTES + 1, 97);
        res.writeHead(200, {
          'content-type': 'application/rss+xml; charset=utf-8',
          'content-length': String(body.length),
        });
        res.end(body);
      },
      async ({ origin }) => {
        const crawler = new RssCrawler(parser, articleHttp);
        await expect(
          crawler.crawl(politicsRssSource({ feedUrl: `${origin}/feed.xml` })),
        ).rejects.toThrow();
        expect(parser.parseURL).not.toHaveBeenCalled();
        expect(parser.parseString).not.toHaveBeenCalled();
        expect(articleHttp.get).not.toHaveBeenCalled();
      },
    );
  });

  it('rejects the wrong feed MIME type after one fetch', async () => {
    const parser = { parseURL: vi.fn(), parseString: vi.fn() };
    const articleHttp = { get: vi.fn() };
    const feedHttp = {
      get: vi.fn().mockResolvedValue({
        data: '<html>not-a-feed</html>',
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    };

    await expect(
      new RssCrawler(parser, articleHttp, feedHttp).crawl(politicsRssSource()),
    ).rejects.toThrow();
    expect(feedHttp.get).toHaveBeenCalledTimes(1);
    expect(parser.parseString).not.toHaveBeenCalled();
    expect(parser.parseURL).not.toHaveBeenCalled();
    expect(articleHttp.get).not.toHaveBeenCalled();
  });

  it('rejects invalid XML after one feed fetch', async () => {
    const parser = {
      parseURL: vi.fn(),
      parseString: vi.fn().mockRejectedValue(new Error('Invalid XML')),
    };
    const articleHttp = { get: vi.fn() };
    const feedHttp = {
      get: vi.fn().mockResolvedValue({
        data: '<not-xml',
        headers: { 'content-type': 'application/xml; charset=utf-8' },
      }),
    };

    await expect(
      new RssCrawler(parser, articleHttp, feedHttp).crawl(politicsRssSource()),
    ).rejects.toThrow('Invalid XML');
    expect(feedHttp.get).toHaveBeenCalledTimes(1);
    expect(parser.parseString).toHaveBeenCalledTimes(1);
    expect(parser.parseURL).not.toHaveBeenCalled();
    expect(articleHttp.get).not.toHaveBeenCalled();
  });

  it('returns only the first 20 items from a 1,000-item politics feed in feed order', async () => {
    const items = Array.from({ length: 1000 }, (_, index) => ({
      title: `Politics item ${index + 1}`,
      link: `https://vnexpress.net/item-${index + 1}`,
      contentSnippet: 'National assembly update',
      isoDate: '2026-08-19T00:00:00.000Z',
    }));
    const parser = {
      parseURL: vi.fn(),
      parseString: vi.fn().mockResolvedValue({ items }),
    };
    const articleHttp = { get: vi.fn() };
    const feedHttp = {
      get: vi.fn().mockResolvedValue({
        data: '<rss></rss>',
        headers: { 'content-type': 'application/atom+xml; charset=us-ascii' },
      }),
    };

    const articles = await new RssCrawler(parser, articleHttp, feedHttp).crawl(politicsRssSource());

    expect(articles).toHaveLength(20);
    expect(articles.map((article) => article.title)).toEqual(
      Array.from({ length: 20 }, (_, index) => `Politics item ${index + 1}`),
    );
    expect(articleHttp.get).not.toHaveBeenCalled();
  });

  it('bounds a near-512-KiB item summary before it leaves source normalization', async () => {
    const hugeSummary = `Gold reserve ${'x'.repeat(MAX_FEED_BODY_BYTES - 32)}`;
    expect(Buffer.byteLength(hugeSummary, 'utf8')).toBeGreaterThan(MAX_FEED_BODY_BYTES - 16_384);
    expect(Buffer.byteLength(hugeSummary, 'utf8')).toBeLessThanOrEqual(MAX_FEED_BODY_BYTES);

    const parser = {
      parseURL: vi.fn(),
      parseString: vi.fn().mockResolvedValue({
        items: [
          {
            title: 'Central bank discusses gold policy',
            link: 'https://vnexpress.net/gold-policy',
            contentSnippet: hugeSummary,
            isoDate: '2026-08-19T00:00:00.000Z',
          },
        ],
      }),
    };
    const articleHttp = { get: vi.fn() };
    const feedHttp = {
      get: vi.fn().mockResolvedValue({
        data: '<rss></rss>',
        headers: { 'content-type': 'text/xml; charset=ascii' },
      }),
    };

    const articles = await new RssCrawler(parser, articleHttp, feedHttp).crawl(politicsRssSource());

    expect(articles).toHaveLength(1);
    expect(articles[0].summary).toBeTruthy();
    expect(articles[0].summary!.length).toBeLessThan(hugeSummary.length);
    expect(articles[0].summary!.length).toBeLessThanOrEqual(MAX_NORMALIZED_SUMMARY_CHARS);
    expect(articleHttp.get).not.toHaveBeenCalled();
  });
});
