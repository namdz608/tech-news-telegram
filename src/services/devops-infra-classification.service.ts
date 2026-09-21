import {
  devopsInfraCategoryKeywords,
  devopsInfraCloudEnvironmentKeywords,
  devopsInfraIncidentKeywords,
  devopsInfraOnpremEnvironmentKeywords,
} from "../config/devops-infra-topics";
import type {
  DevopsDiscoveryChannel,
  DevopsEnvironment,
  DevopsInfraAnswer,
  DevopsInfraCandidate,
  DevopsInfraCategory,
  DevopsInfraSourceItem,
  IncidentVerification,
  SolutionConfidence,
} from "../types/devops-infra";
import { compactText } from "../utils/text";

const categories = Object.keys(
  devopsInfraCategoryKeywords,
) as DevopsInfraCategory[];

const advertisementPattern =
  /\b(?:50%\s*off|buy now|free trial|limited[- ]time offer|special offer|discount|sponsored)\b/i;
const launchPattern =
  /\b(?:launch(?:ing|ed)?|announc(?:e|es|ed|ing)|introduc(?:e|es|ed|ing)|new product|now available)\b/i;
const failurePattern =
  /\b(?:fail(?:ure|ed|ing|s)?|error|outage|incident|down|unavailable|broken|crash|crashloopbackoff|oomkilled|imagepullbackoff|timeout|degraded|restart(?:ing|s|ed)?|accessdenied|cve)\b/i;
const fixPattern =
  /\b(?:fix(?:ed)? by|solution\s*:|resolved by|workaround\s*:|to fix|recovered (?:after|by))\b/i;
const commandOrConfigPattern =
  /`[^`]+`|\b(?:kubectl|helm|docker|systemctl|terraform|ansible|sudo|set|add|remove|edit|update|configure|config(?:uration)?|yaml|yml)\b/i;
const MAX_PROBLEM_SENTENCES = 2;
const MAX_SOLUTION_STEPS = 5;

function includesKeyword(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`,
    "iu",
  ).test(text);
}

function countHits(text: string, keywords: readonly string[]): number {
  return keywords.reduce(
    (count, keyword) => count + Number(includesKeyword(text, keyword)),
    0,
  );
}

function categoryFor(
  title: string,
  body: string,
): DevopsInfraCategory | undefined {
  let selected: DevopsInfraCategory | undefined;
  let highestScore = 0;

  for (const category of categories) {
    const keywords = devopsInfraCategoryKeywords[category];
    const score = countHits(title, keywords) * 3 + countHits(body, keywords);
    if (score > highestScore) {
      selected = category;
      highestScore = score;
    }
  }

  return selected;
}

function environmentFor(text: string): DevopsEnvironment {
  const cloud = countHits(text, devopsInfraCloudEnvironmentKeywords) > 0;
  const onprem = countHits(text, devopsInfraOnpremEnvironmentKeywords) > 0;
  if (cloud && onprem) return "hybrid";
  if (cloud) return "cloud";
  if (onprem) return "onprem";
  return "unknown";
}

function answerConfidence(
  answers: readonly DevopsInfraAnswer[],
  sourceText: string,
  channel: DevopsDiscoveryChannel,
): SolutionConfidence {
  if (answers.some((answer) => answer.accepted)) return "accepted";
  if (answers.some((answer) => answer.authorConfirmed))
    return "author-confirmed";

  const scored = answers
    .map((answer) => answer.score ?? 0)
    .sort((left, right) => right - left);
  if (
    scored.length > 0 &&
    scored[0] >= 2 &&
    (scored.length === 1 || scored[0] > scored[1])
  ) {
    return "highly-voted";
  }

  if (
    answers.some((answer) => commandOrConfigPattern.test(answer.body)) ||
    fixPattern.test(sourceText)
  ) {
    return "anecdotal";
  }
  if (
    (channel === "hn" || channel === "stackexchange" || channel === "reddit") &&
    answers.some((answer) => compactText(answer.body).length > 0)
  ) {
    return "anecdotal";
  }
  return "none";
}

function tagSearchText(tags: readonly string[] | undefined): string {
  if (!tags?.length) return "";
  return tags
    .flatMap((tag) => {
      const spaced = tag.replace(/-/g, " ").trim();
      return spaced && spaced !== tag ? [tag, spaced] : [tag];
    })
    .join(" ");
}

