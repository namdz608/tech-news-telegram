# DevOps Infrastructure Telegram Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /telegram/send-devops-infra` that collects cloud and on-prem infrastructure problems plus their forum solutions (and at most three hot incidents), edits them into Vietnamese, and sends at most 12 messages to a dedicated Telegram chat.

**Architecture:** A dedicated `DevopsInfraFlowService` composes all-settled forum adapters (Reddit, Stack Exchange, HN, Brave, optional X/Discord/Facebook), deterministic classification/dedupe/selection, source-grounded Vietnamese editorial validation, sequential Telegram delivery, and an independent in-process lock. Do not extend `CuratedTelegramFlow`. Do not import politics query lists or politics types.

**Tech Stack:** Node.js 22, TypeScript 6, Express 5, Vitest 4, Zod, Axios, Telegraf, `tldts`, existing `SafeWebRetrievalService`, `BraveWebSearchProvider`, `SentHistoryStore`, `XSearchCrawler`, and editorial generators.

## Global Constraints

- Implement `docs/superpowers/specs/2026-09-21-devops-infra-telegram-design.md` only.
- Stay on `feature/devops-infra-telegram` in this repo unless the user changes it. Helm work is a separate git repo at `/root/helm`; create `feature/devops-infra-telegram` from that repo's `origin/main` only when starting Task 15.
- Red-green-refactor every task. Run the focused test after writing it and confirm RED before production code.
- Never read, print, edit, or commit the real `.env`. Never put bot tokens, API keys, or captured credential-bearing payloads in fixtures, logs, snapshots, or commits.
- No live Telegram send. No login, CAPTCHA bypass, private Discord/Facebook/Telegram access, or Discord joins.
- Do not invent commands, root causes, or runbooks absent from collected source text. Keep technical tokens untranslated.
- Disabled adapters (`isEnabled() === false`) contribute neither items nor `failedSources` keys.
- Preserve tech, gadget, health, gold-politics, and jobs behavior.
- Application tests: `npx vitest run <file>`. Helm tests: `bash tests/render-test.sh` from the chart directory.

---

## Target File Map

### Domain and configuration

- Create `src/types/devops-infra.ts`: source item, candidate, editorial fields, selection/flow result, adapter contract types.
- Create `src/config/devops-infra-sources.ts`: subreddits, search queries, Stack Exchange sites/tags, HN queries, Brave queries, X query.
- Create `src/config/devops-infra-topics.ts`: category/environment/kind keyword tables.
- Modify `src/config/env.ts` and `tests/config/env.test.ts`.

### Collection

- Create `src/services/devops-infra-source.adapter.ts`.
- Create `src/services/devops-infra-reddit.adapter.ts`.
- Create `src/services/devops-infra-stackexchange.adapter.ts`.
- Create `src/services/devops-infra-hn.adapter.ts`.
- Modify `src/services/web-search.provider.ts`: `search(query: { key: string; text: string })`.
- Modify `src/services/brave-web-search.provider.ts` to use that query shape (still only reads `text`).
- Create `src/services/devops-infra-web-search.adapter.ts`.
- Create `src/services/devops-infra-x.adapter.ts`.
- Create `src/services/devops-infra-discord.adapter.ts`.
- Create `src/services/devops-infra-facebook.adapter.ts`.
- Create `src/services/devops-infra-source.service.ts`.

### Policy, editorial, delivery, API

- Create `src/services/devops-infra-classification.service.ts`.
- Create `src/services/devops-infra-dedupe.service.ts`.
- Create `src/services/devops-infra-selection.service.ts`.
- Create `src/services/devops-infra-editorial-validator.ts`.
- Create `src/services/devops-infra-editorial.types.ts`.
- Create `src/services/devops-infra-editorial.service.ts`.
- Create `src/services/devops-infra-codex-editorial.generator.ts`.
- Create `src/services/devops-infra-google-editorial.generator.ts`.
- Create `src/services/devops-infra-openai-editorial.generator.ts`.
- Create `src/services/devops-infra-message.service.ts`.
- Create `src/services/devops-infra-delivery.service.ts`.
- Create `src/services/devops-infra-flow.service.ts`.
- Modify `src/controllers/telegram.controller.ts` and `src/routes/telegram.routes.ts`.
- Modify `.env.example` and `README.md`.
- Create matching `tests/**` files listed in each task.

### Helm (sibling repo `/root/helm`)

- Modify `tech-news-telegram/values.yaml` (new cron job + env keys).
- Modify `tech-news-telegram/tests/render-test.sh` (CronJob count 5, secret env count +14).

---

### Task 1: Runtime configuration, domain types, and source catalogs

**Files:**
- Modify: `src/config/env.ts`
- Modify: `tests/config/env.test.ts`
- Create: `src/types/devops-infra.ts`
- Create: `src/config/devops-infra-sources.ts`
- Create: `src/config/devops-infra-topics.ts`
- Create: `tests/config/devops-infra-sources.test.ts`

**Interfaces:**
- Consumes: existing `envSchema` / `readEnvValues` helpers in `tests/config/env.test.ts`
- Produces: `env.DEVOPS_INFRA_*` fields; types in `src/types/devops-infra.ts`; catalogs exported from the two config files

- [ ] **Step 1: Write failing env default tests**

In `tests/config/env.test.ts`, using existing `readEnvValues` / `runEnv` with `DOTENV_CONFIG_PATH=/dev/null`:

```typescript
it('provides isolated devops-infra defaults', () => {
  expect(
    readEnvValues([
      'DEVOPS_INFRA_TELEGRAM_BOT_TOKEN',
      'DEVOPS_INFRA_TELEGRAM_CHAT_ID',
      'DEVOPS_INFRA_MAX_ARTICLES',
      'DEVOPS_INFRA_MAX_INCIDENTS',
      'DEVOPS_INFRA_MAX_AGE_HOURS',
      'DEVOPS_INFRA_HISTORY_RETENTION_DAYS',
      'DEVOPS_INFRA_HISTORY_PATH',
      'DEVOPS_INFRA_WEB_SEARCH_MAX_QUERIES',
      'DEVOPS_INFRA_EDITORIAL_PROVIDER',
      'STACKEXCHANGE_KEY',
      'DISCORD_BOT_TOKEN',
      'DISCORD_CHANNEL_ALLOWLIST',
      'FACEBOOK_ACCESS_TOKEN',
      'FACEBOOK_PAGE_ALLOWLIST',
    ]),
  ).toEqual({
    DEVOPS_INFRA_TELEGRAM_BOT_TOKEN: 'test-devops-infra-token',
    DEVOPS_INFRA_TELEGRAM_CHAT_ID: 'test-devops-infra-chat-id',
    DEVOPS_INFRA_MAX_ARTICLES: 12,
    DEVOPS_INFRA_MAX_INCIDENTS: 3,
    DEVOPS_INFRA_MAX_AGE_HOURS: 72,
    DEVOPS_INFRA_HISTORY_RETENTION_DAYS: 7,
    DEVOPS_INFRA_HISTORY_PATH: 'data/devops-infra-sent-history.json',
    DEVOPS_INFRA_WEB_SEARCH_MAX_QUERIES: 8,
    DEVOPS_INFRA_EDITORIAL_PROVIDER: 'codex',
    STACKEXCHANGE_KEY: '',
    DISCORD_BOT_TOKEN: '',
    DISCORD_CHANNEL_ALLOWLIST: '',
    FACEBOOK_ACCESS_TOKEN: '',
    FACEBOOK_PAGE_ALLOWLIST: '',
  });
});
```

Also assert: `MAX_ARTICLES` rejects `0` and `51`; `MAX_INCIDENTS` rejects `-1` and `4`; `WEB_SEARCH_MAX_QUERIES` accepts `0` and rejects `21`; empty `HISTORY_PATH` rejects; editorial provider accepts `codex|google|openai|none` and rejects `gpt`; effective incidents cap is `Math.min(MAX_INCIDENTS, MAX_ARTICLES)` when articles is `2` and incidents is `3` (result `2`).

