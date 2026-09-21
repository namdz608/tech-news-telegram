/**
 * Chuyển HTML fragment (body của Stack Exchange, Hacker News) thành text gọn.
 */
import * as cheerio from 'cheerio';
import { compactText } from './text';

export function htmlToCompactText(value: string): string {
  if (!value.includes('<') && !value.includes('&')) return compactText(value);
  const $ = cheerio.load(value, undefined, false);
  $('script, style').remove();
  $('br, hr').replaceWith(' ');
  $('p, div, li, pre, blockquote, h1, h2, h3, h4, h5, h6').append(' ');
  return compactText($.root().text());
}
