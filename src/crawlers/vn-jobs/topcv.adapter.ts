/**
 * Crawl danh sách việc làm từ TopCV (HTML).
 * Direct HTTP thường bị Cloudflare 403 → dùng FlareSolverr khi có FLARESOLVERR_URL.
 * List page thiếu JD — enrich trang chi tiết sau khi đã lọc job vào digest.
 */
import * as cheerio from 'cheerio';
import { normalizeUrl } from '../../utils/normalize-url';
import { compactText } from '../../utils/text';
import { fetchHtmlViaFlareSolverr } from './flaresolverr';
import { htmlToPlainText } from './html-text';
import { normalizeLogoUrl } from './logo-url';
import { mapPool } from './map-pool';
import { topcvSearchUrl } from './role-queries';
import type { JobRole, VnJobListing, VnJobsHttpClient } from './types';

const HOMEPAGE = 'https://www.topcv.vn';
/** FlareSolverr chịu tải vừa phải; tăng concurrency để limit lớn không quá chậm. */
const DETAIL_FETCH_CONCURRENCY = 5;

/** Skill/tool thường gặp — dùng khi TopCV không có mục "Kỹ năng cần có". */
const SKILL_HINTS = [
  'Kubernetes',
  'K8s',
  'Docker',
  'Terraform',
  'Ansible',
  'Jenkins',
  'CI/CD',
  'GitLab CI',
  'GitHub Actions',
  'Prometheus',
  'Grafana',
  'Opsview',
  'CheckMK',
  'Cacti',
  'ELK',
  'OpenStack',
  'AWS',
  'Azure',
  'GCP',
  'Linux',
  'Nginx',
  'Redis',
  'MongoDB',
  'PostgreSQL',
  'MySQL',
  'Helm',
  'ArgoCD',
  'Kafka',
  'RabbitMQ',
  'Python',
  'Bash',
  'Shell',
  'Observability',
  'DevOps',
  'SRE',
  'Cloud',
  'Automation',
  'Containerization',
];

function isCloudflareBlocked(html: string, status: number): boolean {
  return !html || status === 403 || /attention required|cloudflare|you have been blocked|just a moment/i.test(html.slice(0, 4000));
}

async function fetchTopcvHtml(url: string, http: VnJobsHttpClient): Promise<{ data: string; status: number } | null> {
  const direct = await http.get(url);
  const html = typeof direct.data === 'string' ? direct.data : '';
  const status = direct.status ?? 0;

  if (!isCloudflareBlocked(html, status)) {
    return { data: html, status };
  }

  const viaFlare = await fetchHtmlViaFlareSolverr(url);

  if (!viaFlare || isCloudflareBlocked(viaFlare.data, viaFlare.status)) {
    return null;
  }

  return viaFlare;
}

export async function crawlTopcv(role: JobRole, http: VnJobsHttpClient): Promise<VnJobListing[]> {
  const searchUrl = topcvSearchUrl(role);
  const listResponse = await fetchTopcvHtml(searchUrl, http);

  if (!listResponse) {
    console.warn(
      'TopCV unavailable: Cloudflare is blocking server requests. Set FLARESOLVERR_URL to enable TopCV via FlareSolverr.',
    );
    return [];
  }

  return parseJobCards(listResponse.data);
}

/**
 * Fetch JD chi tiết cho các job TopCV sẽ vào digest (tránh enrich nhầm job đầu list rồi bỏ).
 */
export async function enrichTopcvJobDetails(jobs: VnJobListing[], http: VnJobsHttpClient): Promise<void> {
  const targets = jobs.filter((job) => job.sourceId === 'topcv' && needsDetailEnrichment(job));
  await mapPool(targets, DETAIL_FETCH_CONCURRENCY, (job) => enrichOneJob(job, http));
}

export function needsDetailEnrichment(job: VnJobListing): boolean {
  if (job.sourceId !== 'topcv') {
    return false;
  }

  const description = job.description ?? '';
  const thinDescription = !description || /^Yêu cầu kinh nghiệm:/i.test(description) || description.length < 80;
  const missingSkills = !job.skills || job.skills.length === 0;

  return thinDescription || missingSkills;
}

function parseJobCards(html: string): VnJobListing[] {
  const $ = cheerio.load(html);
  const jobs: VnJobListing[] = [];
  const cards = $('.job-item-search-result, .job-item, .job-list-item, [data-job-id]');

  cards.each((_index, element) => {
    const card = $(element);
    const titleAnchor = card.find('h3.title a, h3 a, .title a').first();
    const title =
      compactText(titleAnchor.attr('title') ?? '') ||
      compactText(titleAnchor.find('span[data-original-title]').first().attr('data-original-title') ?? '') ||
      compactText(titleAnchor.find('span[title]').first().attr('title') ?? '') ||
      compactText(titleAnchor.find('span').first().text()) ||
      compactText(titleAnchor.text());
    const href = titleAnchor.attr('href');

    if (!title || !href || !href.includes('/viec-lam/')) {
      return;
    }

    const absoluteUrl = new URL(href, HOMEPAGE).toString();
    const url = normalizeUrl(absoluteUrl.split('?')[0] ?? absoluteUrl);
    const company =
      compactText(card.find('a.company').clone().children().remove().end().text()) ||
      compactText(card.find('a.company, .company-name, .company').first().text()) ||
      undefined;
    const location =
      compactText(card.find('.address .city-text, .city-text, .address').first().text()) || undefined;
    const salaryText =
      compactText(card.find('label.title-salary, label.salary, .salary, .title-salary').first().text()) || undefined;
    const experienceText = compactText(card.find('label.exp, .experience, .exp').first().text()) || undefined;
    const imageUrl = card.find('img').attr('data-src') || card.find('img').attr('src') || undefined;
    const posted = compactText(card.find('.label-update, .address.label-update').first().text());

    jobs.push({
      title,
      url,
      company: cleanCompanyName(company),
      location,
      salaryText,
      experienceText,
      description: experienceText ? `Yêu cầu kinh nghiệm: ${experienceText}` : undefined,
      imageUrl: normalizeLogoUrl(imageUrl, 'https://www.topcv.vn'),
      publishedAt: parseRelativePostedVi(posted),
      sourceId: 'topcv',
      sourceName: 'TopCV',
    });
  });

  return jobs;
}

