import { describe, expect, it, vi } from 'vitest';
import { GoldPoliticsMessageService } from '../../src/services/gold-politics-message.service';
import type { PoliticsEditorial } from '../../src/services/politics-editorial.service';
import type {
  EvidenceAssertion,
  GoldPriceSnapshot,
  GoldPriceSource,
  GoldQuote,
  PoliticsCandidate,
} from '../../src/types/gold-politics';

const COLLECTED_AT = '2026-08-20T04:00:00.000Z';

const sjcSource: GoldPriceSource = {
  providerKey: 'sjc',
  providerName: 'SJC',
  instrumentKey: 'sjc-1l',
  instrumentName: 'SJC 1 lượng',
  sourceUrl: 'https://www.sjc.com.vn/bieu-do-gia-vang?q=1&x=2',
  displayUnit: 'million-vnd-per-tael',
};

const dojiSource: GoldPriceSource = {
  providerKey: 'doji',
  providerName: 'DOJI',
  instrumentKey: 'doji-sjc-bar',
  instrumentName: 'VÀNG MIẾNG SJC',
  sourceUrl: 'https://banggia.doji.vn/',
  displayUnit: 'million-vnd-per-tael',
};

const pnjSource: GoldPriceSource = {
  providerKey: 'pnj',
  providerName: 'PNJ',
  instrumentKey: 'pnj-sjc-999.9',
  instrumentName: 'Vàng miếng SJC 999.9',
  sourceUrl: 'https://www.pnj.com.vn/site/gia-vang',
  displayUnit: 'million-vnd-per-tael',
};

const xauSource: GoldPriceSource = {
  providerKey: 'xau-usd',
  providerName: 'Gold API',
  instrumentKey: 'xau-usd-spot',
  instrumentName: 'XAU/USD',
  sourceUrl: 'https://api.gold-api.com/price/XAU',
  displayUnit: 'usd-per-troy-ounce',
};

function assertion(overrides: Partial<EvidenceAssertion> = {}): EvidenceAssertion {
  return {
    semanticClaimKey: 'pham-minh-chinh|bribery',
    claimText: 'Pham Minh Chinh allegedly accepted bribes of 5 billion dong',
    stance: 'supports',
    modality: 'alleged',
    effect: 'records-claim',
    kind: 'identified-report',
    sourceId: 'rss-vnexpress',
    sourceUrl: 'https://vnexpress.net/pm-bribe',
    evidenceOriginKey: 'vnexpress.net',
    ...overrides,
  };
}

function candidate(overrides: Partial<PoliticsCandidate> = {}): PoliticsCandidate {
  const url = overrides.url ?? 'https://vnexpress.net/pm-bribe';
  const origin = overrides.originAttribution;
  const base: PoliticsCandidate = {
    id: url,
    sourceId: 'rss-vnexpress',
    sourceName: 'VnExpress',
    title: 'Pham Minh Chinh allegedly accepted bribes',
    url,
    summary: 'An identified outlet reported the allegation.',
    author: 'Desk',
    publishedAt: '2026-08-20T08:00:00.000Z',
    collectedAt: '2026-08-20T09:00:00.000Z',
    topics: [],
    discoveryChannel: 'rss',
    discoveredAt: '2026-08-20T09:00:00.000Z',
    originalAuthor: 'Desk',
    originalAccount: 'vnexpress',
    originalUrl: url,
    sourceQuotaKey: 'vnexpress.net',
    sourceTextStatus: 'full',
    evidenceKind: 'identified-report',
    evidentiaryEffect: 'records-claim',
    evidenceOriginKey: 'vnexpress.net',
    originAttribution: {
      url,
      account: 'vnexpress',
      publishedAt: '2026-08-20T08:00:00.000Z',
      discoveredAt: '2026-08-20T09:00:00.000Z',
    },
    primaryCategory: 'leader-controversy',
    geographicScope: 'vietnam',
    semanticClaimKey: 'pham-minh-chinh|bribery',
    claimEntities: ['pham-minh-chinh'],
    claimStance: 'supports',
    claimModality: 'alleged',
    evidenceAssertions: [assertion()],
    verificationState: 'reported',
    eventFingerprint: 'fp-pm-bribe',
    claimOriginUrl: url,
    claimOriginResolution: 'collected-original',
    priorityTier: 3,
    independentSourceIds: ['vnexpress.net'],
    score: 50,
    scoringReasons: ['leader-controversy:20'],
    corroborationNote: 'Một nguồn độc lập ghi nhận cùng cáo buộc.',
  };
  return {
    ...base,
    ...overrides,
    originAttribution: {
      ...base.originAttribution,
      ...origin,
    },
  };
}

