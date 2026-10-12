import * as cheerio from 'cheerio';
import { env } from '../config/env';
import { normalizeUrl } from '../utils/normalize-url';
import { compactText } from '../utils/text';
import { AgentReachRetrievalService, isAuthenticationUrl, isChallengePage, isLoginBackedSocialUrl, isUnavailableSourceContent } from './agent-reach-retrieval.service';
import type { SafeWebContent } from './safe-web-retrieval.service';

export interface EnrichableSource {
  url: string;
  title: string;
  summary?: string;
  body?: string;
  description?: string;
  sourceTextStatus?: 'full' | 'search-excerpt' | 'incomplete';
  retrievalBackend?: 'direct' | 'jina';
  discoveryChannel?: string;
  jobDetails?: { description?: string };
}

export interface SourceEnrichmentOptions {
  enabled: boolean;
  maxItems: number;
  concurrency: number;
  maxChars: number;
}

export function extractArticleText(content: SafeWebContent): string {
  if (content.contentType === 'text/plain') return isChallengePage('', content.text) ? '' : compactText(content.text);
  if (!['text/html', 'application/xhtml+xml'].includes(content.contentType)) return '';
  const $ = cheerio.load(content.text);
  if (isChallengePage($('title').text(), $('body').text())) return '';
  $('script,style,noscript,nav,header,footer,form,template,svg,aside,[hidden],[aria-hidden="true"]').remove();
  return compactText($('article').text()) || compactText($('main').text()) || compactText($('body').text());
}

function articleUrlKey(input: string): string {
  const url = new URL(normalizeUrl(input));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('unsafe-url');
  url.searchParams.sort();
  return `${url.hostname.replace(/^www\./u, '')}:${url.port}${url.pathname.replace(/\/+$/u, '')}${url.search}`;
}

function identifiesSourceArticle(source: EnrichableSource, content: SafeWebContent): boolean {
  try {
    if (articleUrlKey(source.url) === articleUrlKey(content.finalUrl)) return true;
    if (new URL(content.finalUrl).pathname.replace(/\/+$/u, '') === '') return false;
    if (!['text/html', 'application/xhtml+xml'].includes(content.contentType)) return false;
    const $ = cheerio.load(content.text);
    const article = $('article');
    if (article.length !== 1) return false;
    const heading = compactText(article.find('h1').first().text()).toLocaleLowerCase();
    return heading !== '' && heading === compactText(source.title).toLocaleLowerCase();
  } catch {
    return false;
  }
}

export class SourceContentEnrichmentService {
  constructor(
    private readonly retrieval?: { retrieve(url: string): Promise<SafeWebContent> },
    private readonly options: SourceEnrichmentOptions = {
      enabled: env.AGENT_REACH_ENABLED,
      maxItems: env.CRAWL_ENRICH_MAX_ITEMS,
      concurrency: env.CRAWL_ENRICH_CONCURRENCY,
      maxChars: 4000,
    },
  ) {}

  async enrich<T extends EnrichableSource>(sources: readonly T[]): Promise<T[]> {
    if (!this.options.enabled || this.options.maxItems === 0) return [...sources];
    const targets = new Map<string, EnrichableSource>();
    for (const source of sources) {
      if (!this.shouldRetrieve(source)) continue;
      const key = normalizeUrl(source.url);
      if (!targets.has(key) && targets.size < this.options.maxItems) targets.set(key, source);
    }
    const results = new Map<string, { text: string; backend?: 'direct' | 'jina' }>();
    const entries = [...targets];
    if (entries.length === 0) return [...sources];
    const retrieval = this.retrieval ?? new AgentReachRetrievalService();
    const concurrency = Math.max(1, this.options.concurrency);
    for (let index = 0; index < entries.length; index += concurrency) {
      await Promise.all(entries.slice(index, index + concurrency).map(async ([key, source]) => {
        try {
          const content = await retrieval.retrieve(source.url);
          if (isUnavailableSourceContent(content) || !identifiesSourceArticle(source, content)) return;
          const text = extractArticleText(content);
          if (text.length >= 80) results.set(key, { text, backend: content.retrievalBackend });
        } catch {
          // Optional enrichment must preserve the original excerpt and its status.
        }
      }));
    }
    return sources.map((source) => {
      if (!this.shouldRetrieve(source)) return source;
      const result = results.get(normalizeUrl(source.url));
      if (!result) return source;
      const text = result.text.slice(0, this.options.maxChars);
      return {
        ...source,
        ...('description' in source ? { description: text } : { summary: text }),
        ...('body' in source ? { body: text } : {}),
        ...(source.jobDetails ? { jobDetails: { ...source.jobDetails, description: text } } : {}),
        sourceTextStatus: result.text.length > this.options.maxChars ? 'incomplete' : 'full',
        ...(result.backend ? { retrievalBackend: result.backend } : {}),
      };
    });
  }

  private shouldRetrieve(source: EnrichableSource): boolean {
    if (source.sourceTextStatus === 'full' && (source.body || source.description || source.jobDetails?.description)) return false;
    if (source.retrievalBackend && source.jobDetails?.description) return false;
    if (['reddit', 'x', 'facebook', 'discord'].includes(source.discoveryChannel ?? '')
      || isLoginBackedSocialUrl(source.url) || isAuthenticationUrl(source.url)) return false;
    try {
      const url = new URL(source.url);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
        && url.hostname !== 'github.com' && !url.hostname.endsWith('.github.com');
    } catch {
      return false;
    }
  }
}
