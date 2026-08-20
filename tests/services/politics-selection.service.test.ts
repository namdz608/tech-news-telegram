import { describe, expect, it } from 'vitest';
import { PoliticsClassificationService } from '../../src/services/politics-classification.service';
import { PoliticsEventDedupeService } from '../../src/services/politics-event-dedupe.service';
import {
  PoliticsSelectionService,
  type PoliticsSelectionOptions,
} from '../../src/services/politics-selection.service';
import { PoliticsVerificationService } from '../../src/services/politics-verification.service';
import type { PoliticsCandidate, PoliticsSourceItem } from '../../src/types/gold-politics';

const NOW = new Date('2026-08-20T12:00:00.000Z');
const REASON_KEYS = [
  'leader-controversy',
  'high-impact-politics',
  'other-politics',
  'gold-market',
  'named-leader',
  'relevance',
  'age',
  'source-text',
  'verification',
  'independent-origins',
  'engagement',
] as const;

function hoursAgo(hours: number, extraMs = 0): string {
  return new Date(NOW.getTime() - hours * 3_600_000 - extraMs).toISOString();
}

function item(overrides: Partial<PoliticsSourceItem> = {}): PoliticsSourceItem {
  const url = overrides.url ?? 'https://news.example/story';
  const publishedAt = Object.hasOwn(overrides, 'publishedAt') ? overrides.publishedAt! : hoursAgo(3);
  const origin = overrides.originAttribution;
  return {
    id: overrides.id ?? url,
    sourceId: overrides.sourceId ?? 'rss-test',
    sourceName: overrides.sourceName ?? 'Test Source',
    title: overrides.title ?? 'Government announces a new budget plan',
    url,
    summary: overrides.summary ?? 'Parliament debated spending and gold-reserve policy.',
    author: overrides.author ?? 'Desk',
    publishedAt,
    collectedAt: overrides.collectedAt ?? NOW.toISOString(),
    topics: overrides.topics ?? [],
    discoveryChannel: overrides.discoveryChannel ?? 'rss',
    discoveredAt: overrides.discoveredAt ?? NOW.toISOString(),
    originalAuthor: overrides.originalAuthor ?? 'Desk',
    originalAccount: overrides.originalAccount,
    originalUrl: overrides.originalUrl ?? url,
    quotedOriginUrl: overrides.quotedOriginUrl,
    syndicationKey: overrides.syndicationKey,
    sourceQuotaKey: overrides.sourceQuotaKey ?? 'news.example',
    sourceTextStatus: overrides.sourceTextStatus ?? 'full',
    evidenceKind: overrides.evidenceKind ?? 'identified-report',
    evidentiaryEffect: overrides.evidentiaryEffect ?? 'records-claim',
    evidenceOriginKey: overrides.evidenceOriginKey ?? 'news.example',
    originAttribution: {
      url: origin?.url ?? url,
      account: origin?.account,
      publishedAt: origin?.publishedAt ?? publishedAt,
      discoveredAt: origin?.discoveredAt ?? overrides.discoveredAt ?? NOW.toISOString(),
    },
    ...('engagement' in overrides ? { engagement: overrides.engagement } : {}),
  };
}

function createService(
  options: PoliticsSelectionOptions = { maxArticles: 15, maxGoldNews: 3, maxPerSource: 3 },
  now: () => Date = () => NOW,
): PoliticsSelectionService {
  return new PoliticsSelectionService(
    new PoliticsClassificationService(),
    new PoliticsEventDedupeService(),
    new PoliticsVerificationService(),
    options,
    now,
  );
}

function parseReasons(reasons: readonly string[]): Map<string, number> {
  const parsed = new Map<string, number>();
  for (const reason of reasons) {
    const separator = reason.lastIndexOf(':');
    const key = reason.slice(0, separator);
    const points = Number(reason.slice(separator + 1));
    parsed.set(key, points);
  }
  return parsed;
}

function reasonSum(candidate: PoliticsCandidate): number {
  return [...parseReasons(candidate.scoringReasons).values()].reduce((sum, points) => sum + points, 0);
}

function categoryReason(candidate: PoliticsCandidate): string | undefined {
  return candidate.scoringReasons.find((reason) =>
    reason.startsWith('leader-controversy:') ||
    reason.startsWith('high-impact-politics:') ||
    reason.startsWith('other-politics:') ||
    reason.startsWith('gold-market:'),
  );
}

function vnAnchor(candidate: PoliticsCandidate): boolean {
  return (
    (candidate.primaryCategory === 'vietnam-politics' || candidate.primaryCategory === 'leader-controversy') &&
    (candidate.geographicScope === 'vietnam' || candidate.geographicScope === 'mixed')
  );
}

function intAnchor(candidate: PoliticsCandidate): boolean {
  return (
    (candidate.primaryCategory === 'international-politics' || candidate.primaryCategory === 'leader-controversy') &&
    (candidate.geographicScope === 'international' || candidate.geographicScope === 'mixed')
  );
}

function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  let seed = 1_234_567_891;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    const swap = seed % (index + 1);
    const current = copy[index]!;
    copy[index] = copy[swap]!;
    copy[swap] = current;
  }
  return copy;
}

