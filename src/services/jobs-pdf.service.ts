/**
 * Tổng hợp Article[] jobs thành một PDF gọn, rõ (tiếng Việt qua DejaVu).
 * Chỉ giữ Buffer trong RAM — không ghi file local.
 * Icon = chấm màu vẽ bằng pdfkit (không dùng emoji).
 * Logo công ty = JPEG/PNG tải về rồi nhúng cạnh tiêu đề.
 *
 * "Kỹ năng cần có" lấy từ phần yêu cầu trong JD (chi tiết), không dump tag chung.
 */
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { env } from '../config/env';
import { preferPdfCompatibleLogoUrl } from '../crawlers/vn-jobs/logo-url';
import { mapPool } from '../crawlers/vn-jobs/map-pool';
import type { ExperienceYears, JobRole } from '../crawlers/vn-jobs/types';
import type { Article } from '../types/article';

export interface JobsPdfMeta {
  role: JobRole;
  experienceYears?: ExperienceYears;
  limit: number;
  generatedAt?: Date;
}

export interface JobsPdfResult {
  buffer: Buffer;
  fileName: string;
}

const PAGE = {
  marginX: 42,
  marginTop: 40,
  marginBottom: 42,
  contentWidth: 515,
  maxY: 800,
};

const LOGO = {
  size: 42,
  gap: 10,
  maxBytes: 512 * 1024,
  fetchConcurrency: 8,
  timeoutMs: 8000,
};

const COLORS = {
  ink: '#1a1a1a',
  muted: '#5c5c5c',
  soft: '#8a8a8a',
  line: '#c4c4c4',
  accent: '#0f6e56',
  link: '#0b57d0',
  salary: '#b45309',
  location: '#1d4ed8',
  source: '#7c3aed',
  skills: '#0f6e56',
  desc: '#0e7490',
};

const SECTION_MAX = 1800;

type FontFns = {
  bold: () => PDFKit.PDFDocument;
  regular: () => PDFKit.PDFDocument;
};

export function buildJobsPdf(articles: Article[], meta: JobsPdfMeta): Promise<JobsPdfResult> {
  const generatedAt = meta.generatedAt ?? new Date();
  const fileName = buildPdfFileName(meta.role, generatedAt);

  return (async () => {
    const logos = await loadCompanyLogos(articles);

    return new Promise<JobsPdfResult>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: {
          top: PAGE.marginTop,
          bottom: PAGE.marginBottom,
          left: PAGE.marginX,
          right: PAGE.marginX,
        },
        autoFirstPage: true,
      });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), fileName }));
      doc.on('error', reject);

      const fonts = resolveFonts();
      if (fonts.regular) {
        doc.registerFont('JobsRegular', fonts.regular);
      }
      if (fonts.bold) {
        doc.registerFont('JobsBold', fonts.bold);
      }

      const bold = () => doc.font(fonts.bold ? 'JobsBold' : fonts.regular ? 'JobsRegular' : 'Helvetica-Bold');
      const regular = () => doc.font(fonts.regular ? 'JobsRegular' : 'Helvetica');

      drawHeader(doc, { bold, regular }, meta, articles.length, generatedAt);

      articles.forEach((article, index) => {
        ensureSpace(doc, 120);
        drawJobCard(doc, { bold, regular }, article, index + 1, logos.get(article.url));
      });

      doc.end();
    });
  })();
}

function drawHeader(
  doc: PDFKit.PDFDocument,
  fonts: FontFns,
  meta: JobsPdfMeta,
  count: number,
  generatedAt: Date,
): void {
  const roleLabel = formatRoleLabel(meta.role);
  const when = formatDateTimeVi(generatedAt);
  const experience = meta.experienceYears ?? 'mọi mức';

  fonts.bold();
  doc.fontSize(18).fillColor(COLORS.ink).text(`Tin tuyển dụng - ${roleLabel}`, {
    width: PAGE.contentWidth,
  });

  fonts.regular();
  doc
    .moveDown(0.25)
    .fontSize(9)
    .fillColor(COLORS.muted)
    .text(`${when}  |  Kinh nghiệm: ${experience}  |  ${count} tin (limit ${meta.limit})`, {
      width: PAGE.contentWidth,
    });

  const y = doc.y + 8;
  doc
    .moveTo(PAGE.marginX, y)
    .lineTo(PAGE.marginX + PAGE.contentWidth, y)
    .lineWidth(1.5)
    .strokeColor(COLORS.accent)
    .stroke();
  doc.y = y + 14;
}

