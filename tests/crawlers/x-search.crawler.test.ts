import { describe, expect, it, vi } from 'vitest';
import { XSearchCrawler } from '../../src/crawlers/x-search.crawler';
import type { XSearchSourceConfig } from '../../src/types/source';

describe('XSearchCrawler', () => {
  it('maps recent X posts into matching articles', async () => {
    const source: XSearchSourceConfig = {
      id: 'x-search',
      name: 'X Search',
      kind: 'x-search',
      enabled: true,
      homepageUrl: 'https://x.com',
      bearerToken: 'token',
      query: '(AI OR Kubernetes) lang:en -is:retweet -is:reply',
      maxResults: 20,
    };
    const http = {
      get: vi.fn().mockResolvedValue({
        data: {
          data: [
            {
              id: '123',
              text: 'OpenAI ships a Kubernetes security update for platform teams',
              author_id: '42',
              created_at: '2026-06-09T00:00:00.000Z',
              public_metrics: {
                retweet_count: 10,
                like_count: 99,
              },
            },
            {
              id: '456',
              text: 'A cooking post without a matching topic',
              author_id: '43',
              created_at: '2026-06-09T00:00:00.000Z',
            },
          ],
          includes: {
            users: [
              {
                id: '42',
                name: 'Tech Writer',
                username: 'techwriter',
              },
            ],
          },
        },
      }),
    };

    const articles = await new XSearchCrawler(http).crawl(source);

    expect(http.get).toHaveBeenCalledWith('https://api.x.com/2/tweets/search/recent', {
      headers: {
        Authorization: 'Bearer token',
      },
      params: {
        query: '(AI OR Kubernetes) lang:en -is:retweet -is:reply',
        max_results: 20,
        expansions: 'author_id',
        'tweet.fields': 'author_id,created_at,public_metrics,lang',
        'user.fields': 'name,username',
      },
    });
    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({
      id: 'https://x.com/i/web/status/123',
      sourceId: 'x-search',
      sourceName: 'X Search',
      title: 'OpenAI ships a Kubernetes security update for platform teams',
      url: 'https://x.com/i/web/status/123',
      summary: '@techwriter: OpenAI ships a Kubernetes security update for platform teams | Likes: 99 | Reposts: 10',
      author: '@techwriter',
      publishedAt: '2026-06-09T00:00:00.000Z',
      topics: expect.arrayContaining(['ai', 'k8s', 'security']),
    });
  });

  it('returns no articles when bearer token is not configured', async () => {
    const source: XSearchSourceConfig = {
      id: 'x-search',
      name: 'X Search',
      kind: 'x-search',
      enabled: true,
      homepageUrl: 'https://x.com',
      bearerToken: '',
      query: 'AI lang:en',
      maxResults: 20,
    };
    const http = {
      get: vi.fn(),
    };

    const articles = await new XSearchCrawler(http).crawl(source);

    expect(articles).toEqual([]);
    expect(http.get).not.toHaveBeenCalled();
  });
});
