import type { GoldPriceAdapter } from '../../types/gold-politics';
import { DojiGoldPriceAdapter } from './doji.adapter';
import { PnjGoldPriceAdapter } from './pnj.adapter';
import { SjcGoldPriceAdapter } from './sjc.adapter';
import { XauUsdGoldPriceAdapter } from './xau-usd.adapter';

export function createGoldPriceAdapters(): GoldPriceAdapter[] {
  return [
    new SjcGoldPriceAdapter(),
    new DojiGoldPriceAdapter(),
    new PnjGoldPriceAdapter(),
    new XauUsdGoldPriceAdapter(),
  ];
}