const vnControversy = (): PoliticsSourceItem =>
  item({
    url: 'https://vnexpress.net/pm-bribe',
    sourceQuotaKey: 'vnexpress.net',
    evidenceOriginKey: 'vnexpress.net',
    title: 'Prime Minister Pham Minh Chinh allegedly accepted bribes',
    summary: 'Corruption scandal in Hanoi.',
  });

const intControversy = (): PoliticsSourceItem =>
  item({
    url: 'https://www.reuters.com/musk-scandal',
    sourceQuotaKey: 'reuters.com',
    evidenceOriginKey: 'reuters.com',
    title: 'Elon Musk accused of abuse of power at Tesla',
    summary: 'CEO controversy in the United States.',
  });

const vnHighImpact = (): PoliticsSourceItem =>
  item({
    url: 'https://nhandan.vn/election',
    sourceQuotaKey: 'nhandan.vn',
    evidenceOriginKey: 'nhandan.vn',
    title: 'Bầu cử Quốc hội và quốc phòng Việt Nam',
    summary: 'Bộ Quốc phòng công bố kế hoạch.',
  });

const intHighImpact = (): PoliticsSourceItem =>
  item({
    url: 'https://www.bbc.com/uk-election',
    sourceQuotaKey: 'bbc.co.uk',
    evidenceOriginKey: 'bbc.co.uk',
    title: 'UK election results reshape parliament',
    summary: 'British government coalition talks begin.',
  });

const vnOther = (): PoliticsSourceItem =>
  item({
    url: 'https://chinhphu.vn/budget',
    sourceQuotaKey: 'chinhphu.vn',
    evidenceOriginKey: 'chinhphu.vn',
    title: 'Quốc hội thông qua luật ngân sách',
    summary: 'Chính phủ trình chính sách công.',
  });

const intOther = (): PoliticsSourceItem =>
  item({
    url: 'https://www.eu.europa.eu/diplomacy',
    sourceQuotaKey: 'europa.eu',
    evidenceOriginKey: 'europa.eu',
    title: 'European Union diplomats discuss agriculture policy',
    summary: 'Brussels trade talks continue with the government.',
  });

const goldVietnam = (): PoliticsSourceItem =>
  item({
    url: 'https://sjc.com.vn/price',
    sourceQuotaKey: 'sjc.com.vn',
    evidenceOriginKey: 'sjc.com.vn',
    title: 'Giá vàng SJC tại Hà Nội tăng',
    summary: 'DOJI và PNJ niêm yết giá vàng.',
  });

function uniqueGold(index: number, sourceQuotaKey = `gold-${index}.example`): PoliticsSourceItem {
  const token = `golduniq${String(index).padStart(2, '0')}`;
  return item({
    url: `https://${sourceQuotaKey}/${token}`,
    sourceQuotaKey,
    evidenceOriginKey: sourceQuotaKey,
    title: `Gold prices rise ${token}aaa ${token}bbb ${token}ccc ${token}ddd`,
    summary: `Bullion and XAU drivers ${token}eee ${token}fff ${token}ggg in London.`,
  });
}

function buildConstraintPool(): PoliticsSourceItem[] {
  const controversies: PoliticsSourceItem[] = [
    vnControversy(),
    intControversy(),
    item({
      url: 'https://www.nytimes.com/dalai-scandal',
      sourceQuotaKey: 'nytimes.com',
      evidenceOriginKey: 'nytimes.com',
      title: 'Dalai Lama faces a scandal over donations',
      summary: 'Controversy involving the public figure in India coverage.',
    }),
    item({
      url: 'https://www.washingtonpost.com/trump-corruption',
      sourceQuotaKey: 'washingtonpost.com',
      evidenceOriginKey: 'washingtonpost.com',
      title: 'Donald Trump accused of corruption in the United States',
      summary: 'Scandal reported in Washington politics.',
    }),
    item({
      url: 'https://vnexpress.net/president-fraud',
      sourceQuotaKey: 'vnexpress.net',
      evidenceOriginKey: 'vnexpress.net',
      title: 'Vietnamese president accused of fraud in Hanoi',
      summary: 'Scandal involving the president and government palace.',
    }),
    item({
      url: 'https://vnexpress.net/chief-justice',
      sourceQuotaKey: 'vnexpress.net',
      evidenceOriginKey: 'vnexpress.net',
      title: 'Vietnam Chief Justice accused of corruption in Hanoi',
      summary: 'Supreme court scandal involving the chief justice.',
    }),
    item({
      url: 'https://vnexpress.net/minister-bribe',
      sourceQuotaKey: 'vnexpress.net',
      evidenceOriginKey: 'vnexpress.net',
      title: 'Vietnamese minister accused of bribery in Hanoi',
      summary: 'Public official scandal at the government ministry.',
    }),
    item({
      url: 'https://www.un.org/sg-scandal',
      sourceQuotaKey: 'un.org',
      evidenceOriginKey: 'un.org',
      title: 'UN Secretary-General accused of corruption',
      summary: 'Scandal at the United Nations headquarters.',
    }),
  ];

  const highImpact: PoliticsSourceItem[] = [
    vnHighImpact(),
    intHighImpact(),
  ];

  const otherPolitics: PoliticsSourceItem[] = [
    vnOther(),
    intOther(),
  ];

  const mixedControversy = item({
    url: 'https://www.ft.com/mixed-leader',
    sourceQuotaKey: 'ft.com',
    evidenceOriginKey: 'ft.com',
    title: 'Prime Minister Pham Minh Chinh and Donald Trump face a joint scandal',
    summary: 'Corruption controversy links Hanoi and the United States.',
  });

  const gold = [
    goldVietnam(),
    item({
      url: 'https://www.kitco.com/fed',
      sourceQuotaKey: 'kitco.com',
      evidenceOriginKey: 'kitco.com',
      title: 'Gold price rises as Federal Reserve rates climb',
      summary: 'USD drivers push bullion higher.',
    }),
    ...Array.from({ length: 8 }, (_, index) => uniqueGold(index + 1, 'bullion.example')),
    ...Array.from({ length: 4 }, (_, index) => uniqueGold(index + 20, `spot-${index}.example`)),
  ];

  return [...controversies, ...highImpact, ...otherPolitics, mixedControversy, ...gold];
}

