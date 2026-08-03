import { describe, expect, it } from 'vitest';
import { mapPool } from '../../src/crawlers/vn-jobs/map-pool';

describe('mapPool', () => {
  it('runs workers with limited concurrency', async () => {
    let active = 0;
    let maxActive = 0;
    const seen: number[] = [];

    await mapPool([1, 2, 3, 4, 5], 2, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      seen.push(item);
      active -= 1;
    });

    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });
});