- [ ] **Step 2: Run env tests and verify RED**

Run: `npx vitest run tests/config/env.test.ts`
Expected: FAIL because the keys are absent.

- [ ] **Step 3: Add Zod fields and clamp**

Append to `envSchema` (do not change existing defaults):

```typescript
DEVOPS_INFRA_TELEGRAM_BOT_TOKEN: z.string().default('test-devops-infra-token'),
DEVOPS_INFRA_TELEGRAM_CHAT_ID: z.string().default('test-devops-infra-chat-id'),
DEVOPS_INFRA_MAX_ARTICLES: z.coerce.number().int().min(1).max(50).default(12),
DEVOPS_INFRA_MAX_INCIDENTS: z.coerce.number().int().min(0).max(3).default(3),
DEVOPS_INFRA_MAX_AGE_HOURS: z.coerce.number().int().positive().default(72),
DEVOPS_INFRA_HISTORY_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
DEVOPS_INFRA_HISTORY_PATH: z.string().min(1).default('data/devops-infra-sent-history.json'),
DEVOPS_INFRA_WEB_SEARCH_MAX_QUERIES: z.coerce.number().int().min(0).max(20).default(8),
DEVOPS_INFRA_EDITORIAL_PROVIDER: z.enum(['openai', 'codex', 'google', 'none']).default('codex'),
STACKEXCHANGE_KEY: z.string().default(''),
DISCORD_BOT_TOKEN: z.string().default(''),
DISCORD_CHANNEL_ALLOWLIST: z.string().default(''),
FACEBOOK_ACCESS_TOKEN: z.string().default(''),
FACEBOOK_PAGE_ALLOWLIST: z.string().default(''),
```

Extend the exported `env` object:

```typescript
export const env = {
  ...parsedEnv,
  GOLD_POLITICS_MAX_GOLD_NEWS: Math.min(
    parsedEnv.GOLD_POLITICS_MAX_GOLD_NEWS,
    parsedEnv.GOLD_POLITICS_MAX_ARTICLES,
  ),
  DEVOPS_INFRA_MAX_INCIDENTS: Math.min(
    parsedEnv.DEVOPS_INFRA_MAX_INCIDENTS,
    parsedEnv.DEVOPS_INFRA_MAX_ARTICLES,
  ),
};
```

- [ ] **Step 4: Create domain types**

Create `src/types/devops-infra.ts` with exactly these public types (no politics imports):

```typescript
export type DevopsDiscoveryChannel =
  | 'reddit'
  | 'stackexchange'
  | 'hn'
  | 'web'
  | 'x'
  | 'discord'
  | 'facebook'
  | 'telegram';

export type DevopsInfraCategory =
  | 'k8s-containers'
  | 'cloud-aws'
  | 'cloud-gcp'
  | 'cloud-azure'
  | 'onprem-selfhosted'
  | 'networking'
  | 'observability-sre'
  | 'cicd'
  | 'db-storage'
  | 'iam-secrets';

export type DevopsEnvironment = 'cloud' | 'onprem' | 'hybrid' | 'unknown';
export type DevopsInfraKind = 'problem-solution' | 'incident';
export type SolutionConfidence =
  | 'accepted'
  | 'highly-voted'
  | 'author-confirmed'
  | 'anecdotal'
  | 'none';
export type IncidentVerification = 'confirmed' | 'reported' | 'unverified';
export type SourceTextStatus = 'full' | 'search-excerpt' | 'incomplete';

export interface DevopsInfraSearchQuery {
  key: string;
  text: string;
  discoveryHint?: 'facebook' | 'telegram' | 'discord';
}

export interface DevopsInfraSourceItem {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  summary: string;
  body: string;
  imageUrl?: string;
  author?: string;
  publishedAt: string;
  collectedAt: string;
  discoveredAt: string;
  discoveryChannel: DevopsDiscoveryChannel;
  communityKey: string;
  sourceQuotaKey: string;
  sourceTextStatus: SourceTextStatus;
  answers: readonly DevopsInfraAnswer[];
  engagement?: { score?: number; comments?: number };
}

export interface DevopsInfraAnswer {
  body: string;
  score?: number;
  accepted?: boolean;
  authorConfirmed?: boolean;
}

export interface DevopsInfraCandidate {
  item: DevopsInfraSourceItem;
  kind: DevopsInfraKind;
  category: DevopsInfraCategory;
  environment: DevopsEnvironment;
  problem: string;
  rootCause?: string;
  solutionSteps: readonly string[];
  solutionConfidence: SolutionConfidence;
  verification?: IncidentVerification;
  fingerprint: string;
  score: number;
  scoreReasons: readonly string[];
}

export interface DevopsInfraMessage {
  text: string;
  url: string;
  imageUrl?: string;
}

export interface DevopsInfraSelectionResult {
  selected: DevopsInfraCandidate[];
  eligibleCount: number;
  skippedSeenCount: number;
}

export interface DevopsInfraCollectionResult {
  items: DevopsInfraSourceItem[];
  collectedCount: number;
  successfulSourceCount: number;
  failedSources: string[];
}

export interface DevopsInfraFlowResult {
  sent: true | false;
  reason?: 'no_new_articles';
  channel: 'telegram-devops-infra';
  messageCount: number;
  collectedCount: number;
  eligibleCount: number;
  skippedSeenCount: number;
  partial: boolean;
  failedSources: string[];
  language: 'vi';
}
```

- [ ] **Step 5: Create source and topic catalogs**

`src/config/devops-infra-sources.ts` must export:

- `DEVOPS_INFRA_SUBREDDITS`: `devops`, `sysadmin`, `kubernetes`, `aws`, `azure`, `googlecloud`, `selfhosted`, `homelab`, `linuxadmin`, `networking`, `sre`, `terraform`, `ansible`, `docker`, `gitlab`, `prometheus`, `proxmox` (exact 17 strings).
- `devopsInfraRedditQueries: DevopsInfraSearchQuery[]` — at least: crashloop/OOMKilled, terraform state lock, nginx 502, wireguard/on-prem, IAM AccessDenied, plus one Vietnamese query `kubernetes lỗi`.
- `DEVOPS_INFRA_STACKEXCHANGE_SITES`: `{ site: 'serverfault' | 'unix' | 'devops' | 'stackoverflow'; tags?: string[] }[]` with stackoverflow tags exactly `kubernetes,docker,terraform,amazon-web-services,azure,google-cloud-platform,linux,nginx,ansible,prometheus,gitlab-ci,networking`.
- `devopsInfraHnQueries`: CrashLoopBackOff/OOMKilled/ImagePullBackOff, terraform state lock/apply failed, AWS/GCP/Azure outage/postmortem, on-prem VPN/Proxmox/bare-metal Kubernetes, nginx 502/DNS/cert expiry/IAM AccessDenied.
- `buildDevopsInfraWebSearchQueries(max: number): DevopsInfraSearchQuery[]` returning at most `max` items, including general queries plus domain-scoped `site:facebook.com`, `site:t.me`, `site:discord.com` variants with `discoveryHint` set.
- `DEVOPS_INFRA_X_QUERY`: English/Vietnamese infra troubleshooting query ending with `-is:retweet`.

`src/config/devops-infra-topics.ts` exports keyword arrays (lowercase) per `DevopsInfraCategory`, plus incident keywords (`outage`, `cve`, `postmortem`, `status page`, `incident`, `sự cố`) and environment keywords (`eks/gke/aks/aws/gcp/azure` → cloud; `bare metal/proxmox/on-prem/self-hosted/homelab` → onprem; both → hybrid).