describe('PoliticsSelectionService constructor options', () => {
  it.each([
    { maxArticles: 1, maxGoldNews: 0, maxPerSource: 1 },
    { maxArticles: 16, maxGoldNews: 3, maxPerSource: 3 },
    { maxArticles: 15.5, maxGoldNews: 3, maxPerSource: 3 },
    { maxArticles: Number.NaN, maxGoldNews: 3, maxPerSource: 3 },
    { maxArticles: 15, maxGoldNews: -1, maxPerSource: 3 },
    { maxArticles: 15, maxGoldNews: 4, maxPerSource: 3 },
    { maxArticles: 2, maxGoldNews: 3, maxPerSource: 3 },
    { maxArticles: 15, maxGoldNews: 1.5, maxPerSource: 3 },
    { maxArticles: 15, maxGoldNews: 3, maxPerSource: 0 },
    { maxArticles: 15, maxGoldNews: 3, maxPerSource: 4 },
    { maxArticles: 15, maxGoldNews: 3, maxPerSource: 2.2 },
    { maxArticles: 100, maxGoldNews: 50, maxPerSource: 50 },
  ] satisfies PoliticsSelectionOptions[])(
    'rejects invalid options %j with RangeError invalid-politics-selection-options',
    (options) => {
      expect(() => createService(options)).toThrow(RangeError);
      try {
        createService(options);
      } catch (error) {
        expect(error).toBeInstanceOf(RangeError);
        expect((error as RangeError).message).toBe('invalid-politics-selection-options');
      }
    },
  );

  it.each([
    { maxArticles: 2, maxGoldNews: 0, maxPerSource: 1 },
    { maxArticles: 2, maxGoldNews: 2, maxPerSource: 3 },
    { maxArticles: 15, maxGoldNews: 3, maxPerSource: 3 },
    { maxArticles: 15, maxGoldNews: 0, maxPerSource: 1 },
  ] satisfies PoliticsSelectionOptions[])('accepts valid boundary options %j', (options) => {
    expect(() => createService(options)).not.toThrow();
  });

  it('freezes a copied options object and ignores later mutation of the caller object', () => {
    const options: PoliticsSelectionOptions = { maxArticles: 2, maxGoldNews: 0, maxPerSource: 1 };
    const service = createService(options);
    options.maxArticles = 15;
    options.maxGoldNews = 3;
    options.maxPerSource = 3;
    const result = service.select(
      [vnControversy(), intHighImpact(), vnOther(), uniqueGold(1), uniqueGold(2), uniqueGold(3)],
      new Set(),
    );
    expect(result.selected).toHaveLength(2);
  });
});

