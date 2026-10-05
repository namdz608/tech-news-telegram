import { DEVOPS_JOB_SOURCE_URLS } from '../config/devops-jobs-sources';
import type { DevopsJob } from '../types/devops-jobs';
import { getDevopsJobsText } from './devops-jobs-http';
import { toDevopsJob } from './devops-jobs-record';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface HnHit {
  objectID?: string;
  title?: string;
  comment_text?: string;
  created_at?: string;
}

export class HnHiringAdapter {
  readonly key = 'hn';

  constructor(
    private readonly getText: (url: string) => Promise<string> = getDevopsJobsText,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async collect(): Promise<DevopsJob[]> {
    const month = MONTHS[this.now().getUTCMonth()];
    const year = this.now().getUTCFullYear();
    const expected = `Ask HN: Who is hiring? (${month} ${year})`;
    const storyUrl = `${DEVOPS_JOB_SOURCE_URLS.hnStories}?tags=story&query=${encodeURIComponent('Ask HN: Who is hiring')}&hitsPerPage=5`;
    const stories = await this.hits(storyUrl);
    const story = stories.find((hit) => hit.title === expected && hit.objectID);
    if (!story?.objectID) throw new Error('Current HN hiring story was not found');
    const commentUrl = `${DEVOPS_JOB_SOURCE_URLS.hnComments}?tags=${encodeURIComponent(`comment,story_${story.objectID}`)}&hitsPerPage=200`;
    const comments = await this.hits(commentUrl);
    return comments.flatMap((hit) => {
      const parsed = companyAndTitle(hit.comment_text ?? '');
      if (!parsed || !hit.objectID || !hit.created_at) return [];
      const job = toDevopsJob({
        id: hit.objectID,
        sourceId: this.key,
        sourceName: 'HN Who is hiring',
        title: parsed.title,
        company: parsed.company,
        url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        description: hit.comment_text,
        publishedAt: hit.created_at,
      });
      return job ? [job] : [];
    });
  }

  private async hits(url: string): Promise<HnHit[]> {
    const parsed: unknown = JSON.parse(await this.getText(url));
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { hits?: unknown }).hits)) {
      throw new Error('HN payload is not a hit list');
    }
    return (parsed as { hits: HnHit[] }).hits;
  }
}

function companyAndTitle(text: string): { company: string; title: string } | undefined {
  const first = text.split('\n')[0] ?? '';
  const separator = first.includes('|') ? '|' : /\s+-\s+/.test(first) ? '-' : undefined;
  if (!separator) return undefined;
  const [company, title] = separator === '|'
    ? first.split('|').map((part) => part.trim())
    : first.split(/\s+-\s+/).map((part) => part.trim());
  if (!company || !title) return undefined;
  return { company, title };
}
