# GitHub AI Repos Source Design

## Goal

Add a GitHub repository source to the existing tech news Telegram digest so the bot can include newly created or recently updated AI-related repositories.

## Scope

The feature adds one source kind, `github-repos`, backed by GitHub Search API. It reuses the current article collection, filtering, digest, translation, and Telegram delivery pipeline.

The first version focuses on AI repositories only. It does not add persistence, star-growth tracking, per-repository history, or separate Telegram formatting.

## Source Behavior

The new source calls GitHub Search API:

```text
GET https://api.github.com/search/repositories
```

Default query behavior:

- Match AI-related topics and terms such as `llm`, `generative-ai`, `ai-agent`, `rag`, `machine-learning`, and `artificial-intelligence`.
- Restrict results to repositories pushed within the lookback window.
- Sort by stars by default so noisy low-signal repositories are less likely to dominate the digest.
- Limit results using `GITHUB_AI_REPO_MAX_RESULTS`.

The source will be named `GitHub AI Repos`.

## Configuration

Add these environment variables:

```env
GITHUB_TOKEN=
GITHUB_AI_REPO_QUERY=
GITHUB_AI_REPO_MAX_RESULTS=10
GITHUB_AI_REPO_LOOKBACK_DAYS=7
```

`GITHUB_TOKEN` is optional. When present, the crawler sends it as a bearer token to improve GitHub API rate limits. The token must not be written to committed files, logs, test fixtures, or documentation.

If `GITHUB_AI_REPO_QUERY` is empty, the crawler builds a default query from the lookback window. If it is set, the crawler uses it as the full GitHub search query.

## Data Mapping

Each GitHub repository becomes an `Article`:

- `id`: repository HTML URL.
- `sourceId`: source config id.
- `sourceName`: `GitHub AI Repos`.
- `title`: `owner/name`.
- `url`: repository HTML URL.
- `summary`: repository description plus stars, language, created date, updated date, and pushed date where available.
- `author`: repository owner login.
- `publishedAt`: prefer `pushed_at`, then `updated_at`, then `created_at`.
- `collectedAt`: crawl time.
- `topics`: `['ai']`.

This keeps the feature compatible with existing deduplication and digest generation.

## Error Handling

The crawler returns an empty list when GitHub responds with a non-2xx status, the request fails, or the response shape is invalid. `SourceService` already catches source-level crawler failures, so other sources continue to work.

Rate-limit responses should include enough masked context in logs to identify the source and status code without exposing tokens.

## Integration Points

Update these areas:

- `src/types/source.ts`: add `github-repos` source config type.
- `src/config/env.ts`: add GitHub environment variables.
- `src/config/sources.ts`: add enabled GitHub AI repo source.
- `src/crawlers/github-repos.crawler.ts`: implement GitHub Search API crawler.
- `src/crawlers/index.ts`: instantiate the new crawler.
- `src/services/source.service.ts`: route `github-repos` sources to the new crawler.
- `.env.example` and `README.md`: document the new variables and source behavior without including real secrets.

## Tests

Add crawler tests that cover:

- successful GitHub Search API response mapping to `Article`.
- optional token header.
- custom query vs default query behavior.
- non-2xx or malformed responses returning an empty list.

Update source service tests to verify enabled `github-repos` sources are crawled.

## Security Notes

The user provided a GitHub token during planning. The implementation must treat it as a local secret. It can be placed in local `.env` only if needed, but it must not be committed, copied into docs, echoed in terminal output, or included in test snapshots.
