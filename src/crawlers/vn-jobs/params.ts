/**
 * Parse và validate query params cho POST /telegram/send-jobs.
 */
import { env } from '../../config/env';
import type { ExperienceYears, JobRole } from './types';

const JOB_ROLES = new Set<JobRole>(['english-teacher', 'devops']);
const EXPERIENCE_YEARS = new Set<ExperienceYears>(['0', '1-2', '2-5', '3-5', '5+']);
const MAX_LIMIT = 100;
/** Mặc định số tin khi không truyền `limit` — teacher lấy nhiều hơn devops. */
const DEFAULT_LIMIT_BY_ROLE: Record<JobRole, number> = {
  'english-teacher': 50,
  devops: env.MAX_JOBS_PER_DIGEST,
};

export interface ParsedJobSendParams {
  role: JobRole;
  experienceYears?: ExperienceYears;
  /** Số tin gửi; mặc định theo role (teacher 50, devops = MAX_JOBS_PER_DIGEST), tối đa 100. */
  limit: number;
}

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }

  return undefined;
}

/**
 * Đọc `role` (bắt buộc), `experienceYears` / `limit` (tuỳ chọn) từ query object.
 * Ném Error message bắt đầu bằng `Invalid` khi giá trị không hợp lệ.
 */
export function parseJobSendParams(query: Record<string, unknown>): ParsedJobSendParams {
  const roleRaw = firstString(query.role)?.trim();

  if (!roleRaw) {
    throw new Error('Invalid role: required query param `role` must be english-teacher or devops');
  }

  if (!JOB_ROLES.has(roleRaw as JobRole)) {
    throw new Error('Invalid role: must be english-teacher or devops');
  }

  const experienceRaw = firstString(query.experienceYears)?.trim();
  let experienceYears: ExperienceYears | undefined;

  if (experienceRaw) {
    if (!EXPERIENCE_YEARS.has(experienceRaw as ExperienceYears)) {
      throw new Error('Invalid experienceYears: must be 0, 1-2, 2-5, 3-5, or 5+');
    }

    experienceYears = experienceRaw as ExperienceYears;
  }

  return {
    role: roleRaw as JobRole,
    experienceYears,
    limit: parseLimit(query.limit, roleRaw as JobRole),
  };
}

function parseLimit(value: unknown, role: JobRole): number {
  const raw = firstString(value)?.trim();

  if (!raw) {
    return DEFAULT_LIMIT_BY_ROLE[role];
  }

  if (!/^\d+$/.test(raw)) {
    throw new Error(`Invalid limit: must be an integer from 1 to ${MAX_LIMIT}`);
  }

  const limit = Number(raw);

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Error(`Invalid limit: must be an integer from 1 to ${MAX_LIMIT}`);
  }

  return limit;
}