function drawJobCard(
  doc: PDFKit.PDFDocument,
  fonts: FontFns,
  article: Article,
  index: number,
  logo?: Buffer,
): void {
  const details = article.jobDetails;
  const startY = doc.y;
  const hasLogo = Boolean(logo);
  const textX = PAGE.marginX + (hasLogo ? LOGO.size + LOGO.gap : 26);
  const textWidth = PAGE.contentWidth - (hasLogo ? LOGO.size + LOGO.gap : 26);
  const { duties, requirements } = splitJobDescription(details?.description || article.summary || '');

  if (logo) {
    try {
      doc.image(logo, PAGE.marginX, startY, {
        fit: [LOGO.size, LOGO.size],
        align: 'center',
        valign: 'center',
      });
      doc
        .save()
        .rect(PAGE.marginX, startY, LOGO.size, LOGO.size)
        .lineWidth(0.6)
        .strokeColor(COLORS.line)
        .stroke()
        .restore();
    } catch {
      // Logo hỏng / định dạng lạ → bỏ qua, vẫn vẽ nội dung.
    }
  } else {
    fonts.bold();
    doc.fontSize(9).fillColor(COLORS.accent).text(String(index).padStart(2, '0'), PAGE.marginX, startY, {
      width: 22,
    });
  }

  fonts.bold();
  doc.fontSize(11).fillColor(COLORS.ink).text(compactOneLine(article.title), textX, startY, {
    width: textWidth,
    lineGap: 1,
  });

  fonts.regular();
  doc.fontSize(9).fillColor(COLORS.muted);
  if (article.author) {
    doc.text(compactOneLine(article.author), { width: textWidth });
  }

  if (hasLogo) {
    doc.y = Math.max(doc.y, startY + LOGO.size);
  }

  doc.moveDown(0.2);
  drawIconLine(doc, fonts, COLORS.salary, 'Lương', details?.salary || 'Thương lượng');
  drawIconLine(doc, fonts, COLORS.location, 'Địa điểm', details?.location || 'Hà Nội');
  drawIconLine(doc, fonts, COLORS.source, 'Nguồn', article.sourceName);

  const dutiesText = truncateText(toDashBulletList(duties), SECTION_MAX);
  doc.moveDown(0.3);
  drawSectionTitle(doc, fonts, COLORS.desc, 'Mô tả công việc');
  fonts.regular();
  doc.fontSize(9).fillColor(dutiesText ? COLORS.ink : COLORS.soft).text(
    dutiesText || '- Chưa có mô tả chi tiết từ nguồn',
    {
      width: PAGE.contentWidth - 26,
      lineGap: 1.6,
    },
  );

  const skillsText = buildRequirementsText(requirements, details?.skills);
  doc.moveDown(0.35);
  drawSectionTitle(doc, fonts, COLORS.skills, 'Kỹ năng cần có');
  fonts.regular();
  doc.fontSize(9).fillColor(skillsText ? COLORS.ink : COLORS.soft).text(
    skillsText || '- Chưa cập nhật yêu cầu kỹ năng từ JD',
    {
      width: PAGE.contentWidth - 26,
      lineGap: 1.6,
    },
  );

  doc.moveDown(0.25);
  drawSectionTitle(doc, fonts, COLORS.link, 'Link ứng tuyển');
  fonts.regular();
  doc.fontSize(8).fillColor(COLORS.link).text(article.url, {
    link: article.url,
    underline: true,
    width: PAGE.contentWidth - 26,
  });

  const endY = doc.y + 10;
  doc
    .save()
    .moveTo(PAGE.marginX, endY)
    .lineTo(PAGE.marginX + PAGE.contentWidth, endY)
    .lineWidth(1)
    .strokeColor(COLORS.line)
    .stroke()
    .restore();
  doc.y = endY + 16;
}

