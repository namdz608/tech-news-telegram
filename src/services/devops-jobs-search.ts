import type { DevopsJob } from '../types/devops-jobs';
import { dedupeDevopsJobs } from './devops-jobs-record';

export async function collectDevopsJobQueries(
  queries: readonly string[],
  fetchQuery: (query: string) => Promise<DevopsJob[]>,
): Promise<DevopsJob[]> {
  const settled = await Promise.allSettled(queries.map((query) => fetchQuery(query)));
  const jobs: DevopsJob[] = [];
  let successes = 0;
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    successes += 1;
    jobs.push(...result.value);
  }
  if (successes === 0) {
    throw new Error('All devops-jobs queries failed');
  }
  return dedupeDevopsJobs(jobs);
}