Test in `tests/config/devops-infra-sources.test.ts` that the 17 subreddits are present, stackoverflow tags match the spec list, `buildDevopsInfraWebSearchQueries(8)` length is `<= 8` and includes at least one `discoveryHint: 'telegram'`, and catalogs contain no politics query strings such as `Quốc hội`.

- [ ] **Step 6: Run catalog + env tests and commit**

Run: `npx vitest run tests/config/env.test.ts tests/config/devops-infra-sources.test.ts`
Expected: PASS.

```bash
git add src/config/env.ts tests/config/env.test.ts src/types/devops-infra.ts \
  src/config/devops-infra-sources.ts src/config/devops-infra-topics.ts \
  tests/config/devops-infra-sources.test.ts
git commit -m "$(cat <<'EOF'
feat: add devops-infra env, types, and source catalogs

EOF
)"
```

---

### Task 2: Adapter interface and Reddit collector

**Files:**
- Create: `src/services/devops-infra-source.adapter.ts`
- Create: `src/services/devops-infra-reddit.adapter.ts`
- Create: `tests/services/devops-infra-reddit.adapter.test.ts`

**Interfaces:**
- Consumes: `DevopsInfraSourceItem`, catalogs from Task 1, `env.USER_AGENT` / `REQUEST_TIMEOUT_MS`
- Produces: `DevopsInfraSourceAdapter` with `key`, `isEnabled()`, `collect()`; `DevopsInfraRedditAdapter`

```typescript
export interface DevopsInfraSourceAdapterResult {
  items: DevopsInfraSourceItem[];
  successfulSourceCount: number;
  failedSources: string[];
}

export interface DevopsInfraSourceAdapter {
  readonly key: string;
  isEnabled(): boolean;
  collect(): Promise<DevopsInfraSourceAdapterResult>;
}
```

- [ ] **Step 1: Write failing Reddit adapter tests**

Inject an HTTP client. Cover:

1. `isEnabled()` is always `true`.
2. Subreddit listing `GET https://www.reddit.com/r/{name}/new.json?limit=10` maps a self-post with permalink, `created_utc`, author, and selftext into a `DevopsInfraSourceItem` with `discoveryChannel: 'reddit'`, `communityKey: 'reddit:r/{sub}'`, `sourceQuotaKey` equal to that community key, canonical url `https://www.reddit.com{permalink}` without trailing slash duplication.
3. Search `GET https://www.reddit.com/search.json` is called for catalog queries; a 429 on one query adds `reddit:{query.key}` to `failedSources` and does not drop other successes.
4. Comment fetch `GET https://www.reddit.com{permalink}.json` attaches answers; an OP reply containing `this worked` sets `authorConfirmed: true`; a comment with score `5` vs sibling `1` is kept as highly-voted input (confidence itself is assigned in classification, but `answers[].score` must be preserved).
5. Removed/deleted posts (`[removed]`, `[deleted]`, missing permalink) are skipped.
6. Comment-fetch failure still returns the post with `answers: []` and `sourceTextStatus: 'incomplete'`.
7. Cap comment fetches at 15 per run (16th post has empty answers without a comments GET).
8. Response bodies and headers in fixtures contain no credentials.

- [ ] **Step 2: Run Reddit tests and verify RED**

Run: `npx vitest run tests/services/devops-infra-reddit.adapter.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement the Reddit adapter**

Class `DevopsInfraRedditAdapter implements DevopsInfraSourceAdapter`, `key = 'reddit'`. Use axios with `timeout: env.REQUEST_TIMEOUT_MS`, `maxRedirects: 0`, `maxContentLength: 512 * 1024`, header `User-Agent: env.USER_AGENT`. Query concurrency 2. Reuse compact-text and public http(s) URL parsing locally (copy small helpers; do not import politics mappers). `collect()` runs subreddit listings and searches with `Promise` batching; comment fetches run after unique permalinks are known.

- [ ] **Step 4: Run tests PASS and commit**

Run: `npx vitest run tests/services/devops-infra-reddit.adapter.test.ts`
Expected: PASS.

```bash
git add src/services/devops-infra-source.adapter.ts \
  src/services/devops-infra-reddit.adapter.ts \
  tests/services/devops-infra-reddit.adapter.test.ts
git commit -m "$(cat <<'EOF'
feat: collect devops-infra Reddit posts and answers

EOF
)"
```

---

### Task 3: Stack Exchange adapter

**Files:**
- Create: `src/services/devops-infra-stackexchange.adapter.ts`
- Create: `tests/services/devops-infra-stackexchange.adapter.test.ts`

**Interfaces:**
- Consumes: `DEVOPS_INFRA_STACKEXCHANGE_SITES`, `env.STACKEXCHANGE_KEY`, adapter interface
- Produces: `DevopsInfraStackExchangeAdapter` (`key = 'stackexchange'`)

- [ ] **Step 1: Write failing tests**

1. `isEnabled()` is always `true` even when `STACKEXCHANGE_KEY` is empty.
2. For `serverfault`, GET `https://api.stackexchange.com/2.3/questions` with params `order=desc`, `sort=creation`, `site=serverfault`, `fromdate` = floor(now/1000) minus `DEVOPS_INFRA_MAX_AGE_HOURS * 3600`, `filter=withbody`, `answers=1`. Optional `key` param is omitted when empty and present when configured (assert the configured key is not logged).
3. A question with an `accepted_answer_id` includes that answer body with `accepted: true`.
4. Without accepted answer, include the highest-scoring answer body.
5. Questions with zero answers are skipped.
6. HTTP 400 on `unix` adds `stackexchange:unix` to `failedSources` and still returns `serverfault` items.
7. Stack Overflow requests include `tagged` joined by `;` from the spec tag list.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/services/devops-infra-stackexchange.adapter.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Use the public API 2.3. Map `link` to `url`, `creation_date` to ISO `publishedAt`, `communityKey` / `sourceQuotaKey` to `stackexchange:{site}`. `discoveryChannel: 'stackexchange'`. `sourceTextStatus: 'full'` when body+answer exist.

- [ ] **Step 4: PASS and commit**

```bash
git add src/services/devops-infra-stackexchange.adapter.ts \
  tests/services/devops-infra-stackexchange.adapter.test.ts
git commit -m "$(cat <<'EOF'
feat: collect devops-infra Stack Exchange threads

EOF
)"
```

---

### Task 4: Hacker News adapter

**Files:**
- Create: `src/services/devops-infra-hn.adapter.ts`
- Create: `tests/services/devops-infra-hn.adapter.test.ts`

**Interfaces:**
- Consumes: `devopsInfraHnQueries`, adapter interface
- Produces: `DevopsInfraHnAdapter` (`key = 'hn-search'`)

- [ ] **Step 1: Write failing tests**

1. GET `https://hn.algolia.com/api/v1/search` with `query` from catalog, `numericFilters=created_at_i>{fromUnix}`, `hitsPerPage=10`.
2. Map `story_url` or `https://news.ycombinator.com/item?id={objectID}` as `url`; require http(s). Set `communityKey` and `sourceQuotaKey` to `hn`.
3. Include `comment_text` or `story_text` as `body`.
4. One query HTTP failure adds `hn:{query.key}` to `failedSources`; other queries still succeed. If every query fails, `successfulSourceCount` is 0 and `failedSources` includes those keys (source service later rolls them up; adapter `key` remains `hn-search`).
5. Hits older than `DEVOPS_INFRA_MAX_AGE_HOURS` are dropped even if Algolia returns them.

- [ ] **Step 2: RED, implement, PASS, commit**

```bash
git add src/services/devops-infra-hn.adapter.ts tests/services/devops-infra-hn.adapter.test.ts
git commit -m "$(cat <<'EOF'
feat: collect devops-infra Hacker News threads

EOF
)"
```

---

### Task 5: Brave web search and X adapters

