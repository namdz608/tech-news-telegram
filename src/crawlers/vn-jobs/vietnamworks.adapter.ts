/**
 * Crawl danh sách việc làm từ VietnamWorks (JSON search API).
 */
import { vietnamworksQuery } from './role-queries';
import type { JobRole, VnJobListing, VnJobsHttpClient } from './types';

const SEARCH_URL = 'https://ms.vietnamworks.com/job-search/v1.0/search';

interface VietnamWorksHit {
  jobTitle?: string;
  jobUrl?: string;
  companyName?: string;
  prettySalary?: string;
  jobLevel?: string;
  companyLogo?: string;
  workingLocations?: Array<{ cityName?: string; cityNameVI?: string; address?: string }>;
  expiredOn?: string;
}

interface VietnamWorksResponse {
  data?: VietnamWorksHit[];
}

export async function crawlVietnamworks(
  role: JobRole,
  http: VnJobsHttpClient,
  maxResults: number,
): Promise<VnJobListing[]> {
  if (!http.post) {
    return [];
  }

  const body = {
    query: vietnamworksQuery(role),
    filter: [],
    ranges: [],
    order: [],
    hitsPerPage: Math.min(Math.max(maxResults, 1), 50),
    page: 0,
    retrieveFields: [
      'jobTitle',
      'jobUrl',
      'companyName',
      'prettySalary',
      'jobLevel',
      'workingLocations',
      'companyLogo',
      'expiredOn',
    ],
    userId: 0,
  };

  const response = await http.post(SEARCH_URL, body);
  const payload = response.data as VietnamWorksResponse;
  const hits = Array.isArray(payload?.data) ? payload.data : [];

  return hits
    .map((hit): VnJobListing | null => {
      const title = hit.jobTitle?.trim();
      const url = hit.jobUrl?.trim();

      if (!title || !url) {
        return null;
      }

      const location = hit.workingLocations
        ?.map((item) => item.cityNameVI || item.cityName || item.address)
        .filter(Boolean)
        .join(', ');

      return {
        title,
        url,
        company: hit.companyName || undefined,
        location: location || undefined,
        salaryText: hit.prettySalary || undefined,
        experienceText: hit.jobLevel || undefined,
        imageUrl: hit.companyLogo?.startsWith('http') ? hit.companyLogo : undefined,
        sourceId: 'vietnamworks',
        sourceName: 'VietnamWorks',
      };
    })
    .filter((job): job is VnJobListing => job !== null);
}
