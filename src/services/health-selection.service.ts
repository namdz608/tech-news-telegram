import { env } from '../config/env';
import { healthSourceAffinity, healthTopics } from '../config/health-topics';
import type { Article } from '../types/article';
import type {
  HealthEvidenceKind,
  HealthSelectionResult,
  HealthTopicKey,
} from '../types/health';
import {
  canonicalizeCuratedArticles,
  matchesCuratedKeyword,
  pickBalancedCuratedEntries,
  type RankedCuratedEntry,
} from './curated-selection';
import {
  classifyHealthEvidence,
  isSafeHealthArticle,
} from './health-safety.service';

function keywordHits(article: Article, topic: HealthTopicKey): { title: number; summary: number } {
  const definition = healthTopics.find((candidate) => candidate.key === topic);
  if (!definition) return { title: 0, summary: 0 };
  return {
    title: definition.keywords.filter((keyword) =>
      matchesCuratedKeyword(article.title, keyword)).length,
    summary: definition.keywords.filter((keyword) =>
      matchesCuratedKeyword(article.summary ?? '', keyword)).length,
  };
}

export function classifyHealthTopic(article: Article): HealthTopicKey | undefined {
  let winner: { topic: HealthTopicKey; hits: number } | undefined;
  for (const topic of healthTopics) {
    const hits = keywordHits(article, topic.key);
    const total = hits.title + hits.summary;
    if (total > (winner?.hits ?? 0)) winner = { topic: topic.key, hits: total };
  }
  return winner?.topic;
}

function scoreHealthArticle(article: Article, topic: HealthTopicKey, now: Date): number {
  const hits = keywordHits(article, topic);
  const timestamp = new Date(article.publishedAt ?? article.collectedAt).getTime();
  const ageDays = Number.isFinite(timestamp)
    ? Math.max(0, Math.floor((now.getTime() - timestamp) / 86_400_000))
    : 14;
  const freshness = Math.max(0, 14 - ageDays);
  const affinity = healthSourceAffinity[article.sourceId]?.includes(topic) ? 25 : 0;
  const metadataQuality = [article.summary, article.publishedAt, article.imageUrl]
    .filter((value) => Boolean(value?.trim())).length * 2;
  return hits.title * 100 + hits.summary * 10 + affinity + freshness + metadataQuality;
}

export class HealthSelectionService {
  constructor(
    private readonly maxArticles = env.HEALTH_MAX_ARTICLES,
    private readonly now = () => new Date(),
  ) {}

  select(articles: Article[], seenUrls: ReadonlySet<string>): HealthSelectionResult {
    const canonical = canonicalizeCuratedArticles(articles);
    let skippedSeenCount = 0;
    const ranked: Array<RankedCuratedEntry<HealthTopicKey> & {
      evidence: HealthEvidenceKind;
    }> = [];

    canonical.forEach((article, index) => {
      if (seenUrls.has(article.url)) {
        skippedSeenCount += 1;
        return;
      }
      if (!isSafeHealthArticle(article)) return;
      const topic = classifyHealthTopic(article);
      if (!topic) return;
      ranked.push({
        article,
        topic,
        evidence: classifyHealthEvidence(article),
        score: scoreHealthArticle(article, topic, this.now()),
        index,
      });
    });

    ranked.sort((left, right) => right.score - left.score || left.index - right.index);
    const selected = pickBalancedCuratedEntries(
      ranked,
      healthTopics.map((topic) => topic.key),
      this.maxArticles,
      2,
      2,
    );
    return { selected, eligibleCount: ranked.length, skippedSeenCount };
  }
}
