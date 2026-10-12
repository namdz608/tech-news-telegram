import axios from 'axios';
import * as cheerio from 'cheerio';
import { env } from '../config/env';
import { normalizeUrl } from '../utils/normalize-url';
import { SafeWebRetrievalService, type SafeWebContent } from './safe-web-retrieval.service';

const MAX_BYTES = 512 * 1024;
const SOCIAL_HOSTS = ['reddit.com', 'x.com', 'twitter.com', 'facebook.com', 'instagram.com', 'linkedin.com', 'discord.com', 'discord.gg', 'tiktok.com'];

export function isLoginBackedSocialUrl(input: string): boolean {
  try {
    const host = new URL(input).hostname.toLowerCase().replace(/\.+$/u, '');
    return SOCIAL_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function isChallengePage(title: string, text: string): boolean {
  return /^(?:just a moment|access denied|attention required|sign[ _-]?in|log[ _-]?in|đăng nhập|dang nhap|authentication required|authwall|verify you are human|robot check|captcha)(?![\p{L}\p{N}_])/iu.test(title.trim())
    || /^(?:verify you are human|checking your browser|please enable javascript and cookies|access denied|too many requests)/iu.test(text.trim());
}

export function isAuthenticationUrl(input: string): boolean {
  try {
    const path = decodeURIComponent(new URL(input).pathname);
    return /(?:^|\/)(?:authwall|sign[ _-]?in|log[ _-]?in|dang[-_]?nhap)(?:\/|$)/iu.test(path)
      || /^\/(?:auth|authenticate|(?:oauth2?\/)?authorize)(?:\/|$)/iu.test(path);
  } catch {
    return false;
  }
}

export function isAuthenticationContent(content: SafeWebContent): boolean {
  if (isLoginBackedSocialUrl(content.finalUrl) || isAuthenticationUrl(content.finalUrl)) return true;
  if (!['text/html', 'application/xhtml+xml'].includes(content.contentType)) return false;
  const $ = cheerio.load(content.text);
  return /^(?:sign[ _-]?in|log[ _-]?in|đăng nhập|dang nhap|authentication required|authwall)(?![\p{L}\p{N}_])/iu.test($('title').text().trim())
    || $('form input[type="password"]').length > 0;
}

export function isBotChallengeContent(content: SafeWebContent): boolean {
  if (isAuthenticationContent(content)) return false;
  let title = '';
  let text = content.text;
  if (['text/html', 'application/xhtml+xml'].includes(content.contentType)) {
    const $ = cheerio.load(content.text);
    title = $('title').text().trim();
    text = $('body').text().trim();
    if ($('input[type="password"]').length > 0) return false;
  }
  return /^(?:just a moment|attention required|verify you are human|robot check|captcha)(?![\p{L}\p{N}_])/iu.test(title)
    || /^(?:verify you are human|checking your browser|please enable javascript and cookies)(?![\p{L}\p{N}_])/iu.test(text.trim());
}

export function isUnavailableSourceContent(content: SafeWebContent): boolean {
  if (isLoginBackedSocialUrl(content.finalUrl) || isAuthenticationUrl(content.finalUrl)) return true;
  if (['text/html', 'application/xhtml+xml'].includes(content.contentType)) {
    const $ = cheerio.load(content.text);
    return isChallengePage($('title').text(), $('body').text())
      || ($('input[type="password"]').length > 0 && $('article').length === 0 && $('main').text().trim().length < 80);
  }
  return isChallengePage('', content.text);
}

interface ReaderHttpClient {
  get(url: string, options: { headers: Record<string, string> }): Promise<{ data: unknown; headers?: Record<string, string | undefined> }>;
}

export class JinaReaderService {
  constructor(
    private readonly http: ReaderHttpClient = axios.create({
      timeout: env.REQUEST_TIMEOUT_MS, maxRedirects: 0,
      maxContentLength: MAX_BYTES, maxBodyLength: MAX_BYTES,
      headers: { 'User-Agent': env.USER_AGENT },
    }),
    private readonly policy: Pick<SafeWebRetrievalService, 'assertPublicUrl'> = new SafeWebRetrievalService(),
    private readonly options = { apiKey: env.JINA_API_KEY, timeoutMs: env.REQUEST_TIMEOUT_MS },
  ) {}

  async retrieve(input: string, format: 'text' | 'html' = 'text'): Promise<SafeWebContent> {
    if (isLoginBackedSocialUrl(input) || isAuthenticationUrl(input)) throw new Error('unsupported-reader-source');
    const sourceUrl = await this.policy.assertPublicUrl(input);
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json', 'X-Return-Format': format,
        'X-Timeout': String(Math.max(1, Math.floor(this.options.timeoutMs / 1000))),
        'X-Remove-Selector': 'nav,footer,form,script,style,noscript',
      };
      if (format === 'html') headers['X-No-Cache'] = 'true';
      if (this.options.apiKey.trim()) headers.Authorization = `Bearer ${this.options.apiKey}`;
      const response = await this.http.get(`https://r.jina.ai/${sourceUrl}`, { headers });
      if (!String(response.headers?.['content-type'] ?? '').toLowerCase().startsWith('application/json')) throw new Error('jina-reader');
      const payload = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      if (!payload || typeof payload !== 'object' || payload.code !== 200 || !payload.data) throw new Error('jina-reader');
      const { url, title, httpStatus } = payload.data;
      const content = (format === 'html' ? payload.data.html : payload.data.text) ?? payload.data.content;
      if (httpStatus !== undefined && (!Number.isInteger(httpStatus) || httpStatus < 200 || httpStatus > 299)) throw new Error('jina-reader');
      if (typeof url !== 'string' || normalizeUrl(url) !== normalizeUrl(sourceUrl)
        || typeof content !== 'string' || !content.trim() || Buffer.byteLength(content) > MAX_BYTES
        || isChallengePage(typeof title === 'string' ? title : '', content)) throw new Error('jina-reader');
      await this.policy.assertPublicUrl(url);
      if (format === 'html' && !/<(?:html|body|article|main|table)\b/iu.test(content)) throw new Error('jina-reader');
      return { finalUrl: sourceUrl, contentType: format === 'html' ? 'text/html' : 'text/plain', text: content, retrievalBackend: 'jina' };
    } catch {
      // Provider errors can contain credentials and response bodies.
      throw new Error('jina-reader');
    }
  }
}

