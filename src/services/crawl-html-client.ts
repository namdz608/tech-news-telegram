import { env } from '../config/env';
import { JinaReaderService, isAuthenticationContent, isAuthenticationUrl, isBotChallengeContent, isLoginBackedSocialUrl } from './agent-reach-retrieval.service';
import { isPublicHttpUrl } from './safe-web-retrieval.service';

interface RawHttpResult {
  data: unknown;
  headers: Readonly<Record<string, string | undefined>>;
  status?: number;
  retrievalBackend?: 'direct' | 'jina';
}

export class CrawlHtmlClient {
  constructor(
    private readonly direct: { get(url: string): Promise<RawHttpResult> },
    private readonly reader?: Pick<JinaReaderService, 'retrieve'>,
    private readonly enabled = env.AGENT_REACH_ENABLED && env.JINA_READER_ENABLED,
  ) {}

  async get(url: string): Promise<RawHttpResult> {
    let nativeResponse: RawHttpResult | undefined;
    try {
      const response = await this.direct.get(url);
      nativeResponse = response;
      const contentType = Object.entries(response.headers).find(([name]) => name.toLowerCase() === 'content-type')?.[1]?.split(';', 1)[0].trim().toLowerCase();
      if (typeof response.data === 'string' && ['text/html', 'application/xhtml+xml'].includes(contentType ?? '')) {
        const content = { finalUrl: url, contentType: contentType!, text: response.data };
        if (isBotChallengeContent(content)) throw new Error('bot-challenge');
        if (isAuthenticationContent(content)) return response;
      }
      if (response.status !== undefined && response.status >= 400) throw new Error('crawl-http');
      return response;
    } catch (error) {
      if (!this.enabled || !isPublicHttpUrl(url) || isLoginBackedSocialUrl(url) || isAuthenticationUrl(url)
        || /\.(?:json|xml|rss)(?:\?|$)|\/(?:api|rss|feed)(?:[/?]|$)/iu.test(new URL(url).pathname)) {
        if (nativeResponse) return nativeResponse;
        throw error;
      }
      try {
        const content = await (this.reader ?? new JinaReaderService()).retrieve(url, 'html');
        // eslint-disable-next-line preserve-caught-error -- keep upstream transport details out of parser errors
        if (content.contentType !== 'text/html') throw new Error('crawl-html');
        return { data: content.text, headers: { 'content-type': 'text/html' }, status: 200, retrievalBackend: 'jina' };
      } catch (readerError) {
        // Preserve native status/body so existing parsers can use their own fallback.
        if (nativeResponse) return nativeResponse;
        throw readerError;
      }
    }
  }
}
