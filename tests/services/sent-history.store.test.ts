import { inspect } from 'node:util';
import {
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SentHistoryStore,
  SentHistoryStoreError,
} from '../../src/services/sent-history.store';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: vi.fn(actual.readFile),
    writeFile: vi.fn(actual.writeFile),
    rename: vi.fn(actual.rename),
  };
});

const NOW = new Date('2026-08-10T01:00:00.000Z');
const SAFE_WARNING = 'Invalid sent history quarantined';

function leakSurface(value: unknown): string {
  const error = value as { cause?: unknown; message?: string; stack?: string };
  return [
    JSON.stringify(value),
    JSON.stringify(error?.cause),
    String(value),
    error?.message ?? '',
    error?.stack ?? '',
    inspect(value, { depth: 8, showHidden: true }),
  ].join('\n');
}

function assertSafeStoreError(
  error: unknown,
  code: 'invalid-history' | 'history-read-failed' | 'history-block-failed' | 'history-quarantine-failed',
): void {
  expect(error).toBeInstanceOf(SentHistoryStoreError);
  expect(error).toMatchObject({
    name: 'SentHistoryStoreError',
    code,
    message: code,
  });
  expect((error as Error).cause).toBeUndefined();
  const surface = leakSurface(error);
  expect(surface).not.toMatch(/ENOSPC|EACCES|EPERM|permission denied|no space/i);
  expect(surface).not.toContain('/var/');
  expect(surface).not.toContain('/etc/');
  expect(surface).not.toContain('{broken');
  expect(surface).not.toContain('history.json');
}

