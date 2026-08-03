/**
 * Kiểu dùng chung cho crawl tin tuyển dụng Việt Nam.
 */

export type JobRole = 'english-teacher' | 'devops';

export type ExperienceYears = '0' | '1-2' | '2-5' | '3-5' | '5+';

export type JobLocation = 'hanoi' | 'all';

export type VnJobBoardId = 'topcv' | 'itviec' | 'vietnamworks';

export type VnJobBoardName = 'TopCV' | 'ITviec' | 'VietnamWorks';

export interface VnJobListing {
  title: string;
  url: string;
  company?: string;
  location?: string;
  salaryText?: string;
  experienceText?: string;
  description?: string;
  skills?: string[];
  summary?: string;
  imageUrl?: string;
  publishedAt?: string;
  sourceId: VnJobBoardId;
  sourceName: VnJobBoardName;
}

export interface VnJobsCrawlOptions {
  role: JobRole;
  experienceYears?: ExperienceYears;
  /** Mặc định `hanoi` — chỉ lấy việc tại Hà Nội. */
  location?: JobLocation;
  maxResults: number;
}

export interface VnJobsHttpClient {
  get(url: string): Promise<{ data: string; status?: number }>;
  post?(url: string, body: unknown): Promise<{ data: unknown; status?: number }>;
}
