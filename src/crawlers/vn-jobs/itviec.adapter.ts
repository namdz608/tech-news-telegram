/**
 * Crawl danh sách việc làm từ ITviec (HTML).
 */
import * as cheerio from 'cheerio';
import { normalizeUrl } from '../../utils/normalize-url';
import { compactText } from '../../utils/text';
import { itviecSearchUrl } from './role-queries';
import type { JobRole, VnJobListing, VnJobsHttpClient } from './types';

const HOMEPAGE = 'https://itviec.com';

export async function crawlItviec(role: JobRole, http: VnJobsHttpClient): Promise<VnJobListing[]> {
  const response = await http.get(itviecSearchUrl(role));
  const html = typeof response.data === 'string' ? response.data : '';

  if (!html || /attention required|cloudflare/i.test(html.slice(0, 2000))) {
    return [];
  }

  const $ = cheerio.load(html);
  const jobs: VnJobListing[] = [];

  $('.job-card').each((_index, element) => {
    const card = $(element);
    const titleAnchor = card.find('h3 a').first();
    const title = compactText(titleAnchor.text());
    const href = titleAnchor.attr('href');

    if (!title || !href) {
      return;
    }

    const absoluteUrl = new URL(href, HOMEPAGE).toString();
    const url = normalizeUrl(absoluteUrl.split('?')[0] ?? absoluteUrl);
    const company =
      compactText(card.find('a.logo-employer-card').attr('title') ?? '') ||
      compactText(card.find('a.text-rich-grey').first().text()) ||
      undefined;
    const location =
      compactText(card.find('[title]').filter((_, el) => {
        const value = $(el).attr('title') ?? '';
        return /Ho Chi Minh|Ha Noi|Da Nang|Hà Nội|Hồ Chí Minh|Đà Nẵng/i.test(value);
      }).first().attr('title') ?? '') ||
      compactText(card.find('.text-rich-grey.text-truncate').last().text()) ||
      undefined;
    const salaryText = compactText(card.find('.salary').text()) || undefined;
    const posted = compactText(card.find('.small-text.text-dark-grey').first().text());
    const highlights = card
      .find('ul li')
      .map((_, li) => compactText($(li).text()))
      .get()
      .filter(Boolean)
      .join(' · ');
    const imageUrl = card.find('img[data-src]').attr('data-src') || card.find('img').attr('src') || undefined;

    jobs.push({
      title,
      url,
      company,
      location,
      salaryText,
      summary: highlights || undefined,
      imageUrl: imageUrl && imageUrl.startsWith('http') ? imageUrl : undefined,
      publishedAt: parseRelativePosted(posted),
      sourceId: 'itviec',
      sourceName: 'ITviec',
    });
  });

  return jobs;
}

function parseRelativePosted(text: string): string | undefined {
  const match = text.match(/(\d+)\s+(day|days|hour|hours|minute|minutes)\s+ago/i);

  if (!match) {
    return undefined;
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const date = new Date();

  if (unit.startsWith('day')) {
    date.setDate(date.getDate() - amount);
  } else if (unit.startsWith('hour')) {
    date.setHours(date.getHours() - amount);
  } else {
    date.setMinutes(date.getMinutes() - amount);
  }

  return date.toISOString();
}
