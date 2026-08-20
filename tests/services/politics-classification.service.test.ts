import { describe, expect, it } from 'vitest';
import { PoliticsClassificationService } from '../../src/services/politics-classification.service';
import type { PoliticsSourceItem } from '../../src/types/gold-politics';

const NOW = '2026-08-20T12:00:00.000Z';
const PUBLISHED = '2026-08-19T08:00:00.000Z';

function item(overrides: Partial<PoliticsSourceItem> = {}): PoliticsSourceItem {
  const url = overrides.url ?? 'https://news.example/story';
  const publishedAt = Object.hasOwn(overrides, 'publishedAt') ? overrides.publishedAt! : PUBLISHED;
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
    evidentiaryEffect: overrides.evidentiaryEffect ?? 'mentions',
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

const service = new PoliticsClassificationService();

describe('PoliticsClassificationService', () => {
  it.each([
    {
      name: 'SJC gold price with USD drivers',
      title: 'Giá vàng SJC tăng khi USD yếu',
      summary: 'Lãi suất và dollar drivers kéo giá vàng.',
      category: 'gold-market',
      geography: 'mixed',
    },
    {
      name: 'Fed rates and USD gold drivers',
      title: 'Gold price rises as Federal Reserve rates climb',
      summary: 'USD drivers push bullion higher.',
      category: 'gold-market',
      geography: 'international',
    },
    {
      name: 'domestic SJC gold without foreign markers',
      title: 'Giá vàng SJC tại Hà Nội tăng',
      summary: 'DOJI và PNJ niêm yết giá vàng.',
      category: 'gold-market',
      geography: 'vietnam',
    },
    {
      name: 'UK gold prices without politics',
      title: 'Gold prices in the UK rise',
      summary: 'Bullion trades higher in Britain.',
      category: 'gold-market',
      geography: 'international',
    },
    {
      name: 'China gold prices without politics',
      title: 'Gold prices in China rise',
      summary: 'Bullion trades higher in Shanghai.',
      category: 'gold-market',
      geography: 'international',
    },
  ] as const)('classifies gold-market when politics precedence does not apply: $name', ({ title, summary, category, geography }) => {
    const classified = service.classify(item({ title, summary }));
    expect(classified?.primaryCategory).toBe(category);
    expect(classified?.geographicScope).toBe(geography);
  });

  it('gives Vietnamese politics precedence over gold-market drivers', () => {
    const classified = service.classify(
      item({
        title: 'Chính phủ Việt Nam thay đổi chính sách lãi suất',
        summary: 'Giá vàng SJC tăng sau quyết định của Chính phủ.',
      }),
    );
    expect(classified?.primaryCategory).toBe('vietnam-politics');
    expect(classified?.geographicScope).toBe('vietnam');
  });

  it.each([
    {
      name: 'Quốc hội and government',
      title: 'Quốc hội thông qua luật ngân sách',
      summary: 'Chính phủ trình chính sách công.',
    },
    {
      name: 'public policy and diplomacy',
      title: 'Chính phủ Việt Nam công bố chính sách ngoại giao mới',
      summary: 'Hà Nội đàm phán hiệp định.',
    },
    {
      name: 'election and defense',
      title: 'Bầu cử Quốc hội và quốc phòng Việt Nam',
      summary: 'Bộ Quốc phòng công bố kế hoạch.',
    },
    {
      name: 'investigation of a named public official',
      title: 'Điều tra Bộ trưởng Tài chính Việt Nam',
      summary: 'Cơ quan công quyền mở cuộc điều tra chính sách.',
    },
  ])('classifies Vietnamese politics with vietnam geography: $name', ({ title, summary }) => {
    const classified = service.classify(item({ title, summary }));
    expect(classified?.primaryCategory).toBe('vietnam-politics');
    expect(classified?.geographicScope).toBe('vietnam');
  });

  it.each([
    {
      name: 'foreign election',
      title: 'UK election results reshape parliament',
      summary: 'British government coalition talks begin.',
    },
    {
      name: 'diplomacy and war',
      title: 'NATO and the United Nations discuss the Ukraine war',
      summary: 'Ceasefire diplomacy continues as the conflict spreads.',
    },
    {
      name: 'international organization',
      title: 'IMF and World Bank meet on sanctions policy',
      summary: 'European Union diplomats join the talks.',
    },
  ])('classifies international politics with international geography: $name', ({ title, summary }) => {
    const classified = service.classify(item({ title, summary }));
    expect(classified?.primaryCategory).toBe('international-politics');
    expect(classified?.geographicScope).toBe('international');
  });

  it('does not treat a foreign parliament mentioned in Vietnamese as Vietnam politics', () => {
    const classified = service.classify(
      item({
        title: 'Ukraine có tân Bộ trưởng Quốc phòng',
        summary:
          'Quốc hội Ukraine phê chuẩn ông Yevhen Khmara làm Bộ trưởng Quốc phòng, giữa lúc Tổng thống Zelensky đối mặt sóng gió chính trị.',
      }),
    );

    expect(classified?.primaryCategory).toBe('international-politics');
    expect(classified?.geographicScope).toBe('international');
    expect(classified?.claimEntities).toContain('parliament');
    expect(classified?.claimEntities).not.toContain('vietnam-parliament');
  });

  it.each([
    {
      name: 'Vietnamese prime minister controversy',
      title: 'Thủ tướng Phạm Minh Chính bị cáo buộc tham nhũng',
      summary: 'Bê bối hối lộ gây tranh cãi.',
      geography: 'vietnam',
    },
    {
      name: 'English prime minister controversy',
      title: 'Prime Minister Pham Minh Chinh accused of bribery',
      summary: 'Corruption scandal investigation opened.',
      geography: 'vietnam',
    },
    {
      name: 'senior public official',
      title: 'Chánh án Tối cao đối mặt cáo buộc lạm quyền',
      summary: 'Điều tra bê bối tại tòa án.',
      geography: 'vietnam',
    },
    {
      name: 'major-company executive',
      title: 'Tesla CEO Elon Musk investigated for fraud',
      summary: 'Executive scandal and allegations of abuse of power.',
      geography: 'international',
    },
    {
      name: 'international-organization leader',
      title: 'UN Secretary-General accused of abuse of power',
      summary: 'United Nations controversy and allegations.',
      geography: 'international',
    },
    {
      name: 'politically influential public figure',
      title: 'Dalai Lama faces political controversy over alleged influence',
      summary: 'Public figure scandal draws diplomatic protest.',
      geography: 'international',
    },
  ] as const)('classifies in-scope leader controversy first: $name', ({ title, summary, geography }) => {
    const classified = service.classify(item({ title, summary }));
    expect(classified?.primaryCategory).toBe('leader-controversy');
    expect(classified?.geographicScope).toBe(geography);
  });

  it('keeps geography independent of controversy category, including mixed scope', () => {
    const classified = service.classify(
      item({
        title: 'Thủ tướng Phạm Minh Chính gặp Tổng thống Trump amid bribery scandal',
        summary: 'Vietnamese and US officials clash over the controversy.',
      }),
    );
    expect(classified?.primaryCategory).toBe('leader-controversy');
    expect(classified?.geographicScope).toBe('mixed');
  });

  it.each([
    { name: 'celebrity gossip', title: 'Taylor Swift dating rumor with Hollywood actor', summary: 'Celebrity gossip about a singer.' },
    { name: 'product ad', title: 'iPhone 16 giảm giá khuyến mãi affiliate', summary: 'Sponsored product sale this week.' },
    { name: 'sport', title: 'Manchester United wins the championship', summary: 'Football match report and league table.' },
    { name: 'entertainment', title: 'New concert film premiere in Hollywood', summary: 'Entertainment movie and music show.' },
    { name: 'allegation without in-scope leader', title: 'Neighbor accused of theft in apartment block', summary: 'Anonymous allegation with no official named.' },
  ])('rejects out-of-scope items: $name', ({ title, summary }) => {
    expect(service.classify(item({ title, summary }))).toBeUndefined();
  });

  it('is Unicode NFKC-aware, case-insensitive, and deterministic with exactly one category', () => {
    const nfc = service.classify(
      item({ title: 'Quốc hội thông qua luật ngân sách', summary: 'Chính phủ trình chính sách.' }),
    );
    const nfd = service.classify(
      item({
        title: 'Quốc hội thông qua luật ngân sách'.normalize('NFD'),
        summary: 'Chính phủ trình chính sách.'.normalize('NFD'),
      }),
    );
    const cased = service.classify(
      item({ title: 'QUỐC HỘI THÔNG QUA LUẬT NGÂN SÁCH', summary: 'CHÍNH PHỦ TRÌNH CHÍNH SÁCH.' }),
    );
    const fullwidth = service.classify(
      item({
        title: 'Ｑｕốc hội thông qua luật ngân sách',
        summary: 'Chính phủ trình chính sách.',
      }),
    );

    expect(nfc?.primaryCategory).toBe('vietnam-politics');
    expect(nfd).toEqual(nfc);
    expect(cased?.primaryCategory).toBe(nfc?.primaryCategory);
    expect(cased?.semanticClaimKey).toBe(nfc?.semanticClaimKey);
    expect(fullwidth?.semanticClaimKey).toBe(nfc?.semanticClaimKey);
    expect(service.classify(item({ title: nfc!.title, summary: nfc!.summary }))).toEqual(nfc);
    expect(nfc?.primaryCategory).toBeDefined();
    expect(['gold-market', 'vietnam-politics', 'international-politics', 'leader-controversy']).toContain(
      nfc?.primaryCategory,
    );
  });

  it('builds a bilingual semanticClaimKey that excludes polarity and modality', () => {
    const vietnamese = service.classify(
      item({
        title: 'Thủ tướng Phạm Minh Chính bị cáo buộc nhận hối lộ',
        summary: 'Bê bối tham nhũng tại Hà Nội.',
      }),
    );
    const english = service.classify(
      item({
        title: 'Prime Minister Pham Minh Chinh allegedly accepted bribes',
        summary: 'Corruption scandal in Hanoi.',
      }),
    );
    const denied = service.classify(
      item({
        title: 'Prime Minister Pham Minh Chinh denies accepting bribes',
        summary: 'He did not accept bribes in Hanoi.',
      }),
    );
    const established = service.classify(
      item({
        title: 'Official record established Pham Minh Chinh accepted bribes',
        summary: 'Confirmed corruption finding in Hanoi.',
        evidenceKind: 'official-final',
        evidentiaryEffect: 'establishes',
      }),
    );
    const possible = service.classify(
      item({
        title: 'Pham Minh Chinh possibly accepted bribes',
        summary: 'Prime Minister may have taken bribes in Hanoi.',
      }),
    );

    expect(vietnamese?.semanticClaimKey).toBe(english?.semanticClaimKey);
    expect(denied?.semanticClaimKey).toBe(english?.semanticClaimKey);
    expect(established?.semanticClaimKey).toBe(english?.semanticClaimKey);
    expect(possible?.semanticClaimKey).toBe(english?.semanticClaimKey);
    expect(english?.claimStance).toBe('neutral');
    expect(denied?.claimStance).toBe('denies');
    expect(vietnamese?.claimStance).toBe('neutral');
    expect(established?.claimStance).toBe('supports');
    expect(english?.claimModality).toBe('alleged');
    expect(possible?.claimModality).toBe('possible');
    expect(established?.claimModality).toBe('established');
    expect(vietnamese?.claimEntities).toEqual(expect.arrayContaining(['pham-minh-chinh']));
    expect(english?.claimEntities).toEqual(vietnamese?.claimEntities);
  });

  it('emits one source-linked EvidenceAssertion and ignores secondary unrelated claims', () => {
    const source = item({
      id: 'https://news.example/pm-bribe',
      url: 'https://news.example/pm-bribe',
      sourceId: 'rss-vnexpress',
      evidenceKind: 'identified-report',
      evidentiaryEffect: 'records-claim',
      evidenceOriginKey: 'vnexpress.net',
      title: 'Thủ tướng Phạm Minh Chính bị cáo buộc nhận hối lộ',
      summary:
        'Unrelated: Taylor Swift announced a new album. Gold prices also rose in London after the Fed meeting.',
    });
    const goldOnly = service.classify(
      item({
        title: 'Gold prices rose in London after the Fed meeting',
        summary: 'USD drivers and rates lifted bullion.',
      }),
    );
    const classified = service.classify(source);

    expect(classified?.evidenceAssertions).toHaveLength(1);
    const assertion = classified!.evidenceAssertions[0]!;
    expect(assertion.semanticClaimKey).toBe(classified!.semanticClaimKey);
    expect(assertion.kind).toBe(source.evidenceKind);
    expect(assertion.effect).toBe(source.evidentiaryEffect);
    expect(assertion.evidenceOriginKey).toBe(source.evidenceOriginKey);
    expect(assertion.sourceUrl).toBe(source.url);
    expect(assertion.sourceId).toBe(source.id);
    expect(assertion.stance).toBe(classified!.claimStance);
    expect(assertion.modality).toBe(classified!.claimModality);
    expect(assertion.claimText.length).toBeGreaterThan(0);
    expect(classified!.semanticClaimKey).not.toBe(goldOnly?.semanticClaimKey);
    expect(classified!.claimEntities.join(' ')).not.toMatch(/swift|taylor/i);
    expect(classified!.primaryCategory).toBe('leader-controversy');
  });

  it('maps a bilingual National Assembly budget claim onto the same key', () => {
    const vi = service.classify(
      item({ title: 'Quốc hội thông qua luật ngân sách', summary: 'Chính phủ trình dự luật.' }),
    );
    const en = service.classify(
      item({ title: 'National Assembly passes budget law', summary: 'Government presents the bill.' }),
    );
    expect(vi?.primaryCategory).toBe('vietnam-politics');
    expect(en?.primaryCategory).toBe('vietnam-politics');
    expect(vi?.semanticClaimKey).toBe(en?.semanticClaimKey);
    expect(vi?.claimStance).toBe('neutral');
    expect(en?.claimStance).toBe('neutral');
  });

  it('does not treat official silence as a denial of the claim', () => {
    const classified = service.classify(
      item({
        title: 'Prime Minister Pham Minh Chinh allegedly accepted bribes with no official comment',
        summary: 'Officials have not denied the allegation.',
      }),
    );
    expect(classified?.claimStance).not.toBe('denies');
    expect(classified?.claimStance).toBe('neutral');
    expect(classified?.evidenceAssertions[0]?.stance).toBe('neutral');
  });

  it('does not treat ordinary Vietnamese khong as a claim denial', () => {
    const atmosphere = service.classify(
      item({
        title: 'Quốc hội thông qua luật ngân sách',
        summary: 'Không khí tại hội trường căng thẳng khi Chính phủ trình dự luật.',
      }),
    );
    const reporting = service.classify(
      item({
        title: 'Chính phủ Việt Nam công bố chính sách ngoại giao mới',
        summary: 'Hà Nội cho biết không khí đàm phán vẫn ổn định.',
      }),
    );
    expect(atmosphere?.primaryCategory).toBe('vietnam-politics');
    expect(atmosphere?.claimStance).not.toBe('denies');
    expect(atmosphere?.claimStance).toBe('neutral');
    expect(reporting?.claimStance).not.toBe('denies');
    expect(reporting?.claimStance).toBe('neutral');
  });

  it('classifies reporting news without explicit support or denial as neutral', () => {
    const report = service.classify(
      item({
        title: 'Quốc hội thông qua luật ngân sách',
        summary: 'Chính phủ trình dự luật.',
      }),
    );
    const alleged = service.classify(
      item({
        title: 'Prime Minister Pham Minh Chinh allegedly accepted bribes',
        summary: 'Corruption scandal in Hanoi.',
      }),
    );
    expect(report?.claimStance).toBe('neutral');
    expect(alleged?.claimStance).toBe('neutral');
  });

  it('still classifies an explicit denial of the claim as denies', () => {
    const english = service.classify(
      item({
        title: 'Prime Minister Pham Minh Chinh denied the allegation',
        summary: 'The prime minister denied accepting bribes in Hanoi.',
      }),
    );
    const vietnamese = service.classify(
      item({
        title: 'Thủ tướng Phạm Minh Chính phủ nhận cáo buộc nhận hối lộ',
        summary: 'Ông bác bỏ bê bối tham nhũng tại Hà Nội.',
      }),
    );
    expect(english?.claimStance).toBe('denies');
    expect(vietnamese?.claimStance).toBe('denies');
    expect(english?.semanticClaimKey).toBe(vietnamese?.semanticClaimKey);
  });
});
