import { env } from '../config/env';
import { BraveWebSearchProvider } from './brave-web-search.provider';
import { ExaWebSearchProvider } from './exa-web-search.provider';
import { FallbackWebSearchProvider } from './fallback-web-search.provider';
import { AgentReachRetrievalService } from './agent-reach-retrieval.service';
import { SafeWebRetrievalService } from './safe-web-retrieval.service';
import type { WebSearchProvider } from './web-search.provider';

export function createCrawlWebSearch(options = {
  enabled: env.AGENT_REACH_ENABLED, braveKey: env.BRAVE_SEARCH_API_KEY, exaKey: env.EXA_API_KEY,
}): WebSearchProvider {
  const brave = new BraveWebSearchProvider(options.braveKey);
  return options.enabled ? new FallbackWebSearchProvider([brave, new ExaWebSearchProvider(options.exaKey)]) : brave;
}

export function createCrawlWebRetrieval(enabled = env.AGENT_REACH_ENABLED): Pick<SafeWebRetrievalService, 'retrieve'> {
  return enabled ? new AgentReachRetrievalService() : new SafeWebRetrievalService();
}