describe('SentHistoryStore', () => {
  let directory: string;
  let historyPath: string;
  let blockedPath: string;
  let store: SentHistoryStore;
  let actualFs: typeof import('node:fs/promises');

  beforeEach(async () => {
    actualFs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.mocked(readFile).mockImplementation(actualFs.readFile);
    vi.mocked(writeFile).mockImplementation(actualFs.writeFile);
    vi.mocked(rename).mockImplementation(actualFs.rename);
    directory = await mkdtemp(join(tmpdir(), 'gadget-history-'));
    historyPath = join(directory, 'history.json');
    blockedPath = `${historyPath}.blocked`;
    store = new SentHistoryStore(historyPath, 30, () => NOW);
  });

  afterEach(async () => {
    vi.mocked(readFile).mockReset();
    vi.mocked(writeFile).mockReset();
    vi.mocked(rename).mockReset();
    await rm(directory, { recursive: true, force: true });
  });

  function failClosedStore(): SentHistoryStore {
    return new SentHistoryStore(historyPath, 7, () => NOW, { failurePolicy: 'fail-closed' });
  }

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

  it('honors the health retention boundary at exactly seven days', async () => {
    const healthStore = new SentHistoryStore(
      historyPath,
      7,
      () => new Date('2026-08-11T01:00:00.000Z'),
    );
    await writeFile(
      historyPath,
      JSON.stringify({
        version: 1,
        sent: {
          'https://example.com/expired': '2026-08-04T00:59:59.999Z',
          'https://example.com/boundary': '2026-08-04T01:00:00.000Z',
        },
      }),
    );

    expect(await healthStore.seenUrls()).toEqual(new Set(['https://example.com/boundary']));
  });

  it('preserves malformed data under a corrupt suffix and starts empty', async () => {
    await writeFile(historyPath, '{broken');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      expect(await store.seenUrls()).toEqual(new Set());
      expect(warn).toHaveBeenCalledWith(SAFE_WARNING);
      expect(warn.mock.calls.every((call) => call.length === 1)).toBe(true);
    } finally {
      warn.mockRestore();
    }

    expect((await readdir(directory)).some((name) => name.startsWith('history.json.corrupt-'))).toBe(true);
    expect((await readdir(directory)).includes('history.json.blocked')).toBe(false);
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
    expect((await readdir(directory)).includes('history.json.blocked')).toBe(false);
  });

  it('treats a missing fail-closed history file with no sentinel as empty', async () => {
    expect(await failClosedStore().seenUrls()).toEqual(new Set());
    expect(await readdir(directory)).toEqual([]);
  });

  it.each([
    { label: 'malformed JSON', body: '{broken' },
    { label: 'unsupported schema', body: JSON.stringify({ version: 2, sent: [] }) },
  ])('fail-closed $label writes the sentinel before quarantine then rejects invalid-history', async ({ body }) => {
    await writeFile(historyPath, body);
    const order: string[] = [];
    vi.mocked(writeFile).mockImplementation(async (path, data, options) => {
      order.push(`write:${String(path)}`);
      return actualFs.writeFile(path, data, options);
    });
    vi.mocked(rename).mockImplementation(async (from, to, options) => {
      order.push(`rename:${String(from)}->${String(to)}`);
      return actualFs.rename(from, to, options);
    });

    const error = await failClosedStore().seenUrls().catch((thrown: unknown) => thrown);
    assertSafeStoreError(error, 'invalid-history');

    const sentinelReady = order.findIndex((entry) => entry.startsWith('rename:') && entry.endsWith(blockedPath));
    const quarantined = order.findIndex((entry) => entry.includes('.corrupt-'));
    expect(sentinelReady).toBeGreaterThanOrEqual(0);
    expect(quarantined).toBeGreaterThan(sentinelReady);
    expect(await readFile(blockedPath, 'utf8')).toMatch(/"version": 1/);
    expect((await readdir(directory)).some((name) => name.startsWith('history.json.corrupt-'))).toBe(true);
  });

  it.each([
    { label: 'non-RFC3339', timestamp: '2026-08-09T00:00:00' },
    { label: 'impossible calendar date', timestamp: '2026-02-30T00:00:00.000Z' },
    { label: 'more than five minutes ahead', timestamp: '2026-08-10T01:05:00.001Z' },
  ])('fail-closed rejects $label instead of pruning it into an empty seen set', async ({ timestamp }) => {
    await writeFile(
      historyPath,
      JSON.stringify({
        version: 1,
        sent: { 'https://example.com/secret': timestamp },
      }),
    );

    const error = await failClosedStore().seenUrls().catch((thrown: unknown) => thrown);
    assertSafeStoreError(error, 'invalid-history');
    expect(await readFile(blockedPath, 'utf8')).toMatch(/"version": 1/);
    expect((await readdir(directory)).some((name) => name.startsWith('history.json.corrupt-'))).toBe(true);
  });

  it('prunes a valid expired timestamp after semantic validation', async () => {
    await writeFile(
      historyPath,
      JSON.stringify({
        version: 1,
        sent: {
          'https://example.com/expired': '2026-08-02T00:59:59.999Z',
          'https://example.com/fresh': '2026-08-09T00:00:00.000Z',
          'https://example.com/skew': '2026-08-10T01:05:00.000Z',
        },
      }),
    );

    expect(await failClosedStore().seenUrls()).toEqual(
      new Set(['https://example.com/fresh', 'https://example.com/skew']),
    );
  });

  it('keeps rejecting after quarantine because the sentinel remains', async () => {
    await writeFile(historyPath, '{broken');
    const closed = failClosedStore();
    await expect(closed.seenUrls()).rejects.toMatchObject({ code: 'invalid-history' });
    expect((await readdir(directory)).includes('history.json')).toBe(false);

    const again = await closed.seenUrls().catch((thrown: unknown) => thrown);
    assertSafeStoreError(again, 'invalid-history');
    await expect(closed.mark('https://example.com/retry')).rejects.toMatchObject({
      code: 'invalid-history',
    });
  });

  it('rejects a valid replacement history while the sentinel exists', async () => {
    await writeFile(blockedPath, `${JSON.stringify({ version: 1, status: 'blocked' }, null, 2)}\n`);
    await writeFile(
      historyPath,
      JSON.stringify({
        version: 1,
        sent: { 'https://example.com/repaired': '2026-08-09T00:00:00.000Z' },
      }),
    );

    const error = await failClosedStore().seenUrls().catch((thrown: unknown) => thrown);
    assertSafeStoreError(error, 'invalid-history');
  });

  it('loads repaired history after the operator removes the sentinel', async () => {
    await writeFile(historyPath, '{broken');
    const closed = failClosedStore();
    await expect(closed.seenUrls()).rejects.toMatchObject({ code: 'invalid-history' });

    await writeFile(
      historyPath,
      JSON.stringify({
        version: 1,
        sent: { 'https://example.com/repaired': '2026-08-09T00:00:00.000Z' },
      }),
    );
    await unlink(blockedPath);

    expect(await closed.seenUrls()).toEqual(new Set(['https://example.com/repaired']));
  });

  it('rejects sentinel-write failure with history-block-failed and leaves history in place', async () => {
    await writeFile(historyPath, '{broken');
    vi.mocked(writeFile).mockImplementation(async (path, data, options) => {
      if (String(path).includes('.blocked')) {
        throw Object.assign(new Error('ENOSPC no space left on /var/secrets'), { code: 'ENOSPC' });
      }
      return actualFs.writeFile(path, data, options);
    });

    const error = await failClosedStore().seenUrls().catch((thrown: unknown) => thrown);
    assertSafeStoreError(error, 'history-block-failed');
    expect(await readFile(historyPath, 'utf8')).toBe('{broken');
    expect((await readdir(directory)).includes('history.json.blocked')).toBe(false);
  });

  it('rejects read permission failures with history-read-failed', async () => {
    await writeFile(
      historyPath,
      JSON.stringify({ version: 1, sent: { 'https://example.com/a': '2026-08-09T00:00:00.000Z' } }),
    );
    vi.mocked(readFile).mockImplementation(async (path, options) => {
      if (String(path) === historyPath) {
        throw Object.assign(new Error('EACCES permission denied /etc/shadow'), { code: 'EACCES' });
      }
      return actualFs.readFile(path, options);
    });

    const error = await failClosedStore().seenUrls().catch((thrown: unknown) => thrown);
    assertSafeStoreError(error, 'history-read-failed');
  });

  it('rejects quarantine-rename failure, keeps the sentinel, and stays fail-closed', async () => {
    await writeFile(historyPath, '{broken');
    vi.mocked(rename).mockImplementation(async (from, to, options) => {
      if (String(to).includes('.corrupt-')) {
        throw Object.assign(new Error('EPERM /var/secrets/history.json'), { code: 'EPERM' });
      }
      return actualFs.rename(from, to, options);
    });

    const closed = failClosedStore();
    const error = await closed.seenUrls().catch((thrown: unknown) => thrown);
    assertSafeStoreError(error, 'history-quarantine-failed');
    expect(await readFile(blockedPath, 'utf8')).toMatch(/"version": 1/);
    expect(await readFile(historyPath, 'utf8')).toBe('{broken');

    vi.mocked(rename).mockImplementation(actualFs.rename);
    const again = await closed.seenUrls().catch((thrown: unknown) => thrown);
    assertSafeStoreError(again, 'invalid-history');
  });
});
