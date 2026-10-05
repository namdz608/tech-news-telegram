import { describe, expect, it } from 'vitest';
import { HnHiringAdapter } from '../../src/services/devops-jobs-hn.adapter';

const now = () => new Date('2026-10-02T00:00:00.000Z');

describe('HnHiringAdapter', () => {
  it('keeps a comment from the current month story', async () => {
    const adapter = new HnHiringAdapter(async (url) => {
      if (url.includes('search_by_date')) {
        return JSON.stringify({
          hits: [
            { objectID: '1', title: 'Ask HN: Who is hiring? (September 2026)' },
            { objectID: '2', title: 'Ask HN: Who is hiring? (October 2026)' },
          ],
        });
      }
      return JSON.stringify({
        hits: [{
          objectID: '99',
          comment_text: 'Acme | SRE | Remote\nWorldwide platform work',
          created_at: '2026-10-01T00:00:00.000Z',
        }],
      });
    }, now);
    const jobs = await adapter.collect();
    expect(jobs[0]).toMatchObject({
      sourceId: 'hn',
      company: 'Acme',
      title: 'SRE',
      url: 'https://news.ycombinator.com/item?id=99',
    });
  });

  it('throws when the current month story is missing', async () => {
    const adapter = new HnHiringAdapter(async () => JSON.stringify({
      hits: [{ objectID: '1', title: 'Ask HN: Who is hiring? (September 2026)' }],
    }), now);
    await expect(adapter.collect()).rejects.toThrow(/story/);
  });

  it('drops a comment without a company separator', async () => {
    const adapter = new HnHiringAdapter(async (url) => {
      if (url.includes('search_by_date')) {
        return JSON.stringify({
          hits: [{ objectID: '2', title: 'Ask HN: Who is hiring? (October 2026)' }],
        });
      }
      return JSON.stringify({
        hits: [{
          objectID: '100',
          comment_text: 'Looking for work',
          created_at: '2026-10-01T00:00:00.000Z',
        }],
      });
    }, now);
    expect(await adapter.collect()).toEqual([]);
  });
});
