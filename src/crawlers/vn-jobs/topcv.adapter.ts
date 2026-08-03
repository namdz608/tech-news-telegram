/**
 * Crawl danh sách việc làm từ TopCV (HTML). Cloudflare block → [].
 */
import * as cheerio from 'cheerio';
import { normalizeUrl } from '../../utils/normalize-url';
import { compactText } from '../../utils/text';
import { topcvSearchUrl } from './role-queries';
import type { JobRole, VnJobListing, VnJobsHttpClient } from './types';

const HOMEPAGE = 'https://www.topcv.vn';

export async function crawlTopcv(role: JobRole, http: VnJobsHttpClient): Promise<VnJobListing[]> {
  const response = await http.get(topcvSearchUrl(role));
  const html = typeof response.data === 'string' ? response.data : '';
  const status = response.status ?? 0;

  if (!html || status === 403 || /attention required|cloudflare|you have been blocked|just a moment/i.test(html.slice(0, 4000))) {
    console.warn(
      `TopCV unavailable (status=${status || 'n/a'}): Cloudflare is blocking server requests. Jobs from TopCV are skipped.`,
    );
    return [];
  }

  const $ = cheerio.load(html);
  const jobs: VnJobListing[] = [];
  const cards = $('.job-item, .job-list-item, [data-job-id], .job-item-search-result');

  cards.each((_index, element) => {
    const card = $(element);
    const titleAnchor = card.find('h3 a, .title a, a[href*="/viec-lam/"]').first();
    const title = compactText(titleAnchor.text());
    const href = titleAnchor.attr('href');

    if (!title || !href) {
      return;
    }

    const absoluteUrl = new URL(href, HOMEPAGE).toString();
    const url = normalizeUrl(absoluteUrl.split('?')[0] ?? absoluteUrl);
    const company = compactText(card.find('.company-name, .company a, .company').first().text()) || undefined;
    const location = compactText(card.find('.address, .city-text, .workplace').first().text()) || undefined;
    const salaryText = compactText(card.find('.salary, .title-salary').first().text()) || undefined;
    const experienceText =
      compactText(card.find('.experience, .exp, [class*="experience"]').first().text()) || undefined;
    const imageUrl = card.find('img').attr('src') || card.find('img').attr('data-src') || undefined;

    jobs.push({
      title,
      url,
      company,
      location,
      salaryText,
      experienceText,
      imageUrl: imageUrl && imageUrl.startsWith('http') ? imageUrl : undefined,
      sourceId: 'topcv',
      sourceName: 'TopCV',
    });
  });

  return jobs;
}
