import type { DevopsJob } from '../types/devops-jobs';

export interface DevopsJobInput {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  company: string;
  url: string;
  location?: string;
  description?: string;
  tags?: readonly string[];
  salary?: string;
  publishedAt: string;
}

export function toDevopsJob(input: DevopsJobInput): DevopsJob | undefined {
  const title = input.title.trim();
  const company = input.company.trim();
  const url = input.url.trim();
  if (title === '' || company === '' || !Number.isFinite(Date.parse(input.publishedAt))) {
    return undefined;
  }
  try {
    const protocol = new URL(url).protocol;
    if (protocol !== 'http:' && protocol !== 'https:') return undefined;
  } catch {
    return undefined;
  }
  const salary = input.salary?.trim();
  return {
    id: input.id,
    sourceId: input.sourceId,
    sourceName: input.sourceName,
    title,
    company,
    url,
    location: input.location?.trim() ?? '',
    description: input.description ?? '',
    tags: input.tags ?? [],
    publishedAt: new Date(input.publishedAt).toISOString(),
    ...(salary ? { salary } : {}),
  };
}

export function dedupeDevopsJobs(jobs: readonly DevopsJob[]): DevopsJob[] {
  const seen = new Set<string>();
  const unique: DevopsJob[] = [];
  for (const job of jobs) {
    if (seen.has(job.url)) continue;
    seen.add(job.url);
    unique.push(job);
  }
  return unique;
}

export function salaryRange(min?: unknown, max?: unknown): string | undefined {
  const left = typeof min === 'number' ? String(min) : undefined;
  const right = typeof max === 'number' ? String(max) : undefined;
  if (left && right) return `${left}-${right}`;
  return left ?? right;
}
