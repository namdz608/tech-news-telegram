import { env } from '../config/env';
import type { DevopsInfraCandidate } from '../types/devops-infra';
import { CodexExecRunner, type CodexRunner } from './codex-exec.runner';
import {
  devopsInfraEditorialInstructions,
  devopsInfraEditorialPayload,
  parseDevopsInfraEditorial,
  type DevopsInfraEditorial,
  type DevopsInfraEditorialGenerator,
} from './devops-infra-editorial.types';

export class DevopsInfraCodexEditorialGenerator
implements DevopsInfraEditorialGenerator {
  constructor(
    private readonly runner: CodexRunner = new CodexExecRunner(),
    private readonly timeoutMs = env.CODEX_TRANSLATION_TIMEOUT_MS,
  ) {}

  async generate(candidate: DevopsInfraCandidate): Promise<DevopsInfraEditorial> {
    const output = await this.runner.run(
      devopsInfraEditorialInstructions,
      JSON.stringify(devopsInfraEditorialPayload(candidate)),
      this.timeoutMs,
    );
    return parseDevopsInfraEditorial(output);
  }
}