function snapshot(quotes: GoldQuote[]): GoldPriceSnapshot {
  return {
    collectedAt: COLLECTED_AT,
    quotes,
    successfulProviderCount: quotes.filter((quote) => quote.status !== 'unavailable').length,
    failedSources: quotes.filter((quote) => quote.status === 'unavailable').map((quote) => quote.providerKey),
  };
}

function mixedQuotes(): GoldQuote[] {
  return [
    {
      ...xauSource,
      status: 'fresh',
      collectedAt: COLLECTED_AT,
      sourceUnit: 'usd-per-troy-ounce',
      sourceTimestamp: '2026-08-20T03:45:00.000Z',
      quoteKind: 'spot',
      spot: 2400,
      movement: { status: 'available', previousSourceTimestamp: '2026-08-20T03:00:00.000Z', spotDelta: 10 },
    },
    {
      ...pnjSource,
      status: 'unavailable',
      collectedAt: COLLECTED_AT,
      failureReason: 'fetch-failed',
    },
    {
      ...dojiSource,
      status: 'stale',
      collectedAt: COLLECTED_AT,
      sourceUnit: 'thousand-vnd-per-chi',
      sourceTimestamp: '2026-08-20T02:00:00.000Z',
      quoteKind: 'buy-sell',
      buy: 141,
      sell: 144,
      movement: { status: 'available', previousSourceTimestamp: '2026-08-20T01:00:00.000Z', buyDelta: 0, sellDelta: 0 },
    },
    {
      ...sjcSource,
      status: 'fresh',
      collectedAt: COLLECTED_AT,
      sourceUnit: 'thousand-vnd-per-tael',
      sourceTimestamp: '2026-08-20T03:32:28.000Z',
      quoteKind: 'buy-sell',
      buy: 143,
      sell: 146,
      movement: { status: 'available', previousSourceTimestamp: '2026-08-20T03:00:00.000Z', buyDelta: 3, sellDelta: -1 },
    },
  ];
}

function firstObservationQuotes(): GoldQuote[] {
  return [
    {
      ...sjcSource,
      status: 'fresh',
      collectedAt: COLLECTED_AT,
      sourceUnit: 'thousand-vnd-per-tael',
      sourceTimestamp: '2026-08-20T03:32:28.000Z',
      quoteKind: 'buy-sell',
      buy: 143,
      sell: 146,
      movement: { status: 'not-available', reason: 'no-previous-quote' },
    },
    {
      ...dojiSource,
      status: 'fresh',
      collectedAt: COLLECTED_AT,
      sourceUnit: 'thousand-vnd-per-chi',
      sourceTimestamp: '2026-08-20T03:30:00.000Z',
      quoteKind: 'buy-sell',
      buy: 142,
      sell: 145,
      movement: { status: 'not-available', reason: 'no-previous-quote' },
    },
    {
      ...pnjSource,
      status: 'fresh',
      collectedAt: COLLECTED_AT,
      sourceUnit: 'vnd-per-chi',
      sourceTimestamp: '2026-08-20T03:31:00.000Z',
      quoteKind: 'buy-sell',
      buy: 142.5,
      sell: 145.5,
      movement: { status: 'not-available', reason: 'no-previous-quote' },
    },
    {
      ...xauSource,
      status: 'fresh',
      collectedAt: COLLECTED_AT,
      sourceUnit: 'usd-per-troy-ounce',
      sourceTimestamp: '2026-08-20T03:45:00.000Z',
      quoteKind: 'spot',
      spot: 2400,
      movement: { status: 'not-available', reason: 'no-previous-quote' },
    },
  ];
}

