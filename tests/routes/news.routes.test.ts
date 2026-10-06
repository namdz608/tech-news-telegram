import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { sources } from '../../src/config/sources';

describe('news routes', () => {
  it('lists configured sources', async () => {
    const response = await request(createApp()).get('/news/sources');

    expect(response.status).toBe(200);
    expect(response.body.sources.length).toBeGreaterThan(0);
  });

  it('exposes only public metadata even when sources have credentials', async () => {
    const x = sources.find((source) => source.kind === 'x-search')!;
    const github = sources.find((source) => source.kind === 'github-repos')!;
    const originalX = x.bearerToken;
    const originalGithub = github.token;
    try {
      x.bearerToken = 'review-x-secret';
      github.token = 'review-github-secret';
      const response = await request(createApp()).get('/news/sources');

      expect(response.status).toBe(200);
      expect(JSON.stringify(response.body)).not.toContain('review-x-secret');
      expect(JSON.stringify(response.body)).not.toContain('review-github-secret');
      for (const source of response.body.sources) {
        expect(Object.keys(source).sort()).toEqual(
          ['enabled', 'homepageUrl', 'id', 'kind', 'name'],
        );
      }
      expect(x.bearerToken).toBe('review-x-secret');
      expect(github.token).toBe('review-github-secret');
    } finally {
      x.bearerToken = originalX;
      github.token = originalGithub;
    }
  });
});
