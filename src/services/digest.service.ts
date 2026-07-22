import { env } from '../config/env';
import { topicImageUrls } from '../config/topic-images';
import { topics } from '../config/topics';
import type { Article } from '../types/article';
import type { TopicKey } from '../types/topic';
import { compactText, escapeHtml, includesKeyword } from '../utils/text';
import { createFallbackEditorial } from './article-editorial.service';
import type { ArticleEditorial } from './article-editorial.types';

export interface DigestMessage {
  text: string;
  url: string;
  imageUrl?: string;
  article: Article;
  topic: TopicKey;
}

interface DigestEntry {
  article: Article;
  topic: TopicKey;
}

interface RankedDigestEntry extends DigestEntry {
  index: number;
  score: number;
}

const sourceTopicAffinity: Record<string, TopicKey[]> = {
  'hn-rss': ['ai'],
  'github-ai-repos': ['ai'],
  'reddit-machine-learning': ['ai'],
  'reddit-local-llama': ['ai'],
  'reddit-openai': ['ai'],
  'reddit-artificial': ['ai'],
  'kubernetes-blog': ['k8s'],
  'reddit-kubernetes': ['k8s'],
  'google-security-blog': ['security'],
  'reddit-cybersecurity': ['security'],
  'aws-news-blog': ['cloud'],
  'reddit-aws': ['cloud'],
  'cncf-blog': ['k8s', 'devops', 'cloud'],
  'devops-dot-com': ['devops'],
  'reddit-devops': ['devops'],
  'the-hacker-news-html': ['security'],
};
const summaryMaxLength = 1000;

export class DigestService {
  constructor(private readonly maxArticlesPerTopic = env.MAX_ARTICLES_PER_TOPIC) {}

  buildDigest(articles: Article[]): string {
    const selectedEntries = selectBalancedEntries(articles, this.maxArticlesPerTopic);
    const selectedArticles = selectedEntries.map((entry) => entry.article);

    if (selectedEntries.length === 0) {
      return '🧠 BẢN TIN CÔNG NGHỆ\n\nChưa tìm thấy bài viết phù hợp.';
    }

    const sourceNames = [...new Set(selectedArticles.map((article) => article.sourceName))].join(', ');
    const lines: string[] = [
      '🧠 BẢN TIN CÔNG NGHỆ',
      `⏱ ${formatVietnamTime(new Date())}`,
      `📌 ${selectedEntries.length} bài mới | Nguồn: ${sourceNames}`,
      '',
    ];
    const grouped = groupEntriesByAssignedTopic(selectedEntries);
    let articleNumber = 1;

    for (const topic of topics) {
      const topicArticles = grouped.get(topic.key) ?? [];

      if (topicArticles.length === 0) {
        continue;
      }

      lines.push('━━━━━━━━━━━━━━');
      lines.push(`${topicIcon(topic.key)} ${topic.label.toUpperCase()}`);
      lines.push('');

      for (const entry of topicArticles) {
        const { article } = entry;
        lines.push(`${articleNumber}. ${article.title}`);
        lines.push(`   📰 ${article.sourceName}`);
        const summary = formatSummary(article.summary);
        if (summary) {
          lines.push(`   📝 ${summary}`);
        }
        lines.push(`   🔗 ${article.url}`);
        lines.push('');
        articleNumber += 1;
      }
    }

    return lines.join('\n').trim();
  }

  buildDigestMessages(articles: Article[]): DigestMessage[] {
    const selectedEntries = selectBalancedEntries(articles, this.maxArticlesPerTopic);

    if (selectedEntries.length === 0) {
      return [];
    }

    const grouped = groupEntriesByAssignedTopic(selectedEntries);
    const messages: DigestMessage[] = [];

    for (const topic of topics) {
      const topicArticles = grouped.get(topic.key) ?? [];

      for (const entry of topicArticles) {
        const editorial = createFallbackEditorial(entry.article, topic.key);
        messages.push({
          text: renderArticleMessage(entry.article, topic.key, editorial),
          url: entry.article.url,
          imageUrl: getMessageImageUrl(entry.article, topic.key),
          article: entry.article,
          topic: topic.key,
        });
      }
    }

    return messages;
  }
}

function selectBalancedEntries(articles: Article[], maxArticlesPerTopic: number): DigestEntry[] {
  const selectedByUrl = new Set<string>();
  const result: DigestEntry[] = [];

  for (const topic of topics) {
    const candidates = articles
      .map((article, index) => ({ article, index }))
      .filter(({ article }) => article.topics.includes(topic.key) && !selectedByUrl.has(article.url))
      .map(({ article, index }) => ({
        article,
        topic: topic.key,
        index,
        score: scoreArticleForTopic(article, topic.key),
      }))
      .sort((left, right) => right.score - left.score || left.index - right.index);

    const selectedForTopic = pickDiverseSources(candidates, maxArticlesPerTopic);

    for (const entry of selectedForTopic) {
      selectedByUrl.add(entry.article.url);
      result.push({ article: entry.article, topic: entry.topic });
    }
  }

  return result;
}

