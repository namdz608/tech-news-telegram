import { describe, expect, it } from 'vitest';
import { PoliticsClassificationService } from '../../src/services/politics-classification.service';
import {
  EVENT_SIMILARITY_THRESHOLD,
  PoliticsEventDedupeService,
} from '../../src/services/politics-event-dedupe.service';
import type {
  ClassifiedPoliticsItem,
  PoliticsSourceItem,
} from '../../src/types/gold-politics';

const NOW = '2026-08-20T12:00:00.000Z';
const PUBLISHED = '2026-08-19T08:00:00.000Z';
const classifier = new PoliticsClassificationService();
const deduper = new PoliticsEventDedupeService();

function source(overrides: Partial<PoliticsSourceItem> = {}): PoliticsSourceItem {
  const url = overrides.url ?? 'https://news.example/story';
  const publishedAt = Object.hasOwn(overrides, 'publishedAt') ? overrides.publishedAt! : PUBLISHED;
  const origin = overrides.originAttribution;
  return {
    id: overrides.id ?? url,
    sourceId: overrides.sourceId ?? 'rss-test',
    sourceName: overrides.sourceName ?? 'Test Source',
    title: overrides.title ?? 'Prime Minister Pham Minh Chinh allegedly accepted bribes',
    url,
    summary: overrides.summary ?? 'Corruption scandal in Hanoi.',
    author: overrides.author ?? 'Desk',
    publishedAt,
    collectedAt: overrides.collectedAt ?? NOW,
    topics: overrides.topics ?? [],
    discoveryChannel: overrides.discoveryChannel ?? 'rss',
    discoveredAt: overrides.discoveredAt ?? NOW,
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
      discoveredAt: origin?.discoveredAt ?? overrides.discoveredAt ?? NOW,
    },
    ...('engagement' in overrides ? { engagement: overrides.engagement } : {}),
  };
}

function classified(overrides: Partial<ClassifiedPoliticsItem> = {}): ClassifiedPoliticsItem {
  const base = source(overrides);
  const semanticClaimKey = overrides.semanticClaimKey ?? 'bribery|pham-minh-chinh';
  const claimEntities = overrides.claimEntities ?? ['pham-minh-chinh', 'prime-minister'];
  const claimStance = overrides.claimStance ?? 'supports';
  const claimModality = overrides.claimModality ?? 'alleged';
  return {
    ...base,
    primaryCategory: overrides.primaryCategory ?? 'leader-controversy',
    geographicScope: overrides.geographicScope ?? 'vietnam',
    semanticClaimKey,
    claimEntities,
    claimStance,
    claimModality,
    evidenceAssertions: overrides.evidenceAssertions ?? [
      {
        semanticClaimKey,
        claimText: base.title,
        stance: claimStance,
        modality: claimModality,
        effect: base.evidentiaryEffect,
        kind: base.evidenceKind,
        sourceId: base.id,
        sourceUrl: base.url,
        evidenceOriginKey: base.evidenceOriginKey,
      },
    ],
  };
}

function classifiedFrom(overrides: Partial<PoliticsSourceItem> = {}): ClassifiedPoliticsItem {
  const result = classifier.classify(source(overrides));
  if (!result) {
    throw new Error(`expected classification for ${overrides.title ?? 'item'}`);
  }
  return result;
}

function tokenTitle(shared: readonly string[], extra: readonly string[]): string {
  return [...shared, ...extra].join(' ');
}

function numberedTokens(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `claimtok${String(start + index).padStart(3, '0')}`);
}

