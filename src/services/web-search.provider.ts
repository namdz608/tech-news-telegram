export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedAt: string;
  sourceName?: string;
}

export interface WebSearchProvider {
  readonly key: string;
  isEnabled(): boolean;
  search(query: { key: string; text: string }): Promise<WebSearchResult[]>;
}
