import type { LookupAddress, LookupOptions } from 'node:dns';
import type { LookupFunction } from 'node:net';
import { describe, expect, it } from 'vitest';
import { createRedditAwareLookup } from '../../src/utils/reddit-dns';

interface LookupResult {
  address: string | LookupAddress[];
  family?: number;
}

describe('createRedditAwareLookup', () => {
  it('returns a successful normal lookup without resolving an alias', async () => {
    const requestedHosts: string[] = [];
    const systemLookup: LookupFunction = (hostname, _options, callback) => {
      requestedHosts.push(hostname);
      callback(null, '203.0.113.10', 4);
    };

    const result = await lookup(createRedditAwareLookup(systemLookup), 'example.com');

    expect(result).toEqual({ address: '203.0.113.10', family: 4 });
    expect(requestedHosts).toEqual(['example.com']);
  });

  it.each([
    ['reddit.com', 'reddit.map.fastly.net'],
    ['www.reddit.com', 'reddit.map.fastly.net'],
    ['OLD.REDDIT.COM.', 'reddit.map.fastly.net'],
    ['redd.it', 'dualstack.reddit.map.fastly.net'],
    ['preview.redd.it', 'dualstack.reddit.map.fastly.net'],
    ['redditstatic.com', 'dualstack.reddit.map.fastly.net'],
    ['www.redditstatic.com', 'dualstack.reddit.map.fastly.net'],
  ])('falls back from %s to %s after ENOTFOUND', async (hostname, expectedAlias) => {
    const requestedHosts: string[] = [];
    const systemLookup: LookupFunction = (requestedHost, _options, callback) => {
      requestedHosts.push(requestedHost);

      if (requestedHost === hostname) {
        callback(createDnsError('ENOTFOUND'), '', 0);
        return;
      }

      callback(null, '151.101.77.140', 4);
    };

    const result = await lookup(createRedditAwareLookup(systemLookup), hostname);

    expect(result).toEqual({ address: '151.101.77.140', family: 4 });
    expect(requestedHosts).toEqual([hostname, expectedAlias]);
  });

  it('does not fall back for a non-Reddit hostname', async () => {
    const requestedHosts: string[] = [];
    const systemLookup: LookupFunction = (hostname, _options, callback) => {
      requestedHosts.push(hostname);
      callback(createDnsError('ENOTFOUND'), '', 0);
    };

    await expect(lookup(createRedditAwareLookup(systemLookup), 'example.com')).rejects.toMatchObject({
      code: 'ENOTFOUND',
    });
    expect(requestedHosts).toEqual(['example.com']);
  });

  it('does not disguise DNS errors other than ENOTFOUND', async () => {
    const requestedHosts: string[] = [];
    const systemLookup: LookupFunction = (hostname, _options, callback) => {
      requestedHosts.push(hostname);
      callback(createDnsError('EAI_AGAIN'), '', 0);
    };

    await expect(lookup(createRedditAwareLookup(systemLookup), 'www.reddit.com')).rejects.toMatchObject({
      code: 'EAI_AGAIN',
    });
    expect(requestedHosts).toEqual(['www.reddit.com']);
  });

  it('propagates an error from the Fastly alias lookup', async () => {
    const requestedHosts: string[] = [];
    const systemLookup: LookupFunction = (hostname, _options, callback) => {
      requestedHosts.push(hostname);
      const code = hostname === 'www.reddit.com' ? 'ENOTFOUND' : 'EAI_AGAIN';
      callback(createDnsError(code), '', 0);
    };

    await expect(lookup(createRedditAwareLookup(systemLookup), 'www.reddit.com')).rejects.toMatchObject({
      code: 'EAI_AGAIN',
    });
    expect(requestedHosts).toEqual(['www.reddit.com', 'reddit.map.fastly.net']);
  });

  it('preserves all-address lookup results from the alias', async () => {
    const addresses: LookupAddress[] = [
      { address: '151.101.77.140', family: 4 },
      { address: '2a04:4e42:12::396', family: 6 },
    ];
    const systemLookup: LookupFunction = (hostname, _options, callback) => {
      if (hostname === 'www.reddit.com') {
        callback(createDnsError('ENOTFOUND'), [], undefined);
        return;
      }

      callback(null, addresses, undefined);
    };

    const result = await lookup(createRedditAwareLookup(systemLookup), 'www.reddit.com', { all: true });

    expect(result).toEqual({ address: addresses, family: undefined });
  });
});

function lookup(lookupFunction: LookupFunction, hostname: string, options: LookupOptions = {}): Promise<LookupResult> {
  return new Promise((resolve, reject) => {
    lookupFunction(hostname, options, (error, address, family) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ address, family });
    });
  });
}

function createDnsError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}