**Files:**
- Modify: `src/services/web-search.provider.ts`
- Modify: `src/services/brave-web-search.provider.ts`
- Create: `src/services/devops-infra-web-search.adapter.ts`
- Create: `src/services/devops-infra-x.adapter.ts`
- Create: `tests/services/devops-infra-web-search.adapter.test.ts`
- Create: `tests/services/devops-infra-x.adapter.test.ts`

**Interfaces:**
- Consumes: `WebSearchProvider`, `SafeWebRetrievalService`, `buildDevopsInfraWebSearchQueries`, `XSearchCrawler`, `env.BRAVE_SEARCH_API_KEY`, `env.DEVOPS_INFRA_WEB_SEARCH_MAX_QUERIES`, `env.X_BEARER_TOKEN`
- Produces: `DevopsInfraWebSearchAdapter` (`key = 'web-search'`), `DevopsInfraXAdapter` (`key = 'x-search'`)

- [ ] **Step 1: Widen web-search query type**

Change `WebSearchProvider.search` to accept `{ key: string; text: string }` instead of `PoliticsSearchQuery`. Update `BraveWebSearchProvider.search` signature the same way. Existing politics callers remain valid because `PoliticsSearchQuery` has `key` and `text`. Run `npx vitest run tests/services/brave-web-search.provider.test.ts tests/services/politics-web-search.adapter.test.ts` and keep them green. Do not change politics query contents.

- [ ] **Step 2: Write failing web-search adapter tests**

1. Empty Brave key → `isEnabled() === false`; `collect()` returns empty items, `successfulSourceCount: 0`, `failedSources: []` without calling search.
2. `maxQueries: 0` → disabled even if a key exists.
3. Enabled adapter calls `provider.search` at most `DEVOPS_INFRA_WEB_SEARCH_MAX_QUERIES` times with devops queries only (assert no `Quốc hội` / gold-politics query text).
4. A result with http(s) URL, snippet ≥ 80 chars, and in-window `publishedAt` is kept. After `retrieval.retrieve(url)` succeeds with HTML text, `sourceTextStatus: 'full'` and `body` comes from retrieved text (strip tags, compact, cap 2000 chars).
5. Retrieval failure falls back to snippet with `sourceTextStatus: 'search-excerpt'` only when URL + snippet + timestamp exist; otherwise drop.
6. Infer `discoveryChannel`: `facebook.com` → `facebook`, `t.me`/`telegram.me` → `telegram`, `discord.com`/`discord.gg` → `discord`, else `web`. Set `sourceQuotaKey` to `registrablePublisherKey(url)` when available, otherwise the inferred channel name.
7. One query throw → `failedSources` includes `web:{query.key}`; other queries still collect.
8. Reject `javascript:` / `http://127.0.0.1/...` URLs without calling retrieve.
9. Do not pass discovered image URLs through; omit `imageUrl` unless a later task adds a safe image pipeline (this iteration: omit `imageUrl` on web/social items).

- [ ] **Step 3: Write failing X adapter tests**

1. Empty `X_BEARER_TOKEN` → `isEnabled() === false`; no crawler call.
2. Enabled: crawler called with `query: DEVOPS_INFRA_X_QUERY`, `includeUnmatched: true`, `maxResults: 20`.
3. Maps article URL `https://x.com/i/web/status/{id}`, author to `communityKey: 'x:{handle}'`.
4. Crawler throw → `failedSources: ['x-search']`, `successfulSourceCount: 0`.
5. `communityKey` and `sourceQuotaKey` are `x:{handle}` when an author handle exists, otherwise `x.com`.

- [ ] **Step 4: Implement both adapters, PASS, commit**

Web adapter reuses `SafeWebRetrievalService.retrieve`. Retrieval concurrency 3, unique-URL budget 15. X adapter wraps `XSearchCrawler` the same way `PoliticsXAdapter` does, but uses `DEVOPS_INFRA_X_QUERY` and maps to `DevopsInfraSourceItem` (no politics types).

```bash
git add src/services/web-search.provider.ts src/services/brave-web-search.provider.ts \
  src/services/devops-infra-web-search.adapter.ts src/services/devops-infra-x.adapter.ts \
  tests/services/devops-infra-web-search.adapter.test.ts \
  tests/services/devops-infra-x.adapter.test.ts
git commit -m "$(cat <<'EOF'
feat: add devops-infra web search and X adapters

EOF
)"
```

---

### Task 6: Discord and Facebook adapters

**Files:**
- Create: `src/services/devops-infra-discord.adapter.ts`
- Create: `src/services/devops-infra-facebook.adapter.ts`
- Create: `src/utils/devops-infra-allowlist.ts`
- Create: `tests/services/devops-infra-discord.adapter.test.ts`
- Create: `tests/services/devops-infra-facebook.adapter.test.ts`

**Interfaces:**
- Consumes: `env.DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ALLOWLIST`, `FACEBOOK_ACCESS_TOKEN`, `FACEBOOK_PAGE_ALLOWLIST`
- Produces: `parseDiscordChannelAllowlist(raw: string): { guildId: string; channelId: string }[]`, `parseFacebookPageAllowlist(raw: string): string[]`, `DevopsInfraDiscordAdapter`, `DevopsInfraFacebookAdapter`

- [ ] **Step 1: Write failing allowlist + Discord tests**

`parseDiscordChannelAllowlist('1:2, 3:4')` → two pairs. Ignore malformed tokens (`abc`, `1:`, `:2`, extra colons). Empty/whitespace → `[]`.

Discord:

1. Missing token, missing allowlist, or empty parse → `isEnabled() === false`; no HTTP.
2. Enabled: for each pair, GET `https://discord.com/api/v10/channels/{channelId}/messages?limit=50` with header `Authorization: Bot {token}` (assert header is used, never logged).
3. Map message `id`, `content`, `timestamp`, author username, url `https://discord.com/channels/{guildId}/{channelId}/{messageId}`, `communityKey` and `sourceQuotaKey` both `discord:{channelId}`. Skip empty content, bots if `author.bot === true`, and messages whose `channel_id` is not allowlisted (defense in depth).
4. HTTP 403 on one channel → `failedSources: ['discord:{channelId}']`; other channels still succeed.
5. Adapter must not call guild-list, DM, or invite-join endpoints (assert HTTP URLs called are only the allowlisted channel message URLs).

- [ ] **Step 2: Write failing Facebook tests**

1. Missing token or empty page allowlist → disabled, no HTTP.
2. Enabled: GET `https://graph.facebook.com/v21.0/{pageId}/feed` with `fields=message,created_time,permalink_url` and `access_token` as query param (do not log the token).
3. Skip posts without `message` or `permalink_url`. Set `communityKey` and `sourceQuotaKey` to `facebook:{pageId}`.
4. Page ID not in allowlist is never requested even if passed to a malicious constructor override — the adapter reads env/allowlist only.
5. HTTP 400 on one page → `facebook:{pageId}` failure key; other pages succeed.
6. No groups endpoint (`/{id}/feed` on allowlisted page IDs only).

- [ ] **Step 3: Implement, PASS, commit**

```bash
git add src/utils/devops-infra-allowlist.ts \
  src/services/devops-infra-discord.adapter.ts \
  src/services/devops-infra-facebook.adapter.ts \
  tests/services/devops-infra-discord.adapter.test.ts \
  tests/services/devops-infra-facebook.adapter.test.ts
git commit -m "$(cat <<'EOF'
feat: add optional Discord and Facebook devops-infra adapters

EOF
)"
```

---

### Task 7: Source service (all-settled collection)

**Files:**
- Create: `src/services/devops-infra-source.service.ts`
- Create: `tests/services/devops-infra-source.service.test.ts`

**Interfaces:**
- Consumes: `DevopsInfraSourceAdapter[]`
- Produces: `DevopsInfraSourceService.collectLatest(): Promise<DevopsInfraCollectionResult>`

