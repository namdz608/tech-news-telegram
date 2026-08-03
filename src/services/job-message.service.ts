/**
 * Dựng message Telegram riêng cho tin tuyển dụng VN.
 */
import { topics } from '../config/topics';
import { topicImageUrls } from '../config/topic-images';
import type { Article } from '../types/article';
import type { TopicKey } from '../types/topic';
import { compactText, escapeHtml } from '../utils/text';
import type { DigestMessage } from './digest.service';

const FALLBACK = 'Chưa cập nhật';
/** Giữ mô tả dài; Telegram sendMessage = 4096, ảnh tách riêng nếu vượt caption. */
const DESCRIPTION_MAX_LENGTH = 2400;

/**
 * Map Article[] jobs → DigestMessage[] với cấu trúc:
 * mô tả công việc / kỹ năng / mức lương / địa điểm.
 */
export function buildJobDigestMessages(articles: Article[]): DigestMessage[] {
  return articles.map((article) => {
    const topic = article.topics[0] ?? 'devops';

    return {
      text: renderJobMessage(article, topic),
      url: article.url,
      imageUrl: topicImageUrls[topic],
      article,
      topic,
    };
  });
}

export function renderJobMessage(article: Article, topic: TopicKey): string {
  const topicDefinition = topics.find((item) => item.key === topic);
  const topicLabel = (topicDefinition?.label ?? topic).toUpperCase();
  const details = article.jobDetails;
  const description = formatDescription(details?.description || article.summary || FALLBACK);
  const skills = formatSkills(details?.skills);
  const salary = compactText(details?.salary || '') || FALLBACK;
  const location = compactText(details?.location || '') || 'Hà Nội';
  const company = article.author ? `\n🏢 <b>Công ty:</b> ${escapeHtml(article.author)}` : '';

  return [
    `${topicIcon(topic)}  <b>${escapeHtml(`${topicLabel} UPDATE`)}</b>`,
    '━━━━━━━━━━━━━━━━',
    '',
    `📰  <b>${escapeHtml(article.title)}</b>`,
    company,
    '',
    '📋 <b>Mô tả công việc</b>',
    escapeHtml(description),
    '',
    '🛠 <b>Kỹ năng cần có</b>',
    escapeHtml(skills),
    '',
    '💰 <b>Mức lương</b>',
    escapeHtml(salary),
    '',
    '📍 <b>Địa điểm</b>',
    escapeHtml(location),
    '',
    `🏢 <i>Nguồn: ${escapeHtml(article.sourceName)}</i>`,
  ]
    .filter((line) => line !== undefined)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatDescription(value: string): string {
  const text = value
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!text) {
    return FALLBACK;
  }

  if (text.length <= DESCRIPTION_MAX_LENGTH) {
    return text;
  }

  return `${text.slice(0, DESCRIPTION_MAX_LENGTH - 1).trimEnd()}…`;
}

function formatSkills(skills: string[] | undefined): string {
  if (!skills || skills.length === 0) {
    return FALLBACK;
  }

  const items = skills.map((skill) => compactText(skill)).filter(Boolean);

  if (items.length === 0) {
    return FALLBACK;
  }

  return items.map((skill) => `- ${skill}`).join('\n');
}

function topicIcon(topic: TopicKey): string {
  const icons: Record<TopicKey, string> = {
    ai: '🤖',
    k8s: '☸️',
    security: '🔐',
    devops: '🛠️',
    cloud: '☁️',
    'jobs-english': '📚',
  };

  return icons[topic];
}
