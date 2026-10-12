import type { WebSearchProvider, WebSearchResult } from "./web-search.provider";

export class FallbackWebSearchProvider implements WebSearchProvider {
  readonly key = "web-search";

  constructor(private readonly providers: readonly WebSearchProvider[]) {}

  isEnabled(): boolean {
    return this.providers.some((provider) => provider.isEnabled());
  }

  async search(query: {
    key: string;
    text: string;
  }): Promise<WebSearchResult[]> {
    let attempted = false;
    let succeeded = false;
    for (const provider of this.providers) {
      if (!provider.isEnabled()) continue;
      attempted = true;
      try {
        const results = await provider.search(query);
        succeeded = true;
        if (results.length > 0) return results;
      } catch {
        // Try the next configured provider without forwarding its error details.
      }
    }
    if (attempted && !succeeded) throw new Error("web-search");
    return [];
  }
}
