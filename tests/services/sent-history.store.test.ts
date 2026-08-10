import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SentHistoryStore } from '../../src/services/sent-history.store';

describe('SentHistoryStore', () => {
  let directory: string;
  let historyPath: string;
  let store: SentHistoryStore;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'gadget-history-'));
    historyPath = join(directory, 'history.json');
    store = new SentHistoryStore(historyPath, 30, () => new Date('2026-08-10T01:00:00.000Z'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('treats a missing file as empty and persists canonical timestamps', async () => {
    expect(await store.seenUrls()).toEqual(new Set());
    await store.mark('https://example.com/device?utm_source=rss');
    expect(await store.seenUrls()).toEqual(new Set(['https://example.com/device']));
  });

  it('removes entries older than 30 days', async () => {
    await writeFile(
      historyPath,
      JSON.stringify({
        version: 1,
        sent: {
          'https://example.com/old': '2026-06-01T00:00:00.000Z',
          'https://example.com/fresh': '2026-08-09T00:00:00.000Z',
        },
      }),
    );

    expect(await store.seenUrls()).toEqual(new Set(['https://example.com/fresh']));
  });

  it('preserves malformed data under a corrupt suffix and starts empty', async () => {
    await writeFile(historyPath, '{broken');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      expect(await store.seenUrls()).toEqual(new Set());
    } finally {
      warn.mockRestore();
    }

    expect((await readdir(directory)).some((name) => name.startsWith('history.json.corrupt-'))).toBe(true);
  });

  it('leaves no temporary file after an atomic save', async () => {
    await store.mark('https://example.com/device');
    expect(await readdir(directory)).toEqual(['history.json']);
  });

  it('treats invalid history schema as corrupt', async () => {
    await writeFile(historyPath, JSON.stringify({ version: 2, sent: [] }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      expect(await store.seenUrls()).toEqual(new Set());
    } finally {
      warn.mockRestore();
    }

    expect((await readdir(directory)).some((name) => name.startsWith('history.json.corrupt-'))).toBe(true);
  });
});