async function loadCompanyLogos(articles: Article[]): Promise<Map<string, Buffer>> {
  const logos = new Map<string, Buffer>();
  const targets = articles.filter((article) => Boolean(article.imageUrl));

  await mapPool(targets, LOGO.fetchConcurrency, async (article) => {
    const buffer = await fetchCompanyLogo(article.imageUrl!);

    if (buffer) {
      logos.set(article.url, buffer);
    }
  });

  return logos;
}

/** Tải logo JPEG/PNG; bỏ qua WebP/SVG/GIF vì pdfkit không hỗ trợ. */
export async function fetchCompanyLogo(url: string): Promise<Buffer | undefined> {
  const candidates = logoFetchCandidates(url);

  for (const candidate of candidates) {
    const buffer = await downloadImageBuffer(candidate);

    if (buffer && isPdfCompatibleImage(buffer)) {
      return buffer;
    }
  }

  return undefined;
}

function logoFetchCandidates(url: string): string[] {
  const preferred = preferPdfCompatibleLogoUrl(url);
  const candidates = [preferred];

  if (preferred !== url) {
    candidates.push(url);
  }

  // Fallback: ép JPEG qua CDN TopCV nếu URL gốc vẫn fail.
  if (/cdn-new\.topcv\.vn\/unsafe\//i.test(url) && !/filters:format\(/i.test(url)) {
    const forced = url.replace(
      /cdn-new\.topcv\.vn\/unsafe\/([^/]+)\//i,
      'cdn-new.topcv.vn/unsafe/$1/filters:format(jpeg)/',
    );
    candidates.push(forced);
  }

  return [...new Set(candidates)];
}

async function downloadImageBuffer(url: string): Promise<Buffer | undefined> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOGO.timeoutMs);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': env.USER_AGENT,
        Accept: 'image/png,image/jpeg,image/*;q=0.8',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);

    if (!response.ok) {
      return undefined;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length === 0 || buffer.length > LOGO.maxBytes) {
      return undefined;
    }

    return buffer;
  } catch {
    return undefined;
  }
}

/** pdfkit chỉ nhúng JPEG/PNG ổn định. */
export function isPdfCompatibleImage(buffer: Buffer): boolean {
  if (buffer.length < 8) {
    return false;
  }

  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

  return isPng || isJpeg;
}

function drawIconLine(
  doc: PDFKit.PDFDocument,
  fonts: FontFns,
  color: string,
  label: string,
  value: string,
): void {
  const y = doc.y + 4;
  doc.save();
  doc.circle(PAGE.marginX + 4, y, 3).fill(color);
  doc.restore();

  fonts.bold();
  doc.fontSize(9).fillColor(color).text(`${label}: `, PAGE.marginX + 14, doc.y, {
    continued: true,
    width: PAGE.contentWidth - 14,
  });
  fonts.regular();
  doc.fillColor(COLORS.ink).text(compactOneLine(value), {
    width: PAGE.contentWidth - 14,
  });
}

function drawSectionTitle(doc: PDFKit.PDFDocument, fonts: FontFns, color: string, label: string): void {
  const y = doc.y + 3;
  doc.save();
  doc.roundedRect(PAGE.marginX, y - 3, 6, 6, 1.5).fill(color);
  doc.restore();
  fonts.bold();
  doc.fontSize(9).fillColor(color).text(label, PAGE.marginX + 14, doc.y, {
    width: PAGE.contentWidth - 14,
  });
  doc.moveDown(0.12);
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > PAGE.maxY) {
    doc.addPage();
  }
}

/**
 * Tách JD thành mô tả / yêu cầu kỹ năng (theo nội dung JD, không dùng tag ngành).
 */
