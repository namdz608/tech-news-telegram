import type { DevopsInfraCandidate } from '../types/devops-infra';
import {
  devopsInfraEditorialInstructions,
  devopsInfraEditorialPayload,
  parseDevopsInfraEditorial,
  type DevopsInfraEditorial,
  type DevopsInfraEditorialGenerator,
} from './devops-infra-editorial.types';
import { GoogleTranslationService } from './google-translation.service';

interface DigestTranslator {
  translateDigest(text: string): Promise<string>;
}

export class DevopsInfraGoogleEditorialGenerator
implements DevopsInfraEditorialGenerator {
  constructor(
    private readonly translator: DigestTranslator = new GoogleTranslationService(),
  ) {}

  async generate(candidate: DevopsInfraCandidate): Promise<DevopsInfraEditorial> {
    const output = await this.translator.translateDigest(
      `${devopsInfraEditorialInstructions}\n${JSON.stringify(
        devopsInfraEditorialPayload(candidate),
      )}`,
    );
    return parseDevopsInfraEditorial(output);
  }
}