- [ ] **Step 1: Write failing tests**

Inject fake adapters.

1. Disabled adapter is not `collect()`-ed and does not appear in `failedSources`.
2. Two enabled successes concatenate items; `successfulSourceCount` is 2; `collectedCount` is `items.length`; `failedSources` sorted uniquely.
3. Enabled adapter throw → catch, treat as `{ items: [], successfulSourceCount: 0, failedSources: [adapter.key] }`.
4. Duplicate URLs across adapters: keep the first occurrence (stable adapter order). Canonicalize with existing `normalizeUrl`.
5. Drop items missing http(s) URL, empty title+body, or `publishedAt`/`discoveredAt` older than `DEVOPS_INFRA_MAX_AGE_HOURS`.
6. Adapter order used by the production factory (document in test comment, enforce in factory task): Reddit, Stack Exchange, HN, web, X, Discord, Facebook.

- [ ] **Step 2: Implement `collectLatest` with `Promise.allSettled` over `adapters.filter(a => a.isEnabled())`, PASS, commit**

```bash
git add src/services/devops-infra-source.service.ts \
  tests/services/devops-infra-source.service.test.ts
git commit -m "$(cat <<'EOF'
feat: aggregate devops-infra sources without failing the run

EOF
)"
```

---

### Task 8: Classification (kind, category, environment, solution confidence)

**Files:**
- Create: `src/services/devops-infra-classification.service.ts`
- Create: `tests/services/devops-infra-classification.service.test.ts`

**Interfaces:**
- Consumes: `DevopsInfraSourceItem`, keyword tables from `devops-infra-topics.ts`
- Produces: `classifyDevopsInfraItem(item): DevopsInfraCandidate | undefined` (undefined = reject as off-topic/ad/no-solution-problem)

- [ ] **Step 1: Write failing tests with fixtures**

Use a helper `item(overrides)` with a valid URL and now-iso timestamps.

1. Kubernetes CrashLoopBackOff + accepted answer steps → `kind: 'problem-solution'`, `category: 'k8s-containers'`, `solutionConfidence: 'accepted'`, `solutionSteps` non-empty, `problem` from title/body.
2. Same without any answers and no fix phrases → `undefined` (problem-solution + none is rejected here).
3. AWS status-page outage thread, no fix → `kind: 'incident'`, `category: 'cloud-aws'`, `verification: 'reported'` unless body contains `status.aws.amazon.com` / `official advisory` / `CVE-` → `confirmed`; rumor-only social post → `unverified`.
4. Proxmox + self-hosted keywords → `environment: 'onprem'`; EKS → `cloud`; both Proxmox and EKS → `hybrid`; neither → `unknown`.
5. Tool advertisement (“best DevOps platform 50% off”) → `undefined`.
6. Product launch without an operational failure → `undefined`.
7. Exactly one category: if k8s and aws both match, prefer `k8s-containers` when the title is about pods/helm/kubectl; prefer `cloud-aws` when the title is about IAM/S3/EKS control plane without k8s error tokens. Encode this as: score each category by keyword hits in title (weight 3) + body (weight 1); pick the unique max; tie-break by the spec category order listed in `DevopsInfraCategory`.
8. `rootCause` set only when body/answers match `caused by|root cause|nguyên nhân` followed by a clause; otherwise omitted (do not guess).
9. `fingerprint` = lowercase alphanumeric compact of first 12 words of title+problem, min length 8 or reject.
10. `authorConfirmed` answer → `author-confirmed` unless `accepted` exists (accepted wins). Highest answer score ≥ 2 and strictly greater than siblings → `highly-voted`. Else if any answer has a command/config step → `anecdotal`.
11. Incident may have `solutionConfidence: 'none'` and still classify.

- [ ] **Step 2: Implement, PASS, commit**

```bash
git add src/services/devops-infra-classification.service.ts \
  tests/services/devops-infra-classification.service.test.ts
git commit -m "$(cat <<'EOF'
feat: classify devops-infra forum threads

EOF
)"
```

---

### Task 9: Deduplication

**Files:**
- Create: `src/services/devops-infra-dedupe.service.ts`
- Create: `tests/services/devops-infra-dedupe.service.test.ts`

**Interfaces:**
- Produces: `dedupeDevopsInfraCandidates(candidates: readonly DevopsInfraCandidate[]): DevopsInfraCandidate[]`

- [ ] **Step 1: Write failing tests**

1. Same `normalizeUrl(url)` keeps one (first).
2. Same `fingerprint` keeps the representative that is better by: `accepted` > `highly-voted` > `author-confirmed` > `anecdotal` > `none`, then longer `item.body`, then earlier `publishedAt`.
3. Dice/Jaccard on fingerprint tokens ≥ 0.85 treats as the same event (pick a simple token Jaccard; document threshold 0.85).
4. Different fingerprints and URLs stay separate.
5. Output order is deterministic: remaining candidates sorted by original input index.

- [ ] **Step 2: Implement, PASS, commit**

```bash
git add src/services/devops-infra-dedupe.service.ts \
  tests/services/devops-infra-dedupe.service.test.ts
git commit -m "$(cat <<'EOF'
feat: dedupe devops-infra threads by URL and fingerprint

EOF
)"
```

---

### Task 10: Selection

**Files:**
- Create: `src/services/devops-infra-selection.service.ts`
- Create: `tests/services/devops-infra-selection.service.test.ts`

**Interfaces:**
- Consumes: `classifyDevopsInfraItem`, `dedupeDevopsInfraCandidates`, `env.DEVOPS_INFRA_MAX_ARTICLES`, `env.DEVOPS_INFRA_MAX_INCIDENTS`
- Produces: `DevopsInfraSelectionService.select(items, seenUrls): DevopsInfraSelectionResult`

Scoring (integer, deterministic):

```
ageHours = max(0, (now - publishedAt) / 36e5)
freshness = max(0, 72 - floor(ageHours))
relevance = categoryKeywordHits
solution = accepted 40 | highly-voted 30 | author-confirmed 25 | anecdotal 10 | none 0
completeness = (environment !== unknown ? 8 : 0) + (rootCause ? 5 : 0) + min(10, solutionSteps.length * 2)
engagement = min(20, floor(log2(1 + max(0, item.engagement?.score ?? 0))))
score = freshness + relevance + solution + completeness + engagement
```

`scoreReasons` lists which addends were non-zero (`freshness:70`, `solution:accepted`, …).

- [ ] **Step 1: Write failing tests**

Fixed `now`. Build classified candidates via the real classifier or by constructing `DevopsInfraCandidate` objects directly (prefer constructing candidates so this suite does not depend on live keyword tweaks).

1. URLs in `seenUrls` increment `skippedSeenCount` and are not selected.
2. Off-topic items (pass through classifier returning undefined) do not increment eligible.
3. `eligibleCount` is post-classify, post-age, pre-history? Spec: reject stale/malformed before selection; history is skipped. Define: `eligibleCount` = classified+deduped not-yet-filtered-by-caps count after dropping seen URLs. `skippedSeenCount` = classified items dropped for seen URL.
4. When both cloud and on-prem exist in eligible set, selected set contains ≥1 each even if a high-scoring third environment would otherwise fill slots (anchor first, then score).
5. At most 3 `incident`.
6. At most 2 per `category`.
7. At most 4 combined `cloud-aws` + `cloud-gcp` + `cloud-azure`.
8. At most 2 per `sourceQuotaKey`.
9. Length ≤ `DEVOPS_INFRA_MAX_ARTICLES`.
10. Prefer problem-solution with accepted/highly-voted/author-confirmed over anecdotal when filling remaining slots (after anchors and caps).
11. Same inputs + same now → deep-equal selected URLs.
12. Backfill by score after anchors without violating caps.

