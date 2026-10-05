# Remote DevOps Jobs Telegram Design

**Date:** 2026-10-02  
**Status:** Approved for implementation planning

## Goal

Add a Telegram flow that collects remote DevOps job posts from public boards and sends each new post as a fixed Vietnamese card. The flow has its own bot, chat, sent-URL history, and morning cron. It does not call an editorial model.

This flow is separate from `POST /telegram/send-jobs`, which crawls Vietnam boards and emails a PDF.

## Approved Product Decisions

- Sources are Remote OK, Remotive, We Work Remotely, Himalayas, the current HN “Who is hiring?” thread, LinkedIn, and Indeed.
- LinkedIn and Indeed use public pages or RSS only. A block, auth wall, or unparseable body fails that source. The run still sends jobs from every source that succeeded.
- A job matches when the title, description, or tags contain DevOps, SRE, site reliability, platform, infrastructure, Kubernetes, k8s, or cloud engineer, and the post is remote worldwide.
- Delivery is a new Telegram flow with its own token, chat id, history file, and cron.
- Messages are fixed Vietnamese cards. No LLM.

## Flow

`POST /telegram/send-devops-jobs` acquires an in-process lock keyed by `Symbol.for('tech-news-telegram:devops-jobs-digest-running')`. A held lock returns HTTP 409 `{ "error": "DevOps jobs digest is already running" }`. The lock is released in `finally`.

The factory refuses to build the flow when the bot token or chat id is empty or is `test-devops-jobs-token`, `test-devops-jobs-chat-id`, or `replace_me` (case-insensitive). That error and a sent-history read error propagate to the existing error middleware as HTTP 500. A history read failure sends nothing.

One run:

1. Collect all seven adapters with `Promise.allSettled`.
2. When every adapter fails, throw an all-sources-failed error. The controller returns HTTP 503 `{ "error": "All devops-jobs sources failed" }`.
3. Keep jobs that pass the keyword, worldwide-remote, and age rules.
4. Count history hits in that set, drop those URLs, then apply the per-source and overall caps.
5. Render one card per selected job.
6. Send sequentially. Mark a URL only after that message is accepted by Telegram.

An adapter that returns a valid document with zero jobs is a success. An adapter that throws, returns HTTP >= 400, or returns a body that cannot be parsed is a failure named by its key. A search adapter that issues several queries succeeds when at least one query returns a parseable document. HTTP 429 on every query fails that adapter.

HTTP 200 body:

```json
{
  "sent": true,
  "channel": "telegram-devops-jobs",
  "messageCount": 0,
  "collectedCount": 0,
  "eligibleCount": 0,
  "skippedSeenCount": 0,
  "partial": false,
  "failedSources": [],
  "language": "vi"
}
```

`sent: false` and `reason: "no_new_articles"` when selection is empty. `partial` is true when `failedSources` is non-empty. `collectedCount` is the number of normalized jobs before filtering. `eligibleCount` is the number that pass the keyword, location, and age rules and are not already in history, counted before the per-source and overall caps. `skippedSeenCount` is the number that pass those same rules but whose URL is already in history.

## Configuration

| Variable | Default |
| --- | --- |
| `DEVOPS_JOBS_TELEGRAM_BOT_TOKEN` | `test-devops-jobs-token` |
| `DEVOPS_JOBS_TELEGRAM_CHAT_ID` | `test-devops-jobs-chat-id` |
| `DEVOPS_JOBS_MAX_JOBS` | `8` |
| `DEVOPS_JOBS_MAX_PER_SOURCE` | `2` |
| `DEVOPS_JOBS_MAX_AGE_HOURS` | `72` |
| `DEVOPS_JOBS_HISTORY_RETENTION_DAYS` | `7` |
| `DEVOPS_JOBS_HISTORY_PATH` | `data/devops-jobs-sent-history.json` |

History uses the existing sent-history store with `failurePolicy: 'fail-closed'`.

Helm cron in the `helm` repo, chart `tech-news-telegram`:

