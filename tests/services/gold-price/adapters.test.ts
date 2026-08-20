import { describe, expect, it } from 'vitest';
import { env } from '../../../src/config/env';
import { createGoldPriceAdapters } from '../../../src/services/gold-price/adapters';
import { DojiGoldPriceAdapter } from '../../../src/services/gold-price/doji.adapter';
import { PnjGoldPriceAdapter } from '../../../src/services/gold-price/pnj.adapter';
import { SjcGoldPriceAdapter } from '../../../src/services/gold-price/sjc.adapter';
import { XauUsdGoldPriceAdapter, toPublicSourceOrigin } from '../../../src/services/gold-price/xau-usd.adapter';

describe('createGoldPriceAdapters', () => {
  it('returns SJC, DOJI, PNJ, XAU/USD with approved public display pages', () => {
    const adapters = createGoldPriceAdapters();

    expect(adapters).toHaveLength(4);
    expect(adapters.map((adapter) => adapter.constructor)).toEqual([
      SjcGoldPriceAdapter,
      DojiGoldPriceAdapter,
      PnjGoldPriceAdapter,
      XauUsdGoldPriceAdapter,
    ]);
    expect(adapters.map((adapter) => adapter.source.providerKey)).toEqual([
      'sjc',
      'doji',
      'pnj',
      'xau-usd',
    ]);
    expect(adapters.map((adapter) => adapter.source.sourceUrl)).toEqual([
      'https://www.sjc.com.vn/bieu-do-gia-vang',
      'https://banggia.doji.vn/',
      'https://www.pnj.com.vn/site/gia-vang',
      toPublicSourceOrigin(env.GOLD_SPOT_API_URL),
    ]);
    expect(adapters[3].source.sourceUrl).toBe('https://api.gold-api.com/');

    const publicPages = adapters.map((adapter) => adapter.source.sourceUrl).join('\n');
    expect(publicPages).not.toContain('TablePrice');
    expect(publicPages).not.toContain('edge-api');
    expect(publicPages).not.toContain('/price/XAU');
  });

  it('only XAU receives GOLD_SPOT_API_URL as its request endpoint', async () => {
    const requested: string[] = [];
    const http = {
      async get(url: string) {
        requested.push(url);
        throw new Error('offline');
      },
    };

    await Promise.allSettled([
      new SjcGoldPriceAdapter(undefined, http).fetch(),
      new DojiGoldPriceAdapter(undefined, http).fetch(),
      new PnjGoldPriceAdapter(undefined, http).fetch(),
      new XauUsdGoldPriceAdapter(undefined, http).fetch(),
    ]);

    expect(requested).toEqual([
      'https://www.sjc.com.vn/bieu-do-gia-vang',
      'https://banggia.doji.vn/api/TablePrice/GetTablePrice',
      'https://edge-api.pnj.io/ecom-frontend/v1/get-gold-price?zone=00',
      env.GOLD_SPOT_API_URL,
    ]);
    expect(requested.filter((url) => url === env.GOLD_SPOT_API_URL)).toHaveLength(1);
  });
});