Algorithm order (implement exactly):

1. Classify each item; drop undefined.
2. Drop seen URLs; count skips.
3. Dedupe.
4. Score remaining.
5. Partition into buckets. Pick on-prem anchor = highest-score `environment === 'onprem'` if any. Pick cloud anchor = highest-score `environment === 'cloud'` if any. Seed `selected` with those that exist (cloud first then on-prem if both, to stay deterministic).
6. Walk remaining by score descending, then url ascending. Accept if all caps still hold (incidents, per-category, cloud-family, per-source, max articles). Skip `incident` if incident cap reached. When adding would exceed a cap, skip that candidate.
7. Stop at max articles.

- [ ] **Step 2: Implement, PASS, commit**

```bash
git add src/services/devops-infra-selection.service.ts \
  tests/services/devops-infra-selection.service.test.ts
git commit -m "$(cat <<'EOF'
feat: select devops-infra digest with caps and coverage anchors

EOF
)"
```

---

### Task 11: Editorial validator and editorial service

**Files:**
- Create: `src/services/devops-infra-editorial-validator.ts`
- Create: `src/services/devops-infra-editorial.types.ts`
- Create: `src/services/devops-infra-editorial.service.ts`
- Create: `src/services/devops-infra-codex-editorial.generator.ts`
- Create: `src/services/devops-infra-google-editorial.generator.ts`
- Create: `src/services/devops-infra-openai-editorial.generator.ts`
- Create: `tests/services/devops-infra-editorial-validator.test.ts`
- Create: `tests/services/devops-infra-editorial.service.test.ts`

**Interfaces:**

```typescript
export interface DevopsInfraEditorial {
  title: string;
  problem: string;
  rootCause?: string;
  solutionSteps: string[];
  caution: string;
}

export function validateDevopsInfraEditorial(
  editorial: DevopsInfraEditorial,
  candidate: DevopsInfraCandidate,
): DevopsInfraEditorial

export class DevopsInfraEditorialService {
  constructor(
    generator?: DevopsInfraEditorialGenerator,
    fallback?: DevopsInfraEditorialGenerator,
  )
  edit(candidate: DevopsInfraCandidate): Promise<DevopsInfraEditorial>
}
```

- [ ] **Step 1: Write failing validator tests**

Source corpus = `candidate.item.title + body + answers[].body + problem + solutionSteps`.

1. A generated solution step containing `kubectl delete namespace production` when that string is absent from corpus is dropped; if all steps are invalid, replace with deterministic steps copied from `candidate.solutionSteps` (or a one-line “thread describes a workaround; see original”).
2. Generated `rootCause` omitted when candidate has no `rootCause`, even if the model invented one.
3. Technical tokens present in corpus as `/[A-Za-z][A-Za-z0-9_.-]{2,}/` plus backtick spans must remain in `problem` or `solutionSteps` after validation; if the model translated `CrashLoopBackOff` to a Vietnamese paraphrase and dropped the token, restore deterministic copy for that field.
4. HTML `<` `>` `&` in editorial fields are not escaped here (message service escapes); validator still rejects a field containing `javascript:`.
5. Title bounded to 240 chars, problem 720, each step 280, caution 360 using the same UTF-16 truncate helper pattern as politics (`truncateUtf16`).

Deterministic fallback copy (Vietnamese):

- title: compact original title (keep tokens)
- problem: first 720 chars of symptom from candidate.problem
- rootCause: candidate.rootCause if any
- solutionSteps: candidate.solutionSteps
- caution: `Một thread diễn đàn không phải runbook chính thức.` plus destructive caution when corpus matches `rm -rf|mkfs|drop database|disable.*auth|kubectl delete` : `Lệnh trong thread có thể phá hủy dữ liệu; kiểm tra trên môi trường của bạn.`

- [ ] **Step 2: Write failing editorial service tests**

1. Generator success that passes validation is returned.
2. Generator throw → fallback copy, never throw.
3. Generator success that fails validation → validated/fallback fields, never drop the candidate (service always returns editorial).
4. No generator (`new DevopsInfraEditorialService()`) returns deterministic fallback without calling a model.

5. Primary throw + fallback success → fallback editorial after validation.

Do not log candidate source text or secrets on generator failure; log only `error.name`.

- [ ] **Step 3: Implement generators and service**

Do not reuse `ArticleEditorialService` or `CodexArticleEditorialGenerator` (wrong JSON keys). Create:

`src/services/devops-infra-editorial.types.ts`:

```typescript
export const devopsInfraEditorialInstructions = [
  'Edit this infrastructure forum thread into Vietnamese.',
  'Return only a JSON object with keys title, problem, rootCause, solutionSteps, caution.',
  'solutionSteps must be a JSON array of strings. rootCause may be null.',
  'Do not invent commands, flags, file paths, IPs, or root causes absent from the input.',
  'Keep technical tokens unchanged (CrashLoopBackOff, IAM, kubectl, terraform, systemctl, CVE IDs).',
  'A forum thread is not an official runbook.',
].join('\n');

export interface DevopsInfraEditorialGenerator {
  generate(candidate: DevopsInfraCandidate): Promise<DevopsInfraEditorial>;
}
```

`DevopsInfraCodexEditorialGenerator` calls `CodexExecRunner.run(devopsInfraEditorialInstructions, JSON.stringify({ title, body, answers, problem, rootCause, solutionSteps, kind }), timeoutMs)`, parses JSON, throws on missing `title`/`problem`/`solutionSteps`/`caution`.

`DevopsInfraGoogleEditorialGenerator` calls `GoogleTranslationService.translateDigest` with the same instructions + JSON payload and parses JSON the same way.

`DevopsInfraOpenAIEditorialGenerator` copies the existing OpenAI article generator HTTP pattern but requests the devops JSON keys above (not article `actionLevel` keys).

`DevopsInfraEditorialService`:

```typescript
constructor(
  private readonly generator?: DevopsInfraEditorialGenerator,
  private readonly fallback?: DevopsInfraEditorialGenerator,
) {}

async edit(candidate: DevopsInfraCandidate): Promise<DevopsInfraEditorial> {
  const fallbackCopy = deterministicFallback(candidate);
  for (const current of [this.generator, this.fallback]) {
    if (!current) continue;
    try {
      return validateDevopsInfraEditorial(await current.generate(candidate), candidate);
    } catch (error) {
      console.warn('devops-infra editorial failed', error instanceof Error ? error.name : 'unknown');
    }
  }
  return fallbackCopy;
}
```

Test that the Codex prompt contains `Do not invent commands` and `Keep technical tokens unchanged`.

- [ ] **Step 4: PASS and commit**

```bash
git add src/services/devops-infra-editorial-validator.ts \
  src/services/devops-infra-editorial.types.ts \
  src/services/devops-infra-editorial.service.ts \
  src/services/devops-infra-codex-editorial.generator.ts \
  src/services/devops-infra-google-editorial.generator.ts \
  src/services/devops-infra-openai-editorial.generator.ts \
  tests/services/devops-infra-editorial-validator.test.ts \
  tests/services/devops-infra-editorial.service.test.ts
git commit -m "$(cat <<'EOF'
feat: validate source-grounded devops-infra editorial copy

EOF
)"
```

---

### Task 12: Message HTML and sequential delivery

**Files:**
- Create: `src/services/devops-infra-message.service.ts`
- Create: `src/services/devops-infra-delivery.service.ts`
- Create: `tests/services/devops-infra-message.service.test.ts`
- Create: `tests/services/devops-infra-delivery.service.test.ts`

**Interfaces:**
- Consumes: `escapeHtml` from `src/utils/text.ts`, `TelegramService.sendDigest`, `SentHistoryStore.mark`
- Produces: `buildMessages(candidates): Promise<DevopsInfraMessage[]>`, `DevopsInfraDeliveryService.send(messages)`

