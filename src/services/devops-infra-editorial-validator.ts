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
const VARIABLE_SUBSTITUTION = /\$\{([^}\r\n]+)\}/gu;
const TOKEN = /[A-Za-z][A-Za-z0-9_.-]{2,}/gu;
const KNOWN_BINARY =
  /\b(?:kubectl|terraform|systemctl|helm|docker|podman|ansible|gcloud|aws|az|rm|mkfs|curl|wget|sudo|reboot|bash|sh|zsh|apt|yum|dnf|chmod|chown|kill|pkill|nsenter|iptables|ip|ssh|scp|rsync|python|python3|node|npm|go|make|cargo|git)\b/giu;
const SHELL_COMMAND =
  /\b(?:curl|wget)\b[^;\r\n]*|\b[A-Za-z][A-Za-z0-9_./-]{1,}(?:\s+[^|;\r\n]+)?\s*\|\s*(?:bash|sh)\b[^;\r\n]*/gu;
const FLAGGED_COMMAND =
  /(?:^|[;&]\s*)([^.!?;\r\n]*\s--?[A-Za-z0-9][A-Za-z0-9_-]*(?:[=\s][^;&\r\n]+)?)/gu;
const PATH_LIKE = /(?:^|\s)((?:\.\/|~\/|\/)[^\s`'"]+|[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+)/gu;
const COMMAND_WORD = /^[A-Za-z][A-Za-z0-9_.-]*$/u;
const TECH_TOKEN_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'when', 'then',
  'still', 'after', 'before', 'using', 'apply', 'restart', 'service',
  'deployment', 'pod', 'node', 'error', 'issue', 'fix', 'run', 'logs', 'log',
  'inspect', 'missing', 'returns', 'return', 'enters', 'restarts',
  'continuously', 'proxy', 'deploy', 'cách', 'bài', 'toán',
]);

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

function knownCommandPhrases(step: string): string[] {
  const phrases: string[] = [];
  for (const match of step.matchAll(KNOWN_BINARY)) {
    const binary = match[0];
    const start = match.index ?? 0;
    const tail = step.slice(start).split(/\s+/u);
    const words = [binary];
    const wordLimit = 3;
    for (const part of tail.slice(1)) {
      const word = part.replace(/[.,:!?]+$/gu, '');
      if (!COMMAND_WORD.test(word) || words.length >= wordLimit) break;
      words.push(word);
    }
    phrases.push(words.join(' '));
  }
  return phrases;
}

function hasInventedCommand(step: string, corpus: string): boolean {
  const normalizedCorpus = normalizeCommand(corpus);
  const knownCommands = knownCommandPhrases(step);
  const commands = [
    ...[...step.matchAll(BACKTICK_SPAN)].map((match) => match[1] ?? ''),
    ...[...step.matchAll(COMMAND_SUBSTITUTION)].map((match) => match[1] ?? ''),
    ...[...step.matchAll(VARIABLE_SUBSTITUTION)].map((match) => match[1] ?? ''),
    ...(step.match(SHELL_COMMAND) ?? []),
    ...knownCommands,
    ...[...step.matchAll(FLAGGED_COMMAND)]
      .map((match) => match[1] ?? '')
      .filter((command) => /(?:^|\s)--?[A-Za-z0-9]/u.test(command)),
    ...(knownCommands.length === 0
      ? [...step.matchAll(PATH_LIKE)].map((match) => match[1] ?? '')
      : []),
  ];
  return commands.some((command) => {
    const normalized = normalizeCommand(command);
    return normalized.length > 0 && !normalizedCorpus.includes(normalized);
  });
}

function technicalTokens(value: string): Set<string> {
  const tokens = new Set<string>();
  for (const span of value.matchAll(BACKTICK_SPAN)) {
    if (span[1] && !TECH_TOKEN_STOPWORDS.has(span[1].toLowerCase())) {
      tokens.add(span[1]);
    }
  }
  for (const token of value.match(TOKEN) ?? []) {
    const stopwordForm = token.toLowerCase().replace(/^[_.-]+|[_.-]+$/gu, '');
    if (!TECH_TOKEN_STOPWORDS.has(stopwordForm)) tokens.add(token);
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

function appendMissingTokens(problem: string, missing: Set<string>): string {
  if (missing.size === 0) return problem;
  const suffix = ` ${[...missing].join(' ')}`;
  const baseBound = Math.max(0, PROBLEM_BOUND - suffix.length);
  return `${truncateUtf16(problem, baseBound)}${truncateUtf16(suffix, PROBLEM_BOUND)}`;
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
  let missing = missingTokens(`${problem}\n${solutionSteps.join('\n')}`, corpus);
  if (containsAnyToken(fallback.problem, missing)) {
    problem = fallback.problem;
    missing = missingTokens(`${problem}\n${solutionSteps.join('\n')}`, corpus);
  }
  if (containsAnyToken(fallback.solutionSteps.join('\n'), missing)) {
    solutionSteps = fallback.solutionSteps;
    missing = missingTokens(`${problem}\n${solutionSteps.join('\n')}`, corpus);
  }
  problem = appendMissingTokens(problem, missing);
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