export class AgentReachRetrievalService {
  constructor(
    private readonly direct: Pick<SafeWebRetrievalService, 'retrieve'> = new SafeWebRetrievalService(undefined, {
      timeoutMs: env.REQUEST_TIMEOUT_MS, maxBytes: MAX_BYTES, maxRedirects: 3, userAgent: env.USER_AGENT,
      allowUrl: (url) => !isLoginBackedSocialUrl(url.href) && !isAuthenticationUrl(url.href),
    }),
    private readonly reader: Pick<JinaReaderService, 'retrieve'> = new JinaReaderService(),
    private readonly enabled = env.AGENT_REACH_ENABLED && env.JINA_READER_ENABLED,
  ) {}

  async retrieve(input: string): Promise<SafeWebContent> {
    if (isLoginBackedSocialUrl(input)) throw new Error('unsupported-reader-source');
    if (isAuthenticationUrl(input)) throw new Error('unavailable-source-content');
    try {
      const content = await this.direct.retrieve(input);
      if (isLoginBackedSocialUrl(content.finalUrl)) throw new Error('unsupported-reader-source');
      if (isUnavailableSourceContent(content)) throw new Error(isBotChallengeContent(content) ? 'bot-challenge' : 'unavailable-source-content');
      return { ...content, retrievalBackend: 'direct' };
    } catch (error) {
      if (!this.enabled || !(error instanceof Error)
        || !['unexpected-status', 'request-timeout', 'unsupported-content-encoding', 'bot-challenge'].includes(error.message)
        || isLoginBackedSocialUrl(input)) throw error;
      return this.reader.retrieve(input);
    }
  }
}
