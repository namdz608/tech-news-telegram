import { lookup as nodeLookup } from 'node:dns';
import { Agent } from 'node:https';
import type { LookupFunction } from 'node:net';

const redditFastlyAlias = 'reddit.map.fastly.net';
const redditDualstackFastlyAlias = 'dualstack.reddit.map.fastly.net';
const systemLookup = nodeLookup as LookupFunction;

export function createRedditAwareLookup(baseLookup: LookupFunction = systemLookup): LookupFunction {
  return (hostname, options, callback) => {
    baseLookup(hostname, options, (error, address, family) => {
      if (!error) {
        callback(null, address, family);
        return;
      }

      const fallbackAlias = error.code === 'ENOTFOUND' ? getRedditFallbackAlias(hostname) : undefined;

      if (!fallbackAlias) {
        callback(error, address, family);
        return;
      }

      baseLookup(fallbackAlias, options, callback);
    });
  };
}

export function createRedditHttpsAgent(baseLookup: LookupFunction = systemLookup): Agent {
  return new Agent({ lookup: createRedditAwareLookup(baseLookup) });
}

export const redditHttpsAgent = createRedditHttpsAgent();

function getRedditFallbackAlias(hostname: string): string | undefined {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');

  if (isHostnameInFamily(normalized, 'reddit.com')) {
    return redditFastlyAlias;
  }

  if (isHostnameInFamily(normalized, 'redd.it') || isHostnameInFamily(normalized, 'redditstatic.com')) {
    return redditDualstackFastlyAlias;
  }

  return undefined;
}

function isHostnameInFamily(hostname: string, root: string): boolean {
  return hostname === root || hostname.endsWith(`.${root}`);
}
