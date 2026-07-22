import type { TopicKey } from './topic';

export type SourceKind = 'rss' | 'html' | 'x-search' | 'github-repos';

export interface BaseSourceConfig {
  id: string;
  name: string;
  kind: SourceKind;
  enabled: boolean;
  homepageUrl: string;
}

export interface RssSourceConfig extends BaseSourceConfig {
  kind: 'rss';
  feedUrl: string;
  defaultTopics?: TopicKey[];
}

export interface HtmlSourceSelectors {
  item: string;
  title: string;
  url: string;
  summary?: string;
  publishedAt?: string;
  image?: string;
}

export interface HtmlSourceConfig extends BaseSourceConfig {
  kind: 'html';
  listUrl: string;
  selectors: HtmlSourceSelectors;
}

export interface XSearchSourceConfig extends BaseSourceConfig {
  kind: 'x-search';
  bearerToken: string;
  query: string;
  maxResults: number;
}

export interface GitHubReposSourceConfig extends BaseSourceConfig {
  kind: 'github-repos';
  token: string;
  query: string;
  maxResults: number;
  lookbackDays: number;
}

export type SourceConfig = RssSourceConfig | HtmlSourceConfig | XSearchSourceConfig | GitHubReposSourceConfig;
