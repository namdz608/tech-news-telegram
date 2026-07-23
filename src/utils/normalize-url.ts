export function normalizeUrl(input: string): string {
  const url = new URL(input);
  url.hash = '';

  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith('utm_') || key === 'fbclid' || key === 'gclid') {
      url.searchParams.delete(key);
    }
  }

  url.search = url.searchParams.toString();
  return url.toString().replace(/\/$/, '');
}
