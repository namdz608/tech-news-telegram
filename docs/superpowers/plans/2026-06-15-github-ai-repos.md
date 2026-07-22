# GitHub AI Repos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub Search API source that contributes recently updated AI repositories to the Telegram tech news digest.

**Architecture:** Add a `github-repos` source kind and a focused `GitHubReposCrawler` that maps GitHub repository search results into existing `Article` objects. Reuse the existing collection, freshness, dedupe, digest, translation, and Telegram delivery pipeline by routing the new source through `SourceService`.

**Tech Stack:** TypeScript, Express service code, Axios, Zod env parsing, Vitest.

---

## File Structure

- Create `src/crawlers/github-repos.crawler.ts`: GitHub Search API client, query building, response mapping, and defensive error handling.
- Create `tests/crawlers/github-repos.crawler.test.ts`: crawler unit tests with mocked `http.get`.
- Modify `src/types/source.ts`: add `GitHubReposSourceConfig` and include `github-repos` in `SourceKind`.
- Modify `src/config/env.ts`: add `GITHUB_TOKEN`, `GITHUB_AI_REPO_QUERY`, `GITHUB_AI_REPO_MAX_RESULTS`, and `GITHUB_AI_REPO_LOOKBACK_DAYS`.
- Modify `src/config/sources.ts`: add enabled `GitHub AI Repos` source config.
- Modify `src/crawlers/index.ts`: instantiate `GitHubReposCrawler`.
- Modify `src/services/source.service.ts`: add `githubRepos` crawler dependency and route `github-repos`.
- Modify `tests/services/source.service.test.ts`: add coverage for enabled GitHub repo source.
- Modify `.env.example` and `README.md`: document the new source and env values without real secrets.

---

### Task 1: Add Source Type And Env Config

**Files:**
- Modify: `src/types/source.ts`
- Modify: `src/config/env.ts`
- Test: `npm run build`

- [ ] **Step 1: Update source types**

Replace `src/types/source.ts` with:

```ts
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
}

export interface HtmlSourceSelectors {
  item: string;
  title: string;
  url: string;
  summary?: string;
  publishedAt?: string;
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
```

- [ ] **Step 2: Update env schema**

In `src/config/env.ts`, add these fields after the existing X settings:

```ts
  GITHUB_TOKEN: z.string().default(''),
  GITHUB_AI_REPO_QUERY: z.string().default(''),
  GITHUB_AI_REPO_MAX_RESULTS: z.coerce.number().int().min(1).max(100).default(10),
  GITHUB_AI_REPO_LOOKBACK_DAYS: z.coerce.number().int().positive().default(7),
```

- [ ] **Step 3: Run TypeScript build**

Run:

```bash
npm run build
```

Expected: build fails until later tasks route the new source type everywhere, or passes if TypeScript accepts the type changes at this point.

- [ ] **Step 4: Checkpoint**

Run:

```bash
git status --short 2>/dev/null || true
```

Expected in this workspace: no git status output because `/root/tech-news-telegram` is not a git repository. Do not commit real tokens.

---

### Task 2: Build GitHub Repo Crawler With Tests

**Files:**
- Create: `tests/crawlers/github-repos.crawler.test.ts`
- Create: `src/crawlers/github-repos.crawler.ts`
- Test: `tests/crawlers/github-repos.crawler.test.ts`

- [ ] **Step 1: Write failing crawler tests**

