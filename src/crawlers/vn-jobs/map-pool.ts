/**
 * Chạy tasks theo lô song song với giới hạn concurrency.
 */
export async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const limit = Math.max(1, concurrency);

  for (let index = 0; index < items.length; index += limit) {
    const batch = items.slice(index, index + limit);
    await Promise.all(batch.map((item, offset) => worker(item, index + offset)));
  }
}
