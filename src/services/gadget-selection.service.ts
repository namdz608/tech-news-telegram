/** Phân loại và chọn cân bằng tin thiết bị mà không dùng topic của tech digest. */
import { env } from '../config/env';
import { gadgetSourceAffinity, gadgetTopics } from '../config/gadget-topics';
import type { Article } from '../types/article';
import type { GadgetDigestEntry, GadgetSelectionResult, GadgetTopicKey } from '../types/gadget';
import { normalizeUrl } from '../utils/normalize-url';

interface RankedGadgetEntry extends GadgetDigestEntry {
  index: number;
}

const vendorOnlyKeywords = new Set(['apple', 'intel', 'amd', 'nvidia', 'qualcomm']);

export class GadgetSelectionService {
  constructor(
    private readonly maxArticles = env.GADGET_MAX_ARTICLES,
    private readonly now = () => new Date(),
  ) {}

  select(articles: Article[], seenUrls: ReadonlySet<string>): GadgetSelectionResult {
    const canonical = canonicalizeAndDedupe(articles);
    let skippedSeenCount = 0;
    const ranked: RankedGadgetEntry[] = [];

    canonical.forEach((article, index) => {
      if (seenUrls.has(article.url)) {
        skippedSeenCount += 1;
        return;
      }
      const topic = classifyGadgetArticle(article);
      if (!topic) return;
      ranked.push({ article, topic, score: scoreArticle(article, topic, this.now()), index });
    });

    ranked.sort((left, right) => right.score - left.score || left.index - right.index);
    return {
      selected: pickBalanced(ranked, this.maxArticles),
      eligibleCount: ranked.length,
      skippedSeenCount,
    };
  }
}

function canonicalizeAndDedupe(articles: Article[]): Article[] {
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

function classifyGadgetArticle(article: Article): GadgetTopicKey | undefined {
  if (!hasStrongProductTerm(article)) return undefined;

  const apple = gadgetTopics.find((topic) => topic.key === 'apple');
  if (apple && keywordHits(article, apple.keywords) > 0) return 'apple';

  let best: { key: GadgetTopicKey; hits: number } | undefined;
  for (const topic of gadgetTopics) {
    if (topic.key === 'apple') continue;
    const hits = keywordHits(article, topic.keywords);
    if (hits > 0 && (!best || hits > best.hits)) best = { key: topic.key, hits };
  }
  return best?.key;
}

function hasStrongProductTerm(article: Article): boolean {
  const searchable = `${article.title} ${article.summary ?? ''}`;
  return gadgetTopics.some((topic) =>
    topic.keywords.some(
      (keyword) => !vendorOnlyKeywords.has(keyword) && matchesGadgetKeyword(searchable, keyword),
    ),
  );
}

function keywordHits(article: Article, keywords: string[]): number {
  const searchable = `${article.title} ${article.summary ?? ''}`;
  return keywords.filter((keyword) => matchesGadgetKeyword(searchable, keyword)).length;
}

function scoreArticle(article: Article, topic: GadgetTopicKey, now: Date): number {
  const definition = gadgetTopics.find((candidate) => candidate.key === topic);
  if (!definition) return 0;
  const titleHits = definition.keywords.filter((keyword) =>
    matchesGadgetKeyword(article.title, keyword),
  ).length;
  const summaryHits = definition.keywords.filter((keyword) =>
    matchesGadgetKeyword(article.summary ?? '', keyword),
  ).length;
  const affinity = (gadgetSourceAffinity[article.sourceId] ?? []).includes(topic) ? 25 : 0;
  const published = new Date(article.publishedAt ?? article.collectedAt).getTime();
  const ageDays = Math.max(0, Math.floor((now.getTime() - published) / 86_400_000));
  return titleHits * 100 + summaryHits * 10 + affinity + Math.max(0, 14 - ageDays);
}

function matchesGadgetKeyword(text: string, keyword: string): boolean {
  const phrase = keyword
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${phrase}(?![\\p{L}\\p{N}])`, 'iu').test(text);
}

function pickBalanced(ranked: RankedGadgetEntry[], limit: number): GadgetDigestEntry[] {
  const selected: RankedGadgetEntry[] = [];
  const urls = new Set<string>();
  const sourceCounts = new Map<string, number>();
  const tryPick = (entry: RankedGadgetEntry) => {
    if (selected.length >= limit || urls.has(entry.article.url)) return;
    const count = sourceCounts.get(entry.article.sourceId) ?? 0;
    if (count >= 2) return;
    selected.push(entry);
    urls.add(entry.article.url);
    sourceCounts.set(entry.article.sourceId, count + 1);
  };

  for (const topic of gadgetTopics) {
    let categoryCount = 0;
    for (const entry of ranked) {
      if (entry.topic !== topic.key || categoryCount >= 2) continue;
      const before = selected.length;
      tryPick(entry);
      if (selected.length > before) categoryCount += 1;
    }
  }
  for (const entry of ranked) tryPick(entry);

  return selected.map(({ article, topic, score }) => ({ article, topic, score }));
}
