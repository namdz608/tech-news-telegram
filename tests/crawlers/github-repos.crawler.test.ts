import { describe, expect, it, vi } from 'vitest';
import { GitHubReposCrawler } from '../../src/crawlers/github-repos.crawler';
import type { GitHubReposSourceConfig } from '../../src/types/source';

function createSource(overrides: Partial<GitHubReposSourceConfig> = {}): GitHubReposSourceConfig {
  return {
    id: 'github-ai-repos',
    name: 'GitHub AI Repos',
    kind: 'github-repos',
    enabled: true,
    homepageUrl: 'https://github.com',
    token: 'token',
    query: '',
    maxResults: 10,
    lookbackDays: 7,
    ...overrides,
  };
}

describe('GitHubReposCrawler', () => {
  it('maps GitHub repositories from default topic queries into AI articles', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z'));

    try {
      const http = {
        get: vi.fn().mockImplementation((_url: string, config: { params: { q: string } }) => {
          if (config.params.q.startsWith('topic:llm ')) {
            return Promise.resolve({
              data: {
                items: [
                  {
                    html_url: 'https://github.com/example/no-description',
                    full_name: 'example/no-description',
                    stargazers_count: 10,
                    created_at: '2026-06-10T00:00:00.000Z',
                    updated_at: '2026-06-12T00:00:00.000Z',
                    pushed_at: '2026-06-12T00:00:00.000Z',
                    owner: {
                      login: 'example',
                    },
                  },
                ],
              },
            });
          }

          if (config.params.q.startsWith('topic:generative-ai ')) {
            return Promise.resolve({
              data: {
                items: [
                  {
                    html_url: 'https://github.com/example/ai-agent',
                    full_name: 'example/ai-agent',
                    description: 'OpenAI powered RAG agent framework',
                    stargazers_count: 1234,
                    language: 'TypeScript',
                    created_at: '2026-06-01T00:00:00.000Z',
                    updated_at: '2026-06-14T00:00:00.000Z',
                    pushed_at: '2026-06-14T12:00:00.000Z',
                    owner: {
                      login: 'example',
                      avatar_url: 'https://avatars.githubusercontent.com/u/123?v=4',
                    },
                  },
                  {
                    html_url: 'https://github.com/example/no-description',
                    full_name: 'example/no-description',
                    stargazers_count: 10,
                    created_at: '2026-06-10T00:00:00.000Z',
                    updated_at: '2026-06-12T00:00:00.000Z',
                    pushed_at: '2026-06-12T00:00:00.000Z',
                    owner: {
                      login: 'example',
                    },
                  },
                ],
              },
            });
          }

          return Promise.resolve({
            data: {
              items: [],
            },
          });
        }),
      };

      const articles = await new GitHubReposCrawler(http).crawl(createSource());

      expect(http.get).toHaveBeenCalledTimes(6);
      expect(http.get).toHaveBeenNthCalledWith(1, 'https://api.github.com/search/repositories', {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer token',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        params: {
          q: 'topic:llm pushed:>=2026-06-08',
          sort: 'stars',
          order: 'desc',
          per_page: 10,
        },
      });
      expect(http.get).toHaveBeenNthCalledWith(
        6,
        'https://api.github.com/search/repositories',
        expect.objectContaining({
          params: expect.objectContaining({
            q: 'topic:artificial-intelligence pushed:>=2026-06-08',
          }),
        }),
      );
      expect(articles).toHaveLength(2);
      expect(articles[0]).toMatchObject({
        id: 'https://github.com/example/ai-agent',
        sourceId: 'github-ai-repos',
        sourceName: 'GitHub AI Repos',
        title: 'example/ai-agent',
        url: 'https://github.com/example/ai-agent',
        summary:
          'OpenAI powered RAG agent framework | Stars: 1234 | Language: TypeScript | Created: 2026-06-01 | Updated: 2026-06-14 | Pushed: 2026-06-14',
        imageUrl: 'https://avatars.githubusercontent.com/u/123?v=4',
        author: 'example',
        publishedAt: '2026-06-14T12:00:00.000Z',
        topics: ['ai'],
      });
      expect(articles[0].collectedAt).toBe('2026-06-15T00:00:00.000Z');
      expect(articles[1].summary).toBe('Stars: 10 | Created: 2026-06-10 | Updated: 2026-06-12 | Pushed: 2026-06-12');
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses a custom query and omits authorization when token is blank', async () => {
    const http = {
      get: vi.fn().mockResolvedValue({
        data: {
          items: [],
        },
      }),
    };

    await new GitHubReposCrawler(http).crawl(
      createSource({
        token: '',
        query: 'topic:llm stars:>500 pushed:>=2026-06-01',
        maxResults: 5,
      }),
    );

    expect(http.get).toHaveBeenCalledWith('https://api.github.com/search/repositories', {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      params: {
        q: 'topic:llm stars:>500 pushed:>=2026-06-01',
        sort: 'stars',
        order: 'desc',
        per_page: 5,
      },
    });
  });

  it('returns an empty list for failed or malformed responses', async () => {
    const failedHttp = {
      get: vi.fn().mockRejectedValue(new Error('rate limited')),
    };
    const malformedHttp = {
      get: vi.fn().mockResolvedValue({
        data: {
          items: 'not-an-array',
        },
      }),
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(new GitHubReposCrawler(failedHttp).crawl(createSource())).resolves.toEqual([]);
      await expect(new GitHubReposCrawler(malformedHttp).crawl(createSource())).resolves.toEqual([]);
      expect(consoleError).toHaveBeenCalledWith('Failed to crawl GitHub repositories from source github-ai-repos: rate limited');
    } finally {
      consoleError.mockRestore();
    }
  });
});
