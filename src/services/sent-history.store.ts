/** Lưu URL Telegram đã gửi bằng JSON versioned và atomic rename. */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { env } from '../config/env';
import { normalizeUrl } from '../utils/normalize-url';

interface HistoryDocument {
  version: 1;
  sent: Record<string, string>;
}

export class SentHistoryStore {
  constructor(
    private readonly filePath = env.GADGET_HISTORY_PATH,
    private readonly retentionDays = env.GADGET_HISTORY_RETENTION_DAYS,
    private readonly now = () => new Date(),
  ) {}

  async seenUrls(): Promise<Set<string>> {
    return new Set(Object.keys((await this.load()).sent));
  }

  async mark(inputUrl: string): Promise<void> {
    const document = await this.load();
    document.sent[normalizeUrl(inputUrl)] = this.now().toISOString();
    await this.save(document);
  }

  private async load(): Promise<HistoryDocument> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (!isHistoryDocument(parsed)) throw new Error('Invalid gadget history schema');
      return pruneHistory(parsed, this.now(), this.retentionDays);
    } catch (error) {
      if (isMissingFile(error)) return { version: 1, sent: {} };

      await mkdir(dirname(this.filePath), { recursive: true });
      const corruptPath = `${this.filePath}.corrupt-${this.now().toISOString().replace(/[:.]/g, '-')}`;
      await rename(this.filePath, corruptPath);
      console.warn(`Invalid gadget history moved to ${corruptPath}`, error);
      return { version: 1, sent: {} };
    }
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

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
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
