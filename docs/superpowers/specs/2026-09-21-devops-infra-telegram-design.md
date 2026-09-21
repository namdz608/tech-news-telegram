# DevOps Infrastructure Telegram Flow Design

**Date:** 2026-09-21
**Status:** Approved

## Goal

Add an API-triggered flow to the existing Express application that collects
infrastructure and DevOps **problems and their solutions** from public forums
(cloud and on-prem), plus a small number of hot outage/CVE/incident threads,
edits them into Vietnamese, and sends each item to a dedicated Telegram bot
and chat.

The flow is a knowledge feed, not a product-news digest. It must not invent
commands, root causes, or runbooks that are absent from the source thread. A
forum thread is not an official runbook.

## Approved Product Decisions

- Add `POST /telegram/send-devops-infra`; do not add an in-process scheduler.
- Use Telegram credentials, concurrency state, and sent-URL history dedicated
  to this flow.
- Send at most 12 messages per request. At most three of those may be
  `incident` items (outage, CVE, or breaking vendor incident). The rest must
  be `problem-solution` items.
- Cover a broad infrastructure surface: Kubernetes/containers, AWS/GCP/Azure,
  on-prem/self-hosted, networking/DNS/load balancing, observability/SRE,
  CI/CD, databases/storage, and IAM/secrets.
- Output Vietnamese editorial copy. Keep technical terms, commands, error
  strings, and product names in their original form (`CrashLoopBackOff`,
  `IAM`, `systemctl`, `terraform apply`).
- Combine public forum APIs and RSS-less search: Reddit, Stack Exchange,
  Hacker News, and Brave web search (including publicly indexed Facebook,
  Telegram `t.me`, Discord, and X URLs).
- Discord and Facebook adapters ship in this iteration and stay disabled when
  their credentials or allowlists are empty. They only read allowlisted
  communities the operator already authorized with an official token.
- Do not log in, bypass CAPTCHA, join private groups, read Discord DMs, or
  scrape communities outside the allowlist.
- Retain sent-item URL history for seven days.
- Preserve the behavior of the tech, gadget, health, gold-politics, and jobs
  flows.
- Schedule the new endpoint from the existing Helm CronJob map at 08:40
  `Asia/Ho_Chi_Minh`, staggered after gold-politics.

## Chosen Architecture

Create a domain-specific `DevopsInfraFlowService` rather than extending
`CuratedTelegramFlow`. The curated engine selects generic `Article` records
and has no first-class fields for problem, environment, solution steps, or
solution confidence. A separate orchestrator keeps gadget and health free of
forum-thread special cases while still reusing narrow helpers: safe HTTP
retrieval, Brave search, sent-history JSON, tracked Telegram delivery, HTML
escaping, and sequential send.

The composition is:

```text
POST /telegram/send-devops-infra
  -> route-specific in-process lock
  -> DevopsInfraFlowService
       |-> DevopsInfraSourceService
       |    |-> Reddit search/subreddit adapter
       |    |-> Stack Exchange adapter
       |    |-> Hacker News adapter
       |    |-> WebSearchProvider (Brave first)
       |    |-> DevopsInfraX adapter (disabled without X_BEARER_TOKEN)
       |    |-> Discord adapter (disabled without token + allowlist)
       |    |-> Facebook adapter (disabled without token + allowlist)
       |-> DevopsInfraClassificationService
       |-> DevopsInfraDedupeService
       |-> DevopsInfraSelectionService
       |-> DevopsInfraMessageService
       |-> TelegramService (dedicated bot/chat)
       `-> SentHistoryStore (dedicated path)
