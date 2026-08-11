import type { Article } from '../types/article';
import { normalizeUrl } from '../utils/normalize-url';

export interface RankedCuratedEntry<TTopic extends string> {
  article: Article;
  topic: TTopic;
  score: number;
  index: number;
}

export function canonicalizeCuratedArticles(articles: Article[]): Article[] {
  const seen = new Set<string>();
  const result: Article[] = [];
  for (const article of articles) {
    try {
      const url = normalizeUrl(article.url);
      if (seen.has(url)) continue;
      seen.add(url);
      result.push({ ...article, id: url, url });
    } catch {
      continue;
    }
  }
  return result;
}

export function matchesCuratedKeyword(text: string, keyword: string): boolean {
  const phrase = keyword.trim().split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${phrase}(?![\\p{L}\\p{N}])`, 'iu').test(text);
}

export function pickBalancedCuratedEntries<
  TTopic extends string,
  TEntry extends RankedCuratedEntry<TTopic>,
>(
  ranked: TEntry[],
  topicOrder: readonly TTopic[],
  limit: number,
  maxPerTopic = 2,
  maxPerSource = 2,
): Array<Omit<TEntry, 'index'>> {
  const selected: TEntry[] = [];
  const urls = new Set<string>();
  const sourceCounts = new Map<string, number>();
  const topicCounts = new Map<TTopic, number>();
  const tryPick = (entry: TEntry) => {
    if (selected.length >= limit || urls.has(entry.article.url)) return false;
    const sourceCount = sourceCounts.get(entry.article.sourceId) ?? 0;
    const topicCount = topicCounts.get(entry.topic) ?? 0;
    if (sourceCount >= maxPerSource || topicCount >= maxPerTopic) return false;
    selected.push(entry);
    urls.add(entry.article.url);
    sourceCounts.set(entry.article.sourceId, sourceCount + 1);
    topicCounts.set(entry.topic, topicCount + 1);
    return true;
  };

  for (const topic of topicOrder) {
    let topicCount = 0;
    for (const entry of ranked) {
      if (entry.topic !== topic || topicCount >= maxPerTopic) continue;
      if (tryPick(entry)) topicCount += 1;
    }
  }
  for (const entry of ranked) tryPick(entry);

  return selected.map(({ index: _index, ...entry }) => entry);
}
