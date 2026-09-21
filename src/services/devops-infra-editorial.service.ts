import type { DevopsInfraCandidate } from '../types/devops-infra';
import { hasVietnameseText } from './article-editorial.service';
import type {
  DevopsInfraEditorial,
  DevopsInfraEditorialGenerator,
} from './devops-infra-editorial.types';
import {
  deterministicDevopsInfraEditorial,
  validateDevopsInfraEditorial,
} from './devops-infra-editorial-validator';

export class DevopsInfraEditorialService {
  constructor(
    private readonly generator?: DevopsInfraEditorialGenerator,
    private readonly fallback?: DevopsInfraEditorialGenerator,
  ) {}

  async edit(candidate: DevopsInfraCandidate): Promise<DevopsInfraEditorial> {
    const fallbackCopy = deterministicDevopsInfraEditorial(candidate);
    let bestVietnamese: DevopsInfraEditorial | undefined;
    for (const current of [this.generator, this.fallback]) {
      if (!current) continue;
      try {
        const generated = await current.generate(candidate);
        const validated = validateDevopsInfraEditorial(generated, candidate);
        const droppedEnglishSteps = validated.solutionSteps.some(isEnglishProse);
        const editorial = keepVietnameseFields(validated, fallbackCopy);
        if (
          !hasVietnameseText(editorial.title)
          || !hasVietnameseText(editorial.problem)
        ) {
          throw new Error('Editorial response is not Vietnamese');
        }
        bestVietnamese = editorial;
        if (!droppedEnglishSteps) {
          return editorial;
        }
      } catch (error) {
        console.warn(
          'devops-infra editorial failed',
          error instanceof Error ? error.name : 'unknown',
        );
      }
    }
    return bestVietnamese ?? fallbackCopy;
  }
}

const LATIN_WORD = /\b[A-Za-z]{3,}\b/gu;
const TECH_STEP =
  /\b(?:kubectl|terraform|helm|docker|systemctl|ansible|sudo|aws|gcloud|az|nginx)\b/iu;

function keepVietnameseFields(
  editorial: DevopsInfraEditorial,
  fallback: DevopsInfraEditorial,
): DevopsInfraEditorial {
  const { rootCause: generatedRootCause, ...rest } = editorial;
  const rootCause = generatedRootCause && hasVietnameseText(generatedRootCause)
    ? generatedRootCause
    : undefined;
  const keptSteps = editorial.solutionSteps.filter((step) => !isEnglishProse(step));
  return {
    ...rest,
    ...(rootCause ? { rootCause } : {}),
    solutionSteps: keptSteps.length > 0 ? keptSteps : fallback.solutionSteps,
  };
}

function isEnglishProse(text: string): boolean {
  if (hasVietnameseText(text)) return false;
  const words = text.match(LATIN_WORD) ?? [];
  if (TECH_STEP.test(text) && words.length < 8) return false;
  return words.length >= 8;
}