```

Each adapter implements a typed injectable interface so collection,
classification, selection, editorial, and delivery can be tested without live
network or Telegram calls. Politics types and politics query lists are not
imported. Reddit/X/Brave HTTP patterns may be copied or extracted into a
shared helper only when a second copy would otherwise diverge; the first
implementation uses dedicated adapters with devops queries.

A disabled adapter (`isEnabled() === false`) contributes neither items nor a
failed-source key. An enabled adapter that errors contributes a stable
`failedSources` key and does not fail the whole run.

## Domain Models

`DevopsInfraCandidate` contains:

- discovery channel: `reddit`, `stackexchange`, `hn`, `web`, `x`, `discord`,
  `facebook`, or `telegram`;
- primary category (exactly one): `k8s-containers`, `cloud-aws`, `cloud-gcp`,
  `cloud-azure`, `onprem-selfhosted`, `networking`, `observability-sre`,
  `cicd`, `db-storage`, or `iam-secrets`;
- environment: `cloud`, `onprem`, `hybrid`, or `unknown`;
- kind: `problem-solution` or `incident`;
- original title, source body, and enough quoted text to summarize without
  invention;
- `problem`: symptom or question grounded in the source;
- `rootCause`: present only when the source states a cause; otherwise omitted;
- `solutionSteps`: ordered steps copied or condensed from an accepted answer,
  a highly voted answer/comment, or an author-confirmed workaround;
- `solutionConfidence`: `accepted`, `highly-voted`, `author-confirmed`,
  `anecdotal`, or `none`;
- incident `verification`: `confirmed` (vendor/status-page/primary advisory),
  `reported`, or `unverified`;
- original community/site, author/account when available, canonical URL,
  publication or discovery time;
- normalized problem fingerprint and independent-source identifiers;
- score and deterministic scoring reasons.

The delivery message retains its canonical URL so tracked Telegram delivery
marks history only after a successful send.

### Kind rules

- `problem-solution` is a troubleshooting thread: a failure, misconfiguration,
  capacity, networking, IAM, storage, or CI/CD problem plus at least one
  attempted or confirmed fix.
- `incident` is a public outage, CVE with operational impact, or vendor
  breaking-change event that forums are discussing. Incident items may have
  empty `solutionSteps`. They must not be rewritten as a DIY runbook.
- Product launches, hiring posts, tool advertisements, and generic opinion
  pieces without an operational problem are rejected.

### Solution-confidence rules

- `accepted`: Stack Exchange accepted answer, or a Reddit/HN comment the post
  author marked as the fix (“this worked”, “solved”, accepted flair).
- `highly-voted`: highest-scoring answer/comment that contains concrete steps,
  with score at least 2 and strictly higher than siblings when scores exist.
- `author-confirmed`: original poster confirms a workaround in a follow-up.
- `anecdotal`: a concrete command/config change is described but not confirmed
  by the author and not accepted.
- `none`: no actionable fix in the collected text.

A `problem-solution` candidate with `solutionConfidence === none` is rejected.
Open questions without a fix are not sent. `incident` items are allowed with
`none`.

## Sources

### Reddit (always enabled)

Search the public JSON API and also fetch new posts from a fixed subreddit
list. Initial subreddits:

`devops`, `sysadmin`, `kubernetes`, `aws`, `azure`, `googlecloud`,
`selfhosted`, `homelab`, `linuxadmin`, `networking`, `sre`, `terraform`,
`ansible`, `docker`, `gitlab`, `prometheus`, `proxmox`.

Search queries mix English operational phrases (crashloop, OOMKilled, terraform
state lock, nginx 502, wireguard, on-prem kubernetes, IAM AccessDenied) and
Vietnamese phrases when they appear in public posts. Per-run query count is
capped. Each post keeps its permalink, subreddit, author, created time, self
text, and the top comments needed to extract a fix.

Rate limits and access changes are a source failure for that leaf key
(`reddit:<query-or-subreddit>`). They do not fail the whole flow.

### Stack Exchange (always enabled)

Use the public Stack Exchange API 2.3 (no key required; optional
`STACKEXCHANGE_KEY` only raises quota). Sites:

- `serverfault`
- `unix`
- `devops`
- `stackoverflow` restricted to infrastructure tags: `kubernetes`, `docker`,
  `terraform`, `amazon-web-services`, `azure`, `google-cloud-platform`,
  `linux`, `nginx`, `ansible`, `prometheus`, `gitlab-ci`, `networking`

Collect questions from the last 72 hours that have at least one answer.
Attach the accepted answer when present; otherwise attach the highest-scoring
answer that contains steps. Quota or HTTP failures are isolated per site key
(`stackexchange:<site>`).

### Hacker News (always enabled)

Use the Algolia HN Search API with a capped query set. Initial themes:

- kubernetes CrashLoopBackOff / OOMKilled / ImagePullBackOff
- terraform state lock / apply failed
- AWS, GCP, or Azure outage / postmortem
- on-prem VPN, Proxmox, bare-metal Kubernetes
- nginx 502, DNS, cert expiry, IAM AccessDenied

Accept story URLs and comment threads that include an original HTTP(S) link
or enough comment text to summarize. Failures use leaf key `hn-search`.

### Brave web search (disabled when `BRAVE_SEARCH_API_KEY` is empty)

Reuse the existing provider-neutral `WebSearchProvider` with Brave as the
first adapter. Queries are devops/infra-specific and independent from
politics queries. `DEVOPS_INFRA_WEB_SEARCH_MAX_QUERIES` caps the run
(default 8). Include general web searches plus domain searches for
`facebook.com`, `t.me`, and `discord.com`.

A search hit is accepted only when it has an original HTTP(S) URL, enough
source text to summarize without invention, and a publication or discovery
time inside the freshness window. If a social page cannot be fetched, the
search snippet may be used only when those fields are present; the message
must identify it as a search-discovered excerpt.

### X (disabled when `X_BEARER_TOKEN` is empty)

Reuse the existing recent-search integration with devops/infra queries. An
empty token disables X without failing the flow.

### Discord (disabled when token or allowlist is empty)

Requires `DISCORD_BOT_TOKEN` and `DISCORD_CHANNEL_ALLOWLIST` (comma-separated
`guildId:channelId` pairs). The bot must already be a member of those guilds.
The adapter reads the latest 50 text-channel messages on each allowlisted
channel per run. It never lists other guilds, never reads DMs, and never
joins a guild.

HTTP 401/403/404 on a channel is a leaf failure (`discord:<channelId>`), not
a prompt to scrape the web UI.

### Facebook (disabled when token or allowlist is empty)

Requires `FACEBOOK_ACCESS_TOKEN` and `FACEBOOK_PAGE_ALLOWLIST` (comma-separated
Page IDs the token is allowed to read). The adapter calls the Graph API page
feed (`message`, `created_time`, `permalink_url`) on those IDs only. Facebook
Groups are out of this iteration because they need different permissions.
Empty credentials disable the adapter. Login automation and private scraping
are out of scope.

## Safe Retrieval of Search Results

Any enrichment fetch for a discovered URL must reuse `SafeWebRetrievalService`
rules:

- accept only HTTP and HTTPS;
- reject localhost, link-local, loopback, private, and reserved IP ranges after
  DNS resolution;
- repeat the address check after every redirect;
- cap redirect count, response bytes, and request duration;
- accept only configured textual content types;
- never send credentials to a discovered origin;
- escape all source-controlled text before Telegram HTML rendering.

The system does not attempt login automation, CAPTCHA bypass, or
private-content access on Discord, Facebook, Telegram, or any other host.

## Classification, Deduplication, and Selection

The default freshness window is 72 hours. Before selection, the service
rejects malformed URLs, spam, advertisements, irrelevant content, stale
items, `problem-solution` items with `solutionConfidence === none`, and URLs
already present in the seven-day history.

Each eligible item receives exactly one primary category. Environment is a
separate field so a Kubernetes failure on bare metal is `k8s-containers` +
`onprem`, and an EKS failure is `k8s-containers` + `cloud`.

Event deduplication groups normalized titles and problem fingerprints with a
deterministic text-similarity threshold. Canonical URLs, syndication markers,
quoted origin links, and near-identical text identify reposts. One
representative URL is selected per event, preferring an accepted or
author-confirmed fix and a fuller body.

Scoring is deterministic and uses:

- freshness;
- title and body relevance to infrastructure operations;
- presence and confidence of a solution;
- completeness of environment/error detail;
- independent corroboration for incidents;
- source engagement metadata when available (upvote, answer score).

The selection algorithm applies these constraints in order:

1. Preserve at least one eligible `cloud` environment item and one eligible
   `onprem` item when both environments are present.
2. Prefer `problem-solution` with `accepted`, `highly-voted`, or
   `author-confirmed` confidence.
3. Allow no more than three `incident` items.
4. Allow no more than two selected items from one category.
5. Allow no more than four selected items whose category is `cloud-aws`,
   `cloud-gcp`, or `cloud-azure` combined, so cloud provider news cannot fill
   the entire digest.
6. Allow no more than two selected items from one domain, subreddit, Stack
   Exchange site, Discord channel, or Facebook page.
7. Backfill remaining capacity by score while preserving the caps above.
8. Stop at `DEVOPS_INFRA_MAX_ARTICLES`, default 12.

## Verification and Editorial Rules

Incident verification is claim-specific:

- `confirmed` / `ĐÃ XÁC NHẬN`: vendor advisory, status page, CVE record, or
  other primary evidence supports the stated fact.
- `reported` / `ĐANG ĐƯỢC ĐƯA TIN`: an identifiable outlet, author, or account
  reports the event, but it is not a primary confirmation.
- `unverified` / `CHƯA KIỂM CHỨNG`: rumor, anonymous claim, or thread without
  adequate corroboration.

Copied reposts remain one source. Conflicting accounts must be described as
conflicting. Silence from a vendor does not raise verification.

The editorial provider produces structured Vietnamese fields: title, problem,
optional root cause, solution steps, and a short caution. A deterministic
validator then checks:

- every solution step is supportable from collected source text;
- no new command, flag, file path, or IP is introduced;
- known technical tokens from the source still appear untranslated;
- incident copy uses attribution and the correct verification badge;
- HTML special characters are escaped.

Any failed or unsafe generated field is replaced by deterministic
source-grounded copy. Provider failure never drops an otherwise valid
candidate.

Destructive actions present in the source (`rm -rf`, disk wipe, force-push,
disable auth, delete a production namespace) must keep an explicit caution in
the `Lưu ý` block. The editor must not add new destructive commands.

## Telegram Messages

Each selected candidate is sent as a separate Telegram message. An image is
attached only when the source supplies an `http`/`https` preview or
`og:image` URL that passes the same public-host retrieval rules. Missing or
unsafe images are omitted. If Telegram cannot fetch an attached image,
delivery falls back to text without losing the item. No placeholder image is
required.

Message blocks, in order:

1. Category icon/label and environment label (`Cloud`, `On-prem`, `Hybrid`, or
   omitted when `unknown`).
2. Kind label: `Bài toán` or `Sự cố`. Unverified incidents put
   `🔴 CHƯA KIỂM CHỨNG` before the title.
3. Neutral Vietnamese title.
4. Publication or discovery time in `Asia/Ho_Chi_Minh`.
5. **Bài toán:** attributed symptom.
6. **Nguyên nhân:** only when `rootCause` is present; omit the block otherwise.
7. **Cách xử lý:** numbered steps for `problem-solution`; for `incident`, a
   short “diễn đàn/vendor đang nói gì” summary instead of a fake runbook.
8. **Độ tin cậy lời giải:** Vietnamese label of `solutionConfidence`, omitted
   for incidents with `none`.
9. **Lưu ý:** a thread is not an official runbook; include destructive-command
   caution when applicable; note incomplete source text when applicable.
10. Source community/account, discovery channel, and an inline
    `Xem thread gốc` button.
11. Closing line: `Tham khảo từ diễn đàn, kiểm tra trên môi trường của bạn trước khi áp dụng.`

Existing Telegram splitting, photo fallback, HTML escaping, and sequential-send
behavior are reused.

## API Contract and Concurrency

Register:

```http
POST /telegram/send-devops-infra
```

The route owns an in-process lock independent from gadget, health, and
gold-politics locks. Concurrent calls to this route return HTTP 409. Other
flows may run at the same time.

A successful response includes:

- `sent`;
- `channel: "telegram-devops-infra"`;
- `messageCount`;
- `collectedCount`;
- `eligibleCount`;
- `skippedSeenCount`;
- `partial`;
- `failedSources` as stable source keys;
- `language: "vi"`.

Failure behavior:

- Partial source failures return HTTP 200 and `partial: true` after sending
  available content.
- No eligible unseen items returns HTTP 200 with `sent: false`,
  `reason: "no_new_articles"` (same reason string as gadget/health, even
  though items are forum threads), and `messageCount: 0`.
- If every enabled source fails, return HTTP 503 and send nothing.
- Missing or placeholder Telegram credentials return a dedicated configuration
  error (same pattern as gold-politics `telegram-not-configured`), not a
  silent skip.
- Telegram delivery errors propagate to the existing error middleware.
  Per-item history retains only sends completed before the error. A failed
  text send stops the run and leaves that URL and subsequent URLs unseen for
  retry.

## Configuration and Storage

Add:

```env
DEVOPS_INFRA_TELEGRAM_BOT_TOKEN=replace_me
DEVOPS_INFRA_TELEGRAM_CHAT_ID=replace_me
DEVOPS_INFRA_MAX_ARTICLES=12
DEVOPS_INFRA_MAX_INCIDENTS=3
DEVOPS_INFRA_MAX_AGE_HOURS=72
DEVOPS_INFRA_HISTORY_RETENTION_DAYS=7
DEVOPS_INFRA_HISTORY_PATH=data/devops-infra-sent-history.json
DEVOPS_INFRA_WEB_SEARCH_MAX_QUERIES=8
DEVOPS_INFRA_EDITORIAL_PROVIDER=codex
STACKEXCHANGE_KEY=
DISCORD_BOT_TOKEN=
DISCORD_CHANNEL_ALLOWLIST=
FACEBOOK_ACCESS_TOKEN=
FACEBOOK_PAGE_ALLOWLIST=
```

`DEVOPS_INFRA_EDITORIAL_PROVIDER` accepts `codex`, `google`, `openai`, or
`none` (default `codex`). Codex failure falls back to Google when a Google
generator is available, then to deterministic source-grounded copy. `none`
skips the model and uses deterministic copy only.

`DEVOPS_INFRA_MAX_INCIDENTS` is clamped so it cannot exceed
`DEVOPS_INFRA_MAX_ARTICLES`. Real Telegram and provider credentials remain in
ignored runtime configuration. The JSON history store uses the existing
same-directory atomic-rename and corrupt-file quarantine pattern. Docker
deployments persist `/app/data`.

The application does not expose a chat-ID discovery route. The operator
creates the new Telegram chat, adds the dedicated bot, and sets the env vars.

Shared keys already defined (`BRAVE_SEARCH_API_KEY`, `X_BEARER_TOKEN`,
`USER_AGENT`, `REQUEST_TIMEOUT_MS`) are reused. They are not duplicated.

## Helm Scheduling

The sibling Helm chart (`helm/tech-news-telegram`) adds a CronJob map entry.
No in-process scheduler is added in the application.

| Job | Endpoint | Schedule (`Asia/Ho_Chi_Minh`) |
| --- | --- | --- |
| DevOps infra digest | `/telegram/send-devops-infra` | `08:40` daily (`40 8 * * *`) |

The new job uses the same curl POST, `--fail`, `concurrencyPolicy: Forbid`,
and backoff settings as digest/gadgets/health/gold-politics. Helm values also
receive the new env keys with placeholder tokens; production secrets stay in
the existing secret mechanism, not in git.

## Testing Strategy

Implementation follows test-driven development:

1. Test Reddit, Stack Exchange, HN, Brave, X, Discord, and Facebook adapters
   with injected HTTP clients. Cover query generation, caps, empty credentials
   (adapter disabled, not failed), rate limits, isolated leaf failures, and
   allowlist enforcement (Discord/Facebook ignore IDs outside the list).
2. Test URL retrieval controls by reusing or extending the existing safe-web
   retrieval cases: private addresses, DNS resolution, redirects, size,
   timeout, and content type.
3. Test category, environment, and kind classification; 72-hour freshness;
   canonical URL deduplication; and problem-fingerprint clustering.
4. Test solution-confidence assignment, including rejection of
   `problem-solution` items with `none`, and incident items allowed with
   `none`.
5. Test selection determinism, the cloud/on-prem anchors, the three-incident
   cap, the two-per-category cap, the four-cloud-family cap, the
   two-per-source cap, backfill, the 12-item maximum, and seven-day
   seen-history suppression.
6. Test message HTML escaping, kind/environment labels, unverified incident
   badges, omitted root-cause blocks, retained technical tokens, destructive
   command cautions, the mandatory disclaimer, source buttons, length
   handling, and image fallback.
7. Test editorial validation: invented commands are stripped; provider
   failure falls back to source-grounded copy without dropping the candidate.
8. Test orchestration for no-new-articles, partial source failure, total
   enabled-source failure, sequential delivery, and per-message history
   callbacks.
9. Test the route's HTTP 200, 409, and 503 behavior, plus unconfigured
   Telegram credentials, without live Telegram or provider calls.
10. Run the complete Vitest suite, ESLint, TypeScript build, diff checks, and
    a tracked-secret scan to prove existing flows remain unchanged.

A live provider smoke check may read public data after configuration. A live
Telegram send occurs only after the dedicated bot token/chat ID are configured
and the user explicitly authorizes delivery.

## Out of Scope

- An in-process scheduler.
- Login automation, CAPTCHA bypass, private Discord servers, private Telegram
  groups, private Facebook groups, or reading DMs.
- Treating a social rumor as a confirmed incident or as a production runbook.
- Inventing remediation steps that are not in the collected source text.
- A chat-ID discovery API.
- Distributed locking or exactly-once delivery across multiple replicas.
- Refactoring tech, gadget, health, gold-politics, or jobs onto this
  orchestrator.
- Scraping GitHub issues, Facebook Groups, paid Discord listings, or any
  source that requires a user password.

## References Validated During Design

- Existing gold-politics search/retrieval/lock pattern:
  `docs/superpowers/specs/2026-08-20-gold-politics-telegram-design.md`
- Existing curated-flow lock and history pattern:
  `docs/superpowers/specs/2026-08-11-health-lifestyle-telegram-design.md`
- Helm CronJob map:
  `helm/docs/superpowers/specs/2026-08-13-scheduled-curated-digests-design.md`
- Stack Exchange API 2.3:
  <https://api.stackexchange.com/docs>
- Hacker News Algolia Search:
  <https://hn.algolia.com/api>
- Discord Get Channel Messages:
  <https://discord.com/developers/docs/resources/channel#get-channel-messages>
- Facebook Graph Page posts:
  <https://developers.facebook.com/docs/graph-api/reference/page/feed/>
- Brave Search API:
  <https://api-dashboard.search.brave.com/app/documentation/web-search/get-started>
