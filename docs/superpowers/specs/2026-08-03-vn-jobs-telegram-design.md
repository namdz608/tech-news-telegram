# Vietnam Jobs Telegram Crawl Design

## Goal

Add a separate Telegram jobs flow that crawls Vietnamese job boards for English teacher / teaching assistant (kindergarten and primary) or DevOps roles, then sends results using the same article message pipeline as tech news.

## Scope

In scope:

- New endpoint `POST /telegram/send-jobs` (does not mix into tech digest).
- Required query param `role`: `english-teacher` | `devops`.
- Optional query param `experienceYears`: `0` | `1-2` | `3-5` | `5+`.
- HTML crawl of TopCV, ITviec, and VietnamWorks.
- Map each job to `Article`, then reuse digest message build → editorial → Telegram send.
- New topic key `jobs-english` for English teaching roles; DevOps jobs use existing `devops` topic.
- Env `MAX_JOBS_PER_DIGEST` (default `10`).

Out of scope for MVP:

- City / location filters.
- Long-term persistence or cross-run dedupe store.
- Official paid/partner APIs from job boards.
- Dedicated cron for jobs (caller triggers the endpoint).
- Changing `/telegram/send-digest` behavior.

## API

```http
POST /telegram/send-jobs?role=english-teacher&experienceYears=1-2
POST /telegram/send-jobs?role=devops
```

Validation:

- `role` is required. Allowed values: `english-teacher`, `devops`.
- `experienceYears` is optional. Allowed values when present: `0`, `1-2`, `3-5`, `5+`.
- Missing or invalid params return `400` with a clear error message.
- When `experienceYears` is omitted, do not filter by experience.

Success response shape:

```json
{
  "sent": true,
  "articleCount": 8,
  "messageCount": 8,
  "role": "devops",
  "experienceYears": null,
  "language": "vi"
}
```

Empty result behavior:

- If crawl + filters yield zero jobs, return `200` with `sent: true`, `articleCount: 0`, `messageCount: 0`.
- Do not send an empty Telegram batch or a “no results” chat message.

## Flow

```text
Request
  → validate role / experienceYears
  → VnJobsCrawler.crawl({ role, experienceYears?, maxResults })
      → TopCV + ITviec + VietnamWorks adapters in parallel
      → parse job cards
      → optional experience filter
      → map to Article[]
      → dedupe by URL, sort newest-first, truncate to MAX_JOBS_PER_DIGEST
  → DigestService.buildDigestMessages(articles)
  → editDigestMessages(...)
  → TelegramService.sendMessages(...)
  → JSON response
```

Jobs must not be registered in the default tech `sources` list used by `SourceService.collectLatest()`. The jobs controller owns its crawler call path so tech digests stay unchanged.

## Role Keywords

`english-teacher` search intent covers kindergarten and primary English teacher / teaching assistant roles. Adapters build site search URLs / queries from terms such as:

- giáo viên tiếng anh
- trợ giảng tiếng anh
- english teacher
- teaching assistant
- mầm non / tiểu học / primary / kindergarten (as supported by each site search)

`devops` search intent covers:

- devops
- sre
- platform engineer
- ci/cd

Exact query encoding is adapter-specific, but all adapters must target the same role intent.

## Experience Filter

After parsing each job card, if `experienceYears` is provided:

| Value | Keep when card text indicates |
| --- | --- |
| `0` | fresher / no experience required / under 1 year |
| `1-2` | about 1–2 years |
| `3-5` | about 3–5 years |
| `5+` | 5 or more years |

Jobs with no parseable experience requirement are **kept**. This avoids dropping useful listings that omit experience on the search card.

## Site Adapters

MVP boards:

1. TopCV
2. ITviec
3. VietnamWorks

Each adapter:

- Fetches the role search listing HTML with shared `USER_AGENT` and `REQUEST_TIMEOUT_MS`.
- Parses job cards with Cheerio selectors local to that adapter.
- Returns normalized job records: title, company, location, salary text, experience text, url, publishedAt?, imageUrl?, sourceName.
- On non-2xx, timeout, or parse failure: log and return `[]` for that site only. Other sites continue.

A thin `VnJobsCrawler` orchestrates the three adapters, applies experience filtering, maps to `Article`, dedupes, and truncates.

## Data Mapping

Each job becomes an `Article`:

| Field | Value |
| --- | --- |
| `id` | canonical job URL |
| `sourceId` | stable per board, e.g. `topcv`, `itviec`, `vietnamworks` |
| `sourceName` | `TopCV` / `ITviec` / `VietnamWorks` |
| `title` | job title |
| `url` | job detail URL |
| `summary` | company · location · salary · experience · short description when available |
| `imageUrl` | card image when present and HTTPS |
| `author` | company name when available |
| `publishedAt` | listing date when parseable; otherwise omit and rely on `collectedAt` |
| `collectedAt` | crawl timestamp |
| `topics` | `['jobs-english']` for `english-teacher`; `['devops']` for `devops` |

Telegram delivery reuses the existing per-article rich message path (topic header, title, date, summary, editorial fields, source name, “view original” button, image with text fallback).

## Topics and Images

Extend `TopicKey` with `jobs-english`.

- Add topic definition label suitable for Telegram headers (e.g. `Jobs · English Teacher`).
- Add a fallback image in `topic-images.ts` for `jobs-english`.
- Existing `devops` topic and image remain unchanged.

Update any `Record<TopicKey, ...>` and topic-related tests so the new key is exhaustive.

## Configuration

```env
MAX_JOBS_PER_DIGEST=10
```

No new API tokens are required for MVP HTML listing crawl.

## Error Handling

| Case | Behavior |
| --- | --- |
| Invalid / missing `role` | `400` |
| Invalid `experienceYears` | `400` |
| One board fails | log, continue with remaining boards |
| All boards empty / filtered out | `200`, zero counts, no Telegram send |
| Editorial provider fails | existing editorial fallback behavior |
| Telegram send fails | fail the request as current digest send does (`500` / error middleware) |

## Integration Points

- `src/types/topic.ts`, `src/config/topics.ts`, `src/config/topic-images.ts`: add `jobs-english`.
- `src/config/env.ts`, `.env.example`: add `MAX_JOBS_PER_DIGEST`.
- `src/crawlers/vn-jobs.crawler.ts` (+ board adapters as needed under `src/crawlers/vn-jobs/` or colocated helpers).
- `src/controllers/telegram.controller.ts`: add `sendJobs`.
- `src/routes/telegram.routes.ts`: mount `POST /telegram/send-jobs`.
- `README.md`: document endpoint, params, boards, and env.
- Do **not** add jobs sources to default tech `sources` used by `collectLatest()`.
- Do **not** extend tech `SourceKind` / `SourceConfig` for MVP. `VnJobsCrawler` is called directly from the jobs controller with a small options type (`role`, `experienceYears?`, `maxResults`).

## Tests

- Query validation unit tests for `role` / `experienceYears`.
- Adapter parse tests against HTML fixtures for TopCV, ITviec, VietnamWorks.
- Experience filter tests, including “missing experience keeps job”.
- Crawler orchestration: merges boards, dedupes by URL, respects `MAX_JOBS_PER_DIGEST`.
- Controller/route test: valid request reaches Telegram path with mapped articles; invalid params return 400; missing `experienceYears` still succeeds.
- Regression: `/telegram/send-digest` still collects only tech sources.

## Success Criteria

- Caller can trigger English-teacher or DevOps job digests via one endpoint and optional experience bucket.
- Results come from the three named Vietnamese boards when available.
- Messages look and behave like existing tech article Telegram messages.
- Tech news digest remains isolated and unchanged.
