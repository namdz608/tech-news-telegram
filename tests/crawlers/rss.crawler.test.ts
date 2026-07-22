import { describe, expect, it } from 'vitest';
import { RssCrawler } from '../../src/crawlers/rss.crawler';
import type { RssSourceConfig } from '../../src/types/source';
import { redditHttpsAgent } from '../../src/utils/reddit-dns';

describe('RssCrawler', () => {
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
      parseURL: async () => ({
        items: [
          {
            title: 'External secrets for Kubernetes',
            link: 'https://example.com/kubernetes-secrets',
            contentSnippet: 'Kubernetes security and DevOps update',
            isoDate: '2026-06-09T00:00:00.000Z',
          },
        ],
      }),
    };
    const http = {
      get: async () => ({
        data: `
          <html>
            <head>
              <meta property="og:image" content="https://example.com/article-diagram.jpg" />
            </head>
          </html>
        `,
      }),
    };

    const articles = await new RssCrawler(parser, http).crawl({
      id: 'rss-one',
      name: 'RSS One',
      kind: 'rss',
      enabled: true,
      homepageUrl: 'https://example.com',
      feedUrl: 'https://example.com/feed.xml',
    });

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
});
