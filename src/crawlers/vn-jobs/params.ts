/**
 * Parse và validate query params cho POST /telegram/send-jobs.
 */
import type { ExperienceYears, JobRole } from './types';

const JOB_ROLES = new Set<JobRole>(['english-teacher', 'devops']);
const EXPERIENCE_YEARS = new Set<ExperienceYears>(['0', '1-2', '2-5', '3-5', '5+']);

export interface ParsedJobSendParams {
  role: JobRole;
  experienceYears?: ExperienceYears;
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
 * Đọc `role` (bắt buộc) và `experienceYears` (tuỳ chọn) từ query object.
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

  if (!experienceRaw) {
    return { role: roleRaw as JobRole };
  }

  if (!EXPERIENCE_YEARS.has(experienceRaw as ExperienceYears)) {
    throw new Error('Invalid experienceYears: must be 0, 1-2, 2-5, 3-5, or 5+');
  }

  return {
    role: roleRaw as JobRole,
    experienceYears: experienceRaw as ExperienceYears,
  };
}
