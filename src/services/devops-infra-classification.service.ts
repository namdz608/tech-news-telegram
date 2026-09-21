import {
  devopsInfraCategoryKeywords,
  devopsInfraCloudEnvironmentKeywords,
  devopsInfraIncidentKeywords,
  devopsInfraOnpremEnvironmentKeywords,
} from "../config/devops-infra-topics";
import type {
  DevopsEnvironment,
  DevopsInfraAnswer,
  DevopsInfraCandidate,
  DevopsInfraCategory,
  DevopsInfraSourceItem,
  IncidentVerification,
  SolutionConfidence,
} from "../types/devops-infra";

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
  return "none";
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
    .map((answer) => answer.body.trim())
    .filter(Boolean);
  if (answerSteps.length > 0) return answerSteps;

  if (!fixPattern.test(body)) return [];
  const matchingSentence = body
    .split(/(?<=[.!?])\s+/)
    .find((sentence) => fixPattern.test(sentence));
  return matchingSentence ? [matchingSentence.trim()] : [];
}

function rootCauseFor(
  body: string,
  answers: readonly DevopsInfraAnswer[],
): string | undefined {
  const source = [body, ...answers.map((answer) => answer.body)].join(" ");
  const match =
    /\b(?:caused by|root cause(?:\s+(?:was|is))?\s*:?\s*|nguyên nhân(?:\s+là)?\s*:?\s*)([^.!?\n;]+)/i.exec(
      source,
    );
  return match?.[1]?.trim() || undefined;
}

function verificationFor(
  item: DevopsInfraSourceItem,
  text: string,
): IncidentVerification {
  if (
    /status\.aws\.amazon\.com|official advisory|\bCVE-\d{4}-\d+/i.test(text)
  ) {
    return "confirmed";
  }
  if (
    ["x", "facebook", "discord", "telegram"].includes(item.discoveryChannel) &&
    /\b(?:rumou?r|unconfirmed|chatter|allegedly)\b/i.test(text)
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
  const sourceBody = [item.summary, item.body].filter(Boolean).join(" ");
  const fullText = `${item.title} ${sourceBody}`;

  if (advertisementPattern.test(fullText)) return undefined;
  if (launchPattern.test(fullText) && !failurePattern.test(fullText))
    return undefined;

  const category = categoryFor(item.title, sourceBody);
  if (!category) return undefined;

  const incident = devopsInfraIncidentKeywords.some((keyword) =>
    includesKeyword(fullText, keyword),
  );
  const confidence = answerConfidence(item.answers, sourceBody);
  if (!incident && confidence === "none") return undefined;

  const problem = sourceBody
    ? `${item.title}: ${sourceBody}`.trim()
    : item.title.trim();
  const fingerprint = fingerprintFor(item.title, problem);
  if (fingerprint.length < 8) return undefined;

  const rootCause = rootCauseFor(sourceBody, item.answers);
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
    ...(incident ? { verification: verificationFor(item, fullText) } : {}),
    fingerprint,
    score: 0,
    scoreReasons: [
      `kind:${kind}`,
      `category:${category}`,
      `solution:${confidence}`,
    ],
  };
}
