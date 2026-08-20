import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PoliticsClassificationService } from '../../src/services/politics-classification.service';
import { PoliticsEventDedupeService } from '../../src/services/politics-event-dedupe.service';
import { PoliticsVerificationService } from '../../src/services/politics-verification.service';
import type {
  ClassifiedPoliticsItem,
  EvidenceAssertion,
  PoliticsEvent,
  PoliticsSourceItem,
} from '../../src/types/gold-politics';

const NOW = '2026-08-20T12:00:00.000Z';
const PUBLISHED = '2026-08-19T08:00:00.000Z';
const CLAIM = 'bribery|pham-minh-chinh';
const classifier = new PoliticsClassificationService();
const deduper = new PoliticsEventDedupeService();
const verifier = new PoliticsVerificationService();

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

function assertion(overrides: Partial<EvidenceAssertion> = {}): EvidenceAssertion {
  return {
    semanticClaimKey: overrides.semanticClaimKey ?? CLAIM,
    claimText: overrides.claimText ?? 'Pham Minh Chinh accepted bribes',
    stance: overrides.stance ?? 'supports',
    modality: overrides.modality ?? 'alleged',
    effect: overrides.effect ?? 'records-claim',
    kind: overrides.kind ?? 'identified-report',
    sourceId: overrides.sourceId ?? 'https://news.example/story',
    sourceUrl: overrides.sourceUrl ?? 'https://news.example/story',
    evidenceOriginKey: overrides.evidenceOriginKey ?? 'news.example',
  };
}

function classified(overrides: Partial<ClassifiedPoliticsItem> = {}): ClassifiedPoliticsItem {
  const base = source(overrides);
  const semanticClaimKey = overrides.semanticClaimKey ?? CLAIM;
  const claimStance = overrides.claimStance ?? 'supports';
  const claimModality = overrides.claimModality ?? 'alleged';
  const evidenceAssertions = overrides.evidenceAssertions ?? [
    assertion({
      semanticClaimKey,
      claimText: base.title,
      stance: claimStance,
      modality: claimModality,
      effect: base.evidentiaryEffect,
      kind: base.evidenceKind,
      sourceId: base.id,
      sourceUrl: base.url,
      evidenceOriginKey: base.evidenceOriginKey,
    }),
  ];
  return {
    ...base,
    primaryCategory: overrides.primaryCategory ?? 'leader-controversy',
    geographicScope: overrides.geographicScope ?? 'vietnam',
    semanticClaimKey,
    claimEntities: overrides.claimEntities ?? ['pham-minh-chinh', 'prime-minister'],
    claimStance,
    claimModality,
    evidenceAssertions,
  };
}

function eventFrom(members: ClassifiedPoliticsItem[], independentSourceIds?: string[]): PoliticsEvent {
  const clustered = deduper.cluster(members);
  if (clustered.length !== 1) {
    throw new Error(`expected a single event, got ${clustered.length}`);
  }
  const [event] = clustered;
  if (independentSourceIds) {
    return { ...event!, independentSourceIds };
  }
  return event!;
}

function eventOf(
  representative: ClassifiedPoliticsItem,
  members: ClassifiedPoliticsItem[] = [representative],
  independentSourceIds = [...new Set(members.map((member) => member.evidenceOriginKey))].sort(),
): PoliticsEvent {
  return {
    fingerprint: representative.semanticClaimKey,
    representative,
    members,
    claimOriginUrl: representative.originAttribution.url,
    claimOriginResolution: 'representative-source',
    independentSourceIds,
  };
}