Category labels (Vietnamese):

| key | label |
| --- | --- |
| k8s-containers | Kubernetes/Container |
| cloud-aws | AWS |
| cloud-gcp | GCP |
| cloud-azure | Azure |
| onprem-selfhosted | On-prem/Self-hosted |
| networking | Mạng/DNS/LB |
| observability-sre | Observability/SRE |
| cicd | CI/CD |
| db-storage | DB/Storage |
| iam-secrets | IAM/Secrets |

Environment: `Cloud` / `On-prem` / `Hybrid` / omit if `unknown`.

- [ ] **Step 1: Write failing message tests**

1. Problem-solution order: category+environment, `Bài toán`, escaped title, time `Asia/Ho_Chi_Minh`, `Bài toán:`, optional `Nguyên nhân:` omitted when no rootCause, `Cách xử lý:` numbered steps, `Độ tin cậy lời giải:` with Vietnamese confidence, `Lưu ý:`, source line, disclaimer `Tham khảo từ diễn đàn, kiểm tra trên môi trường của bạn trước khi áp dụng.`
2. Incident unverified: `🔴 CHƯA KIỂM CHỨNG` before title; `Cách xử lý` block is a “diễn đàn/vendor đang nói gì” summary, not numbered fake runbook; omit confidence when `none`.
3. `<script>` in title appears escaped as `&lt;script&gt;`.
4. Destructive corpus adds the destructive caution inside `Lưu ý`.
5. `imageUrl` omitted (this iteration) even if `item.imageUrl` is set, unless it is http(s) and not private — **spec allows og:image after public-host check**. Implement: include `imageUrl` only when `item.imageUrl` parses as http(s) without credentials and hostname is not localhost/private IP literal. Do not DNS-resolve images here; skip hostnames that are IPv4 private literals. Otherwise omit.
6. Button text is not in `text` (delivery passes `'Xem thread gốc'`).

Confidence labels: `accepted` → `Câu trả lời được chấp nhận`; `highly-voted` → `Câu trả lời điểm cao`; `author-confirmed` → `Tác giả xác nhận`; `anecdotal` → `Chỉ là trải nghiệm`.

- [ ] **Step 2: Write failing delivery tests**

Mirror gold-politics delivery without a price prelude:

1. Sends messages sequentially via `sendDigest(text, url, imageUrl, 'Xem thread gốc')`.
2. `history.mark(url)` runs only after that send succeeds.
3. Send failure on message 2 does not mark message 2; message 1 already marked; throw `DevopsInfraDeliveryError('telegram-send-failed')`.
4. Mark failure throws `DevopsInfraDeliveryError('sent-history-mark-failed')`.
5. Logs only error name/status, never message text or URLs that could contain tokens.

- [ ] **Step 3: Implement, PASS, commit**

```bash
git add src/services/devops-infra-message.service.ts \
  src/services/devops-infra-delivery.service.ts \
  tests/services/devops-infra-message.service.test.ts \
  tests/services/devops-infra-delivery.service.test.ts
git commit -m "$(cat <<'EOF'
feat: render and deliver devops-infra Telegram messages

EOF
)"
```

---

### Task 13: Flow factory, route, and lock

**Files:**
- Create: `src/services/devops-infra-flow.service.ts`
- Create: `tests/services/devops-infra-flow.service.test.ts`
- Create: `tests/services/devops-infra-flow.factory.test.ts`
- Create: `tests/routes/telegram-devops-infra.routes.test.ts`
- Modify: `src/controllers/telegram.controller.ts`
- Modify: `src/routes/telegram.routes.ts`

**Interfaces:**
- Produces: `DevopsInfraFlowService.run()`, `createDevopsInfraFlowService()`, `AllDevopsInfraSourcesFailedError`, `DevopsInfraFlowError`, `isAllDevopsInfraSourcesFailedError`, `assertDevopsInfraConfigured`

- [ ] **Step 1: Write failing flow unit tests**

Inject fakes.

1. All enabled sources fail (`successfulSourceCount === 0`) → throw `AllDevopsInfraSourcesFailedError` (`name` set); send is not called.
2. Success with selected messages → `sent: true`, `channel: 'telegram-devops-infra'`, `language: 'vi'`, `messageCount` equals messages length, `partial: true` iff `failedSources.length > 0`.
3. Selection empty → `sent: false`, `reason: 'no_new_articles'`, `messageCount: 0`, delivery not called.
4. History `seenUrls` throw → `DevopsInfraFlowError('sent-history-read-failed')` before build/send. Do not wrap `AllDevopsInfraSourcesFailedError`.
5. Adapter order in factory tests is asserted in the factory suite, not here.

- [ ] **Step 2: Write failing factory tests**

`assertDevopsInfraConfigured` trims token/chat and rejects empty, case-insensitive `test-devops-infra-token`, `test-devops-infra-chat-id`, and `replace_me` by throwing `DevopsInfraFlowError('telegram-not-configured')` with **no value in message/cause**. Call it first in `createDevopsInfraFlowService()` before constructing adapters. History store uses `env.DEVOPS_INFRA_HISTORY_PATH`, retention `DEVOPS_INFRA_HISTORY_RETENTION_DAYS`, `failurePolicy: 'fail-closed'` (same as gold-politics). Telegram via `createTelegramService(env.DEVOPS_INFRA_TELEGRAM_BOT_TOKEN, env.DEVOPS_INFRA_TELEGRAM_CHAT_ID)`.

Editorial wiring in the factory (exact):

```typescript
function createDevopsInfraEditorialService(): DevopsInfraEditorialService {
  switch (env.DEVOPS_INFRA_EDITORIAL_PROVIDER) {
    case 'none':
      return new DevopsInfraEditorialService();
    case 'google':
      return new DevopsInfraEditorialService(new DevopsInfraGoogleEditorialGenerator());
    case 'openai':
      return new DevopsInfraEditorialService(new DevopsInfraOpenAIEditorialGenerator());
    default:
      return new DevopsInfraEditorialService(
        new DevopsInfraCodexEditorialGenerator(),
        new DevopsInfraGoogleEditorialGenerator(),
      );
  }
}
```

- [ ] **Step 3: Write failing route tests**

Follow `tests/routes/telegram-gold-politics.routes.test.ts`:

- Mock `createDevopsInfraFlowService` with vi.hoisted.
- Also mock gadget/health/gold-politics factories so concurrent-lock tests can prove isolation.
- POST `/telegram/send-devops-infra` returns flow JSON on 200.
- `AllDevopsInfraSourcesFailedError` → 503 `{ error: 'All devops-infra sources failed' }`.
- Concurrent second call → 409 `{ error: 'DevOps infra digest is already running' }`.
- Does not block gadget/health/gold-politics while running, and is not blocked by them.
- Factory is not called on `createApp()` import (lazy singleton).
- Delivery/flow errors map to 500 without leaking injected secrets (copy the gold-politics secret-guard helpers; use distinct dummy strings, never real tokens).

- [ ] **Step 4: Implement flow, controller, route**

Controller pattern:

```typescript
let devopsInfraFlowService: ReturnType<typeof createDevopsInfraFlowService> | undefined;
let devopsInfraDigestRunning = false;

export async function sendDevopsInfra(_req: Request, res: Response) {
  if (devopsInfraDigestRunning) {
    res.status(409).json({ error: 'DevOps infra digest is already running' });
    return;
  }
  devopsInfraDigestRunning = true;
  try {
    devopsInfraFlowService ??= createDevopsInfraFlowService();
    res.json(await devopsInfraFlowService.run());
  } catch (error) {
    if (isAllDevopsInfraSourcesFailedError(error)) {
      res.status(503).json({ error: 'All devops-infra sources failed' });
      return;
    }
    throw error;
  } finally {
    devopsInfraDigestRunning = false;
  }
}
```

