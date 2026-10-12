import axios from 'axios';
import { env } from '../config/env';

const MAX_BODY_BYTES = 512 * 1024;
const ALLOWED_HOSTS = new Set([
  'reddit.com',
  'www.reddit.com',
  'old.reddit.com',
  'oauth.reddit.com',
]);

export interface RedditHttpResponse {
  data: unknown;
  headers?: Readonly<Record<string, string | undefined>>;
  status?: number;
}

export interface RedditRequestConfig {
  headers: Record<string, string>;
  params?: Record<string, string | number>;
}

export interface RedditHttpClientLike {
  get(url: string, config: RedditRequestConfig): Promise<RedditHttpResponse>;
}

export class RedditApiBackend {
  constructor(
    private readonly accessToken: string = env.REDDIT_ACCESS_TOKEN,
    private readonly http: RedditHttpClientLike = axios.create(),
  ) {}

  isEnabled(): boolean {
    return (
      typeof this.accessToken === 'string' && this.accessToken.trim() !== ''
    );
  }

  async get(
    input: string,
    config: RedditRequestConfig,
  ): Promise<RedditHttpResponse> {
    try {
      if (!this.isEnabled()) throw new Error('reddit-api');
      const url = new URL(input);
      if (
        url.protocol !== 'https:' ||
        !ALLOWED_HOSTS.has(url.hostname) ||
        url.username ||
        url.password ||
        url.port
      ) {
        throw new Error('reddit-api');
      }
      url.hostname = 'oauth.reddit.com';
      url.hash = '';
      const request = {
        headers: {
          Accept: 'application/json',
          'User-Agent': config.headers['User-Agent'] ?? env.USER_AGENT,
          Authorization: `Bearer ${this.accessToken.trim()}`,
        },
        ...(config.params ? { params: config.params } : {}),
        timeout: env.REQUEST_TIMEOUT_MS,
        maxRedirects: 0,
        maxContentLength: MAX_BODY_BYTES,
        maxBodyLength: MAX_BODY_BYTES,
      };
      const response = await this.http.get(url.href, request);
      if (
        response.status !== undefined &&
        (response.status < 200 || response.status >= 300)
      ) {
        throw new Error('reddit-api');
      }
      return response;
    } catch {
      // Do not retain transport errors containing Authorization headers or private bodies.
      throw new Error('reddit-api');
    }
  }
}
