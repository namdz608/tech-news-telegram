export const DEVOPS_JOB_QUERIES = [
  'devops',
  'sre',
  'platform engineer',
  'kubernetes',
  'cloud engineer',
] as const;

export const DEVOPS_JOBS_USER_AGENT = 'tech-news-telegram/devops-jobs';

export const DEVOPS_JOB_SOURCE_URLS = {
  remoteok: 'https://remoteok.com/api',
  remotive: 'https://remotive.com/api/remote-jobs',
  weworkremotely: 'https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss',
  himalayas: 'https://himalayas.app/jobs/api/search',
  hnStories: 'https://hn.algolia.com/api/v1/search_by_date',
  hnComments: 'https://hn.algolia.com/api/v1/search',
  linkedin: 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search',
  indeed: 'https://rss.indeed.com/rss',
} as const;