Register `telegramRoutes.post('/telegram/send-devops-infra', sendDevopsInfra);`

`run()` algorithm:

1. `collectLatest()`
2. if `successfulSourceCount === 0` throw all-failed
3. `seenUrls()` (map store errors to `sent-history-read-failed`)
4. `select(items, seen)`
5. if selected empty, return `sent: false` with counts and `partial`
6. `buildMessages` then `delivery.send`
7. return `sent: true` with counts

- [ ] **Step 5: PASS focused tests plus a regression slice, commit**

Run:

```bash
npx vitest run tests/services/devops-infra-flow.service.test.ts \
  tests/services/devops-infra-flow.factory.test.ts \
  tests/routes/telegram-devops-infra.routes.test.ts \
  tests/routes/telegram-gold-politics.routes.test.ts \
  tests/routes/telegram-health.routes.test.ts \
  tests/routes/telegram-gadgets.routes.test.ts
```

Expected: PASS.

```bash
git add src/services/devops-infra-flow.service.ts \
  src/controllers/telegram.controller.ts src/routes/telegram.routes.ts \
  tests/services/devops-infra-flow.service.test.ts \
  tests/services/devops-infra-flow.factory.test.ts \
  tests/routes/telegram-devops-infra.routes.test.ts
git commit -m "$(cat <<'EOF'
feat: expose POST /telegram/send-devops-infra

EOF
)"
```

---

### Task 14: Operator docs

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Add env example keys with `replace_me` / empty optional tokens** (never real secrets). Document Discord allowlist format `guildId:channelId,guildId:channelId` and Facebook page IDs. State that empty Discord/Facebook/Brave/X disables those adapters.

- [ ] **Step 2: README section “Luồng DevOps infra”** covering: dedicated chat, problem+solution vs incident cap 3/12, Vietnamese with original technical terms, public forums + optional official APIs, `curl -X POST` example, no login/private groups, disclaimer, Helm 08:40.

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "$(cat <<'EOF'
docs: document devops-infra Telegram flow

EOF
)"
```

---

### Task 15: Helm CronJob in sibling repo `/root/helm`

This task is a **different git repository**. Before any helm edit:

```bash
cd /root/helm
git fetch origin main
git checkout -B feature/devops-infra-telegram origin/main
```

Do not commit helm secrets that are not already in `values.yaml`. Add new keys beside existing `secretEnv` entries. For `DEVOPS_INFRA_TELEGRAM_BOT_TOKEN` / `CHAT_ID`, copy the same dummy-token *style* already used by neighboring bot keys in that file (the chart test rejects `replace_me` and `test-*`). Do not paste tokens into this plan or into chat. Empty-string is correct for `STACKEXCHANGE_KEY`, `DISCORD_*`, `FACEBOOK_*` until the operator fills them.

**Files:**
- Modify: `tech-news-telegram/values.yaml`
- Modify: `tech-news-telegram/tests/render-test.sh`

- [ ] **Step 1: Update render-test expectations first (RED)**

- CronJob kind count `4` → `5` (all places: default render, `timeZone` count, `concurrencyPolicy` count).
- `namespace_count` `9` → `10`.
- `assert_cronjob test-tech-news-telegram-devops-infra "40 8 * * *" /telegram/send-devops-infra`
- `health.enabled=false` CronJob count `3` → `4`.
- Add every new env key to the `for key in` existence loop.
- `secret_env_count` `58` → `72` (14 new keys listed below).
- Require `DEVOPS_INFRA_TELEGRAM_BOT_TOKEN` and `CHAT_ID` non-empty like gold-politics tokens.

New keys (must exist in rendered Secret):

`DEVOPS_INFRA_TELEGRAM_BOT_TOKEN`, `DEVOPS_INFRA_TELEGRAM_CHAT_ID`, `DEVOPS_INFRA_MAX_ARTICLES`, `DEVOPS_INFRA_MAX_INCIDENTS`, `DEVOPS_INFRA_MAX_AGE_HOURS`, `DEVOPS_INFRA_HISTORY_RETENTION_DAYS`, `DEVOPS_INFRA_HISTORY_PATH`, `DEVOPS_INFRA_WEB_SEARCH_MAX_QUERIES`, `DEVOPS_INFRA_EDITORIAL_PROVIDER`, `STACKEXCHANGE_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ALLOWLIST`, `FACEBOOK_ACCESS_TOKEN`, `FACEBOOK_PAGE_ALLOWLIST`.

Run: `bash tests/render-test.sh` from `tech-news-telegram/`
Expected: FAIL.

- [ ] **Step 2: Add values**

Under `cronjobs.jobs`, after `gold-politics`:

```yaml
    devops-infra:
      enabled: true
      schedule: "40 8 * * *"
      endpoint: /telegram/send-devops-infra
```

Under `secretEnv` add the 14 keys with:

- `DEVOPS_INFRA_MAX_ARTICLES: "12"`
- `DEVOPS_INFRA_MAX_INCIDENTS: "3"`
- `DEVOPS_INFRA_MAX_AGE_HOURS: "72"`
- `DEVOPS_INFRA_HISTORY_RETENTION_DAYS: "7"`
- `DEVOPS_INFRA_HISTORY_PATH: "data/devops-infra-sent-history.json"`
- `DEVOPS_INFRA_WEB_SEARCH_MAX_QUERIES: "8"`
- `DEVOPS_INFRA_EDITORIAL_PROVIDER: "codex"`
- empty strings for Stack Exchange / Discord / Facebook until configured
- bot token/chat id using the chart’s existing non-placeholder dummy pattern (copy from adjacent keys; do not invent `replace_me`)

- [ ] **Step 3: PASS render-test and commit in the helm repo**

```bash
cd /root/helm
bash tech-news-telegram/tests/render-test.sh
git add tech-news-telegram/values.yaml tech-news-telegram/tests/render-test.sh
git commit -m "$(cat <<'EOF'
feat: schedule devops-infra Telegram digest at 08:40

EOF
)"
```

Do not `git push` either repo unless the user asks.

---

### Task 16: Final verification

**Files:** none new

- [ ] **Step 1: App suite**

From `/root/tech-news-telegram`:

```bash
npx vitest run
npx eslint src tests --ext .ts
npx tsc --noEmit
```

Expected: all PASS / no diagnostics. Fix any breakage in existing gold-politics/web-search tests caused by the `WebSearchQuery` widening.

- [ ] **Step 2: Secret scan**

```bash
rg -n "BOT_TOKEN|ACCESS_TOKEN|api[_-]?key" tests src docs/superpowers/plans/2026-09-21-devops-infra-telegram.md
```

Expected: only env field names, `replace_me`, and `test-devops-infra-*` placeholders — no live tokens.

- [ ] **Step 3: No extra commit unless you had to fix suite failures; if you did, commit those fixes with a message that explains the why.**

---

## Spec coverage checklist

| Spec section | Task |
| --- | --- |
| Dedicated flow, not CuratedTelegramFlow | 13 |
| POST `/telegram/send-devops-infra`, 409 lock | 13 |
| Max 12 / max 3 incidents | 1, 10 |
| Categories + cloud/on-prem | 8, 10 |
| Vietnamese + keep tokens | 11, 12 |
| Reddit, SE, HN, Brave, X | 2–5 |
| Discord/Facebook optional allowlist | 6 |
| Safe retrieval / no login | 5, 6 |
| 72h freshness, 7-day history | 7, 10, 13 |
| Caps, anchors, 4-cloud-family | 10 |
| Message blocks + disclaimer | 12 |
| 200 / 409 / 503 / partial / no_new_articles | 13 |
| Env keys | 1, 14 |
| Helm 08:40 | 15 |
| Preserve other flows | 13, 16 |
| Facebook Pages only, 50 Discord messages | 6 |
| No in-process scheduler | 15 (cron only) |
