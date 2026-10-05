import type { DevopsJob, DevopsJobsMessage } from '../types/devops-jobs';
import { htmlToCompactText } from '../utils/html-text';
import { escapeHtml } from '../utils/text';
import { DevopsJobsTextTranslator } from './devops-jobs-translator';

const EXCERPT_LIMIT = 240;

interface JobTextTranslator {
  translateDigestVerified(text: string): Promise<{ text: string; succeeded: boolean }>;
}

export class DevopsJobsMessageService {
  private readonly translator: JobTextTranslator;

  constructor(
    private readonly timeZone = 'Asia/Ho_Chi_Minh',
    translator?: JobTextTranslator,
  ) {
    this.translator = translator ?? new DevopsJobsTextTranslator();
  }

  async buildMessages(jobs: readonly DevopsJob[]): Promise<DevopsJobsMessage[]> {
    return Promise.all(jobs.map(async (job) => ({
      text: await this.render(job),
      url: job.url,
    })));
  }

  private async render(job: DevopsJob): Promise<string> {
    const excerpt = this.excerpt(job.description);
    const [title, salary, translatedExcerpt] = await Promise.all([
      this.translate(job.title),
      job.salary ? this.translate(job.salary) : Promise.resolve(''),
      excerpt.text ? this.translate(excerpt.text) : Promise.resolve(''),
    ]);
    const excerptLine = translatedExcerpt
      ? `${escapeHtml(translatedExcerpt)}${excerpt.truncated ? '…' : ''}`
      : '';
    const lines = [
      '🛠️ DevOps remote',
      '',
      `<b>${escapeHtml(title)}</b>`,
      `🏢 ${escapeHtml(job.company)}`,
      '📍 Remote · toàn cầu',
      ...(salary ? [`💰 ${escapeHtml(salary)}`] : []),
      `🗓 ${this.formatDate(job.publishedAt)}`,
      `📡 ${escapeHtml(job.sourceName)}`,
      ...(excerptLine ? ['', excerptLine] : []),
    ];
    return lines.join('\n');
  }

  private excerpt(description: string): { text: string; truncated: boolean } {
    const text = htmlToCompactText(description);
    if (text.length <= EXCERPT_LIMIT) return { text, truncated: false };
    return { text: text.slice(0, EXCERPT_LIMIT), truncated: true };
  }

  private async translate(text: string): Promise<string> {
    const source = text.trim();
    if (source === '') return '';
    try {
      const translated = await this.translator.translateDigestVerified(source);
      const value = translated.text.trim();
      if (translated.succeeded && value !== '') return value;
    } catch (error) {
      console.error('DevOps job translation failed, keeping source text', error);
    }
    return source;
  }

  private formatDate(value: string): string {
    const date = new Date(value);
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: this.timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((entry) => entry.type === type)?.value ?? '';
    return `${part('day')}/${part('month')}/${part('year')}`;
  }
}