describe('PoliticsSelectionService eligibility, history, and scoring', () => {
  it('replays one seen Vietnamese and one seen international anchor but never seen gold', () => {
    const vietnam = vnControversy();
    const international = intControversy();
    const gold = goldVietnam();
    const result = createService({ maxArticles: 3, maxGoldNews: 1, maxPerSource: 3 }).select(
      [vietnam, international, gold],
      new Set([vietnam.url, international.url, gold.url]),
    );

    expect(result.eligibleCount).toBe(0);
    expect(result.skippedSeenCount).toBe(3);
    expect(result.selected).toHaveLength(2);
    expect(result.selected.some(vnAnchor)).toBe(true);
    expect(result.selected.some(intAnchor)).toBe(true);
    expect(result.selected.some((candidate) => candidate.primaryCategory === 'gold-market')).toBe(false);
  });

  it('keeps a fresh Vietnamese anchor and replays only the missing international scope', () => {
    const vietnam = vnControversy();
    const international = intControversy();
    const result = createService({ maxArticles: 2, maxGoldNews: 0, maxPerSource: 3 }).select(
      [vietnam, international],
      new Set([international.url]),
    );

    expect(result.eligibleCount).toBe(1);
    expect(result.skippedSeenCount).toBe(1);
    expect(result.selected.map((candidate) => candidate.claimOriginUrl)).toEqual([
      vietnam.url,
      international.url,
    ]);
  });

  it('replays a distinct seen anchor when one fresh mixed event matches both scopes', () => {
    const mixed = item({
      url: 'https://www.ft.com/fresh-mixed-leader',
      sourceQuotaKey: 'ft.com',
      evidenceOriginKey: 'ft.com',
      title: 'Prime Minister Pham Minh Chinh and Donald Trump face a joint scandal',
      summary: 'Corruption controversy links Hanoi and the United States.',
    });
    const international = intOther();
    const result = createService({ maxArticles: 2, maxGoldNews: 0, maxPerSource: 3 }).select(
      [mixed, international],
      new Set([international.url]),
    );

    expect(result.selected).toHaveLength(2);
    expect(new Set(result.selected.map((candidate) => candidate.eventFingerprint)).size).toBe(2);
    expect(result.selected.some(vnAnchor)).toBe(true);
    expect(result.selected.some(intAnchor)).toBe(true);
  });

  it('classifies and clusters before suppressing a seen original plus unseen reposts', () => {
    const original = vnControversy();
    const repostA = item({
      url: 'https://x.com/a/status/1',
      sourceQuotaKey: 'x:a',
      evidenceOriginKey: 'x:a',
      discoveryChannel: 'x',
      evidenceKind: 'social-claim',
      title: original.title,
      summary: original.summary,
      quotedOriginUrl: original.url,
    });
    const repostB = item({
      url: 'https://x.com/b/status/2',
      sourceQuotaKey: 'x:b',
      evidenceOriginKey: 'x:b',
      discoveryChannel: 'x',
      evidenceKind: 'social-claim',
      title: original.title,
      summary: original.summary,
      quotedOriginUrl: original.url,
    });
    const unrelated = intOther();
    const result = createService().select(
      [repostB, original, repostA, unrelated],
      new Set([`${original.url}?utm_source=rss`]),
    );

    expect(result.skippedSeenCount).toBe(1);
    expect(result.selected.map((candidate) => candidate.claimOriginUrl)).toEqual([
      'https://vnexpress.net/pm-bribe',
      'https://www.eu.europa.eu/diplomacy',
    ]);
    expect(result.eligibleCount).toBe(1);
    expect(result.selected.some((candidate) => candidate.url.includes('x.com'))).toBe(false);
  });

  it('treats an event as seen when claim origin, member URL, origin attribution, or quoted origin matches history', () => {
    const quoted = item({
      url: 'https://x.com/quote/status/9',
      sourceQuotaKey: 'x:quote',
      evidenceOriginKey: 'x:quote',
      discoveryChannel: 'x',
      title: 'European Union diplomats discuss fisheries policy',
      summary: 'Government talks continue in Brussels over unique fisheries tokens.',
      quotedOriginUrl: 'https://origin.example/fisheries',
      originAttribution: {
        url: 'https://x.com/quote/status/9',
        publishedAt: hoursAgo(2),
        discoveredAt: NOW.toISOString(),
      },
    });
    const attributed = item({
      url: 'https://mirror.example/budget',
      sourceQuotaKey: 'mirror.example',
      evidenceOriginKey: 'mirror.example',
      title: 'Quốc hội thông qua luật ngân sách',
      summary: 'Chính phủ trình chính sách công.',
      originAttribution: {
        url: 'https://canonical.example/budget',
        publishedAt: hoursAgo(2),
        discoveredAt: NOW.toISOString(),
      },
    });

    const quotedSeen = createService().select([quoted], new Set(['https://origin.example/fisheries']));
    expect(quotedSeen.skippedSeenCount).toBe(1);
    expect(quotedSeen.selected).toHaveLength(1);
    expect(quotedSeen.selected.some(intAnchor)).toBe(true);
    expect(quotedSeen.eligibleCount).toBe(0);

    const attributedSeen = createService().select(
      [attributed],
      new Set(['https://canonical.example/budget?fbclid=1']),
    );
    expect(attributedSeen.skippedSeenCount).toBe(1);
    expect(attributedSeen.selected).toHaveLength(1);
    expect(attributedSeen.selected.some(vnAnchor)).toBe(true);
    expect(attributedSeen.eligibleCount).toBe(0);
  });

  it('increments skippedSeenCount once per fingerprint and ignores out-of-scope items', () => {
    const gossip = item({
      url: 'https://people.com/gossip',
      title: 'Taylor Swift dating rumor with Hollywood actor',
      summary: 'Celebrity gossip about a singer.',
    });
    const result = createService().select([vnControversy(), gossip], new Set(['https://vnexpress.net/pm-bribe']));
    expect(result.skippedSeenCount).toBe(1);
    expect(result.eligibleCount).toBe(0);
    expect(result.selected).toHaveLength(1);
    expect(result.selected.some(vnAnchor)).toBe(true);
  });

  it('assesses verification before scoring and emits one stable nonzero reason per score row', () => {
    const reported = createService().select([vnControversy()], new Set()).selected[0]!;
    const confirmed = createService().select(
      [
        item({
          url: 'https://court.example/judgment',
          sourceQuotaKey: 'court.example',
          evidenceOriginKey: 'court.example',
          evidenceKind: 'official-final',
          evidentiaryEffect: 'establishes',
          title: 'Official record established Pham Minh Chinh accepted bribes',
          summary: 'Confirmed corruption finding in Hanoi.',
        }),
      ],
      new Set(),
    ).selected[0]!;
    const unverified = createService().select(
      [
        item({
          url: 'https://x.com/anon/status/1',
          sourceQuotaKey: 'x.com',
          evidenceOriginKey: 'x.com',
          discoveryChannel: 'x',
          evidenceKind: 'anonymous-rumor',
          sourceTextStatus: 'incomplete',
          author: undefined,
          originalAuthor: undefined,
          originalAccount: undefined,
          sourceName: '',
          title: 'Prime Minister Pham Minh Chinh allegedly accepted bribes',
          summary: 'Corruption scandal in Hanoi.',
        }),
      ],
      new Set(),
    ).selected[0]!;

    expect(reported.verificationState).toBe('reported');
    expect(confirmed.verificationState).toBe('confirmed');
    expect(unverified.verificationState).toBe('unverified');
    expect(parseReasons(reported.scoringReasons).get('verification')).toBe(3);
    expect(parseReasons(confirmed.scoringReasons).get('verification')).toBe(6);
    expect(parseReasons(unverified.scoringReasons).get('verification')).toBe(-6);
    expect(parseReasons(unverified.scoringReasons).has('source-text')).toBe(false);

    for (const candidate of [reported, confirmed, unverified]) {
      expect(reasonSum(candidate)).toBe(candidate.score);
      expect(candidate.scoringReasons).toEqual([...candidate.scoringReasons].sort((left, right) => {
        const leftKey = left.slice(0, left.lastIndexOf(':'));
        const rightKey = right.slice(0, right.lastIndexOf(':'));
        return REASON_KEYS.indexOf(leftKey as (typeof REASON_KEYS)[number]) -
          REASON_KEYS.indexOf(rightKey as (typeof REASON_KEYS)[number]);
      }));
      for (const reason of candidate.scoringReasons) {
        const key = reason.slice(0, reason.lastIndexOf(':'));
        const points = parseReasons([reason]).get(key);
        expect(REASON_KEYS).toContain(key);
        expect(points).not.toBe(0);
      }
    }
  });

  it('awards only the primary-category row so category points do not stack', () => {
    const controversy = createService().select([vnControversy()], new Set()).selected[0]!;
    const highImpact = createService().select([intHighImpact()], new Set()).selected[0]!;
    const other = createService().select([vnOther()], new Set()).selected[0]!;
    const gold = createService().select([goldVietnam()], new Set()).selected[0]!;

    expect(controversy.primaryCategory).toBe('leader-controversy');
    expect(controversy.priorityTier).toBe(3);
    expect(categoryReason(controversy)).toBe('leader-controversy:+30');
    expect(controversy.scoringReasons.some((reason) => reason.startsWith('high-impact-politics:'))).toBe(false);

    expect(highImpact.primaryCategory).toBe('international-politics');
    expect(highImpact.priorityTier).toBe(2);
    expect(categoryReason(highImpact)).toBe('high-impact-politics:+24');
    expect(highImpact.scoringReasons.some((reason) => reason.startsWith('other-politics:'))).toBe(false);

    expect(other.primaryCategory).toBe('vietnam-politics');
    expect(other.priorityTier).toBe(1);
    expect(categoryReason(other)).toBe('other-politics:+15');

    expect(gold.primaryCategory).toBe('gold-market');
    expect(gold.priorityTier).toBe(0);
    expect(categoryReason(gold)).toBe('gold-market:+8');
    expect(parseReasons(gold.scoringReasons).has('named-leader')).toBe(false);
  });

  it('awards named in-scope leader points only when a named leader or institution matches', () => {
    const named = createService().select([vnControversy()], new Set()).selected[0]!;
    const gold = createService().select([goldVietnam()], new Set()).selected[0]!;
    expect(parseReasons(named.scoringReasons).get('named-leader')).toBe(12);
    expect(named.claimEntities.length).toBeGreaterThan(0);
    expect(parseReasons(gold.scoringReasons).has('named-leader')).toBe(false);
  });

  it('caps relevance at ten distinct classifier terms and omits a zero relevance row', () => {
    const stuffed = createService().select(
      [
        item({
          url: 'https://news.example/stuffed',
          title:
            'Prime Minister Pham Minh Chinh allegedly accepted bribes after corruption indictment arrest impeachment resignation',
          summary:
            'Court election war ceasefire sanctions NATO United Nations IMF World Bank European Union Tesla CEO Elon Musk Trump government parliament policy diplomacy defense investigation in Hanoi and the United States.',
        }),
      ],
      new Set(),
    ).selected[0]!;
    const relevance = parseReasons(stuffed.scoringReasons).get('relevance');
    expect(relevance).toBe(10);
  });

  it('uses the captured run clock for inclusive age buckets', () => {
    let nowCalls = 0;
    const service = createService({ maxArticles: 15, maxGoldNews: 3, maxPerSource: 3 }, () => {
      nowCalls += 1;
      return NOW;
    });
    const ages = [
      { hours: 6, extraMs: 0, points: 12 },
      { hours: 6, extraMs: 1, points: 8 },
      { hours: 24, extraMs: 0, points: 8 },
      { hours: 24, extraMs: 1, points: 4 },
      { hours: 48, extraMs: 0, points: 4 },
      { hours: 48, extraMs: 1, points: 0 },
    ];
    for (const [index, sample] of ages.entries()) {
      const candidate = service.select(
        [
          item({
            ...vnOther(),
            url: `https://chinhphu.vn/budget-${index}`,
            publishedAt: hoursAgo(sample.hours, sample.extraMs),
          }),
        ],
        new Set(),
      ).selected[0]!;
      expect(parseReasons(candidate.scoringReasons).get('age') ?? 0).toBe(sample.points);
      if (sample.points === 0) {
        expect(candidate.scoringReasons.some((reason) => reason.startsWith('age:'))).toBe(false);
      }
    }
    expect(nowCalls).toBe(ages.length);
  });

  it('scores full, search-excerpt, and incomplete source text as +6 / +2 / +0', () => {
    const full = createService().select([vnOther()], new Set()).selected[0]!;
    const excerpt = createService().select(
      [item({ ...vnOther(), url: 'https://chinhphu.vn/excerpt', sourceTextStatus: 'search-excerpt' })],
      new Set(),
    ).selected[0]!;
    const incomplete = createService().select(
      [item({ ...vnOther(), url: 'https://chinhphu.vn/incomplete', sourceTextStatus: 'incomplete' })],
      new Set(),
    ).selected[0]!;
    expect(parseReasons(full.scoringReasons).get('source-text')).toBe(6);
    expect(parseReasons(excerpt.scoringReasons).get('source-text')).toBe(2);
    expect(parseReasons(incomplete.scoringReasons).has('source-text')).toBe(false);
    expect(full.score - excerpt.score).toBe(4);
  });

  it('scores additional independent origins at +4 each, capped at +8', () => {
    const two = createService().select(
      [
        vnControversy(),
        item({
          url: 'https://www.reuters.com/pm-bribe',
          sourceQuotaKey: 'reuters.com',
          evidenceOriginKey: 'reuters.com',
          title: 'Prime Minister Pham Minh Chinh accepted bribes',
          summary: 'Corruption scandal in Hanoi continues today.',
        }),
      ],
      new Set(),
    ).selected[0]!;
    const three = createService().select(
      [
        vnControversy(),
        item({
          url: 'https://www.reuters.com/pm-bribe',
          sourceQuotaKey: 'reuters.com',
          evidenceOriginKey: 'reuters.com',
          title: 'Prime Minister Pham Minh Chinh accepted bribes',
          summary: 'Corruption scandal in Hanoi continues today.',
        }),
        item({
          url: 'https://www.bbc.com/pm-bribe',
          sourceQuotaKey: 'bbc.co.uk',
          evidenceOriginKey: 'bbc.co.uk',
          title: 'Thủ tướng Phạm Minh Chính bị cáo buộc nhận hối lộ',
          summary: 'Bê bối tham nhũng tại Hà Nội.',
        }),
      ],
      new Set(),
    ).selected[0]!;
    expect(two.independentSourceIds).toHaveLength(2);
    expect(three.independentSourceIds).toHaveLength(3);
    expect(parseReasons(two.scoringReasons).get('independent-origins')).toBe(4);
    expect(parseReasons(three.scoringReasons).get('independent-origins')).toBe(8);
  });

  it('awards engagement by finite thresholds, caps at +3, and ignores absent or invalid metrics', () => {
    const samples: Array<{ engagement?: PoliticsSourceItem['engagement']; points: number }> = [
      { engagement: undefined, points: 0 },
      { engagement: { likes: 99, shares: 24, comments: 49 }, points: 0 },
      { engagement: { likes: 100 }, points: 1 },
      { engagement: { likes: 100, shares: 25 }, points: 2 },
      { engagement: { likes: 100, shares: 25, comments: 50 }, points: 3 },
      { engagement: { likes: 10_000, shares: 10_000, comments: 10_000 }, points: 3 },
      { engagement: { likes: Number.NaN, shares: -1, comments: Number.POSITIVE_INFINITY }, points: 0 },
    ];
    for (const [index, sample] of samples.entries()) {
      const candidate = createService().select(
        [
          item({
            ...goldVietnam(),
            url: `https://sjc.com.vn/price-${index}`,
            engagement: sample.engagement,
          }),
        ],
        new Set(),
      ).selected[0]!;
      expect(parseReasons(candidate.scoringReasons).get('engagement') ?? 0).toBe(sample.points);
    }
  });

  it('keeps engagement inside a policy tier so +3 cannot outrank a higher tier', () => {
    const result = createService().select(
      [
        item({
          ...goldVietnam(),
          publishedAt: hoursAgo(1),
          engagement: { likes: 1000, shares: 1000, comments: 1000 },
        }),
        item({
          ...vnOther(),
          publishedAt: hoursAgo(70),
          sourceTextStatus: 'incomplete',
          evidenceKind: 'anonymous-rumor',
          discoveryChannel: 'x',
          sourceName: '',
          author: undefined,
          originalAuthor: undefined,
        }),
      ],
      new Set(),
    );
    expect(result.selected[0]?.primaryCategory).toBe('vietnam-politics');
    expect(result.selected[0]?.priorityTier).toBe(1);
    expect(result.selected[1]?.primaryCategory).toBe('gold-market');
    expect(result.selected[1]?.priorityTier).toBe(0);
    expect(parseReasons(result.selected[1]!.scoringReasons).get('engagement')).toBe(3);
  });

  it('lets engagement outweigh at most three within-tier points and never uses input index as a tie-break', () => {
    const sameBucket = item({
      ...uniqueGold(1, 'alpha.example'),
      publishedAt: hoursAgo(24),
    });
    const engagedSameBucket = item({
      ...uniqueGold(2, 'beta.example'),
      publishedAt: hoursAgo(24),
      engagement: { likes: 100, shares: 25, comments: 50 },
    });
    const fresher = item({
      ...uniqueGold(3, 'gamma.example'),
      publishedAt: hoursAgo(6),
    });
    const engagedOlder = item({
      ...uniqueGold(4, 'delta.example'),
      publishedAt: hoursAgo(24),
      engagement: { likes: 100, shares: 25, comments: 50 },
    });
    const withinThree = createService().select([sameBucket, engagedSameBucket], new Set()).selected;
    expect(withinThree[0]?.sourceQuotaKey).toBe('beta.example');

    const beyondThree = createService().select([fresher, engagedOlder], new Set()).selected;
    expect(beyondThree[0]?.sourceQuotaKey).toBe('gamma.example');
    expect(parseReasons(beyondThree[1]!.scoringReasons).get('engagement')).toBe(3);
    expect((parseReasons(beyondThree[0]!.scoringReasons).get('age') ?? 0) -
      (parseReasons(beyondThree[1]!.scoringReasons).get('age') ?? 0)).toBe(4);

    const left = uniqueGold(10, 'zeta.example');
    const right = uniqueGold(11, 'alpha.example');
    const forward = createService().select([left, right], new Set()).selected;
    const reverse = createService().select([right, left], new Set()).selected;
    expect(forward.map((candidate) => candidate.claimOriginUrl)).toEqual(
      reverse.map((candidate) => candidate.claimOriginUrl),
    );
    expect(forward).toHaveLength(2);
    expect(forward[0]!.priorityTier).toBe(forward[1]!.priorityTier);
    expect(forward[0]!.score).toBe(forward[1]!.score);
    const fingerprintOrder = forward[0]!.eventFingerprint.localeCompare(forward[1]!.eventFingerprint);
    if (fingerprintOrder === 0) {
      expect(forward[0]!.claimOriginUrl.localeCompare(forward[1]!.claimOriginUrl)).toBeLessThan(0);
    } else {
      expect(fingerprintOrder).toBeLessThan(0);
    }
  });

  it('materializes event claim origin fields instead of recomputing them from the representative', () => {
    const original = vnControversy();
    const repost = item({
      url: 'https://x.com/later/status/1',
      sourceQuotaKey: 'x:later',
      evidenceOriginKey: 'x:later',
      discoveryChannel: 'x',
      evidenceKind: 'social-claim',
      quotedOriginUrl: original.url,
      title: original.title,
      summary: original.summary,
      originAttribution: {
        url: 'https://x.com/later/status/1',
        publishedAt: hoursAgo(1),
        discoveredAt: NOW.toISOString(),
      },
    });
    const selected = createService().select([repost, original], new Set()).selected[0]!;
    expect(selected.claimOriginUrl).toBe('https://vnexpress.net/pm-bribe');
    expect(selected.claimOriginResolution).toBe('collected-original');
    expect(selected.priorityTier).toBe(3);
    expect(selected.eventFingerprint.length).toBeGreaterThan(0);
  });

  it('does not mutate input objects', () => {
    const source = Object.freeze(vnControversy());
    Object.freeze(source.originAttribution);
    const snapshot = structuredClone(source);
    createService().select([source], new Set());
    expect(source).toEqual(snapshot);
  });
});

