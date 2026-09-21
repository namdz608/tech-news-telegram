import type { DevopsInfraCandidate } from '../types/devops-infra';

export const devopsInfraEditorialInstructions = [
  'Edit this infrastructure forum thread into Vietnamese.',
  'Return only a JSON object with keys title, problem, rootCause, solutionSteps, caution.',
  'solutionSteps must be a JSON array of strings. rootCause may be null.',
  'Do not invent commands, flags, file paths, IPs, or root causes absent from the input.',
  'Keep technical tokens unchanged (CrashLoopBackOff, IAM, kubectl, terraform, systemctl, CVE IDs).',
  'A forum thread is not an official runbook.',
  'Do not wrap the JSON object in Markdown fences and do not add explanation.',
].join('\n');

export interface DevopsInfraEditorial {
  title: string;
  problem: string;
  rootCause?: string;
  solutionSteps: string[];
  caution: string;
}

export interface DevopsInfraEditorialGenerator {
  generate(candidate: DevopsInfraCandidate): Promise<DevopsInfraEditorial>;
}

export function devopsInfraEditorialPayload(candidate: DevopsInfraCandidate): {
  title: string;
  body: string;
  answers: DevopsInfraCandidate['item']['answers'];
  problem: string;
  rootCause: string | undefined;
  solutionSteps: DevopsInfraCandidate['solutionSteps'];
  kind: DevopsInfraCandidate['kind'];
} {
  return {
    title: candidate.item.title,
    body: candidate.item.body,
    answers: candidate.item.answers,
    problem: candidate.problem,
    rootCause: candidate.rootCause,
    solutionSteps: candidate.solutionSteps,
    kind: candidate.kind,
  };
}

function sliceBalancedObject(value: string, start: number): string | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === '\\') {
        escaped = true;
        continue;
      }
      if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return value.slice(start, index + 1);
    }
  }
  return undefined;
}

function extractJsonObject(raw: string): string {
  const stripped = raw.trim().replace(/^```(?:json)?\s*|\s*```$/giu, '');
  for (let index = 0; index < stripped.length; index += 1) {
    if (stripped[index] !== '{') continue;
    const candidate = sliceBalancedObject(stripped, index);
    if (!candidate) continue;
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return candidate;
      }
    } catch {
      continue;
    }
  }
  return stripped;
}

export function parseDevopsInfraEditorial(value: string): DevopsInfraEditorial {
  const parsed: unknown = JSON.parse(extractJsonObject(value));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('Invalid devops-infra editorial');
  }
  const record = parsed as Record<string, unknown>;
  if (
    typeof record.title !== 'string'
    || typeof record.problem !== 'string'
    || !Array.isArray(record.solutionSteps)
    || !record.solutionSteps.every((step) => typeof step === 'string')
    || typeof record.caution !== 'string'
  ) {
    throw new TypeError('Incomplete devops-infra editorial');
  }
  if (
    record.rootCause !== undefined
    && record.rootCause !== null
    && typeof record.rootCause !== 'string'
  ) {
    throw new TypeError('Invalid devops-infra root cause');
  }
  return {
    title: record.title,
    problem: record.problem,
    ...(typeof record.rootCause === 'string' ? { rootCause: record.rootCause } : {}),
    solutionSteps: record.solutionSteps as string[],
    caution: record.caution,
  };
}
