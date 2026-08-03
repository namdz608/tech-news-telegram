/**
 * Crawl danh sách việc làm từ VietnamWorks (JSON search API).
 */
import { htmlToPlainText } from './html-text';
import { normalizeLogoUrl } from './logo-url';
import { vietnamworksQueries } from './role-queries';
import type { JobRole, VnJobListing, VnJobsHttpClient } from './types';

const SEARCH_URL = 'https://ms.vietnamworks.com/job-search/v1.0/search';

/** cityId Hà Nội trên VietnamWorks. */
const HANOI_CITY_ID = '24';

interface VietnamWorksSkill {
  skillName?: string;
}

interface VietnamWorksHit {
  jobTitle?: string;
  jobUrl?: string;
  jobId?: number;
  alias?: string;
  companyName?: string;
  prettySalary?: string;
  jobLevel?: string;
  companyLogo?: string;
  jobDescription?: string;
  jobRequirement?: string;
  skills?: VietnamWorksSkill[] | null;
  workingLocations?: Array<{ cityName?: string; cityNameVI?: string; address?: string }>;
  expiredOn?: string;
}

interface VietnamWorksResponse {
  data?: VietnamWorksHit[];
  meta?: { code?: number; message?: string };
  errors?: unknown;
}

export async function crawlVietnamworks(
  role: JobRole,
  http: VnJobsHttpClient,
  maxResults: number,
): Promise<VnJobListing[]> {
  if (!http.post) {
    return [];
  }

  const queries = vietnamworksQueries(role);
  const perQuery = Math.min(Math.max(maxResults, 5), 100);
  const merged = new Map<string, VnJobListing>();

  const batches = await Promise.all(queries.map((query) => searchOnce(http, query, perQuery)));

  for (const hits of batches) {
    for (const job of hits) {
      if (!merged.has(job.url)) {
        merged.set(job.url, job);
      }
    }
  }

  return [...merged.values()];
}

async function searchOnce(http: VnJobsHttpClient, query: string, hitsPerPage: number): Promise<VnJobListing[]> {
  const body = {
    query,
    filter: [
      {
        field: 'workingLocations.cityId',
        value: HANOI_CITY_ID,
      },
    ],
    ranges: [],
    order: [],
    hitsPerPage,
    page: 0,
    retrieveFields: [
      'jobTitle',
      'jobUrl',
      'jobId',
      'alias',
      'companyName',
      'prettySalary',
      'jobLevel',
      'workingLocations',
      'companyLogo',
      'expiredOn',
      'jobDescription',
      'jobRequirement',
      'skills',
    ],
    userId: 0,
  };

  const response = await http.post!(SEARCH_URL, body);

  if (response.status && response.status >= 400) {
    console.error(`VietnamWorks search failed for query="${query}" status=${response.status}`);
    return [];
  }

  const payload = response.data as VietnamWorksResponse;
  const hits = Array.isArray(payload?.data) ? payload.data : [];

  return hits
    .map((hit): VnJobListing | null => {
      const title = hit.jobTitle?.trim();
      const url = resolveVietnamworksUrl(hit);

      if (!title || !url) {
        return null;
      }

      const location = hit.workingLocations
        ?.map((item) => item.cityNameVI || item.cityName || item.address)
        .filter(Boolean)
        .join(', ');

      const skills = (hit.skills ?? [])
        .map((skill) => skill.skillName?.trim())
        .filter((name): name is string => Boolean(name));

      const description =
        htmlToPlainText(hit.jobDescription, 1600) ||
        htmlToPlainText(hit.jobRequirement, 1600) ||
        undefined;

      const requirementText = htmlToPlainText(hit.jobRequirement, 1200);
      const mergedDescription =
        hit.jobDescription && hit.jobRequirement && requirementText
          ? [htmlToPlainText(hit.jobDescription, 1400), `Yêu cầu:\n${requirementText}`].filter(Boolean).join('\n\n')
          : description;

      return {
        title,
        url,
        company: hit.companyName || undefined,
        location: location || undefined,
        salaryText: hit.prettySalary || undefined,
        experienceText: hit.jobLevel || undefined,
        description: mergedDescription || description,
        skills: skills.length > 0 ? skills : undefined,
        imageUrl: normalizeLogoUrl(hit.companyLogo, 'https://www.vietnamworks.com'),
        sourceId: 'vietnamworks',
        sourceName: 'VietnamWorks',
      };
    })
    .filter((job): job is VnJobListing => job !== null);
}

function resolveVietnamworksUrl(hit: VietnamWorksHit): string | undefined {
  const direct = hit.jobUrl?.trim();

  if (direct) {
    return direct;
  }

  if (hit.alias && hit.jobId) {
    return `https://www.vietnamworks.com/${hit.alias}-${hit.jobId}-jv`;
  }

  return undefined;
}
