/**
 * Chuyển HTML mô tả JD thành text gọn, giữ bullet để dễ đọc trên Telegram.
 */
import * as cheerio from 'cheerio';

export function htmlToPlainText(value: string | undefined, maxLength = 2000): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const $ = cheerio.load(value);
  $('br').replaceWith('\n');
  $('li').each((_index, element) => {
    const item = $(element);
    item.prepend('\n- ');
    item.append('\n');
  });
  $('p, div, h1, h2, h3, h4').each((_index, element) => {
    $(element).prepend('\n');
    $(element).append('\n');
  });
  $('strong, b').each((_index, element) => {
    $(element).prepend(' ');
    $(element).append(' ');
  });

  const text = normalizeJobText($.root().text());

  if (!text) {
    return undefined;
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizeJobText(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
