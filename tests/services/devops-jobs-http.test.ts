import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { getDevopsJobsText } from '../../src/services/devops-jobs-http';

describe('native job board HTTP retrieval', () => {
  it('accepts a full API board larger than the Reader limit', async () => {
    const payload = JSON.stringify([{ id: 'job', description: 'x'.repeat(600_000) }]);
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(payload);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const body = await getDevopsJobsText(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`);
      expect(JSON.parse(body)).toEqual(JSON.parse(payload));
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
