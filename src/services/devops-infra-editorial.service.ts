import type { DevopsInfraCandidate } from '../types/devops-infra';
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
    for (const current of [this.generator, this.fallback]) {
      if (!current) continue;
      try {
        return validateDevopsInfraEditorial(await current.generate(candidate), candidate);
      } catch (error) {
        console.warn(
          'devops-infra editorial failed',
          error instanceof Error ? error.name : 'unknown',
        );
      }
    }
    return fallbackCopy;
  }
}
