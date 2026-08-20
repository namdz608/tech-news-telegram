/** Lưu URL Telegram đã gửi bằng JSON versioned và atomic rename. */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { env } from '../config/env';
import { normalizeUrl } from '../utils/normalize-url';

interface HistoryDocument {
  version: 1;
  sent: Record<string, string>;
}

export interface SentHistoryStoreOptions {
  failurePolicy?: 'recover-empty' | 'fail-closed';
}

export class SentHistoryStoreError extends Error {
  constructor(readonly code:
    | 'invalid-history'
    | 'history-read-failed'
    | 'history-block-failed'
    | 'history-quarantine-failed') {
    super(code);
    this.name = 'SentHistoryStoreError';
  }
}

const timestampSchema = z.iso.datetime({ offset: true });
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const SAFE_WARNING = 'Invalid sent history quarantined';
const SENTINEL_BODY = `${JSON.stringify({ version: 1, status: 'blocked' }, null, 2)}\n`;

export class SentHistoryStore {
  constructor(
    private readonly filePath = env.GADGET_HISTORY_PATH,
    private readonly retentionDays = env.GADGET_HISTORY_RETENTION_DAYS,
    private readonly now = () => new Date(),
    private readonly options: SentHistoryStoreOptions = {},
  ) {}

  async seenUrls(): Promise<Set<string>> {
    return new Set(Object.keys((await this.load()).sent));
  }

  async mark(inputUrl: string): Promise<void> {
    const document = await this.load();
    document.sent[normalizeUrl(inputUrl)] = this.now().toISOString();
    await this.save(document);
  }

  private failClosed(): boolean {
    return this.options.failurePolicy === 'fail-closed';
  }

  private blockedPath(): string {
    return `${this.filePath}.blocked`;
  }

  private async load(): Promise<HistoryDocument> {
    if (this.failClosed() && await this.sentinelExists()) {
      throw new SentHistoryStoreError('invalid-history');
    }

    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (!isHistoryDocument(parsed)) throw new Error('Invalid sent history schema');
      assertTimestampsValid(parsed, this.now());
      return pruneHistory(parsed, this.now(), this.retentionDays);
    } catch (error) {
      if (error instanceof SentHistoryStoreError) throw error;
      if (isMissingFile(error)) return { version: 1, sent: {} };
      if (this.failClosed() && isReadIoFailure(error)) {
        throw new SentHistoryStoreError('history-read-failed');
      }
      if (this.failClosed()) {
        await this.blockAndQuarantine();
        throw new SentHistoryStoreError('invalid-history');
      }
      await this.quarantineRecoverEmpty();
      return { version: 1, sent: {} };
    }
  }

  private async sentinelExists(): Promise<boolean> {
    try {
      await readFile(this.blockedPath(), 'utf8');
      return true;
    } catch (error) {
      if (isMissingFile(error)) return false;
      throw new SentHistoryStoreError('history-read-failed');
    }
  }

  private async blockAndQuarantine(): Promise<void> {
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.blockedPath()}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporaryPath, SENTINEL_BODY, 'utf8');
      await rename(temporaryPath, this.blockedPath());
    } catch {
      throw new SentHistoryStoreError('history-block-failed');
    }

    try {
      await rename(this.filePath, this.corruptPath());
    } catch {
      throw new SentHistoryStoreError('history-quarantine-failed');
    }
  }

  private async quarantineRecoverEmpty(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await rename(this.filePath, this.corruptPath());
    console.warn(SAFE_WARNING);
  }

  private corruptPath(): string {
    return `${this.filePath}.corrupt-${this.now().toISOString().replace(/[:.]/g, '-')}`;
  }

  private async save(document: HistoryDocument): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, this.filePath);
  }
}

function isHistoryDocument(value: unknown): value is HistoryDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as { version?: unknown; sent?: unknown };
  if (
    candidate.version !== 1 ||
    !candidate.sent ||
    typeof candidate.sent !== 'object' ||
    Array.isArray(candidate.sent)
  ) {
    return false;
  }
  return Object.entries(candidate.sent).every(
    ([url, timestamp]) => typeof url === 'string' && typeof timestamp === 'string',
  );
}

function assertTimestampsValid(document: HistoryDocument, now: Date): void {
  const maxFuture = now.getTime() + MAX_FUTURE_SKEW_MS;
  for (const timestamp of Object.values(document.sent)) {
    if (!timestampSchema.safeParse(timestamp).success) {
      throw new Error('Invalid sent history timestamp');
    }
    const value = Date.parse(timestamp);
    if (!Number.isFinite(value) || value > maxFuture) {
      throw new Error('Invalid sent history timestamp');
    }
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function isReadIoFailure(error: unknown): boolean {
  const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
  return typeof code === 'string' && code.startsWith('E') && code !== 'ENOENT';
}

function pruneHistory(document: HistoryDocument, now: Date, retentionDays: number): HistoryDocument {
  const cutoff = now.getTime() - retentionDays * 86_400_000;
  const sent = Object.fromEntries(
    Object.entries(document.sent).filter(([, timestamp]) => {
      const value = new Date(timestamp).getTime();
      return Number.isFinite(value) && value >= cutoff;
    }),
  );
  return { version: 1, sent };
}
