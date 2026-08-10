import type { Article } from '../types/article';
import { compactText, escapeHtml } from '../utils/text';
import type { ArticleEditorial } from './article-editorial.types';

export interface ArticleMessagePresentation {
  label: string;
  icon: string;
  fallbackImageUrl: string;
}

const actions = {
  urgent: { icon: '🔴', label: 'KHẨN CẤP' },
  high: { icon: '🟠', label: 'CAO' },
  monitor: { icon: '🟡', label: 'THEO DÕI' },
} as const;

export function renderArticleMessageWithPresentation(
  article: Article,
  presentation: ArticleMessagePresentation,
  editorial: ArticleEditorial,
): string {
  const summary = truncate(compactText(editorial.summary), 360);
  const whyImportant = truncate(compactText(editorial.whyImportant), 320);
  const actionText = truncate(compactText(editorial.actionText), 240);
  const action = actions[editorial.actionLevel];
  return [
    `${presentation.icon}  <b>${escapeHtml(`${presentation.label.toUpperCase()} UPDATE`)}</b>`,
    '━━━━━━━━━━━━━━━━',
    '',
    `📰  <b>${escapeHtml(editorial.title)}</b>`,
    '',
    `📅 <b>Công bố:</b> ${formatDate(article)}`,
    '',
    '📝 <b>Tóm tắt</b>',
    escapeHtml(summary),
    '',
    '🎯 <b>Vì sao đáng chú ý?</b>',
    escapeHtml(whyImportant),
    '',
    '⚡ <b>Mức hành động</b>',
    `${action.icon} <b>${action.label}</b> — ${escapeHtml(actionText)}`,
    '',
    `🏢 <i>Nguồn: ${escapeHtml(article.sourceName)}</i>`,
  ].join('\n').trim();
}

export function getArticleMessageImageUrl(article: Article, fallbackImageUrl: string): string | undefined {
  return validHttpsUrl(article.imageUrl) ?? validHttpsUrl(fallbackImageUrl);
}

function formatDate(article: Article): string {
  for (const value of [article.publishedAt, article.collectedAt]) {
    if (!value) continue;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) continue;
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
    }).format(date);
  }
  return 'Không rõ';
}

function validHttpsUrl(input?: string): string | undefined {
  if (!input?.trim()) return undefined;
  try {
    const url = new URL(input.trim());
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}…`;
}