export function splitJobDescription(raw: string): { duties: string; requirements: string } {
  const normalized = normalizeDescription(raw);

  if (!normalized) {
    return { duties: '', requirements: '' };
  }

  const match = normalized.match(
    /\n(?=Yêu cầu\b|Your skills and experience\b|Requirements\b|Must have\b)/i,
  );

  if (!match || match.index === undefined) {
    return { duties: normalized, requirements: '' };
  }

  const duties = normalized.slice(0, match.index).trim();
  const requirements = normalized
    .slice(match.index)
    .replace(/^(Yêu cầu|Your skills and experience|Requirements|Must have)\b[:\s]*/i, '')
    .trim();

  return { duties, requirements };
}

/**
 * Ưu tiên đoạn yêu cầu trong JD; chỉ fallback tag kỹ năng thật (lọc ngành/job title).
 */
export function buildRequirementsText(requirementsFromJd: string, skillTags?: string[]): string {
  const fromJd = truncateText(toDashBulletList(requirementsFromJd), SECTION_MAX);

  if (fromJd) {
    return fromJd;
  }

  const tags = (skillTags ?? [])
    .map((skill) => compactOneLine(skill))
    .filter((skill) => isConcreteSkillTag(skill));

  if (tags.length === 0) {
    return '';
  }

  return tags.map((skill) => `- ${skill}`).join('\n');
}

function isConcreteSkillTag(skill: string): boolean {
  if (!skill || skill.length < 2 || skill.length > 32) {
    return false;
  }

  if (
    /consulting|outsourcing|logistics|warehouse|transportation|software products|web services|job search|services and|ai software|recruitment/i.test(
      skill,
    )
  ) {
    return false;
  }

  if (/\b(engineer|developer|admin|manager|leader|architect)\b/i.test(skill) && skill.includes(' ')) {
    return false;
  }

  return true;
}

function formatRoleLabel(role: JobRole): string {
  if (role === 'english-teacher') {
    return 'Giáo viên tiếng Anh';
  }

  return 'DevOps';
}

function formatDateTimeVi(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalizeDescription(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/^Mô tả:\s*/i, '')
    .replace(/\n*Yêu cầu:\s*/gi, '\nYêu cầu\n')
    .replace(/\n*Your skills and experience\s*/gi, '\nYour skills and experience\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Thống nhất mọi kiểu bullet về `- `. */
export function toDashBulletList(value: string): string {
  return value
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();

      if (!trimmed) {
        return '';
      }

      if (/^(Mô tả|Yêu cầu|Requirements|Description|Responsibilities|Must have|Nice to have)\b/i.test(trimmed)) {
        return '';
      }

      const withoutMarker = trimmed.replace(/^([•●▪▸►·*]|\d+[.)]|[-–—])\s+/, '');

      if (withoutMarker !== trimmed) {
        return `- ${withoutMarker}`;
      }

      // Câu yêu cầu dạng văn xuôi vẫn giữ, thêm `-` nếu đủ dài và giống bullet nội dung.
      if (trimmed.length > 40) {
        return `- ${trimmed}`;
      }

      return `- ${trimmed}`;
    })
    .filter(Boolean)
    .join('\n');
}

function compactOneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function truncateText(value: string, maxLength: number): string {
  const text = value.trim();

  if (!text) {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildPdfFileName(role: JobRole, date: Date): string {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    '-',
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
  ].join('');

  return `vn-jobs-${role}-${stamp}.pdf`;
}

function resolveFonts(): { regular?: string; bold?: string } {
  const configured = env.JOBS_PDF_FONT_PATH.trim();
  const bundledRegular = path.join(process.cwd(), 'assets/fonts/DejaVuSans.ttf');
  const bundledBold = path.join(process.cwd(), 'assets/fonts/DejaVuSans-Bold.ttf');
  const regular = firstExisting(configured, bundledRegular);
  const bold = firstExisting(configured ? configured.replace(/(\.ttf)$/i, '-Bold$1') : '', bundledBold);

  return { regular, bold: bold && bold !== regular ? bold : undefined };
}

function firstExisting(...candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}
