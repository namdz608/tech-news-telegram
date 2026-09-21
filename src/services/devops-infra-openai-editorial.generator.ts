import OpenAI from 'openai';
import { env } from '../config/env';
import type { DevopsInfraCandidate } from '../types/devops-infra';
import {
  devopsInfraEditorialInstructions,
  devopsInfraEditorialPayload,
  parseDevopsInfraEditorial,
  type DevopsInfraEditorial,
  type DevopsInfraEditorialGenerator,
} from './devops-infra-editorial.types';

interface OpenAIResponseClientLike {
  responses: {
    create(input: {
      model: string;
      instructions: string;
      input: string;
    }): Promise<{ output_text?: string }>;
  };
}

export class DevopsInfraOpenAIEditorialGenerator
implements DevopsInfraEditorialGenerator {
  constructor(
    private readonly client: OpenAIResponseClientLike = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    }) as OpenAIResponseClientLike,
    private readonly model = env.OPENAI_MODEL,
  ) {}

  async generate(candidate: DevopsInfraCandidate): Promise<DevopsInfraEditorial> {
    const response = await this.client.responses.create({
      model: this.model,
      instructions: devopsInfraEditorialInstructions,
      input: JSON.stringify(devopsInfraEditorialPayload(candidate)),
    });
    return parseDevopsInfraEditorial(response.output_text?.trim() ?? '');
  }
}
