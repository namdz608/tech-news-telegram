import { describe, expect, it, vi } from 'vitest';
import {
  DEVOPS_INFRA_SUBREDDITS,
  devopsInfraRedditQueries,
} from '../../src/config/devops-infra-sources';
import { DevopsInfraRedditAdapter } from '../../src/services/devops-infra-reddit.adapter';

const NOW = new Date('2026-09-21T03:00:00.000Z');
const CREATED_UTC = 1_757_905_200;
const JSON_HEADERS = { 'content-type': 'application/json' };

function listing(posts: unknown[] = []) {
  return { data: { children: posts.map((data) => ({ kind: 't3', data })) } };
}

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: 'abc123',
    title: 'Kubernetes pod keeps restarting',
    selftext: 'The pod enters CrashLoopBackOff after deployment.',
    author: 'OriginalPoster',
    subreddit: 'devops',
    permalink: '/r/devops/comments/abc123/kubernetes_pod_keeps_restarting/',
    created_utc: CREATED_UTC,
    score: 12,
    num_comments: 3,
    ...overrides,
  };
}

function comments(values: unknown[]) {
  return [listing([post()]), { data: { children: values } }];
}

function comment(overrides: Record<string, unknown> = {}) {
  return {
    body: 'Increase the memory limit and inspect the previous container logs.',
    author: 'helper',
    score: 5,
    ...overrides,
  };
}

function createHttp(
  handle: (
    url: string,
    params: Record<string, string | number>,
  ) => Promise<{ data: unknown; headers?: Record<string, string> }>,
) {
  return {
    get: vi.fn(
      async (
        url: string,
        config: {
          headers: Record<string, string>;
          params?: Record<string, string | number>;
        },
      ) => handle(url, config.params ?? {}),
    ),
  };
}

function emptyHttp() {
  return createHttp(async () => ({ data: listing(), headers: JSON_HEADERS }));
}

