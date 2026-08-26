import { describe, expect, it } from 'vitest';
import { sources } from '../../src/config/sources';

describe('sources config', () => {
  it('includes one X source that tracks the configured technology accounts', () => {
    const source = sources.find((candidate) => candidate.id === 'x-tracked-accounts');

    expect(source).toMatchObject({
      id: 'x-tracked-accounts',
      name: 'X Tracked Accounts',
      kind: 'x-search',
      homepageUrl: 'https://x.com',
      query:
        '(from:OpenAI OR from:AnthropicAI OR from:GoogleDeepMind OR from:github OR from:kubernetesio OR from:awscloud OR from:Cloudflare OR from:Docker OR from:HashiCorp OR from:TheHackersNews OR from:thsottiaux) -is:retweet -is:reply',
      maxResults: 20,
    });
  });

  it('includes enabled Reddit forum RSS sources with default topics', () => {
    const redditSources = sources.filter((source) => source.id.startsWith('reddit-'));

    expect(redditSources.map((source) => source.id)).toEqual([
      'reddit-machine-learning',
      'reddit-local-llama',
      'reddit-openai',
      'reddit-artificial',
      'reddit-kubernetes',
      'reddit-devops',
      'reddit-cybersecurity',
      'reddit-aws',
    ]);

    for (const source of redditSources) {
      expect(source.kind).toBe('rss');
      expect(source.enabled).toBe(true);
      expect(source.homepageUrl).toMatch(/^https:\/\/www\.reddit\.com\/r\//);

      if (source.kind === 'rss') {
        expect(source.feedUrl).toMatch(/^https:\/\/www\.reddit\.com\/r\/.+\/\.rss\?limit=10$/);
        expect(source.defaultTopics?.length).toBeGreaterThan(0);
      }
    }
  });
});