describe('PoliticsSelectionService constraint order', () => {
  it('selects a deterministic balanced set from more than 20 eligible events', () => {
    const pool = buildConstraintPool();
    const service = createService();
    const result = service.select(pool, new Set());
    expect(result.eligibleCount).toBeGreaterThan(20);
    expect(result.selected.length).toBeLessThanOrEqual(15);
    expect(result.selected.length).toBe(15);

    const selectedVn = result.selected.filter(vnAnchor);
    const selectedInt = result.selected.filter(intAnchor);
    expect(selectedVn.length).toBeGreaterThan(0);
    expect(selectedInt.length).toBeGreaterThan(0);

    const tiers = result.selected.map((candidate) => candidate.priorityTier);
    expect(tiers).toEqual([...tiers].sort((left, right) => right - left));
    expect(result.selected[0]?.priorityTier).toBe(3);
    expect(result.selected.some((candidate) => candidate.priorityTier === 0)).toBe(true);
    const firstGold = result.selected.findIndex((candidate) => candidate.priorityTier === 0);
    const lastNonGold = result.selected.findLastIndex((candidate) => candidate.priorityTier > 0);
    expect(firstGold).toBeGreaterThan(lastNonGold);

    expect(result.selected.filter((candidate) => candidate.primaryCategory === 'gold-market').length).toBeLessThanOrEqual(3);
    const bySource = new Map<string, number>();
    for (const candidate of result.selected) {
      bySource.set(candidate.sourceQuotaKey, (bySource.get(candidate.sourceQuotaKey) ?? 0) + 1);
    }
    expect(Math.max(...bySource.values())).toBeLessThanOrEqual(3);
    expect(bySource.get('vnexpress.net') ?? 0).toBeLessThanOrEqual(3);
    expect(bySource.get('bullion.example') ?? 0).toBeLessThanOrEqual(3);

    const vnControversySelected = result.selected.find(
      (candidate) => candidate.primaryCategory === 'leader-controversy' && candidate.geographicScope === 'vietnam',
    );
    expect(vnControversySelected).toBeDefined();
    expect(vnAnchor(vnControversySelected!)).toBe(true);

    const mixed = result.selected.filter((candidate) => candidate.geographicScope === 'mixed');
    if (mixed.length === 1) {
      const mixedFingerprint = mixed[0]!.eventFingerprint;
      const otherVn = selectedVn.some((candidate) => candidate.eventFingerprint !== mixedFingerprint);
      const otherInt = selectedInt.some((candidate) => candidate.eventFingerprint !== mixedFingerprint);
      expect(otherVn || otherInt).toBe(true);
    }
    expect(new Set(result.selected.map((candidate) => candidate.claimOriginUrl)).size).toBe(
      result.selected.length,
    );

    const shuffled = service.select(shuffle(pool), new Set());
    const repeated = service.select(pool, new Set());
    expect(repeated.selected.map((candidate) => candidate.claimOriginUrl)).toEqual(
      result.selected.map((candidate) => candidate.claimOriginUrl),
    );
    expect(shuffled.selected.map((candidate) => candidate.claimOriginUrl)).toEqual(
      result.selected.map((candidate) => candidate.claimOriginUrl),
    );
  });

  it('keeps a Vietnamese and an international anchor even when higher-tier same-scope items would fill the cap', () => {
    const squeezingVn = [
      vnControversy(),
      item({
        url: 'https://vnexpress.net/president-fraud',
        sourceQuotaKey: 'vnexpress.net',
        evidenceOriginKey: 'vnexpress.net',
        title: 'Vietnamese president accused of fraud in Hanoi',
        summary: 'Scandal involving the president and government palace.',
      }),
      item({
        url: 'https://thanhnien.vn/chief-justice',
        sourceQuotaKey: 'thanhnien.vn',
        evidenceOriginKey: 'thanhnien.vn',
        title: 'Vietnam Chief Justice accused of corruption in Hanoi',
        summary: 'Supreme court scandal involving the chief justice.',
      }),
    ];
    const weakInt = item({
      ...intOther(),
      publishedAt: hoursAgo(70),
      sourceTextStatus: 'incomplete',
    });
    const result = createService({ maxArticles: 2, maxGoldNews: 0, maxPerSource: 3 }).select(
      [...squeezingVn, weakInt],
      new Set(),
    );
    expect(result.selected).toHaveLength(2);
    expect(result.selected.some(vnAnchor)).toBe(true);
    expect(result.selected.some(intAnchor)).toBe(true);
    expect(result.selected.map((candidate) => candidate.eventFingerprint).every((fingerprint, index, all) => all.indexOf(fingerprint) === index)).toBe(true);
  });

  it('releases reserved anchor capacity when one scope is missing', () => {
    const result = createService({ maxArticles: 2, maxGoldNews: 0, maxPerSource: 3 }).select(
      [vnControversy(), vnOther(), vnHighImpact()],
      new Set(),
    );
    expect(result.selected).toHaveLength(2);
    expect(result.selected.every(vnAnchor)).toBe(true);
    expect(result.selected.some(intAnchor)).toBe(false);
  });

  it('does not let one mixed event satisfy both anchors by itself', () => {
    const mixed = item({
      url: 'https://www.ft.com/mixed-leader',
      sourceQuotaKey: 'ft.com',
      evidenceOriginKey: 'ft.com',
      title: 'Prime Minister Pham Minh Chinh and Donald Trump face a joint scandal',
      summary: 'Corruption controversy links Hanoi and the United States.',
    });
    const result = createService({ maxArticles: 2, maxGoldNews: 0, maxPerSource: 3 }).select(
      [mixed, vnOther(), intOther()],
      new Set(),
    );
    expect(result.selected).toHaveLength(2);
    expect(new Set(result.selected.map((candidate) => candidate.eventFingerprint)).size).toBe(2);
    expect(result.selected.some(vnAnchor)).toBe(true);
    expect(result.selected.some(intAnchor)).toBe(true);
    expect(result.selected.filter((candidate) => candidate.url === mixed.url)).toHaveLength(1);
  });

  it('counts eligible unseen events before caps and skipped fingerprints after clustering', () => {
    const pool = [...Array.from({ length: 6 }, (_, index) => uniqueGold(index + 1, 'bullion.example')), vnOther(), intOther()];
    const seen = new Set(['https://chinhphu.vn/budget']);
    const result = createService({ maxArticles: 2, maxGoldNews: 1, maxPerSource: 1 }).select(pool, seen);
    expect(result.skippedSeenCount).toBe(1);
    expect(result.eligibleCount).toBeGreaterThan(result.selected.length);
    expect(result.selected.length).toBeLessThanOrEqual(2);
    expect(result.selected.some(vnAnchor)).toBe(true);
    expect(result.selected.some(intAnchor)).toBe(true);
    expect(result.selected.filter((candidate) => candidate.primaryCategory === 'gold-market')).toHaveLength(0);
    expect(result.selected.filter((candidate) => candidate.sourceQuotaKey === 'bullion.example').length).toBeLessThanOrEqual(1);
  });
});