async function enrichOneJob(job: VnJobListing, http: VnJobsHttpClient): Promise<void> {
  try {
    const response = await fetchTopcvHtml(job.url, http);

    if (!response) {
      applySkillFallback(job);
      return;
    }

    const details = parseJobDetail(response.data);

    if (details.description) {
      job.description = details.description;
    }

    if (details.skills?.length) {
      job.skills = details.skills;
    }

    if (details.salaryText && (!job.salaryText || /thoả thuận|thỏa thuận|thương lượng/i.test(job.salaryText))) {
      job.salaryText = details.salaryText;
    }

    if (details.experienceText && !job.experienceText) {
      job.experienceText = details.experienceText;
    }

    applySkillFallback(job);
  } catch (error) {
    console.warn(`TopCV detail fetch failed for ${job.url}`, error);
    applySkillFallback(job);
  }
}

function applySkillFallback(job: VnJobListing): void {
  if (job.skills && job.skills.length > 0) {
    return;
  }

  const inferred = inferSkillsFromText(`${job.title ?? ''} ${job.description ?? ''}`);

  if (inferred.length > 0) {
    job.skills = inferred;
  }
}

export function inferSkillsFromText(text: string): string[] {
  const found: string[] = [];

  for (const skill of SKILL_HINTS) {
    const pattern = new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(skill)}([^A-Za-z0-9]|$)`, 'i');

    if (pattern.test(text)) {
      found.push(skill);
    }
  }

  return [...new Set(found)].slice(0, 20);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanCompanyName(company: string | undefined): string | undefined {
  if (!company) {
    return undefined;
  }

  return compactText(company.replace(/^(Pro|Hot|New)\s+/i, '')) || undefined;
}

export function parseJobDetail(html: string): {
  description?: string;
  skills?: string[];
  salaryText?: string;
  experienceText?: string;
} {
  const $ = cheerio.load(html);
  const moTa = extractSectionText($, 'Mô tả công việc', 1400);
  const yeuCau = extractSectionText($, 'Yêu cầu ứng viên', 1400);
  const descriptionParts: string[] = [];

  if (moTa) {
    descriptionParts.push(`Mô tả:\n${moTa}`);
  }

  if (yeuCau) {
    descriptionParts.push(`Yêu cầu:\n${yeuCau}`);
  }

  const description = descriptionParts.length > 0 ? descriptionParts.join('\n\n') : undefined;

  const skills: string[] = [];
  $('.required-tag__content').each((_index, element) => {
    const block = $(element);
    const heading = compactText(block.find('h3.required-tag__content--title, h3').first().text());

    if (!/kỹ năng/i.test(heading)) {
      return;
    }

    const raw = compactText(block.find('.required-tag__content--desc').first().text());

    for (const part of raw.split(/[,;|]/)) {
      const skill = compactText(part);

      if (skill) {
        skills.push(skill);
      }
    }
  });

  const salaryText =
    compactText($('.job-detail-job-salary, .box-item .salary, label.title-salary').first().text()) || undefined;
  const experienceText =
    compactText($('.job-detail-job-experience, label.exp').first().text()) || undefined;

  const truncated =
    description && description.length > 2800 ? `${description.slice(0, 2799).trimEnd()}…` : description;

  return {
    description: truncated,
    skills: skills.length > 0 ? [...new Set(skills)] : undefined,
    salaryText,
    experienceText,
  };
}

function extractSectionText($: cheerio.CheerioAPI, title: string, maxLength: number): string | undefined {
  let found: string | undefined;

  $('.box-job-information-detail-item').each((_index, element) => {
    const heading = compactText($(element).find('h2.box-job-information-detail-item__title--title').first().text());

    if (heading !== title) {
      return;
    }

    const html = $(element).find('.box-job-information-detail-item__text').first().html() ?? undefined;
    found = htmlToPlainText(html, maxLength);
  });

  return found;
}

function parseRelativePostedVi(text: string): string | undefined {
  const match = text.match(/(\d+)\s*(ngày|giờ|phút)/i);

  if (!match) {
    return undefined;
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const date = new Date();

  if (unit.startsWith('ngày')) {
    date.setDate(date.getDate() - amount);
  } else if (unit.startsWith('giờ')) {
    date.setHours(date.getHours() - amount);
  } else {
    date.setMinutes(date.getMinutes() - amount);
  }

  return date.toISOString();
}