- Job name `devops-jobs`
- Schedule `50 8 * * *`
- Time zone `Asia/Ho_Chi_Minh`
- Endpoint `/telegram/send-devops-jobs`
- The same `secretEnv` map gains the variables above. Token and chat id are empty strings for the operator to fill. Do not copy secrets from other flows.

The render test asserts this cron job and endpoint.

## Normalized Job

```ts
interface DevopsJob {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  company: string;
  url: string;
  location: string;
  description: string;
  tags: readonly string[];
  salary?: string;
  publishedAt: string;
}
```

Drop a record that lacks a non-empty title, company, absolute `http` or `https` URL, or a parseable `publishedAt`. Salary stays omitted when the source has none. Adapters do not invent company or salary.

`sourceId` values: `remoteok`, `remotive`, `weworkremotely`, `himalayas`, `hn`, `linkedin`, `indeed`.

## Sources

User-Agent for every request: `tech-news-telegram/devops-jobs`.

Search adapters run these queries, then dedupe by URL inside the adapter: `devops`, `sre`, `platform engineer`, `kubernetes`, `cloud engineer`.

| Key | Request | Failure |
| --- | --- | --- |
| `remoteok` | `GET https://remoteok.com/api` | Non-JSON or HTTP error. Skip the leading legal metadata object. |
| `remotive` | `GET https://remotive.com/api/remote-jobs?search={query}&limit=50` per query | Every query fails. |
| `weworkremotely` | `GET https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss` | Invalid RSS or HTTP error. Company is the text before `:` in the item title when present. |
| `himalayas` | `GET https://himalayas.app/jobs/api/search?q={query}&worldwide=true&sort=recent` per query | Every query fails. |
| `hn` | Find the current month’s story, then up to 200 of its comments | No matching story, or either Algolia call fails. |
| `linkedin` | Guest search HTML per query | Every query is non-200 or an auth wall. A 200 body with no job cards is zero jobs, not a failure. |
| `indeed` | `GET https://rss.indeed.com/rss?q={query}&l=Remote&fromage=3&sort=date` per query | Every query fails. |

HN story search: `GET https://hn.algolia.com/api/v1/search_by_date?tags=story&query=Ask%20HN%3A%20Who%20is%20hiring&hitsPerPage=5`. Keep the story whose title is exactly `Ask HN: Who is hiring? ({English month} {UTC year})` for the current UTC month. Comments: `GET https://hn.algolia.com/api/v1/search?tags=comment,story_{id}&hitsPerPage=200`. Each comment is one job. The company is the first line’s leading name when the comment uses `Company | Role` or `Company - Role`; otherwise drop that comment. The URL is `https://news.ycombinator.com/item?id={commentId}`.

LinkedIn guest URL: `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords={query}&location=Worldwide&f_WT=2&start=0`. `f_WT=2` is LinkedIn’s remote filter. A query fails when the status is not 200 or the body contains `authwall` or a login form. A 200 body that contains elements with class `base-card` or `job-search-card` is parsed into jobs. A 200 body with neither those cards nor an auth wall is success with zero jobs.

## Filter

Keyword match is case-insensitive against `title`, `description`, and `tags`. Any one of these is enough:

- `\bdevops\b`
- `\bsre\b`
- `site reliability`
- `\bplatform\b`
- `\binfrastructure\b`
- `\bkubernetes\b`
- `\bk8s\b`
- `cloud engineer`

Location uses two layers.

Structured `location` drops the job when it contains a country or region token: `united states`, `usa`, `u.s.`, `uk`, `united kingdom`, `europe`, `eu`, `canada`, `germany`, `france`, `india`, `australia`, `latam`, `emea`, `apac`, `north america`, `south america`, `africa`, `asia`. Bare `us` matches only as a whole token. These tokens are not applied to the description, so a worldwide post that mentions `us-east-1` stays eligible.

Explicit restriction phrases, applied to title, location, and description, also drop the job: `us only`, `usa only`, `u.s. only`, `united states only`, `uk only`, `eu only`, `europe only`, `canada only`, `must be located`, `must be based in`, `must reside`, `candidates must be in`, `only candidates in`, and `remote` followed by a dash and `us`, `usa`, `uk`, `eu`, `canada`, or `europe`.