function editorialOf(fields: PoliticsEditorial) {
  return { edit: vi.fn().mockResolvedValue(fields) };
}

function sectionBetween(text: string, start: string, end: string | undefined): string {
  const from = text.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  const to = end ? text.indexOf(end, from + start.length) : text.length;
  expect(to).toBeGreaterThan(from);
  return text.slice(from, to);
}

describe('GoldPoliticsMessageService.buildPriceMessage', () => {
  const service = new GoldPoliticsMessageService();

  it('puts title and collection time first, then SJC, DOJI, PNJ, XAU/USD', () => {
    const html = service.buildPriceMessage(snapshot(mixedQuotes()));
    const titleAt = html.search(/giá vàng/iu);
    const timeAt = html.indexOf('20/08/2026');
    const sjcAt = html.indexOf('SJC 1 lượng');
    const dojiAt = html.indexOf('VÀNG MIẾNG SJC');
    const pnjAt = html.indexOf('Vàng miếng SJC 999.9');
    const xauAt = html.indexOf('XAU/USD');
    expect(titleAt).toBeGreaterThanOrEqual(0);
    expect(timeAt).toBeGreaterThan(titleAt);
    expect(sjcAt).toBeGreaterThan(timeAt);
    expect(dojiAt).toBeGreaterThan(sjcAt);
    expect(pnjAt).toBeGreaterThan(dojiAt);
    expect(xauAt).toBeGreaterThan(pnjAt);
  });

  it('names instrument, display unit, and source timestamp on fresh and stale rows', () => {
    const html = service.buildPriceMessage(snapshot(mixedQuotes()));
    expect(html).toMatch(/SJC 1 lượng[\s\S]*triệu.*(?:đồng|VND).*lượng/iu);
    expect(html).toMatch(/XAU\/USD[\s\S]*USD[\s\S]*(?:troy )?ounce/iu);
    expect(html).toContain('10:32');
    expect(html).toContain('10:45');
    expect(html).toContain('09:00');
  });

  it('renders unavailable rows without buy, sell, spot, spread, or delta values', () => {
    const html = service.buildPriceMessage(snapshot(mixedQuotes()));
    const pnj = sectionBetween(html, 'Vàng miếng SJC 999.9', 'XAU/USD');
    expect(pnj).toContain('KHÔNG CÓ DỮ LIỆU');
    expect(pnj).toContain('không có thời gian nguồn');
    expect(pnj).not.toMatch(/Mua:|Bán:|Spot:|Chênh/iu);
    expect(pnj).not.toMatch(/(?:^|[^\d.])(?:141|142|143|144|145|146|2400|10)(?:[^\d.]|$)/u);
    expect(pnj).toContain('999.9');
  });

  it('displays domestic buy/sell/spread in million VND/tael and XAU spot in USD/troy ounce', () => {
    const html = service.buildPriceMessage(snapshot(mixedQuotes()));
    expect(html).toMatch(/Mua:\s*143,00/u);
    expect(html).toMatch(/Bán:\s*146,00/u);
    expect(html).toMatch(/Chênh(?: lệch)?:\s*3,00/u);
    expect(html).toMatch(/Spot:\s*2\.400,00|Spot:\s*2400,00/u);
  });

  it('renders positive, negative, unchanged deltas and first-observation text', () => {
    const html = service.buildPriceMessage(snapshot(mixedQuotes()));
    expect(html).toMatch(/\+3,00/u);
    expect(html).toMatch(/-1,00/u);
    expect(html).toMatch(/không đổi|0,00/iu);

    const first = service.buildPriceMessage(snapshot(firstObservationQuotes()));
    expect(first).toMatch(/quan sát đầu tiên|chưa có (?:mốc )?so sánh|không có dữ liệu so sánh/iu);
  });

  it('marks stale rows with DỮ LIỆU CŨ', () => {
    const html = service.buildPriceMessage(snapshot(mixedQuotes()));
    const doji = sectionBetween(html, 'VÀNG MIẾNG SJC', 'Vàng miếng SJC 999.9');
    expect(doji).toContain('DỮ LIỆU CŨ');
  });

  it('escapes provider source links and instrument text and includes an investment disclaimer', () => {
    const html = service.buildPriceMessage(snapshot([
      {
        ...sjcSource,
        providerName: 'SJC <Official>',
        instrumentName: 'SJC 1 lượng & bar',
        sourceUrl: 'https://www.sjc.com.vn/bieu-do-gia-vang?q=1&x=2',
        status: 'fresh',
        collectedAt: COLLECTED_AT,
        sourceUnit: 'thousand-vnd-per-tael',
        sourceTimestamp: '2026-08-20T03:32:28.000Z',
        quoteKind: 'buy-sell',
        buy: 143,
        sell: 146,
        movement: { status: 'not-available', reason: 'no-previous-quote' },
      },
      { ...dojiSource, status: 'unavailable', collectedAt: COLLECTED_AT, failureReason: 'fetch-failed' },
      { ...pnjSource, status: 'unavailable', collectedAt: COLLECTED_AT, failureReason: 'fetch-failed' },
      { ...xauSource, status: 'unavailable', collectedAt: COLLECTED_AT, failureReason: 'fetch-failed' },
    ]));

    expect(html).toContain('https://www.sjc.com.vn/bieu-do-gia-vang?q=1&amp;x=2');
    expect(html).toContain('SJC 1 lượng &amp; bar');
    expect(html).toContain('SJC &lt;Official&gt;');
    expect(html).toContain('không phải khuyến nghị đầu tư');
    expect(html.length).toBeLessThanOrEqual(3900);
  });
});

