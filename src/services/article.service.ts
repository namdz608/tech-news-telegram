import { topics } from '../config/topics';
import type { Article } from '../types/article';
import type { TopicKey } from '../types/topic';
import { includesKeyword } from '../utils/text';

interface MatchTopicsInput {
  title: string;
  summary?: string;
}

export function matchTopics(input: MatchTopicsInput): TopicKey[] {
  const searchable = `${input.title} ${input.summary ?? ''}`;

  return topics
    .filter((topic) => topic.keywords.some((keyword) => includesKeyword(searchable, keyword)))
    .map((topic) => topic.key);
}

export function dedupeArticles(articles: Article[]): Article[] {
  const seen = new Set<string>();
  const result: Article[] = [];

  for (const article of articles) {
    if (seen.has(article.url)) {
      continue;
    }

    seen.add(article.url);
    result.push(article);
  }

  return result;
}

const blockedHostnames = new Set(['co88.cfd']);
const suspiciousTerms = [
  'casino',
  'betting',
  'slots',
  'xoso',
  'co88',
  'nổ hũ',
  'no hu',
  'lô đề',
  'lo de',
  'game bài',
  'game bai',
];

export function isAllowedArticle(article: Article): boolean {
  const hostname = getHostname(article.url);

  if (!hostname) {
    return false;
  }

  if (blockedHostnames.has(hostname)) {
    return false;
  }

  const searchable = `${hostname} ${article.title} ${article.summary ?? ''}`.toLowerCase();

  return !suspiciousTerms.some((term) => searchable.includes(term));
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}
