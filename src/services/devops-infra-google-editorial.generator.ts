import type { DevopsInfraCandidate } from '../types/devops-infra';
import type {
  DevopsInfraEditorial,
  DevopsInfraEditorialGenerator,
} from './devops-infra-editorial.types';
import { deterministicDevopsInfraEditorial } from './devops-infra-editorial-validator';
import { GoogleTranslationService } from './google-translation.service';

interface DigestTranslator {
  translateDigestVerified(text: string): Promise<{ text: string; succeeded: boolean }>;
}

export class DevopsInfraGoogleEditorialGenerator
implements DevopsInfraEditorialGenerator {
  constructor(
    private readonly translator: DigestTranslator = new GoogleTranslationService(),
  ) {}

  async generate(candidate: DevopsInfraCandidate): Promise<DevopsInfraEditorial> {
    const fallback = deterministicDevopsInfraEditorial(candidate);
    const fields = [
      candidate.item.title,
      candidate.problem,
      ...(candidate.rootCause ? [candidate.rootCause] : []),
      ...candidate.solutionSteps,
    ];
    const translated = await Promise.all(
      fields.map((field) => this.translator.translateDigestVerified(field)),
    );
    if (translated.some((entry) => !entry.succeeded)) {
      throw new Error('Google translation failed');
    }
    const title = translated[0]?.text ?? fallback.title;
    const problem = translated[1]?.text ?? fallback.problem;
    let offset = 2;
    const rootCause = candidate.rootCause
      ? translated[offset++]?.text
      : undefined;
    return {
      title,
      problem,
      ...(rootCause ? { rootCause } : {}),
      solutionSteps: translated.slice(offset).map((entry) => entry.text),
      caution: fallback.caution,
    };
  }
}
