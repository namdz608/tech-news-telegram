/**
 * Chuyển HTML mô tả JD thành text gọn.
 */
import * as cheerio from 'cheerio';
import { compactText } from '../../utils/text';

export function htmlToPlainText(value: string | undefined, maxLength = 700): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const text = compactText(cheerio.load(value).root().text());

  if (!text) {
    return undefined;
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}