describe('PoliticsEventDedupeService', () => {
  it('exposes EVENT_SIMILARITY_THRESHOLD of 0.72', () => {
    expect(EVENT_SIMILARITY_THRESHOLD).toBe(0.72);
  });

  it('joins the same canonical URL after stripping tracking parameters', () => {
    const a = classified({
      url: 'https://news.example/story?utm_source=x&fbclid=1',
      originAttribution: {
        url: 'https://news.example/story?utm_source=x',
        publishedAt: PUBLISHED,
        discoveredAt: NOW,
      },
    });
    const b = classified({
      id: 'https://news.example/story?gclid=abc',
      url: 'https://news.example/story?gclid=abc',
      originAttribution: {
        url: 'https://news.example/story?gclid=abc',
        publishedAt: PUBLISHED,
        discoveredAt: NOW,
      },
      evidenceOriginKey: 'other.example',
    });

    const events = deduper.cluster([b, a]);
    expect(events).toHaveLength(1);
    expect(events[0]?.members).toHaveLength(2);
  });

  it('joins syndication only after category, geography, entities, and semanticClaimKey match', () => {
    const original = classified({
      url: 'https://vnexpress.net/pm-bribe',
      syndicationKey: 'wire-pm-bribe',
      evidenceOriginKey: 'vnexpress.net',
    });
    const syndicated = classified({
      id: 'https://thanhnien.vn/pm-bribe',
      url: 'https://thanhnien.vn/pm-bribe',
      sourceId: 'rss-thanhnien',
      syndicationKey: 'wire-pm-bribe',
      evidenceOriginKey: 'thanhnien.vn',
    });
    const reusedKey = classified({
      id: 'https://gossip.example/unrelated',
      url: 'https://gossip.example/unrelated',
      title: 'Unrelated social allegation about a neighbor',
      syndicationKey: 'wire-pm-bribe',
      semanticClaimKey: 'theft|neighbor',
      claimEntities: ['neighbor'],
      primaryCategory: 'leader-controversy',
      geographicScope: 'international',
      evidenceOriginKey: 'gossip.example',
    });

    expect(deduper.cluster([syndicated, original])).toHaveLength(1);
    const poisoned = deduper.cluster([original, reusedKey]);
    expect(poisoned).toHaveLength(2);
    expect(poisoned.map((event) => event.claimOriginUrl).sort()).toEqual(
      ['https://gossip.example/unrelated', 'https://vnexpress.net/pm-bribe'].sort(),
    );
  });

  it('joins a social repost quoting a collected original and resolves collected-original', () => {
    const original = classified({
      url: 'https://vnexpress.net/pm-bribe',
      originAttribution: {
        url: 'https://vnexpress.net/pm-bribe',
        publishedAt: '2026-08-19T07:00:00.000Z',
        discoveredAt: '2026-08-19T07:05:00.000Z',
      },
      evidenceOriginKey: 'vnexpress.net',
    });
    const repost = classified({
      id: 'https://x.com/user/status/1',
      url: 'https://x.com/user/status/1',
      discoveryChannel: 'x',
      evidenceKind: 'social-claim',
      quotedOriginUrl: 'https://vnexpress.net/pm-bribe',
      originAttribution: {
        url: 'https://x.com/user/status/1',
        account: 'user',
        publishedAt: '2026-08-19T09:00:00.000Z',
        discoveredAt: '2026-08-19T09:01:00.000Z',
      },
      evidenceOriginKey: 'x:user',
      sourceTextStatus: 'full',
    });

    const [event] = deduper.cluster([repost, original]);
    expect(event?.members).toHaveLength(2);
    expect(event?.claimOriginResolution).toBe('collected-original');
    expect(event?.claimOriginUrl).toBe('https://vnexpress.net/pm-bribe');
    expect(event?.representative.url).toBe('https://vnexpress.net/pm-bribe');
    expect(event?.independentSourceIds).toEqual(['vnexpress.net']);
  });

  it('clusters bilingual titles that share named entities and claim terms', () => {
    const vi = classifiedFrom({
      url: 'https://vnexpress.net/pm-vi',
      title: 'Thủ tướng Phạm Minh Chính bị cáo buộc nhận hối lộ',
      summary: 'Bê bối tham nhũng tại Hà Nội.',
      evidenceOriginKey: 'vnexpress.net',
    });
    const en = classifiedFrom({
      url: 'https://www.bbc.com/pm-en',
      title: 'Prime Minister Pham Minh Chinh allegedly accepted bribes',
      summary: 'Corruption scandal in Hanoi.',
      evidenceOriginKey: 'bbc.com',
      sourceId: 'rss-bbc',
    });

    expect(vi.semanticClaimKey).toBe(en.semanticClaimKey);
    const events = deduper.cluster([en, vi]);
    expect(events).toHaveLength(1);
    expect(events[0]?.independentSourceIds.sort()).toEqual(['bbc.com', 'vnexpress.net']);
  });

  it('does not merge topically similar but materially different events about the same leader', () => {
    const bribe = classifiedFrom({
      url: 'https://news.example/bribe',
      title: 'Prime Minister Pham Minh Chinh allegedly accepted bribes',
      summary: 'Corruption scandal in Hanoi.',
    });
    const budget = classifiedFrom({
      url: 'https://news.example/budget',
      title: 'Prime Minister Pham Minh Chinh announces budget policy',
      summary: 'Government presents the National Assembly spending bill in Hanoi.',
    });

    expect(bribe.semanticClaimKey).not.toBe(budget.semanticClaimKey);
    expect(deduper.cluster([bribe, budget])).toHaveLength(2);
  });

  it('counts ten copied rumor posts as one independent origin', () => {
    const copies = Array.from({ length: 10 }, (_, index) =>
      classified({
        id: `https://x.com/acct${index}/status/1`,
        url: `https://x.com/acct${index}/status/1`,
        title: 'Pham Minh Chinh accepted bribes rumor copy',
        summary: 'Exact copied rumor text about the prime minister.',
        discoveryChannel: 'x',
        evidenceKind: 'social-claim',
        sourceTextStatus: 'full',
        evidenceOriginKey: `x:acct${index}`,
        originalAccount: `acct${index}`,
        originAttribution: {
          url: `https://x.com/acct${index}/status/1`,
          account: `acct${index}`,
          publishedAt: `2026-08-19T10:0${index}:00.000Z`,
          discoveredAt: `2026-08-19T10:0${index}:05.000Z`,
        },
      }),
    );

    const [event] = deduper.cluster([...copies].reverse());
    expect(event?.members).toHaveLength(10);
    expect(event?.independentSourceIds).toHaveLength(1);
  });

  it('keeps two genuinely independent reports as two independentSourceIds', () => {
    const a = classified({
      url: 'https://vnexpress.net/pm-bribe',
      title: 'Prime Minister Pham Minh Chinh allegedly accepted bribes',
      summary: 'Corruption scandal in Hanoi.',
      evidenceOriginKey: 'vnexpress.net',
    });
    const b = classified({
      id: 'https://www.reuters.com/pm-bribe',
      url: 'https://www.reuters.com/pm-bribe',
      title: 'Prime Minister Pham Minh Chinh accepted bribes',
      summary: 'Corruption scandal in Hanoi continues today.',
      evidenceOriginKey: 'reuters.com',
      sourceId: 'rss-reuters',
    });

    const [event] = deduper.cluster([b, a]);
    expect(event?.members).toHaveLength(2);
    expect(event?.independentSourceIds.sort()).toEqual(['reuters.com', 'vnexpress.net']);
  });

  it('counts two document URLs from the same publisher as one independentSourceId', () => {
    const a = classified({
      url: 'https://vnexpress.net/pm-bribe-a',
      evidenceOriginKey: 'vnexpress.net',
    });
    const b = classified({
      id: 'https://vnexpress.net/pm-bribe-b',
      url: 'https://vnexpress.net/pm-bribe-b',
      evidenceOriginKey: 'vnexpress.net',
    });

    const [event] = deduper.cluster([b, a]);
    expect(event?.members).toHaveLength(2);
    expect(event?.independentSourceIds).toEqual(['vnexpress.net']);
  });

  it('does not give corroboration from an original plus compatible reposts', () => {
    const original = classified({
      url: 'https://vnexpress.net/pm-bribe',
      evidenceOriginKey: 'vnexpress.net',
      originAttribution: {
        url: 'https://vnexpress.net/pm-bribe',
        publishedAt: '2026-08-19T07:00:00.000Z',
        discoveredAt: '2026-08-19T07:00:00.000Z',
      },
    });
    const reposts = Array.from({ length: 3 }, (_, index) =>
      classified({
        id: `https://x.com/r${index}/status/1`,
        url: `https://x.com/r${index}/status/1`,
        quotedOriginUrl: 'https://vnexpress.net/pm-bribe',
        evidenceOriginKey: `x:r${index}`,
        discoveryChannel: 'x',
        evidenceKind: 'social-claim',
      }),
    );

    const [event] = deduper.cluster([...reposts, original]);
    expect(event?.independentSourceIds).toEqual(['vnexpress.net']);
    expect(event?.claimOriginResolution).toBe('collected-original');
  });

  it('does not let a newer repost replace an earlier original attribution', () => {
    const original = classified({
      url: 'https://vnexpress.net/pm-bribe',
      title: 'Short',
      summary: 'x',
      sourceTextStatus: 'incomplete',
      originAttribution: {
        url: 'https://vnexpress.net/pm-bribe',
        publishedAt: '2026-08-19T07:00:00.000Z',
        discoveredAt: '2026-08-19T07:00:00.000Z',
      },
      evidenceOriginKey: 'vnexpress.net',
    });
    const newer = classified({
      id: 'https://x.com/later/status/1',
      url: 'https://x.com/later/status/1',
      title: 'Much fuller later repost with complete metadata and long summary text about the claim',
      summary: 'Fuller source text that would otherwise win representative selection.',
      sourceTextStatus: 'full',
      discoveryChannel: 'x',
      evidenceKind: 'social-claim',
      quotedOriginUrl: 'https://vnexpress.net/pm-bribe',
      author: 'Later',
      originalAccount: 'later',
      originAttribution: {
        url: 'https://x.com/later/status/1',
        account: 'later',
        publishedAt: '2026-08-19T11:00:00.000Z',
        discoveredAt: '2026-08-19T11:00:00.000Z',
      },
      evidenceOriginKey: 'x:later',
    });

    const [event] = deduper.cluster([newer, original]);
    expect(event?.representative.url).toBe('https://vnexpress.net/pm-bribe');
    expect(event?.claimOriginUrl).toBe('https://vnexpress.net/pm-bribe');
    expect(event?.claimOriginResolution).toBe('collected-original');
  });

  it('keeps a Reddit permalink as origin while the external link stays quotedOriginUrl', () => {
    const reddit = classified({
      id: 'https://www.reddit.com/r/worldnews/comments/abc/pm/',
      url: 'https://www.reddit.com/r/worldnews/comments/abc/pm/',
      discoveryChannel: 'reddit',
      evidenceKind: 'social-claim',
      quotedOriginUrl: 'https://vnexpress.net/pm-bribe',
      originalAccount: 'redditor',
      originAttribution: {
        url: 'https://www.reddit.com/r/worldnews/comments/abc/pm/',
        account: 'redditor',
        publishedAt: PUBLISHED,
        discoveredAt: NOW,
      },
      evidenceOriginKey: 'reddit:redditor',
    });

    const [event] = deduper.cluster([reddit]);
    expect(event?.claimOriginUrl).toBe('https://www.reddit.com/r/worldnews/comments/abc/pm');
    expect(event?.claimOriginResolution).toBe('representative-source');
    expect(event?.representative.quotedOriginUrl).toBe('https://vnexpress.net/pm-bribe');
  });

  it('keeps an X post as claim origin when the quoted URL is not a collected member', () => {
    const tweet = classified({
      id: 'https://x.com/user/status/9',
      url: 'https://x.com/user/status/9',
      discoveryChannel: 'x',
      evidenceKind: 'social-claim',
      quotedOriginUrl: 'https://vnexpress.net/pm-bribe',
      originAttribution: {
        url: 'https://x.com/user/status/9',
        account: 'user',
        publishedAt: PUBLISHED,
        discoveredAt: NOW,
      },
      evidenceOriginKey: 'x:user',
    });

    const [event] = deduper.cluster([tweet]);
    expect(event?.claimOriginUrl).toBe('https://x.com/user/status/9');
    expect(event?.claimOriginResolution).toBe('representative-source');
  });

  it('never joins a malicious allegation that only reuses a legitimate URL or syndicationKey', () => {
    const article = classifiedFrom({
      url: 'https://vnexpress.net/budget-law',
      title: 'Quốc hội thông qua luật ngân sách',
      summary: 'Chính phủ trình dự luật.',
      evidenceOriginKey: 'vnexpress.net',
    });
    const stuffed = classified({
      id: 'https://x.com/bad/status/1',
      url: 'https://x.com/bad/status/1',
      title: 'Neighbor stole money from the apartment safe',
      summary: 'Unrelated social allegation.',
      quotedOriginUrl: 'https://vnexpress.net/budget-law',
      syndicationKey: article.syndicationKey ?? 'budget-wire',
      semanticClaimKey: 'theft|neighbor',
      claimEntities: ['neighbor'],
      primaryCategory: 'leader-controversy',
      geographicScope: 'international',
      discoveryChannel: 'x',
      evidenceKind: 'social-claim',
      evidenceOriginKey: 'x:bad',
    });

    const events = deduper.cluster([stuffed, article]);
    expect(events).toHaveLength(2);
    const rumor = events.find((event) => event.representative.url === stuffed.url);
    expect(rumor?.claimOriginUrl).toBe(stuffed.url);
    expect(rumor?.claimOriginUrl).not.toBe(article.url);
  });

  it('produces stable clusters and fingerprints regardless of input order', () => {
    const a = classified({ url: 'https://vnexpress.net/a', evidenceOriginKey: 'vnexpress.net' });
    const b = classified({
      id: 'https://www.reuters.com/a',
      url: 'https://www.reuters.com/a',
      evidenceOriginKey: 'reuters.com',
    });
    const c = classifiedFrom({
      url: 'https://news.example/budget',
      title: 'National Assembly passes budget law',
      summary: 'Government presents the bill.',
      evidenceOriginKey: 'news.example',
    });

    const forward = deduper.cluster([a, b, c]);
    const reverse = deduper.cluster([c, b, a]);
    expect(forward.map((event) => event.fingerprint)).toEqual(reverse.map((event) => event.fingerprint));
    expect(forward.map((event) => event.claimOriginUrl)).toEqual(reverse.map((event) => event.claimOriginUrl));
    expect(forward.map((event) => [...event.independentSourceIds])).toEqual(
      reverse.map((event) => [...event.independentSourceIds]),
    );
  });

  it('merges at Jaccard 0.72 and refuses 0.71 when entities overlap', () => {
    const shared72 = numberedTokens(0, 18);
    const mergeA = classified({
      url: 'https://news.example/j72-a',
      title: tokenTitle(shared72, numberedTokens(18, 2)),
      summary: '',
      semanticClaimKey: 'jaccard-a',
      evidenceOriginKey: 'a.example',
    });
    const mergeB = classified({
      url: 'https://news.example/j72-b',
      title: tokenTitle(shared72, numberedTokens(20, 5)),
      summary: '',
      semanticClaimKey: 'jaccard-b',
      evidenceOriginKey: 'b.example',
    });
    expect(deduper.cluster([mergeA, mergeB])).toHaveLength(1);

    const shared71 = numberedTokens(0, 71);
    const skipA = classified({
      url: 'https://news.example/j71-a',
      title: tokenTitle(shared71, numberedTokens(71, 9)),
      summary: '',
      semanticClaimKey: 'jaccard-c',
      evidenceOriginKey: 'c.example',
    });
    const skipB = classified({
      url: 'https://news.example/j71-b',
      title: tokenTitle(shared71, numberedTokens(80, 19)),
      summary: '',
      semanticClaimKey: 'jaccard-d',
      evidenceOriginKey: 'd.example',
    });
    expect(deduper.cluster([skipA, skipB])).toHaveLength(2);
  });
});
