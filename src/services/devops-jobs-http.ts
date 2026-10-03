import axios from 'axios';
import { env } from '../config/env';
import { DEVOPS_JOBS_USER_AGENT } from '../config/devops-jobs-sources';

export async function getDevopsJobsText(url: string): Promise<string> {
  const response = await axios.get<string>(url, {
    timeout: env.REQUEST_TIMEOUT_MS,
    responseType: 'text',
    validateStatus: () => true,
    headers: {
      'User-Agent': DEVOPS_JOBS_USER_AGENT,
      Accept: 'application/json, application/rss+xml, text/html, */*',
    },
  });
  if (response.status >= 400) {
    throw new Error(`HTTP ${response.status}`);
  }
  return String(response.data);
}
