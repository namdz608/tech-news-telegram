import { getDomain } from 'tldts';

const TLDTS_OPTIONS = { extractHostname: false, allowPrivateDomains: false } as const;

export function registrablePublisherKey(input: string): string | undefined {
  if (typeof input !== 'string' || !input.trim()) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return undefined;
  }

  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
    return undefined;
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname) {
    return undefined;
  }

  return getDomain(hostname, TLDTS_OPTIONS) ?? hostname;
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').replace(/\.+$/g, '').toLowerCase();
}
