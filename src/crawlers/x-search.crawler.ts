import axios from 'axios';
import { env } from '../config/env';
import { matchTopics } from '../services/article.service';
import type { Article } from '../types/article';
import type { XSearchSourceConfig } from '../types/source';
import { compactText } from '../utils/text';
import type { NewsCrawler } from './crawler.types';

interface HttpClientLike {
  get(url: string, config: { headers: Record<string, string>; params: Record<string, string | number> }): Promise<{ data: XSearchResponse }>;
}

interface XSearchResponse {
  data?: XPost[];
  includes?: {
    users?: XUser[];
  };
}

interface XPost {
  id: string;
  text: string;
  author_id?: string;
  created_at?: string;
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
  };
}

interface XUser {
  id: string;
  name?: string;
  username?: string;
}

export class XSearchCrawler implements NewsCrawler<XSearchSourceConfig> {
  constructor(
    private readonly http: HttpClientLike = axios.create({
      timeout: env.REQUEST_TIMEOUT_MS,
      headers: {
        'User-Agent': env.USER_AGENT,
      },
    }),
  ) {}

  async crawl(source: XSearchSourceConfig): Promise<Article[]> {
    if (!source.bearerToken.trim()) {
      return [];
    }

    const response = await this.http.get('https://api.x.com/2/tweets/search/recent', {
      headers: {
        Authorization: `Bearer ${source.bearerToken}`,
      },
      params: {
        query: source.query,
        max_results: source.maxResults,
        expansions: 'author_id',
        'tweet.fields': 'author_id,created_at,public_metrics,lang',
        'user.fields': 'name,username',
      },
    });
    const usersById = new Map((response.data.includes?.users ?? []).map((user) => [user.id, user]));

    return (response.data.data ?? [])
      .map((post) => {
        const text = compactText(post.text);
        const topics = matchTopics({ title: text, summary: text });
        const user = post.author_id ? usersById.get(post.author_id) : undefined;
        const author = formatAuthor(user);
        const url = `https://x.com/i/web/status/${post.id}`;

        return {
          id: url,
          sourceId: source.id,
          sourceName: source.name,
          title: truncateText(text, 160),
          url,
          summary: formatSummary(text, author, post.public_metrics),
          author,
          publishedAt: post.created_at,
          collectedAt: new Date().toISOString(),
          topics,
        };
      })
      .filter((article) => article.topics.length > 0);
  }
}

function formatAuthor(user?: XUser): string | undefined {
  if (user?.username) {
    return `@${user.username}`;
  }

  return user?.name;
}

function formatSummary(text: string, author?: string, metrics?: XPost['public_metrics']): string {
  const parts = [author ? `${author}: ${text}` : text];

  if (typeof metrics?.like_count === 'number') {
    parts.push(`Likes: ${metrics.like_count}`);
  }

  if (typeof metrics?.retweet_count === 'number') {
    parts.push(`Reposts: ${metrics.retweet_count}`);
  }

  return parts.join(' | ');
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}