describe('PoliticsVerificationService', () => {
  it('confirms official-final or primary-document only when it establishes the matching claim', () => {
    const court = classified({
      url: 'https://court.example/judgment',
      evidenceKind: 'official-final',
      evidentiaryEffect: 'establishes',
      claimModality: 'established',
      claimStance: 'supports',
      evidenceAssertions: [
        assertion({
          kind: 'official-final',
          effect: 'establishes',
          stance: 'supports',
          modality: 'established',
          evidenceOriginKey: 'court.example',
          sourceUrl: 'https://court.example/judgment',
        }),
      ],
      evidenceOriginKey: 'court.example',
    });
    const primary = classified({
      url: 'https://gazette.example/record',
      evidenceKind: 'primary-document',
      evidentiaryEffect: 'establishes',
      claimModality: 'established',
      claimStance: 'supports',
      evidenceOriginKey: 'gazette.example',
      evidenceAssertions: [
        assertion({
          kind: 'primary-document',
          effect: 'establishes',
          stance: 'supports',
          modality: 'established',
          evidenceOriginKey: 'gazette.example',
          sourceUrl: 'https://gazette.example/record',
          sourceId: 'https://gazette.example/record',
        }),
      ],
    });

    expect(verifier.assess(eventOf(court)).state).toBe('confirmed');
    expect(verifier.assess(eventOf(primary)).state).toBe('confirmed');
  });

  it('treats an identifiable outlet report without final adjudication as reported', () => {
    const report = classified({
      author: 'Lan Anh',
      sourceName: 'VnExpress',
      evidenceKind: 'identified-report',
      evidentiaryEffect: 'records-claim',
      sourceTextStatus: 'full',
    });
    const excerpt = classified({
      url: 'https://news.example/excerpt',
      sourceTextStatus: 'search-excerpt',
      evidenceKind: 'identified-report',
      evidentiaryEffect: 'mentions',
    });
    expect(verifier.assess(eventOf(report)).state).toBe('reported');
    expect(verifier.assess(eventOf(excerpt)).state).toBe('reported');
  });

  it('keeps anonymous rumor, unsupported social claims, incomplete social text, and missing origin unverified', () => {
    const rumor = classified({
      url: 'https://x.com/anon/status/1',
      evidenceKind: 'anonymous-rumor',
      evidentiaryEffect: 'records-claim',
      originalAccount: undefined,
      author: undefined,
      discoveryChannel: 'x',
      evidenceOriginKey: 'x:anon',
    });
    const social = classified({
      url: 'https://x.com/user/status/1',
      evidenceKind: 'social-claim',
      evidentiaryEffect: 'records-claim',
      originalAccount: 'user',
      discoveryChannel: 'x',
      sourceTextStatus: 'full',
      evidenceOriginKey: 'x:user',
    });
    const incomplete = classified({
      url: 'https://x.com/user/status/2',
      evidenceKind: 'social-claim',
      originalAccount: 'user',
      discoveryChannel: 'x',
      sourceTextStatus: 'incomplete',
      evidenceOriginKey: 'x:user',
    });
    const missingOrigin = classified({
      url: 'https://x.com/user/status/3',
      evidenceKind: 'social-claim',
      originalAccount: 'user',
      originAttribution: {
        url: '',
        account: 'user',
        publishedAt: PUBLISHED,
        discoveredAt: NOW,
      },
      evidenceOriginKey: 'x:user',
    });

    expect(verifier.assess(eventOf(rumor)).state).toBe('unverified');
    expect(verifier.assess(eventOf(social)).state).toBe('unverified');
    expect(verifier.assess(eventOf(incomplete)).state).toBe('unverified');
    expect(verifier.assess(eventOf(missingOrigin)).state).toBe('unverified');
  });

  it('does not upgrade copied posts or high engagement', () => {
    const copies = Array.from({ length: 10 }, (_, index) =>
      classified({
        id: `https://x.com/acct${index}/status/1`,
        url: `https://x.com/acct${index}/status/1`,
        discoveryChannel: 'x',
        evidenceKind: 'social-claim',
        originalAccount: `acct${index}`,
        engagement: { likes: 50_000, shares: 8_000, comments: 3_000 },
        evidenceOriginKey: `x:acct${index}`,
      }),
    );
    const clustered = eventFrom(copies);
    const assessment = verifier.assess(clustered);
    expect(clustered.independentSourceIds).toHaveLength(1);
    expect(assessment.state).toBe('unverified');
    expect(assessment.corroborationNote).toBe('');
  });

  it('adds a corroboration note for a second independent outlet without confirming the allegation', () => {
    const first = classified({
      url: 'https://vnexpress.net/pm-bribe',
      evidenceOriginKey: 'vnexpress.net',
    });
    const second = classified({
      url: 'https://www.reuters.com/pm-bribe',
      title: 'Prime Minister Pham Minh Chinh accepted bribes',
      summary: 'Corruption scandal in Hanoi continues today.',
      evidenceOriginKey: 'reuters.com',
    });
    const assessment = verifier.assess(eventFrom([first, second]));
    expect(assessment.state).toBe('reported');
    expect(assessment.independentSourceIds.sort()).toEqual(['reuters.com', 'vnexpress.net']);
    expect(assessment.corroborationNote.length).toBeGreaterThan(0);
    expect(assessment.state).not.toBe('confirmed');
  });

  it('does not treat official silence or lack of denial as confirmation', () => {
    const report = classified({
      title: 'Prime Minister Pham Minh Chinh allegedly accepted bribes with no official comment',
      summary: 'Officials have not denied the allegation.',
    });
    const assessment = verifier.assess(eventOf(report));
    expect(assessment.state).toBe('reported');
    expect(assessment.state).not.toBe('confirmed');
  });

  it('records a neutral conflict note and keeps the conservative state', () => {
    const support = classified({
      url: 'https://vnexpress.net/pm-bribe',
      claimStance: 'supports',
      evidenceOriginKey: 'vnexpress.net',
    });
    const denial = classified({
      url: 'https://www.reuters.com/pm-denies',
      title: 'Prime Minister Pham Minh Chinh denies accepting bribes',
      summary: 'He did not accept bribes in Hanoi.',
      claimStance: 'denies',
      evidentiaryEffect: 'denies',
      evidenceOriginKey: 'reuters.com',
      evidenceAssertions: [
        assertion({
          stance: 'denies',
          effect: 'denies',
          kind: 'identified-report',
          evidenceOriginKey: 'reuters.com',
          sourceUrl: 'https://www.reuters.com/pm-denies',
          sourceId: 'https://www.reuters.com/pm-denies',
        }),
      ],
    });
    const assessment = verifier.assess(eventOf(support, [support, denial], ['reuters.com', 'vnexpress.net']));
    expect(assessment.conflictNote).toBeDefined();
    expect(assessment.conflictNote!.length).toBeGreaterThan(0);
    expect(assessment.state).toBe('reported');
    expect(assessment.state).not.toBe('confirmed');
  });

  it('returns stable status, independent IDs, corroboration, and conflict notes', () => {
    const first = classified({ url: 'https://vnexpress.net/pm-bribe', evidenceOriginKey: 'vnexpress.net' });
    const second = classified({
      url: 'https://www.reuters.com/pm-bribe',
      title: 'Prime Minister Pham Minh Chinh accepted bribes',
      summary: 'Corruption scandal in Hanoi continues today.',
      evidenceOriginKey: 'reuters.com',
    });
    const event = eventFrom([second, first]);
    expect(verifier.assess(event)).toEqual(verifier.assess(event));
  });

  it('does not let a final record that an investigation opened confirm guilt', () => {
    const opened = assertion({
      semanticClaimKey: 'investigation|pham-minh-chinh',
      kind: 'official-final',
      effect: 'establishes',
      stance: 'supports',
      modality: 'established',
      evidenceOriginKey: 'court.example',
    });
    const accusation = classified({
      url: 'https://court.example/opened',
      evidenceKind: 'official-final',
      evidentiaryEffect: 'establishes',
      semanticClaimKey: CLAIM,
      evidenceAssertions: [opened, assertion({ kind: 'identified-report', effect: 'records-claim' })],
    });
    expect(verifier.assess(eventOf(accusation)).state).not.toBe('confirmed');
  });

  it('does not confirm an allegation that a court filing only records', () => {
    const filing = classified({
      url: 'https://court.example/filing',
      evidenceKind: 'official-final',
      evidentiaryEffect: 'records-claim',
      claimModality: 'alleged',
      evidenceAssertions: [
        assertion({
          kind: 'official-final',
          effect: 'records-claim',
          stance: 'supports',
          modality: 'alleged',
          evidenceOriginKey: 'court.example',
        }),
      ],
      evidenceOriginKey: 'court.example',
    });
    expect(verifier.assess(eventOf(filing)).state).toBe('reported');
    expect(verifier.assess(eventOf(filing)).state).not.toBe('confirmed');
  });

  it('ignores official evidence about a different semantic claim key', () => {
    const mismatch = classified({
      semanticClaimKey: CLAIM,
      evidenceKind: 'official-final',
      evidentiaryEffect: 'establishes',
      evidenceAssertions: [
        assertion({
          semanticClaimKey: 'budget|parliament',
          kind: 'official-final',
          effect: 'establishes',
          stance: 'supports',
          modality: 'established',
        }),
      ],
    });
    expect(verifier.assess(eventOf(mismatch)).state).toBe('unverified');
  });

  it('keeps a confirmed procedural fact from upgrading a separate unverified accusation', () => {
    const mixed = classified({
      semanticClaimKey: CLAIM,
      evidenceKind: 'identified-report',
      evidentiaryEffect: 'records-claim',
      evidenceAssertions: [
        assertion({
          semanticClaimKey: 'investigation|pham-minh-chinh',
          kind: 'official-final',
          effect: 'establishes',
          stance: 'supports',
          modality: 'established',
        }),
        assertion({
          semanticClaimKey: CLAIM,
          kind: 'social-claim',
          effect: 'records-claim',
          stance: 'supports',
          modality: 'alleged',
        }),
      ],
    });
    expect(verifier.assess(eventOf(mixed)).state).toBe('unverified');
  });

  it('gives a source calling itself Official no verification boost', () => {
    const branded = classified({
      sourceName: 'Official Government News',
      originalAccount: 'Official',
      evidenceKind: 'identified-report',
      evidentiaryEffect: 'mentions',
    });
    const socialOfficial = classified({
      url: 'https://x.com/Official/status/1',
      sourceName: 'Official',
      originalAccount: 'Official',
      discoveryChannel: 'x',
      evidenceKind: 'social-claim',
      evidentiaryEffect: 'records-claim',
      evidenceOriginKey: 'x:Official',
    });
    expect(verifier.assess(eventOf(branded)).state).toBe('reported');
    expect(verifier.assess(eventOf(socialOfficial)).state).toBe('unverified');
  });

  it('forms an explicit conflict from bilingual support and denial of the same claim', () => {
    const vi = classifier.classify(
      source({
        url: 'https://vnexpress.net/pm-vi',
        title: 'Thủ tướng Phạm Minh Chính bị cáo buộc nhận hối lộ',
        summary: 'Bê bối tham nhũng tại Hà Nội.',
        evidenceOriginKey: 'vnexpress.net',
      }),
    )!;
    const enDeny = classifier.classify(
      source({
        url: 'https://www.bbc.com/pm-denies',
        title: 'Prime Minister Pham Minh Chinh denies accepting bribes',
        summary: 'He did not accept bribes in Hanoi.',
        evidenceOriginKey: 'bbc.com',
        evidentiaryEffect: 'denies',
      }),
    )!;
    expect(vi.semanticClaimKey).toBe(enDeny.semanticClaimKey);
    const assessment = verifier.assess(eventFrom([vi, enDeny]));
    expect(assessment.conflictNote).toBeDefined();
    expect(assessment.state).not.toBe('confirmed');
  });

  it('treats records-claim as proving a filing exists while only establishes can confirm', () => {
    const records = classified({
      evidenceKind: 'primary-document',
      evidentiaryEffect: 'records-claim',
      claimModality: 'alleged',
      evidenceAssertions: [
        assertion({ kind: 'primary-document', effect: 'records-claim', modality: 'alleged' }),
      ],
    });
    const establishes = classified({
      url: 'https://court.example/established',
      evidenceKind: 'primary-document',
      evidentiaryEffect: 'establishes',
      claimModality: 'established',
      claimStance: 'supports',
      evidenceAssertions: [
        assertion({
          kind: 'primary-document',
          effect: 'establishes',
          stance: 'supports',
          modality: 'established',
          sourceUrl: 'https://court.example/established',
          sourceId: 'https://court.example/established',
          evidenceOriginKey: 'court.example',
        }),
      ],
      evidenceOriginKey: 'court.example',
    });
    expect(verifier.assess(eventOf(records)).state).toBe('reported');
    expect(verifier.assess(eventOf(establishes)).state).toBe('confirmed');
  });

  it('never confirms a fixture composed only from V1 live adapter evidence contracts', () => {
    const v1Items = [
      source({
        discoveryChannel: 'rss',
        evidenceKind: 'identified-report',
        evidentiaryEffect: 'mentions',
        evidenceOriginKey: 'vnexpress.net',
      }),
      source({
        url: 'https://www.bbc.com/world/pm',
        discoveryChannel: 'rss',
        evidenceKind: 'identified-report',
        evidentiaryEffect: 'records-claim',
        evidenceOriginKey: 'bbc.com',
        title: 'Prime Minister Pham Minh Chinh accepted bribes',
        summary: 'Corruption scandal in Hanoi continues today.',
      }),
      source({
        url: 'https://x.com/user/status/1',
        discoveryChannel: 'x',
        evidenceKind: 'social-claim',
        evidentiaryEffect: 'records-claim',
        originalAccount: 'user',
        evidenceOriginKey: 'x:user',
      }),
      source({
        url: 'https://x.com/anon/status/2',
        discoveryChannel: 'x',
        evidenceKind: 'anonymous-rumor',
        evidentiaryEffect: 'records-claim',
        evidenceOriginKey: 'x:anon',
      }),
      source({
        url: 'https://www.reddit.com/r/worldnews/comments/abc/pm',
        discoveryChannel: 'reddit',
        evidenceKind: 'social-claim',
        evidentiaryEffect: 'records-claim',
        originalAccount: 'redditor',
        evidenceOriginKey: 'reddit:redditor',
      }),
      source({
        url: 'https://search.brave.example/pm',
        discoveryChannel: 'web',
        evidenceKind: 'identified-report',
        evidentiaryEffect: 'mentions',
        evidenceOriginKey: 'theguardian.com',
      }),
    ];

    for (const item of v1Items) {
      const classifiedItem = classifier.classify(item);
      expect(classifiedItem).toBeDefined();
      const assessment = verifier.assess(eventFrom([classifiedItem!]));
      expect(assessment.state).not.toBe('confirmed');
    }

    const adapterDir = path.join(__dirname, '../../src/services');
    for (const file of [
      'politics-rss.adapter.ts',
      'politics-x.adapter.ts',
      'reddit-search.adapter.ts',
      'politics-web-search.adapter.ts',
    ]) {
      expect(readFileSync(path.join(adapterDir, file), 'utf8')).not.toMatch(/evidentiaryEffect:\s*'establishes'/);
    }
  });
});
