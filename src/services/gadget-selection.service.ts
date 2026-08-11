/** Phân loại và chọn cân bằng tin thiết bị mà không dùng topic của tech digest. */
import { env } from '../config/env';
import { gadgetSourceAffinity, gadgetTopics } from '../config/gadget-topics';
import type { Article } from '../types/article';
import type { GadgetDigestEntry, GadgetSelectionResult, GadgetTopicKey } from '../types/gadget';
import {
  canonicalizeCuratedArticles,
  matchesCuratedKeyword,
  pickBalancedCuratedEntries,
} from './curated-selection';

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
    const canonical = canonicalizeCuratedArticles(articles);
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
      selected: pickBalancedCuratedEntries(
        ranked,
        gadgetTopics.map((topic) => topic.key),
        this.maxArticles,
        2,
        2,
      ),
      eligibleCount: ranked.length,
      skippedSeenCount,
    };
  }
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
      (keyword) => !vendorOnlyKeywords.has(keyword) && matchesCuratedKeyword(searchable, keyword),
    ),
  );
}

function keywordHits(article: Article, keywords: string[]): number {
  const searchable = `${article.title} ${article.summary ?? ''}`;
  return keywords.filter((keyword) => matchesCuratedKeyword(searchable, keyword)).length;
}

function scoreArticle(article: Article, topic: GadgetTopicKey, now: Date): number {
  const definition = gadgetTopics.find((candidate) => candidate.key === topic);
  if (!definition) return 0;
  const titleHits = definition.keywords.filter((keyword) =>
    matchesCuratedKeyword(article.title, keyword),
  ).length;
  const summaryHits = definition.keywords.filter((keyword) =>
    matchesCuratedKeyword(article.summary ?? '', keyword),
  ).length;
  const affinity = (gadgetSourceAffinity[article.sourceId] ?? []).includes(topic) ? 25 : 0;
  const published = new Date(article.publishedAt ?? article.collectedAt).getTime();
  const ageDays = Math.max(0, Math.floor((now.getTime() - published) / 86_400_000));
  return titleHits * 100 + summaryHits * 10 + affinity + Math.max(0, 14 - ageDays);
}