describe('DevopsInfraRedditAdapter', () => {
  it('is always enabled and calls every subreddit listing and catalog search', async () => {
    const http = emptyHttp();
    const adapter = new DevopsInfraRedditAdapter(http, () => NOW);

    expect(adapter.key).toBe('reddit');
    expect(adapter.isEnabled()).toBe(true);

    const result = await adapter.collect();

    for (const subreddit of DEVOPS_INFRA_SUBREDDITS) {
      expect(http.get).toHaveBeenCalledWith(
        `https://www.reddit.com/r/${subreddit}/new.json`,
        expect.objectContaining({ params: { limit: 10 } }),
      );
    }
    for (const query of devopsInfraRedditQueries) {
      expect(http.get).toHaveBeenCalledWith(
        'https://www.reddit.com/search.json',
        expect.objectContaining({
          params: { q: query.text, sort: 'new', t: 'week', limit: 10 },
        }),
      );
    }
    expect(result).toEqual({
      items: [],
      successfulSourceCount:
        DEVOPS_INFRA_SUBREDDITS.length + devopsInfraRedditQueries.length,
      failedSources: [],
    });
  });

  it('maps a self-post and attaches scored, author-confirmed answers', async () => {
    const permalink = '/r/devops/comments/abc123/kubernetes_pod_keeps_restarting/';
    const http = createHttp(async (url) => {
      if (url === 'https://www.reddit.com/r/devops/new.json') {
        return { data: listing([post()]), headers: JSON_HEADERS };
      }
      if (
        url ===
        'https://www.reddit.com/r/devops/comments/abc123/kubernetes_pod_keeps_restarting.json'
      ) {
        return {
          data: comments([
            { kind: 't1', data: comment({ score: 5 }) },
            {
              kind: 't1',
              data: comment({
                body: 'This worked, thank you!',
                author: 'OriginalPoster',
                score: 1,
              }),
            },
          ]),
          headers: JSON_HEADERS,
        };
      }
      return { data: listing(), headers: JSON_HEADERS };
    });

    const result = await new DevopsInfraRedditAdapter(http, () => NOW).collect();

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      id: 'https://www.reddit.com/r/devops/comments/abc123/kubernetes_pod_keeps_restarting',
      sourceId: 'reddit',
      sourceName: 'r/devops',
      title: 'Kubernetes pod keeps restarting',
      url: 'https://www.reddit.com/r/devops/comments/abc123/kubernetes_pod_keeps_restarting',
      summary: 'The pod enters CrashLoopBackOff after deployment.',
      body: 'The pod enters CrashLoopBackOff after deployment.',
      author: 'OriginalPoster',
      publishedAt: new Date(CREATED_UTC * 1000).toISOString(),
      collectedAt: NOW.toISOString(),
      discoveredAt: NOW.toISOString(),
      discoveryChannel: 'reddit',
      communityKey: 'reddit:r/devops',
      sourceQuotaKey: 'reddit:r/devops',
      sourceTextStatus: 'full',
      answers: [
        {
          body: 'Increase the memory limit and inspect the previous container logs.',
          score: 5,
          authorConfirmed: false,
        },
        {
          body: 'This worked, thank you!',
          score: 1,
          authorConfirmed: true,
        },
      ],
      engagement: { score: 12, comments: 3 },
    });
    expect(http.get).toHaveBeenCalledWith(
      `https://www.reddit.com${permalink.slice(0, -1)}.json`,
      expect.any(Object),
    );
  });

  it('isolates a rate-limited query with credential-free fixtures', async () => {
    const failedQuery = devopsInfraRedditQueries[0];
    const http = createHttp(async (url, params) => {
      if (url === 'https://www.reddit.com/search.json' && params.q === failedQuery.text) {
        throw Object.assign(new Error('429'), {
          response: {
            status: 429,
            headers: { 'content-type': 'application/json' },
            data: { error: 'rate limited' },
          },
        });
      }
      return { data: listing(), headers: JSON_HEADERS };
    });

    const result = await new DevopsInfraRedditAdapter(http, () => NOW).collect();

    expect(result.successfulSourceCount).toBe(
      DEVOPS_INFRA_SUBREDDITS.length + devopsInfraRedditQueries.length - 1,
    );
    expect(result.failedSources).toEqual([`reddit:${failedQuery.key}`]);
    expect(JSON.stringify(http.get.mock.calls)).not.toMatch(
      /authorization|cookie|token|api[-_]?key/i,
    );
  });

  it('skips removed, deleted, and permalink-less posts', async () => {
    const http = createHttp(async (url) => ({
      data:
        url === 'https://www.reddit.com/r/devops/new.json'
          ? listing([
              post({ selftext: '[removed]' }),
              post({ title: '[deleted]', selftext: '[deleted]' }),
              post({ permalink: undefined }),
            ])
          : listing(),
      headers: JSON_HEADERS,
    }));

    const result = await new DevopsInfraRedditAdapter(http, () => NOW).collect();

    expect(result.items).toEqual([]);
    expect(
      http.get.mock.calls.some(([url]) => String(url).includes('/comments/')),
    ).toBe(false);
  });

  it('keeps the post as incomplete when its comment request fails', async () => {
    const http = createHttp(async (url) => {
      if (url === 'https://www.reddit.com/r/devops/new.json') {
        return { data: listing([post()]), headers: JSON_HEADERS };
      }
      if (url.endsWith('.json') && url.includes('/comments/')) {
        throw new Error('comments unavailable');
      }
      return { data: listing(), headers: JSON_HEADERS };
    });

    const result = await new DevopsInfraRedditAdapter(http, () => NOW).collect();

    expect(result.items).toEqual([
      expect.objectContaining({
        answers: [],
        sourceTextStatus: 'incomplete',
      }),
    ]);
    expect(result.failedSources).toEqual([]);
  });

  it('fetches comments for at most fifteen unique posts per run', async () => {
    const posts = Array.from({ length: 16 }, (_, index) =>
      post({
        id: `post${index}`,
        title: `Post ${index}`,
        permalink: `/r/devops/comments/post${index}/post_${index}/`,
      }),
    );
    const http = createHttp(async (url) => {
      if (url === 'https://www.reddit.com/r/devops/new.json') {
        return { data: listing(posts), headers: JSON_HEADERS };
      }
      if (url.includes('/comments/')) {
        return { data: comments([]), headers: JSON_HEADERS };
      }
      return { data: listing(), headers: JSON_HEADERS };
    });

    const result = await new DevopsInfraRedditAdapter(http, () => NOW).collect();
    const commentCalls = http.get.mock.calls.filter(([url]) =>
      String(url).includes('/comments/'),
    );

    expect(result.items).toHaveLength(16);
    expect(commentCalls).toHaveLength(15);
    expect(commentCalls.some(([url]) => String(url).includes('/post15/'))).toBe(false);
    expect(result.items[15]).toEqual(
      expect.objectContaining({ answers: [], sourceTextStatus: 'incomplete' }),
    );
  });
});
