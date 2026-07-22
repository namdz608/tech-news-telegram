import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';

describe('news routes', () => {
  it('lists configured sources', async () => {
    const response = await request(createApp()).get('/news/sources');

    expect(response.status).toBe(200);
    expect(response.body.sources.length).toBeGreaterThan(0);
  });
});