Create `tests/crawlers/github-repos.crawler.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { GitHubReposCrawler } from '../../src/crawlers/github-repos.crawler';
import type { GitHubReposSourceConfig } from '../../src/types/source';

function createSource(overrides: Partial<GitHubReposSourceConfig> = {}): GitHubReposSourceConfig {
  return {
    id: 'github-ai-repos',
    name: 'GitHub AI Repos',
    kind: 'github-repos',
    enabled: true,
    homepageUrl: 'https://github.com',
    token: 'token',
    query: '',
    maxResults: 10,
    lookbackDays: 7,
    ...overrides,
  };
}

describe('GitHubReposCrawler', () => {
  it('maps GitHub repositories into AI articles', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z'));

    try {
      const http = {
        get: vi.fn().mockResolvedValue({
          data: {
            items: [
              {
                html_url: 'https://github.com/example/ai-agent',
                full_name: 'example/ai-agent',
                description: 'OpenAI powered RAG agent framework',
                stargazers_count: 1234,
                language: 'TypeScript',
                created_at: '2026-06-01T00:00:00.000Z',
                updated_at: '2026-06-14T00:00:00.000Z',
                pushed_at: '2026-06-14T12:00:00.000Z',
                owner: {
                  login: 'example',
                },
              },
              {
                html_url: 'https://github.com/example/no-description',
                full_name: 'example/no-description',
                stargazers_count: 10,
                created_at: '2026-06-10T00:00:00.000Z',
                updated_at: '2026-06-12T00:00:00.000Z',
                pushed_at: '2026-06-12T00:00:00.000Z',
                owner: {
                  login: 'example',
                },
              },
            ],
          },
        }),
      };

      const articles = await new GitHubReposCrawler(http).crawl(createSource());

      expect(http.get).toHaveBeenCalledWith('https://api.github.com/search/repositories', {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer token',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        params: {
          q: '(topic:llm OR topic:generative-ai OR topic:ai-agent OR topic:rag OR topic:machine-learning OR topic:artificial-intelligence) pushed:>=2026-06-08',
          sort: 'stars',
          order: 'desc',
          per_page: 10,
        },
      });
      expect(articles).toHaveLength(2);
      expect(articles[0]).toMatchObject({
        id: 'https://github.com/example/ai-agent',
        sourceId: 'github-ai-repos',
        sourceName: 'GitHub AI Repos',
        title: 'example/ai-agent',
        url: 'https://github.com/example/ai-agent',
        summary:
          'OpenAI powered RAG agent framework | Stars: 1234 | Language: TypeScript | Created: 2026-06-01 | Updated: 2026-06-14 | Pushed: 2026-06-14',
        author: 'example',
        publishedAt: '2026-06-14T12:00:00.000Z',
        topics: ['ai'],
      });
      expect(articles[0].collectedAt).toBe('2026-06-15T00:00:00.000Z');
      expect(articles[1].summary).toBe('Stars: 10 | Created: 2026-06-10 | Updated: 2026-06-12 | Pushed: 2026-06-12');
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses a custom query and omits authorization when token is blank', async () => {
    const http = {
      get: vi.fn().mockResolvedValue({
        data: {
          items: [],
        },
      }),
    };

    await new GitHubReposCrawler(http).crawl(
      createSource({
        token: '',
        query: 'topic:llm stars:>500 pushed:>=2026-06-01',
        maxResults: 5,
      }),
    );

    expect(http.get).toHaveBeenCalledWith('https://api.github.com/search/repositories', {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      params: {
        q: 'topic:llm stars:>500 pushed:>=2026-06-01',
        sort: 'stars',
        order: 'desc',
        per_page: 5,
      },
    });
  });

  it('returns an empty list for failed or malformed responses', async () => {
    const failedHttp = {
      get: vi.fn().mockRejectedValue(new Error('rate limited')),
    };
    const malformedHttp = {
      get: vi.fn().mockResolvedValue({
        data: {
          items: 'not-an-array',
        },
      }),
    };

    await expect(new GitHubReposCrawler(failedHttp).crawl(createSource())).resolves.toEqual([]);
    await expect(new GitHubReposCrawler(malformedHttp).crawl(createSource())).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run crawler tests to verify failure**

Run:

```bash
npx vitest run tests/crawlers/github-repos.crawler.test.ts
```

Expected: FAIL because `src/crawlers/github-repos.crawler.ts` does not exist.

- [ ] **Step 3: Implement crawler**

Create `src/crawlers/github-repos.crawler.ts`:

```ts
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
  };
}

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
      const response = await this.http.get('https://api.github.com/search/repositories', {
        headers: buildHeaders(source.token),
        params: {
          q: source.query.trim() || buildDefaultQuery(source.lookbackDays),
          sort: 'stars',
          order: 'desc',
          per_page: source.maxResults,
        },
      });

      if (!Array.isArray(response.data.items)) {
        return [];
      }

      return response.data.items.map((repo) => mapRepositoryToArticle(repo as GitHubRepository, source)).filter((article): article is Article => Boolean(article));
    } catch (error) {
      console.error(`Failed to crawl GitHub repositories from source ${source.id}`, error);
      return [];
    }
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

