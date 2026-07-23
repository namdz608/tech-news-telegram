import axios from 'axios';
import { env } from '../config/env';
import type { Article } from '../types/article';
import type { GitHubReposSourceConfig } from '../types/source';
import { compactText } from '../utils/text';
import type { NewsCrawler } from './crawler.types';

interface HttpClientLike {
  get(
    url: string,
    config: {
      headers: Record<string, string>;
      params: Record<string, string | number>;
    },
  ): Promise<{ data: GitHubSearchResponse }>;
}

interface GitHubSearchResponse {
  items?: unknown;
}

interface GitHubRepository {
  html_url?: string;
  full_name?: string;
  description?: string | null;
  stargazers_count?: number;
  language?: string | null;
  created_at?: string;
  updated_at?: string;
  pushed_at?: string;
  owner?: {
    login?: string;
    avatar_url?: string;
  };
}

const defaultAiTopics = ['llm', 'generative-ai', 'ai-agent', 'rag', 'machine-learning', 'artificial-intelligence'];

export class GitHubReposCrawler implements NewsCrawler<GitHubReposSourceConfig> {
  constructor(
    private readonly http: HttpClientLike = axios.create({
      timeout: env.REQUEST_TIMEOUT_MS,
      headers: {
        'User-Agent': env.USER_AGENT,
      },
    }),
  ) {}

  async crawl(source: GitHubReposSourceConfig): Promise<Article[]> {
    try {
      const repositories = await this.fetchRepositories(source);

      return repositories
        .map((repo) => mapRepositoryToArticle(repo as GitHubRepository, source))
        .filter((article): article is Article => Boolean(article));
    } catch (error) {
      console.error(`Failed to crawl GitHub repositories from source ${source.id}: ${formatErrorMessage(error)}`);
      return [];
    }
  }

  private async fetchRepositories(source: GitHubReposSourceConfig): Promise<GitHubRepository[]> {
    const queries = buildQueries(source);
    const repositoryGroups = await Promise.all(
      queries.map(async (query) => {
        const response = await this.http.get('https://api.github.com/search/repositories', {
          headers: buildHeaders(source.token),
          params: {
            q: query,
            sort: 'stars',
            order: 'desc',
            per_page: source.maxResults,
          },
        });

        if (!Array.isArray(response.data.items)) {
          return [];
        }

        return response.data.items as GitHubRepository[];
      }),
    );

    return dedupeRepositories(repositoryGroups.flat())
      .sort((left, right) => (right.stargazers_count ?? 0) - (left.stargazers_count ?? 0))
      .slice(0, source.maxResults);
  }
}

function buildHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (token.trim()) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function buildQueries(source: GitHubReposSourceConfig): string[] {
  const customQuery = source.query.trim();

  if (customQuery) {
    return [customQuery];
  }

  return buildDefaultQueries(source.lookbackDays);
}

function buildDefaultQueries(lookbackDays: number): string[] {
  const fromDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return defaultAiTopics.map((topic) => `topic:${topic} pushed:>=${fromDate}`);
}

function dedupeRepositories(repositories: GitHubRepository[]): GitHubRepository[] {
  const seenUrls = new Set<string>();
  const result: GitHubRepository[] = [];

  for (const repository of repositories) {
    if (!repository.html_url || seenUrls.has(repository.html_url)) {
      continue;
    }

    seenUrls.add(repository.html_url);
    result.push(repository);
  }

  return result;
}

function mapRepositoryToArticle(repo: GitHubRepository, source: GitHubReposSourceConfig): Article | undefined {
  if (!repo.html_url || !repo.full_name) {
    return undefined;
  }

  return {
    id: repo.html_url,
    sourceId: source.id,
    sourceName: source.name,
    title: repo.full_name,
    url: repo.html_url,
    summary: formatSummary(repo),
    imageUrl: normalizeImageUrl(repo.owner?.avatar_url),
    author: repo.owner?.login,
    publishedAt: repo.pushed_at ?? repo.updated_at ?? repo.created_at,
    collectedAt: new Date().toISOString(),
    topics: ['ai'],
  };
}

function formatSummary(repo: GitHubRepository): string {
  const parts = [
    compactText(repo.description ?? ''),
    typeof repo.stargazers_count === 'number' ? `Stars: ${repo.stargazers_count}` : '',
    repo.language ? `Language: ${repo.language}` : '',
    repo.created_at ? `Created: ${formatDate(repo.created_at)}` : '',
    repo.updated_at ? `Updated: ${formatDate(repo.updated_at)}` : '',
    repo.pushed_at ? `Pushed: ${formatDate(repo.pushed_at)}` : '',
  ];

  return parts.filter(Boolean).join(' | ');
}

function formatDate(value: string): string {
  return value.slice(0, 10);
}

function normalizeImageUrl(imageUrl?: string): string | undefined {
  const trimmed = imageUrl?.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'unknown error';
}