Worldwide allow-phrases are `worldwide`, `anywhere`, `global`, `work from anywhere`, and a location that is only `remote`.

Remote-only boards are `remoteok`, `remotive`, `weworkremotely`, and `himalayas`. An empty location on those boards is worldwide. LinkedIn, Indeed, and HN require a remote signal in the title, location, or description (`remote`, `work from home`, `work from anywhere`, `distributed`) plus no restriction and no country or region token in `location`.

## Selection

Compare `publishedAt` with the flow clock. Drop jobs older than `DEVOPS_JOBS_MAX_AGE_HOURS`, except comments from the current month’s HN hiring story. Those comments ignore the 72-hour cap and still have to pass the keyword and location rules.

Sort remaining unseen jobs by `publishedAt` descending. Tie-break by source order: Remote OK, Remotive, We Work Remotely, Himalayas, HN, LinkedIn, Indeed, then by URL. Take at most `DEVOPS_JOBS_MAX_PER_SOURCE` jobs from each source and at most `DEVOPS_JOBS_MAX_JOBS` jobs overall. The same role on two boards with two URLs may both be sent. History suppresses only an exact URL.

## Telegram Card

One message per job. HTML parse mode. Escape every dynamic field. No photo. Button label `Xem tin gốc` pointing at `url`.

```
🛠️ DevOps remote

<b>{title}</b>
🏢 {company}
📍 Remote · toàn cầu
💰 {salary}
🗓 {dd/MM/yyyy in Asia/Ho_Chi_Minh}
📡 {sourceName}

{excerpt}
```

Omit the salary line when `salary` is absent. The location line is the fixed text `Remote · toàn cầu`, not the raw location. The date line uses `en-GB` day, month, and year in `Asia/Ho_Chi_Minh`. The excerpt is the description with HTML removed and whitespace collapsed, cut to 240 characters. When the cut is shorter than the source text, end with `…`. Omit the excerpt paragraph when the description is empty.

## Components

New units under `tech-news-telegram`, following the devops-infra split:

- `src/types/devops-jobs.ts` — job, collection, and flow result types.
- `src/config/devops-jobs-sources.ts` — source URLs and the query list.
- `src/services/devops-jobs-filter.ts` — keyword and worldwide-remote predicates.
- `src/services/devops-jobs-source.adapter.ts` — adapter interface. `collect()` returns `DevopsJob[]`. An empty array is a successful source. A thrown error fails that source key.
- One adapter file per source.
- `src/services/devops-jobs-source.service.ts` — fan-out and partial failure.
- `src/services/devops-jobs-selection.service.ts` — age, seen URLs, caps.
- `src/services/devops-jobs-message.service.ts` — fixed card.
- `src/services/devops-jobs-flow.service.ts` — orchestration and factory.
- `src/services/devops-jobs-digest-lock.ts` — process lock.
- Delivery reuses `TrackedTelegramDeliveryService` and `SentHistoryStore`.
- Route and controller follow `sendDevopsInfra`.

No change to the Vietnam jobs crawler, PDF builder, or mailer.

## Testing

Tests use fixtures and injected clocks. They do not call the network.

- Filter keeps each approved keyword and drops US-only, EU-only, UK-only, `must be located`, and `must be based in`. It keeps Worldwide, Anywhere, Global, and unrestricted remote posts from remote-only boards. A description that mentions `us-east-1` does not drop a worldwide job.
- Selection enforces 8 jobs, 2 per source, drops seen URLs, drops items older than 72 hours, and keeps an older comment from the current HN hiring story.
- The card includes salary when present, omits that line when absent, strips HTML, and truncates the excerpt to 240 characters.
- The flow throws when every source fails, sends when some sources fail, and returns `sent: false` when nothing is new.
- The route returns 409 while the lock is held and 503 when every source fails.
- The Helm render test requires cron `50 8 * * *` and `/telegram/send-devops-jobs`.

## Out of Scope

- Logged-in LinkedIn or Indeed sessions.
- Editorial rewriting, translation models, and salary conversion.
- Applying for jobs, alerts inside the chat, or images.
- Changing the Vietnam jobs email flow.
