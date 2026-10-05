import type { DevopsJob } from '../types/devops-jobs';

const KEYWORDS: readonly RegExp[] = [
  /\bdevops\b/iu,
  /\bsre\b/iu,
  /site reliability/iu,
  /\bplatform\b/iu,
  /\binfrastructure\b/iu,
  /\bkubernetes\b/iu,
  /\bk8s\b/iu,
  /cloud engineer/iu,
];

const LOCATION_REGION =
  /(?:^|[^a-z0-9.])(?:united states|united kingdom|north america|south america|u\.s\.|usa|uk|europe|canada|germany|france|india|australia|latam|emea|apac|africa|asia|eu|us)(?=$|[^a-z0-9-])/iu;

const RESTRICTION =
  /\b(?:us only|usa only|u\.s\. only|united states only|uk only|eu only|europe only|canada only|must be located|must be based in|must reside|candidates must be in|only candidates in)\b|\bremote\s*[-–—]\s*(?:us|usa|uk|eu|canada|europe)\b/iu;

const REMOTE_SIGNAL = /\bremote\b|work from home|work from anywhere|\bdistributed\b/iu;

const REMOTE_ONLY_SOURCES = new Set([
  'remoteok',
  'remotive',
  'weworkremotely',
  'himalayas',
]);

function corpus(job: DevopsJob): string {
  return [job.title, job.location, job.description, ...job.tags].join('\n');
}

export function matchesDevopsJobKeyword(job: DevopsJob): boolean {
  const text = [job.title, job.description, ...job.tags].join('\n');
  return KEYWORDS.some((pattern) => pattern.test(text));
}

export function isWorldwideRemote(job: DevopsJob): boolean {
  if (RESTRICTION.test(corpus(job))) return false;
  if (LOCATION_REGION.test(job.location)) return false;
  if (REMOTE_ONLY_SOURCES.has(job.sourceId)) return true;
  return REMOTE_SIGNAL.test([job.title, job.location, job.description].join('\n'));
}

export function isEligibleDevopsJob(job: DevopsJob): boolean {
  return matchesDevopsJobKeyword(job) && isWorldwideRemote(job);
}
