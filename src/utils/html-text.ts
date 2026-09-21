/**
 * Chuyển HTML fragment (body của Stack Exchange, Hacker News) thành text gọn.
 */
import * as cheerio from 'cheerio';
import { compactText } from './text';

const SKIP_IMAGE_HOST = /(?:^|\.)(?:gravatar\.com|googleusercontent\.com)$/iu;
const SKIP_IMAGE_PATH = /emoji|sprite|score-checker|user-gravatar/iu;

export function htmlToCompactText(value: string): string {
  if (!value.includes('<') && !value.includes('&')) return compactText(value);
  const $ = cheerio.load(value, undefined, false);
  $('script, style').remove();
  $('br, hr').replaceWith(' ');
  $('p, div, li, pre, blockquote, h1, h2, h3, h4, h5, h6').append(' ');
  return compactText($.root().text());
}

export function htmlFirstContentImageUrl(
  html: string,
  baseUrl?: string,
): string | undefined {
  if (!html.includes('<img')) return undefined;
  const $ = cheerio.load(html, undefined, false);
  for (const element of $('img').toArray()) {
    const src = $(element).attr('src')?.trim();
    if (!src) continue;
    const resolved = resolvePublicImageUrl(src, baseUrl);
    if (resolved) return resolved;
  }
  return undefined;
}

function resolvePublicImageUrl(src: string, baseUrl?: string): string | undefined {
  try {
    const url = new URL(src, baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    if (url.username || url.password) return undefined;
    const hostname = url.hostname.toLowerCase().replace(/\.$/u, '');
    if (
      hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || SKIP_IMAGE_HOST.test(hostname)
      || SKIP_IMAGE_PATH.test(url.pathname)
    ) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}