function buildDefaultQuery(lookbackDays: number): string {
  const fromDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return `(topic:llm OR topic:generative-ai OR topic:ai-agent OR topic:rag OR topic:machine-learning OR topic:artificial-intelligence) pushed:>=${fromDate}`;
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
```

- [ ] **Step 4: Run crawler tests to verify pass**

Run:

```bash
npx vitest run tests/crawlers/github-repos.crawler.test.ts
```

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run:

```bash
git status --short 2>/dev/null || true
```

Expected in this workspace: no git status output because `/root/tech-news-telegram` is not a git repository. Do not commit real tokens.

---

### Task 3: Wire GitHub Source Into Collection Pipeline

**Files:**
- Modify: `src/config/sources.ts`
- Modify: `src/crawlers/index.ts`
- Modify: `src/services/source.service.ts`
- Modify: `tests/services/source.service.test.ts`
- Test: `tests/services/source.service.test.ts`

- [ ] **Step 1: Add failing SourceService test**

Append this test inside `describe('SourceService', () => { ... })` in `tests/services/source.service.test.ts`:

```ts
  it('crawls enabled GitHub repository sources', async () => {
    const sources: SourceConfig[] = [
      {
        id: 'github-ai-repos',
        name: 'GitHub AI Repos',
        kind: 'github-repos',
        enabled: true,
        homepageUrl: 'https://github.com',
        token: 'token',
        query: '',
        maxResults: 10,
        lookbackDays: 7,
      },
    ];
    const article: Article = {
      id: 'https://github.com/example/ai-agent',
      sourceId: 'github-ai-repos',
      sourceName: 'GitHub AI Repos',
      title: 'example/ai-agent',
      url: 'https://github.com/example/ai-agent',
      publishedAt: new Date().toISOString(),
      collectedAt: new Date().toISOString(),
      topics: ['ai'],
    };

    const service = new SourceService(sources, {
      rss: { crawl: async () => [] },
      html: { crawl: async () => [] },
      xSearch: { crawl: async () => [] },
      githubRepos: { crawl: async () => [article] },
    });

    await expect(service.collectLatest()).resolves.toEqual([article]);
  });
```

- [ ] **Step 2: Run SourceService test to verify failure**

Run:

```bash
npx vitest run tests/services/source.service.test.ts
```

Expected: FAIL because `SourceServiceCrawlers` does not yet include `githubRepos`.

- [ ] **Step 3: Update crawler factory**

Replace `src/crawlers/index.ts` with:

```ts
import { GitHubReposCrawler } from './github-repos.crawler';
import { HtmlCrawler } from './html.crawler';
import { RssCrawler } from './rss.crawler';
import { XSearchCrawler } from './x-search.crawler';

export function createCrawlers() {
  return {
    rss: new RssCrawler(),
    html: new HtmlCrawler(),
    xSearch: new XSearchCrawler(),
    githubRepos: new GitHubReposCrawler(),
  };
}
```

- [ ] **Step 4: Update SourceService routing**

In `src/services/source.service.ts`, update the type import:

```ts
import type { GitHubReposSourceConfig, HtmlSourceConfig, RssSourceConfig, SourceConfig, XSearchSourceConfig } from '../types/source';
```

Update `SourceServiceCrawlers`:

```ts
interface SourceServiceCrawlers {
  rss: NewsCrawler<RssSourceConfig>;
  html: NewsCrawler<HtmlSourceConfig>;
  xSearch: NewsCrawler<XSearchSourceConfig>;
  githubRepos: NewsCrawler<GitHubReposSourceConfig>;
}
```

Add this branch after the `x-search` branch:

```ts
          if (source.kind === 'github-repos') {
            return await this.crawlers.githubRepos.crawl(source);
          }
```

- [ ] **Step 5: Add GitHub source config**

In `src/config/sources.ts`, add this source after the `x-search` source:

```ts
  {
    id: 'github-ai-repos',
    name: 'GitHub AI Repos',
    kind: 'github-repos',
    enabled: true,
    homepageUrl: 'https://github.com',
    token: env.GITHUB_TOKEN,
    query: env.GITHUB_AI_REPO_QUERY,
    maxResults: env.GITHUB_AI_REPO_MAX_RESULTS,
    lookbackDays: env.GITHUB_AI_REPO_LOOKBACK_DAYS,
  },
```

- [ ] **Step 6: Run SourceService test to verify pass**

Run:

```bash
npx vitest run tests/services/source.service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Checkpoint**

Run:

```bash
git status --short 2>/dev/null || true
```

Expected in this workspace: no git status output because `/root/tech-news-telegram` is not a git repository. Do not commit real tokens.

---

### Task 4: Document GitHub Source And Local Secret

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Optionally modify local-only: `.env`
- Test: `rg -n "g[h]p_|github[_]pat_|GITHUB_TOKEN=" . README.md docs src tests`

- [ ] **Step 1: Update `.env.example`**

Add this block after the X settings in `.env.example`:

```env
GITHUB_TOKEN=
GITHUB_AI_REPO_QUERY=
GITHUB_AI_REPO_MAX_RESULTS=10
GITHUB_AI_REPO_LOOKBACK_DAYS=7
```

- [ ] **Step 2: Update README source list**

In `README.md`, change the source list to include GitHub:

```md
- RSS: Hacker News, Kubernetes Blog, Google Security Blog, AWS News Blog, CNCF Blog, DevOps.com.
- HTML web: The Hacker News.
- X Search: tìm Post công nghệ bằng X API v2 Recent Search.
- GitHub Search: tìm repository AI mới hoặc mới cập nhật bằng GitHub Search API.
```

- [ ] **Step 3: Add README GitHub section**

Add this section before `## Env`:

```md
## Luồng GitHub AI Repos

App dùng endpoint chính thức `GET https://api.github.com/search/repositories` để lấy repo AI mới hoặc mới cập nhật. Mặc định, app lọc theo các topic AI như `llm`, `generative-ai`, `ai-agent`, `rag`, `machine-learning`, `artificial-intelligence`, giới hạn trong `GITHUB_AI_REPO_LOOKBACK_DAYS` ngày gần nhất và sắp theo stars.

Mỗi repo được map thành `Article` với:

- `sourceName`: `GitHub AI Repos`
- `title`: `owner/repo`
- `summary`: mô tả repo, stars, language, ngày tạo, ngày cập nhật và ngày push gần nhất
- `url`: URL repo GitHub

Nếu `GITHUB_TOKEN` trống, nguồn GitHub vẫn chạy với rate limit public của GitHub. Nên dùng fine-grained token chỉ cần quyền đọc public metadata để tăng rate limit.
```

- [ ] **Step 4: Update README env block**

Add these values after the X env values in README:

```env
GITHUB_TOKEN=
GITHUB_AI_REPO_QUERY=
GITHUB_AI_REPO_MAX_RESULTS=10
GITHUB_AI_REPO_LOOKBACK_DAYS=7
```

- [ ] **Step 5: Optionally update local `.env`**

Only if the user wants the current machine configured immediately, add this line to local `.env` without committing or echoing the real value in logs:

```env
GITHUB_TOKEN=<local secret value>
```

Do not place the real token in `.env.example`, README, tests, docs, or terminal output.

- [ ] **Step 6: Secret scan**

Run:

```bash
rg -n "g[h]p_|github[_]pat_|GITHUB_TOKEN=.*[A-Za-z0-9_]{20,}" . README.md docs src tests
```

Expected: no matches containing a real token. Placeholder `GITHUB_TOKEN=` is acceptable.

---

### Task 5: Full Verification

**Files:**
- All changed files
- Test: full test suite and build

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npx vitest run tests/crawlers/github-repos.crawler.test.ts tests/services/source.service.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Optional live smoke test without exposing token**

Run only after local `.env` has `GITHUB_TOKEN` set:

```bash
node -e "require('dotenv/config'); const axios=require('axios'); axios.get('https://api.github.com/search/repositories',{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+process.env.GITHUB_TOKEN,'X-GitHub-Api-Version':'2022-11-28'},params:{q:'topic:llm pushed:>=2026-06-08',sort:'stars',order:'desc',per_page:1}}).then(r=>console.log({count:r.data.items.length,name:r.data.items[0]?.full_name})).catch(e=>console.error({status:e.response?.status,message:e.message}))"
```

Expected: logs only count and repo name, not the token.

- [ ] **Step 5: Final secret scan**

Run:

```bash
rg -n "g[h]p_|github[_]pat_|GITHUB_TOKEN=.*[A-Za-z0-9_]{20,}" . README.md docs src tests
```

Expected: no matches containing a real token.

- [ ] **Step 6: Final status**

Run:

```bash
git status --short 2>/dev/null || true
```

Expected in this workspace: no git status output because `/root/tech-news-telegram` is not a git repository. Report changed files manually.

---

## Self-Review

- Spec coverage: source type, env config, GitHub Search API crawler, Article mapping, SourceService integration, docs, tests, error handling, and token hygiene are covered.
- Placeholder scan: no unresolved implementation notes remain.
- Type consistency: plan consistently uses `github-repos`, `GitHubReposSourceConfig`, `GitHubReposCrawler`, and `githubRepos`.
