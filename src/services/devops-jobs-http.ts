import axios from 'axios';
import { env } from '../config/env';
import { DEVOPS_JOBS_USER_AGENT } from '../config/devops-jobs-sources';
import { CrawlHtmlClient } from './crawl-html-client';

export async function getDevopsJobsText(url: string): Promise<string> {
  const client = axios.create({
    timeout: env.REQUEST_TIMEOUT_MS,
    maxRedirects: 3,
    // Full native boards include many job descriptions; keep a separate bounded budget.
    maxContentLength: 4 * 1024 * 1024,
    maxBodyLength: 4 * 1024 * 1024,
    responseType: 'text',
    validateStatus: () => true,
    headers: {
      'User-Agent': DEVOPS_JOBS_USER_AGENT,
      Accept: 'application/json, application/rss+xml, text/html, */*',
    },
  });
  const response = await new CrawlHtmlClient(client).get(url);
  if (response.status !== undefined && response.status >= 400) throw new Error(`HTTP ${response.status}`);
  return String(response.data);
}