function openingSentences(text: string, max: number): string {
  const sentences = compactText(text)
    .split(/(?<=[.!?])(?:\s+|$)/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.slice(0, max).join(" ");
}

function problemFor(title: string, body: string): string {
  const opening = openingSentences(body, MAX_PROBLEM_SENTENCES);
  return opening ? `${title.trim()}: ${opening}` : title.trim();
}

function splitSteps(text: string): string[] {
  return compactText(text)
    .split(/\n+|(?<=[.!?])\s+/u)
    .map((step) => step.trim())
    .filter(Boolean);
}

function solutionStepsFor(
  answers: readonly DevopsInfraAnswer[],
  body: string,
): readonly string[] {
  const answerSteps = answers
    .filter(
      (answer) =>
        answer.accepted ||
        answer.authorConfirmed ||
        (answer.score ?? 0) >= 2 ||
        commandOrConfigPattern.test(answer.body),
    )
    .flatMap((answer) => splitSteps(answer.body))
    .slice(0, MAX_SOLUTION_STEPS);
  if (answerSteps.length > 0) return answerSteps;

  const answeredSteps = answers
    .map((answer) => compactText(answer.body))
    .filter(Boolean)
    .flatMap((text) => splitSteps(text))
    .slice(0, MAX_SOLUTION_STEPS);
  if (answeredSteps.length > 0) return answeredSteps;

  if (!fixPattern.test(body)) return [];
  const matchingSentence = splitSteps(body)
    .find((sentence) => fixPattern.test(sentence));
  return matchingSentence ? [matchingSentence] : [];
}

function rootCauseFor(
  bodies: readonly string[],
  answers: readonly DevopsInfraAnswer[],
): string | undefined {
  for (const source of [...bodies, ...answers.map((answer) => answer.body)]) {
    const match =
      /\b(?:caused by|root cause(?:\s+(?:was|is))?\s*:?\s*|nguyên nhân(?:\s+là)?\s*:?\s*)([^.!?\n;]+)/i.exec(
        source,
      );
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return undefined;
}

function verificationFor(item: DevopsInfraSourceItem): IncidentVerification {
  if (
    /status\.aws\.amazon\.com|official advisory|\bCVE-\d{4}-\d+/i.test(item.body)
  ) {
    return "confirmed";
  }
  if (
    ["x", "facebook", "discord", "telegram"].includes(item.discoveryChannel) &&
    /\b(?:rumou?r|unconfirmed|chatter|allegedly)\b/i.test(
      `${item.summary} ${item.body}`,
    )
  ) {
    return "unverified";
  }
  return "reported";
}

function fingerprintFor(title: string, problem: string): string {
  const words = `${title} ${problem}`
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/[\p{L}\p{N}]+/gu)
    ?.slice(0, 12);
  return (words ?? []).join("").replace(/[^a-z0-9]/g, "");
}

export function classifyDevopsInfraItem(
  item: DevopsInfraSourceItem,
): DevopsInfraCandidate | undefined {
  const sourceBody = [
    item.summary,
    item.body,
    tagSearchText(item.topicTags),
  ].filter(Boolean).join(" ");
  const fullText = `${item.title} ${sourceBody}`;

  if (advertisementPattern.test(fullText)) return undefined;
  if (launchPattern.test(fullText) && !failurePattern.test(fullText))
    return undefined;

  const category = categoryFor(item.title, sourceBody);
  if (!category) return undefined;

  const incident = devopsInfraIncidentKeywords.some((keyword) =>
    includesKeyword(fullText, keyword),
  );
  const confidence = answerConfidence(
    item.answers,
    sourceBody,
    item.discoveryChannel,
  );
  if (!incident && confidence === "none") return undefined;

  const problem = problemFor(item.title, sourceBody);
  const fingerprint = fingerprintFor(item.title, problem);
  if (fingerprint.length < 8) return undefined;

  const rootCause = rootCauseFor(
    item.body ? [item.body] : [],
    item.answers,
  );
  const environment = environmentFor(fullText);
  const kind = incident ? "incident" : "problem-solution";

  return {
    item,
    kind,
    category,
    environment,
    problem,
    ...(rootCause ? { rootCause } : {}),
    solutionSteps: solutionStepsFor(item.answers, sourceBody),
    solutionConfidence: confidence,
    ...(incident ? { verification: verificationFor(item) } : {}),
    fingerprint,
    score: 0,
    scoreReasons: [
      `kind:${kind}`,
      `category:${category}`,
      `solution:${confidence}`,
    ],
  };
}