function pickDiverseSources(candidates: RankedDigestEntry[], maxArticlesPerTopic: number): RankedDigestEntry[] {
  const picked: RankedDigestEntry[] = [];
  const pickedUrls = new Set<string>();
  const pickedSources = new Set<string>();

  for (const candidate of candidates) {
    if (picked.length >= maxArticlesPerTopic) {
      return picked;
    }

    if (pickedSources.has(candidate.article.sourceId)) {
      continue;
    }

    picked.push(candidate);
    pickedUrls.add(candidate.article.url);
    pickedSources.add(candidate.article.sourceId);
  }

  for (const candidate of candidates) {
    if (picked.length >= maxArticlesPerTopic) {
      break;
    }

    if (pickedUrls.has(candidate.article.url)) {
      continue;
    }

    picked.push(candidate);
    pickedUrls.add(candidate.article.url);
  }

  return picked.sort((left, right) => left.index - right.index);
}

function scoreArticleForTopic(article: Article, topic: TopicKey): number {
  const topicDefinition = topics.find((item) => item.key === topic);
  const affinities = sourceTopicAffinity[article.sourceId] ?? [];
  let score = 0;

  if (affinities.includes(topic)) {
    score += 100;
  } else if (affinities.length > 0) {
    score -= 15;
  }

  if (article.topics.length === 1) {
    score += 8;
  }

  if (article.topics[0] === topic) {
    score += 4;
  }

  if (!topicDefinition) {
    return score;
  }

  for (const keyword of topicDefinition.keywords) {
    if (includesKeyword(article.title, keyword)) {
      score += 20;
    }

    if (includesKeyword(article.url, keyword)) {
      score += 8;
    }

    if (article.summary && includesKeyword(article.summary, keyword)) {
      score += 4;
    }
  }

  return score;
}

export function renderArticleMessage(
  article: Article,
  topic: TopicKey,
  editorial: ArticleEditorial,
): string {
  const topicDefinition = topics.find((item) => item.key === topic);
  const topicLabel = (topicDefinition?.label ?? topic).toUpperCase();
  const summary = truncateText(compactText(editorial.summary), 360);
  const whyImportant = truncateText(compactText(editorial.whyImportant), 320);
  const actionText = truncateText(compactText(editorial.actionText), 240);
  const action = actionPresentation[editorial.actionLevel];

  const lines: string[] = [
    `${topicIcon(topic)}  <b>${escapeHtml(`${topicLabel} UPDATE`)}</b>`,
    '━━━━━━━━━━━━━━━━',
    '',
    `📰  <b>${escapeHtml(editorial.title)}</b>`,
    '',
    `📅 <b>Công bố:</b> ${formatArticleDate(article)}`,
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
  ];

  return lines.join('\n').trim();
}

const actionPresentation = {
  urgent: { icon: '🔴', label: 'KHẨN CẤP' },
  high: { icon: '🟠', label: 'CAO' },
  monitor: { icon: '🟡', label: 'THEO DÕI' },
} as const;

function formatArticleDate(article: Article): string {
  for (const value of [article.publishedAt, article.collectedAt]) {
    if (!value) {
      continue;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      continue;
    }

    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  }

  return 'Không rõ';
}

function getMessageImageUrl(article: Article, topic: TopicKey): string | undefined {
  return normalizeImageUrl(article.imageUrl) ?? topicImageUrls[topic];
}

function normalizeImageUrl(imageUrl?: string): string | undefined {
  const trimmed = imageUrl?.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function formatSummary(summary?: string): string {
  if (!summary) {
    return '';
  }

  const compacted = compactText(summary);

  if (!compacted) {
    return '';
  }

  return truncateText(compacted, summaryMaxLength);
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function groupEntriesByAssignedTopic(entries: DigestEntry[]): Map<TopicKey, DigestEntry[]> {
  const result = new Map<TopicKey, DigestEntry[]>();

  for (const entry of entries) {
    const current = result.get(entry.topic) ?? [];
    current.push(entry);
    result.set(entry.topic, current);
  }

  return result;
}

function formatVietnamTime(date: Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function topicIcon(topic: TopicKey): string {
  const icons: Record<TopicKey, string> = {
    ai: '🤖',
    k8s: '☸️',
    security: '🔐',
    devops: '🛠️',
    cloud: '☁️',
  };

  return icons[topic];
}
