import type { DevopsInfraCandidate } from '../types/devops-infra';
import { compactText } from '../utils/text';
import type { DevopsInfraEditorial } from './devops-infra-editorial.types';

const TITLE_BOUND = 240;
const PROBLEM_BOUND = 720;
const STEP_BOUND = 280;
const CAUTION_BOUND = 360;
const BASE_CAUTION = 'Một thread diễn đàn không phải runbook chính thức.';
const DESTRUCTIVE_CAUTION =
  'Lệnh trong thread có thể phá hủy dữ liệu; kiểm tra trên môi trường của bạn.';
const DESTRUCTIVE_COMMAND =
  /rm\s+-rf|mkfs|drop\s+database|disable.*auth|kubectl\s+delete/iu;
const JAVASCRIPT_SCHEME = /javascript\s*:/iu;
const BACKTICK_SPAN = /`([^`\r\n]+)`/gu;
const COMMAND_SUBSTITUTION = /\$\(([^)\r\n]+)\)/gu;
const TOKEN = /[A-Za-z][A-Za-z0-9_.-]{2,}/gu;
const COMMAND =
  /\b(?:kubectl|terraform|systemctl|helm|docker|podman|ansible|gcloud|aws|az|rm|mkfs)\b[^.!?;\r\n]*/giu;
const SHELL_COMMAND =
  /\b(?:curl|wget)\b[^;\r\n]*|\b[A-Za-z][A-Za-z0-9_./-]{1,}(?:\s+[^|;\r\n]+)?\s*\|\s*(?:bash|sh)\b[^;\r\n]*/gu;
const FLAGGED_COMMAND =
  /(?:^|[;&]\s*)([A-Za-z][A-Za-z0-9_./-]{1,}(?:\s+--?[A-Za-z0-9][A-Za-z0-9_-]*(?:[=\s][^;&\r\n]+)?)?)/gu;

export function truncateUtf16(value: string, max: number): string {
  if (max <= 0) return '';
  if (value.length <= max) return value;
  let end = max;
  const last = value.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return value.slice(0, end);
}

function sourceCorpus(candidate: DevopsInfraCandidate): string {
  return [
    candidate.item.title,
    candidate.item.body,
    ...candidate.item.answers.map((answer) => answer.body),
    candidate.problem,
    ...candidate.solutionSteps,
  ].join('\n');
}

function safe(value: unknown): value is string {
  return typeof value === 'string'
    && compactText(value).length > 0
    && !JAVASCRIPT_SCHEME.test(value);
}

function normalizeCommand(value: string): string {
  return compactText(value)
    .replace(/^[`'"]+|[`'",:]+$/gu, '');
}

function hasInventedCommand(step: string, corpus: string): boolean {
  const normalizedCorpus = normalizeCommand(corpus);
  const commands = [
    ...[...step.matchAll(BACKTICK_SPAN)].map((match) => match[1] ?? ''),
    ...[...step.matchAll(COMMAND_SUBSTITUTION)].map((match) => match[1] ?? ''),
    ...(step.match(COMMAND) ?? []),
    ...(step.match(SHELL_COMMAND) ?? []),
    ...[...step.matchAll(FLAGGED_COMMAND)]
      .map((match) => match[1] ?? '')
      .filter((command) => /(?:^|\s)--?[A-Za-z0-9]/u.test(command)),
  ];
  return commands.some((command) => {
    const normalized = normalizeCommand(command);
    return normalized.length > 0 && !normalizedCorpus.includes(normalized);
  });
}

function technicalTokens(value: string): Set<string> {
  const tokens = new Set<string>();
  for (const span of value.matchAll(BACKTICK_SPAN)) {
    if (span[1]) tokens.add(span[1]);
  }
  for (const token of value.match(TOKEN) ?? []) {
    tokens.add(token);
  }
  return tokens;
}

function missingTokens(generated: string, source: string): Set<string> {
  return new Set(
    [...technicalTokens(source)].filter((token) => !generated.includes(token)),
  );
}

function containsAnyToken(value: string, tokens: Set<string>): boolean {
  return [...tokens].some((token) => value.includes(token));
}

export function deterministicDevopsInfraEditorial(
  candidate: DevopsInfraCandidate,
): DevopsInfraEditorial {
  const corpus = sourceCorpus(candidate);
  const solutionSteps = candidate.solutionSteps.length > 0
    ? candidate.solutionSteps.map((step) => truncateUtf16(compactText(step), STEP_BOUND))
    : ['Thread mô tả một cách khắc phục; xem nội dung gốc.'];
  const caution = DESTRUCTIVE_COMMAND.test(corpus)
    ? `${BASE_CAUTION} ${DESTRUCTIVE_CAUTION}`
    : BASE_CAUTION;
  return {
    title: truncateUtf16(compactText(candidate.item.title), TITLE_BOUND),
    problem: truncateUtf16(compactText(candidate.problem), PROBLEM_BOUND),
    ...(candidate.rootCause
      ? { rootCause: truncateUtf16(compactText(candidate.rootCause), PROBLEM_BOUND) }
      : {}),
    solutionSteps,
    caution: truncateUtf16(caution, CAUTION_BOUND),
  };
}

export function validateDevopsInfraEditorial(
  editorial: DevopsInfraEditorial,
  candidate: DevopsInfraCandidate,
): DevopsInfraEditorial {
  const fallback = deterministicDevopsInfraEditorial(candidate);
  const corpus = sourceCorpus(candidate);
  const title = safe(editorial.title) ? compactText(editorial.title) : fallback.title;
  const generatedProblem = safe(editorial.problem) ? compactText(editorial.problem) : '';
  let problem = generatedProblem || fallback.problem;
  const generatedSteps = Array.isArray(editorial.solutionSteps)
    ? editorial.solutionSteps
      .filter(safe)
      .map(compactText)
      .filter((step) => !hasInventedCommand(step, corpus))
    : [];
  let solutionSteps = generatedSteps.length > 0
    ? generatedSteps
    : fallback.solutionSteps;
  const missing = missingTokens(`${problem}\n${solutionSteps.join('\n')}`, corpus);
  if (containsAnyToken(fallback.problem, missing)) {
    problem = fallback.problem;
  }
  if (containsAnyToken(fallback.solutionSteps.join('\n'), missing)) {
    solutionSteps = fallback.solutionSteps;
  }
  const caution = safe(editorial.caution) ? compactText(editorial.caution) : fallback.caution;

  return {
    title: truncateUtf16(title, TITLE_BOUND),
    problem: truncateUtf16(problem, PROBLEM_BOUND),
    ...(candidate.rootCause && safe(editorial.rootCause)
      ? { rootCause: truncateUtf16(compactText(editorial.rootCause), PROBLEM_BOUND) }
      : candidate.rootCause
        ? { rootCause: fallback.rootCause as string }
        : {}),
    solutionSteps: solutionSteps.map((step) => truncateUtf16(step, STEP_BOUND)),
    caution: truncateUtf16(caution, CAUTION_BOUND),
  };
}
