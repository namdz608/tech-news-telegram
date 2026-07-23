/**
 * Các contract cấu hình nguồn tin, dùng discriminated union theo `kind`.
 *
 * Được `sources.ts`, SourceService, crawler interface/classes và crawler tests
 * sử dụng để TypeScript thu hẹp đúng cấu hình cho từng nguồn.
 */
import type { TopicKey } from './topic';

/**
 * Các cơ chế thu thập được hệ thống hỗ trợ.
 * Được `BaseSourceConfig.kind`, `SourceConfig` và `SourceService` dùng để dispatch crawler.
 */
export type SourceKind = 'rss' | 'html' | 'x-search' | 'github-repos';

/**
 * Trường chung mà mọi nguồn cần có để định danh, bật/tắt và hiển thị.
 * Được kế thừa bởi bốn interface config chuyên biệt trong file này.
 */
export interface BaseSourceConfig {
  // ID ổn định dùng trong Article/source affinity.
  id: string;
  name: string;
  // Discriminator quyết định crawler nào được gọi.
  kind: SourceKind;
  enabled: boolean;
  homepageUrl: string;
}

/**
 * Cấu hình feed RSS/XML, gồm topic fallback tùy chọn.
 * Được dùng tại `sources.ts`, `rss.crawler.ts`, `source.service.ts` và RSS crawler tests.
 */
export interface RssSourceConfig extends BaseSourceConfig {
  kind: 'rss';
  feedUrl: string;
  defaultTopics?: TopicKey[];
}

/**
 * CSS selectors để chuyển mỗi card HTML thành Article.
 * Được nhúng trong `HtmlSourceConfig` và đọc bởi `html.crawler.ts`.
 */
export interface HtmlSourceSelectors {
  item: string;
  title: string;
  url: string;
  summary?: string;
  publishedAt?: string;
  image?: string;
}

/**
 * Cấu hình trang HTML và selectors đi kèm.
 * Được dùng tại `sources.ts`, `html.crawler.ts`, `source.service.ts` và HTML crawler tests.
 */
export interface HtmlSourceConfig extends BaseSourceConfig {
  kind: 'html';
  listUrl: string;
  selectors: HtmlSourceSelectors;
}

/**
 * Credential/query/page size dành riêng cho X Recent Search.
 * Được dùng tại `sources.ts`, `x-search.crawler.ts`, `source.service.ts` và X crawler tests.
 */
export interface XSearchSourceConfig extends BaseSourceConfig {
  kind: 'x-search';
  bearerToken: string;
  query: string;
  maxResults: number;
}

/**
 * Credential/query/lookback dành riêng cho GitHub Repository Search.
 * Được dùng tại `sources.ts`, `github-repos.crawler.ts`, `source.service.ts` và GitHub crawler tests.
 */
export interface GitHubReposSourceConfig extends BaseSourceConfig {
  kind: 'github-repos';
  token: string;
  query: string;
  maxResults: number;
  lookbackDays: number;
}

/**
 * Union giúp `source.kind` thu hẹp chính xác config trong SourceService.
 * Được dùng tại `sources.ts`, `crawler.types.ts`, `source.service.ts` và source service tests.
 */
export type SourceConfig = RssSourceConfig | HtmlSourceConfig | XSearchSourceConfig | GitHubReposSourceConfig;