describe('GoldPoliticsMessageService.buildNewsMessages', () => {
  it('renders category, geography, badge before title, times, summary, why, corroboration, source, and claim origin URL', async () => {
    const editorial = editorialOf({
      title: 'Theo VnExpress, Pham Minh Chinh bị cáo buộc nhận hối lộ',
      summary: 'Nguồn cho rằng Pham Minh Chinh bị cáo buộc nhận hối lộ 5 tỷ đồng.',
      whyImportant: 'Một nguồn độc lập ghi nhận cùng cáo buộc.',
    });
    const input = candidate({
      url: 'https://repost.example/copy',
      originAttribution: {
        url: 'https://facebook.example/discovery',
        account: 'vnexpress',
        publishedAt: '2026-08-20T08:00:00.000Z',
        discoveredAt: '2026-08-20T09:00:00.000Z',
      },
      claimOriginUrl: 'https://origin.example/original',
      claimOriginResolution: 'collected-original',
      conflictNote: 'Một nguồn khác phủ nhận cáo buộc này.',
      primaryCategory: 'vietnam-politics',
      geographicScope: 'vietnam',
      verificationState: 'reported',
    });
    const [message] = await new GoldPoliticsMessageService(editorial).buildNewsMessages([input]);

    expect(message.url).toBe('https://origin.example/original');
    expect(message.imageUrl).toBe(
      'https://placehold.co/1200x630/b91c1c/ffffff.png?text=Vietnam+Politics',
    );
    expect(message.candidate).toBe(input);

    const text = message.text;
    const categoryAt = text.search(/chính trị việt nam/iu);
    const geoAt = text.search(/việt nam/iu);
    const badgeAt = text.indexOf('🟡 ĐANG ĐƯỢC ĐƯA TIN');
    const titleAt = text.indexOf('Theo VnExpress, Pham Minh Chinh bị cáo buộc nhận hối lộ');
    expect(categoryAt).toBeGreaterThanOrEqual(0);
    expect(geoAt).toBeGreaterThanOrEqual(0);
    expect(badgeAt).toBeGreaterThan(categoryAt);
    expect(titleAt).toBeGreaterThan(badgeAt);
    expect(text).toContain('15:00');
    expect(text).toContain('16:00');
    expect(text).toContain('Nguồn cho rằng Pham Minh Chinh bị cáo buộc nhận hối lộ 5 tỷ đồng.');
    expect(text).toContain('Một nguồn độc lập ghi nhận cùng cáo buộc.');
    expect(text).toContain('Một nguồn khác phủ nhận cáo buộc này.');
    expect(text).toMatch(/vnexpress/iu);
    expect(text).toMatch(/rss/iu);
    expect(text).toMatch(/thu thập|collected-original|nguồn gốc đã/iu);
  });

  it('prefers an HTTPS article image and falls back for an unsafe image URL', async () => {
    const editorial = editorialOf({
      title: 'Tiêu đề trung lập',
      summary: 'Tóm tắt có căn cứ.',
      whyImportant: 'Vì sao đáng chú ý.',
    });
    const service = new GoldPoliticsMessageService(editorial);

    const [articleImage] = await service.buildNewsMessages([
      candidate({
        imageUrl: 'https://images.example.com/article.jpg',
        primaryCategory: 'vietnam-politics',
      }),
    ]);
    const [fallbackImage] = await service.buildNewsMessages([
      candidate({
        imageUrl: 'http://unsafe.example/image.jpg',
        primaryCategory: 'international-politics',
      }),
    ]);

    expect(articleImage.imageUrl).toBe('https://images.example.com/article.jpg');
    expect(fallbackImage.imageUrl).toBe(
      'https://placehold.co/1200x630/1d4ed8/ffffff.png?text=World+Politics',
    );
  });

  it('uses representative-source claimOriginUrl even when candidate and attribution URLs differ', async () => {
    const editorial = editorialOf({
      title: 'Theo Reuters, Elon Musk bị cáo buộc lạm quyền',
      summary: 'Nguồn cho rằng Elon Musk bị cáo buộc lạm quyền.',
      whyImportant: 'Sự việc đang được đưa tin.',
    });
    const input = candidate({
      url: 'https://x.com/user/status/99',
      originAttribution: {
        url: 'https://x.com/user/status/99',
        account: 'user',
        publishedAt: '2026-08-20T08:00:00.000Z',
        discoveredAt: '2026-08-20T09:00:00.000Z',
      },
      claimOriginUrl: 'https://www.reuters.com/musk-scandal',
      claimOriginResolution: 'representative-source',
      primaryCategory: 'international-politics',
      geographicScope: 'international',
      verificationState: 'reported',
    });
    const [message] = await new GoldPoliticsMessageService(editorial).buildNewsMessages([input]);
    expect(message.url).toBe('https://www.reuters.com/musk-scandal');
    expect(message.text).toMatch(/đại diện|representative-source/iu);
    expect(message.url).not.toBe(input.url);
  });

  it('places verification badges before the title for each state', async () => {
    const editorial = editorialOf({
      title: 'Tiêu đề trung lập',
      summary: 'Tóm tắt có căn cứ.',
      whyImportant: 'Vì sao đáng chú ý.',
    });
    const service = new GoldPoliticsMessageService(editorial);
    const cases = [
      ['confirmed', '🟢 ĐÃ XÁC NHẬN'],
      ['reported', '🟡 ĐANG ĐƯỢC ĐƯA TIN'],
      ['unverified', '🔴 CHƯA KIỂM CHỨNG'],
    ] as const;

    for (const [state, badge] of cases) {
      const [message] = await service.buildNewsMessages([
        candidate({ verificationState: state, originalAccount: 'rumor_user' }),
      ]);
      const badgeAt = message.text.indexOf(badge);
      const titleAt = message.text.indexOf('Tiêu đề trung lập');
      expect(badgeAt).toBeGreaterThanOrEqual(0);
      if (state !== 'unverified') {
        expect(titleAt).toBeGreaterThan(badgeAt);
      } else {
        expect(badgeAt).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('keeps unverified attribution, source, discovery time, incomplete note, and escapes HTML once', async () => {
    const dense = `A & B <script>alert(1)</script> 𝄞 ${'&<>'.repeat(400)}`;
    const editorial = editorialOf({
      title: `Tài khoản rumor_user cho rằng ${dense}`,
      summary: `Tài khoản rumor_user cho rằng ${dense}. Đây là thông tin chưa được kiểm chứng.`,
      whyImportant: 'Thông tin này chưa được kiểm chứng.',
    });
    const input = candidate({
      verificationState: 'unverified',
      originalAccount: 'rumor_user',
      author: undefined,
      originalAuthor: undefined,
      originAttribution: {
        url: 'https://x.com/rumor_user/status/1?a=1&b=2',
        account: 'rumor_user',
        publishedAt: '2026-08-20T08:00:00.000Z',
        discoveredAt: '2026-08-20T09:00:00.000Z',
      },
      sourceName: 'X <leak>',
      title: dense,
      summary: dense,
      sourceTextStatus: 'incomplete',
      discoveryChannel: 'x',
    });
    const [message] = await new GoldPoliticsMessageService(editorial).buildNewsMessages([input]);
    const text = message.text;
    const badgeAt = text.indexOf('🔴 CHƯA KIỂM CHỨNG');
    const titleAt = text.indexOf('Tài khoản rumor_user cho rằng');
    expect(badgeAt).toBeGreaterThanOrEqual(0);
    expect(titleAt).toBeGreaterThan(badgeAt);
    expect(text).toContain('Tài khoản rumor_user cho rằng');
    expect(text).toContain('16:00');
    expect(text).toMatch(/chưa đầy đủ|chưa truy cập|không đầy đủ|giới hạn/iu);
    expect(text).toContain('&amp;&lt;&gt;');
    expect(text).not.toContain('&amp;lt;');
    expect(text).not.toContain('<script>');
    expect(text).toContain('&lt;script&gt;');
    expect(text).toContain('X &lt;leak&gt;');
    expect(text).toContain('𝄞');
    expect(text.length).toBeLessThanOrEqual(3900);
    expect(text.includes('\uD834') && !text.includes('𝄞')).toBe(false);
  });

  it('shows the exact search-excerpt note and unnamed-author fallback', async () => {
    const editorial = editorialOf({
      title: 'Theo nguồn, giá vàng biến động',
      summary: 'Nguồn cho rằng giá vàng biến động.',
      whyImportant: 'Thị trường đang theo dõi.',
    });
    const input = candidate({
      primaryCategory: 'gold-market',
      geographicScope: 'mixed',
      sourceTextStatus: 'search-excerpt',
      author: undefined,
      originalAuthor: undefined,
      originalAccount: undefined,
      originAttribution: {
        url: 'https://search.example/result',
        account: undefined,
        publishedAt: '2026-08-20T08:00:00.000Z',
        discoveredAt: '2026-08-20T09:00:00.000Z',
      },
    });
    const [message] = await new GoldPoliticsMessageService(editorial).buildNewsMessages([input]);
    expect(message.text).toContain(
      'Nội dung dựa trên trích đoạn do công cụ tìm kiếm cung cấp; chưa truy cập đầy đủ trang gốc.',
    );
    expect(message.text).toContain('Nguồn/tác giả chưa xác định');
  });

  it('does not let unsafe editorial HTML survive and stays within the UTF-16 budget', async () => {
    const editorial = editorialOf({
      title: '<b>Unsafe</b> & title',
      summary: `<script>${'x'.repeat(8_000)}</script> &<> 𝄞`,
      whyImportant: 'Why <img src=x> matters.',
    });
    const [message] = await new GoldPoliticsMessageService(editorial).buildNewsMessages([
      candidate({ verificationState: 'reported' }),
    ]);
    expect(message.text).not.toContain('<script>');
    expect(message.text).not.toContain('<b>Unsafe</b>');
    expect(message.text).not.toContain('<img src=x>');
    expect(message.text).toContain('&lt;b&gt;Unsafe&lt;/b&gt;');
    expect(message.text).toContain('&amp;');
    expect(message.text.length).toBeLessThanOrEqual(3900);
  });
});
