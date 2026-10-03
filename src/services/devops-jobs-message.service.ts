import type { DevopsJob, DevopsJobsMessage } from '../types/devops-jobs';
import { htmlToCompactText } from '../utils/html-text';
import { escapeHtml } from '../utils/text';

const EXCERPT_LIMIT = 240;

export class DevopsJobsMessageService {
  constructor(private readonly timeZone = 'Asia/Ho_Chi_Minh') {}

  async buildMessages(jobs: readonly DevopsJob[]): Promise<DevopsJobsMessage[]> {
    return jobs.map((job) => ({
      text: this.render(job),
      url: job.url,
    }));
  }

  private render(job: DevopsJob): string {
    const excerpt = this.excerpt(job.description);
    const lines = [
      '🛠️ DevOps remote',
      '',
      `<b>${escapeHtml(job.title)}</b>`,
      `🏢 ${escapeHtml(job.company)}`,
      '📍 Remote · toàn cầu',
      ...(job.salary ? [`💰 ${escapeHtml(job.salary)}`] : []),
      `🗓 ${this.formatDate(job.publishedAt)}`,
      `📡 ${escapeHtml(job.sourceName)}`,
      ...(excerpt ? ['', excerpt] : []),
    ];
    return lines.join('\n');
  }

  private excerpt(description: string): string {
    const text = htmlToCompactText(description);
    if (text === '') return '';
    if (text.length <= EXCERPT_LIMIT) return escapeHtml(text);
    return `${escapeHtml(text.slice(0, EXCERPT_LIMIT))}…`;
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
