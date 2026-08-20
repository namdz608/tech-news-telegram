import { describe, expect, it } from 'vitest';
import {
  buildPoliticsSearchQueries,
  goldPoliticsRssSources,
  politicsSearchQueries,
} from '../../src/config/gold-politics-sources';
import {
  GoldPriceAdapterError,
  isGoldPriceAdapterError,
  normalizeGoldPriceAdapterError,
} from '../../src/types/gold-politics';

const expectedFeedUrls = [
  'https://vnexpress.net/rss/thoi-su.rss',
  'https://vnexpress.net/rss/the-gioi.rss',
  'https://vnexpress.net/rss/phap-luat.rss',
  'https://vnexpress.net/rss/kinh-doanh.rss',
  'https://thanhnien.vn/rss/chinh-tri.rss',
  'https://thanhnien.vn/rss/thoi-su.rss',
  'https://thanhnien.vn/rss/the-gioi.rss',
  'https://thanhnien.vn/rss/thoi-su/phong-su--dieu-tra.rss',
  'https://thanhnien.vn/rss/kinh-te.rss',
  'https://tuoitre.vn/rss/thoi-su.rss',
  'https://tuoitre.vn/rss/the-gioi.rss',
  'https://tuoitre.vn/rss/phap-luat.rss',
  'https://tuoitre.vn/rss/kinh-doanh.rss',
  'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://www.theguardian.com/world/rss',
  'https://www.theguardian.com/politics/rss',
  'https://www.aljazeera.com/xml/rss/all.xml',
] as const;

describe('gold-politics source catalogs', () => {
  it('contains every approved RSS feed exactly once with stable IDs', () => {
    const feedUrls = goldPoliticsRssSources.map((source) => source.feedUrl);

    expect(feedUrls).toHaveLength(expectedFeedUrls.length);
    expect(new Set(feedUrls).size).toBe(expectedFeedUrls.length);
    expect(feedUrls).toEqual(expectedFeedUrls);
    expect(new Set(goldPoliticsRssSources.map((source) => source.id)).size).toBe(
      expectedFeedUrls.length,
    );
  });

  it('allows unmatched articles from every RSS source', () => {
    expect(goldPoliticsRssSources.every((source) => source.includeUnmatched === true)).toBe(true);
  });

  it('defines eight stable bilingual discovery queries in the approved order', () => {
    expect(politicsSearchQueries).toHaveLength(8);
    expect(new Set(politicsSearchQueries.map((query) => query.key)).size).toBe(8);

    const texts = politicsSearchQueries.map((query) => query.text);
    expect(texts[0]).toMatch(/chính trị Việt Nam.*Vietnamese politics/i);
    expect(texts[1]).toMatch(/chính trị quốc tế.*international politics/i);
    expect(texts[2]).toMatch(/lãnh đạo Việt Nam.*leader controvers/i);
    expect(texts[3]).toMatch(/lãnh đạo quốc tế.*international leader controvers/i);
    expect(texts[4]).toMatch(/giá vàng.*ngân hàng trung ương.*lãi suất.*USD.*gold.*central bank.*rates/i);
  });

  it('keeps the three hinted domain searches within the default eight', () => {
    const domainQueries = politicsSearchQueries.filter((query) => query.discoveryHint);

    expect(domainQueries.map((query) => query.discoveryHint)).toEqual([
      'facebook',
      'tiktok',
      'telegram',
    ]);
    expect(
      domainQueries.map((query) => query.text.match(/site:(facebook\.com|tiktok\.com|t\.me)/)?.[1]),
    ).toEqual(['facebook.com', 'tiktok.com', 't.me']);
  });

  it('caps queries without accepting caller-provided query text', () => {
    expect(buildPoliticsSearchQueries(2)).toEqual(politicsSearchQueries.slice(0, 2));
    expect(buildPoliticsSearchQueries(0)).toEqual([]);
    expect(buildPoliticsSearchQueries(-1)).toEqual([]);
  });
});

describe('gold price adapter errors', () => {
  it('recognizes and normalizes adapter failures', () => {
    const error = new GoldPriceAdapterError('ambiguous-unit');

    expect(isGoldPriceAdapterError(error)).toBe(true);
    expect(normalizeGoldPriceAdapterError(error)).toBe('ambiguous-unit');
    expect(normalizeGoldPriceAdapterError(new Error('network'))).toBe('fetch-failed');
  });
});
