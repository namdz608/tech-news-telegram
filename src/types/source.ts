/**
 * Các contract cấu hình nguồn tin, dùng discriminated union theo `kind`.
 *
 * Được `sources.ts`, SourceService, crawler interface/classes và crawler tests
 * sử dụng để TypeScript thu hẹp đúng cấu hình cho từng nguồn.
 */
import type { TopicKey } from './topic';

/** Các cơ chế thu thập được hệ thống hỗ trợ. */
export type SourceKind = 'rss' | 'html' | 'x-search' | 'github-repos';

/** Trường chung mà mọi nguồn cần có để định danh, bật/tắt và hiển thị. */
export interface BaseSourceConfig {
  // ID ổn định dùng trong Article/source affinity.
  id: string;
  name: string;
  // Discriminator quyết định crawler nào được gọi.
  kind: SourceKind;
  enabled: boolean;
  homepageUrl: string;
}

/** Cấu hình feed RSS/XML, gồm topic fallback tùy chọn. */
export interface RssSourceConfig extends BaseSourceConfig {
  kind: 'rss';
  feedUrl: string;
  defaultTopics?: TopicKey[];
}

/** CSS selectors để chuyển mỗi card HTML thành Article. */
export interface HtmlSourceSelectors {
  item: string;
  title: string;
  url: string;
  summary?: string;
  publishedAt?: string;
  image?: string;
}

/** Cấu hình trang danh sách HTML và bộ selectors đi kèm. */
export interface HtmlSourceConfig extends BaseSourceConfig {
  kind: 'html';
  listUrl: string;
  selectors: HtmlSourceSelectors;
}

/** Credential/query/page size dành riêng cho X Recent Search. */
export interface XSearchSourceConfig extends BaseSourceConfig {
  kind: 'x-search';
  bearerToken: string;
  query: string;
  maxResults: number;
}

/** Credential/query/lookback dành riêng cho GitHub Repository Search. */
export interface GitHubReposSourceConfig extends BaseSourceConfig {
  kind: 'github-repos';
  token: string;
  query: string;
  maxResults: number;
  lookbackDays: number;
}

/** Union giúp `source.kind` thu hẹp chính xác config trong SourceService. */
export type SourceConfig = RssSourceConfig | HtmlSourceConfig | XSearchSourceConfig | GitHubReposSourceConfig;
