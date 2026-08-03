/**
 * Crawl danh sách việc làm từ ITviec (HTML) + enrich trang chi tiết JD.
 */
import * as cheerio from 'cheerio';
import { normalizeUrl } from '../../utils/normalize-url';
import { compactText } from '../../utils/text';
import { htmlToPlainText } from './html-text';
import { normalizeLogoUrl } from './logo-url';
import { mapPool } from './map-pool';
import { itviecSearchUrl } from './role-queries';
import type { JobRole, VnJobListing, VnJobsHttpClient } from './types';

const HOMEPAGE = 'https://itviec.com';
const DETAIL_FETCH_CONCURRENCY = 8;

export async function crawlItviec(role: JobRole, http: VnJobsHttpClient): Promise<VnJobListing[]> {
  const searchUrl = itviecSearchUrl(role);

  if (!searchUrl) {
    return [];
  }

  const response = await http.get(searchUrl);
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
    const salaryText = normalizeSalary(compactText(card.find('.salary').text()));
    const posted = compactText(card.find('.small-text.text-dark-grey').first().text());
    const highlightItems = card
      .find('ul li')
      .map((_, li) => compactText($(li).text()))
      .get()
      .filter(Boolean);
    const skills = card
      .find('a[data-responsive-tag-list-target="tag"], .itag')
      .map((_, tag) => compactText($(tag).text()))
      .get()
      .filter(Boolean);
    const imageUrl = card.find('img[data-src]').attr('data-src') || card.find('img').attr('src') || undefined;

    jobs.push({
      title,
      url,
      company,
      location,
      salaryText,
      description: highlightItems.length > 0 ? highlightItems.join(' · ') : undefined,
      skills: skills.length > 0 ? [...new Set(skills)] : undefined,
      summary: highlightItems.join(' · ') || undefined,
      imageUrl: normalizeLogoUrl(imageUrl, 'https://itviec.com'),
      publishedAt: parseRelativePosted(posted),
      sourceId: 'itviec',
      sourceName: 'ITviec',
    });
  });

  return jobs;
}

/**
 * Fetch JD chi tiết cho job ITviec sẽ vào digest.
 */
export async function enrichItviecJobDetails(jobs: VnJobListing[], http: VnJobsHttpClient): Promise<void> {
  const targets = jobs.filter((job) => job.sourceId === 'itviec' && needsDetailEnrichment(job));
  await mapPool(targets, DETAIL_FETCH_CONCURRENCY, (job) => enrichOneJob(job, http));
}

export function needsDetailEnrichment(job: VnJobListing): boolean {
  if (job.sourceId !== 'itviec') {
    return false;
  }

  const description = job.description ?? '';
  return description.length < 120;
}

export function parseItviecJobDetail(html: string): { description?: string; skills?: string[] } {
  const $ = cheerio.load(html);
  const moTa = extractSectionAfterHeading($, /job description/i);
  const yeuCau = extractSectionAfterHeading($, /skills and experience|requirements/i);
  const parts = [
    moTa ? `Mô tả:\n${moTa}` : undefined,
    yeuCau ? `Yêu cầu:\n${yeuCau}` : undefined,
  ].filter(Boolean);

  const description = parts.length > 0 ? parts.join('\n\n') : undefined;
  const truncated =
    description && description.length > 2800 ? `${description.slice(0, 2799).trimEnd()}…` : description;

  const skills = $('a[data-responsive-tag-list-target="tag"], .itag, .job-tags a')
    .map((_, tag) => compactText($(tag).text()))
    .get()
    .filter(Boolean);

  return {
    description: truncated,
    skills: skills.length > 0 ? [...new Set(skills)] : undefined,
  };
}

async function enrichOneJob(job: VnJobListing, http: VnJobsHttpClient): Promise<void> {
  try {
    const response = await http.get(job.url);
    const html = typeof response.data === 'string' ? response.data : '';

    if (!html || /attention required|cloudflare/i.test(html.slice(0, 2000))) {
      return;
    }

    const details = parseItviecJobDetail(html);

    if (details.description) {
      job.description = details.description;
    }

    if (details.skills?.length) {
      job.skills = [...new Set([...(job.skills ?? []), ...details.skills])];
    }

    if (!job.salaryText || /sign in to view salary/i.test(job.salaryText)) {
      const $ = cheerio.load(html);
      const salary = normalizeSalary(compactText($('.salary').first().text()));
      if (salary) {
        job.salaryText = salary;
      }
    }
  } catch (error) {
    console.warn(`ITviec detail fetch failed for ${job.url}`, error);
  }
}

function extractSectionAfterHeading($: cheerio.CheerioAPI, titleRe: RegExp): string | undefined {
  const headings = $('h2').toArray();

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const title = compactText($(heading).text());

    if (!titleRe.test(title)) {
      continue;
    }

    const nextHeading = headings[index + 1];
    const parts: string[] = [];
    let cursor = $(heading).next();

    while (cursor.length > 0) {
      if (nextHeading && cursor.get(0) === nextHeading) {
        break;
      }

      if (cursor.is('h1, h2')) {
        break;
      }

      parts.push($.html(cursor) ?? '');
      cursor = cursor.next();
    }

    return htmlToPlainText(parts.join(''), 1600);
  }

  return undefined;
}

function normalizeSalary(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (/sign in to view salary/i.test(value)) {
    return 'Thương lượng';
  }

  return value;
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
