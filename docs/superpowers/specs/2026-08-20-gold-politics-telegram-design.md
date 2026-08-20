# Gold and Politics Telegram Flow Design

**Date:** 2026-08-20
**Status:** Approved

## Goal

Add an API-triggered flow to the existing Express application that sends one
current gold-price snapshot followed by at most 15 Vietnamese news messages to
a dedicated Telegram bot and chat. News coverage includes the gold market,
Vietnamese politics, international politics, and controversies involving
political leaders, senior public officials, leaders of major companies or
international organizations, and public figures with political influence.

The flow may surface unverified social-media rumors. It must label their
verification status prominently, preserve attribution, and never rewrite an
allegation as an established fact.

## Approved Product Decisions

- Add `POST /telegram/send-gold-politics`; do not add an in-process scheduler.
- Use Telegram credentials, concurrency state, and history dedicated to this
  flow.
- Send one gold-price snapshot plus at most 15 news messages per request.
- Include SJC, DOJI, PNJ, and XAU/USD in the price snapshot.
- Include at most three gold-market news articles. Give the remaining capacity
  to Vietnamese politics, international politics, and leader controversies.
- Retain sent-news URL history for seven days. The recurring price snapshot is
  not suppressed by sent history.
- Search broadly rather than relying on a user-maintained account allowlist.
- Combine direct RSS/web sources, X, Reddit, and a configurable web-search
  provider. Use Brave Search as the first web-search adapter.
- Use web search to discover public Facebook, TikTok, and Telegram URLs.
- Use neutral Vietnamese editorial language.
- Permit unverified rumors, but show `CHƯA KIỂM CHỨNG`, identify the source, and
  attribute the claim instead of stating it as fact.
- Preserve the behavior of the tech, gadget, health, and jobs flows.

## Chosen Architecture

Create a domain-specific `GoldPoliticsFlowService` rather than extending the
generic `CuratedTelegramFlow`. The existing engine assumes every outgoing
message represents a selected article, while this flow always has a recurring
price prelude whose persistence and failure semantics are different. Keeping
the orchestration separate avoids adding special cases to the gadget and health
flows while still reusing their narrow components.

The composition is:

```text
POST /telegram/send-gold-politics
  -> route-specific in-process lock
  -> GoldPoliticsFlowService
       |-> GoldPriceService
       |    |-> SJC adapter
       |    |-> DOJI adapter
       |    |-> PNJ adapter
       |    `-> XAU/USD adapter
       |-> PoliticsSourceService
       |    |-> RSS crawler
       |    |-> X recent-search adapter
       |    |-> Reddit search adapter
       |    `-> WebSearchProvider (Brave first)
       |-> PoliticsSelectionService
       |-> GoldPoliticsMessageService
       |-> TelegramService
       |-> SentHistoryStore
       `-> GoldPriceHistoryStore
```

Each unit has a typed injectable interface so parsing, classification,
selection, orchestration, and delivery can be tested without live network or
Telegram calls.

## Domain Models

`GoldQuote` contains:

- provider key and display name;
- instrument key and display name;
- buy and sell values when the provider supplies them;
- a single spot value for XAU/USD;
- source unit and normalized display unit;
- source timestamp and collection timestamp;
- source URL;
- freshness status and an optional failure reason.

Domestic quotes are normalized for display to `million VND/tael`. XAU/USD is
displayed as `USD/troy ounce`. Conversion is allowed only when the source unit
is explicit. A missing or ambiguous unit produces an unavailable quote rather
than a guessed value.

`PoliticsCandidate` extends normalized article data with:

- discovery channel: `rss`, `web`, `x`, `reddit`, `facebook`, `tiktok`, or
  `telegram`;
- primary category: `gold-market`, `vietnam-politics`,
  `international-politics`, or `leader-controversy`;
- geographic scope: `vietnam`, `international`, or `mixed`;
- verification state: `confirmed`, `reported`, or `unverified`;
- original author/account and original URL when available;
- normalized event fingerprint and independent-source identifiers;
- score and deterministic scoring reasons.

The delivery message retains its canonical URL so existing tracked Telegram
delivery can mark history only after a successful send.

## Gold-Price Collection

The initial primary pages are:

| Provider | Primary page | Selected instrument |
| --- | --- | --- |
| SJC | `https://www.sjc.com.vn/bieu-do-gia-vang` | one-tael SJC bar quoted by SJC |
| DOJI | `https://banggia.doji.vn/` | retail SJC bar quoted by DOJI |
| PNJ | `https://www.pnj.com.vn/site/gia-vang` | SJC 999.9 bar quoted by PNJ |
| XAU/USD | `GOLD_SPOT_API_URL`, default `https://api.gold-api.com/price/XAU` | gold spot in USD/oz |

Each provider has its own adapter and fixture-based contract tests. Providers
are fetched with `Promise.allSettled`; one provider failure cannot suppress
other quotes. The snapshot always identifies the provider, instrument, unit,
source time, and collection time.

A quote is marked stale when its source timestamp is older than the configured
maximum price age. Stale values may be displayed only with a visible stale
warning. If parsing, units, or timestamps cannot be validated, that provider's
row says that data is unavailable and contains no numeric value.

`GoldPriceHistoryStore` atomically stores the last successful quote for each
provider/instrument in `data/gold-price-history.json`. A delta is calculated
only against the previous quote for the same provider, instrument, and unit.
The first observation says that comparison data is not yet available. Price
history is updated after a valid fetch; it is independent of sent-news history.

## News Sources

### Direct RSS sources

The initial Vietnamese feeds are:

- VnExpress: `https://vnexpress.net/rss/thoi-su.rss`,
  `https://vnexpress.net/rss/the-gioi.rss`,
  `https://vnexpress.net/rss/phap-luat.rss`, and
  `https://vnexpress.net/rss/kinh-doanh.rss`.
- Thanh Niên: `https://thanhnien.vn/rss/chinh-tri.rss`,
  `https://thanhnien.vn/rss/thoi-su.rss`,
  `https://thanhnien.vn/rss/the-gioi.rss`,
  `https://thanhnien.vn/rss/thoi-su/phong-su--dieu-tra.rss`, and
  `https://thanhnien.vn/rss/kinh-te.rss`.
- Tuổi Trẻ: `https://tuoitre.vn/rss/thoi-su.rss`,
  `https://tuoitre.vn/rss/the-gioi.rss`,
  `https://tuoitre.vn/rss/phap-luat.rss`, and
  `https://tuoitre.vn/rss/kinh-doanh.rss`.

The initial international feeds are:

- BBC World: `https://feeds.bbci.co.uk/news/world/rss.xml`;
- The Guardian World: `https://www.theguardian.com/world/rss`;
- The Guardian Politics: `https://www.theguardian.com/politics/rss`;
- Al Jazeera: `https://www.aljazeera.com/xml/rss/all.xml`.

These feeds provide candidates only. Source identity never bypasses relevance,
freshness, deduplication, or verification-state rules.

### Search sources

- X uses the existing recent-search integration and `X_BEARER_TOKEN`. An empty
  token disables X without failing the flow.
- Reddit uses public search responses with the configured user agent. Rate
  limits or access changes are reported as a source failure and do not fail the
  entire flow.
- Brave Search uses `BRAVE_SEARCH_API_KEY` and a provider-neutral interface.
  An empty key disables web-search discovery without disabling direct sources.

Search queries are generated from fixed Vietnamese and English term groups:

- government, parliament, elections, policy, diplomacy, war, and conflict;
- investigation, corruption, allegation, leak, resignation, abuse of power,
  fraud, and scandal;
- public officials, politicians, major-company leaders, international-
  organization leaders, and politically influential public figures;
- gold, central banks, interest rates, the US dollar, and major gold-price
  drivers.

Brave runs general web searches plus domain searches for `facebook.com`,
`tiktok.com`, and `t.me`. Query count is capped per run. Search results are
accepted only when they contain an original HTTP(S) URL, enough source text to
summarize without invention, and a valid publication time within the freshness
window. If a social page cannot be fetched, the system may use the search
snippet only when those fields are present; it must identify the content as a
search-discovered excerpt and may not infer omitted details.

## Safe Retrieval of Search Results

Any enrichment fetch for a discovered URL must:

- accept only HTTP and HTTPS;
- reject localhost, link-local, loopback, private, and reserved IP ranges after
  DNS resolution;
- repeat the address check after every redirect;
- cap redirect count, response bytes, and request duration;
- accept only configured textual content types;
- never send credentials to a discovered origin;
- escape all source-controlled text before Telegram HTML rendering.

The system does not attempt login automation, CAPTCHA bypass, or private-content
access on Facebook, TikTok, or Telegram.

## Classification, Event Deduplication, and Selection

The default news freshness window is 72 hours. Before selection, the service
rejects malformed URLs, spam, advertisements, irrelevant content, stale items,
and URLs already present in the seven-day history.

Each eligible article receives exactly one primary category. A controversy
involving an in-scope leader is categorized as `leader-controversy` even when it
also concerns domestic or international politics; geographic scope remains a
separate field so coverage balancing is still possible.

Event deduplication groups normalized titles and claim entities using a
deterministic text-similarity threshold. Canonical URLs, syndication markers,
quoted origin links, and near-identical text identify reposts. Reposts do not
increase the independent-source count. One representative URL is selected for
each event, preferring an original post or fuller report.

Scoring is deterministic and uses:

- freshness;
- title and summary relevance;
- in-scope leader and institution matches;
- controversy/political priority;
- source-text and metadata completeness;
- independent corroboration;
- source engagement metadata when available.

The selection algorithm applies these constraints in order:

1. Preserve at least one eligible Vietnamese-politics event and one eligible
   international-politics event when both scopes are present.
2. Prefer leader controversies and high-impact political events.
3. Allow no more than three `gold-market` articles.
4. Allow no more than three selected articles from one domain or social
   account.
5. Backfill remaining capacity by score while preserving the gold and source
   caps.
6. Stop at `GOLD_POLITICS_MAX_ARTICLES`, default 15.

The one price snapshot is outside the 15-article limit.

## Verification States and Editorial Rules

Verification is claim-specific, not source-wide:

- `confirmed` / `ĐÃ XÁC NHẬN`: a final official finding, court record, primary
  document, or directly verifiable primary evidence supports the stated fact.
- `reported` / `ĐANG ĐƯỢC ĐƯA TIN`: an identifiable outlet, author, or account
  reports the claim, but no final determination exists.
- `unverified` / `CHƯA KIỂM CHỨNG`: a rumor, anonymous claim, unsupported social
  post, or claim without adequate corroboration.

Multiple copied posts remain one source. Conflicting accounts must be described
as conflicting. Absence of an official denial does not raise a claim's status.

Unverified content is allowed, but its message must:

- put `🔴 CHƯA KIỂM CHỨNG` before the title;
- use attribution such as “Tài khoản X cáo buộc…”;
- identify the earliest original source found, discovery time, and original
  link;
- avoid asserting guilt, motive, identity, or hidden facts;
- state when source text is incomplete or inaccessible;
- never use an AI-generated detail that is absent from the collected text.

The editorial provider produces neutral Vietnamese structured fields. A
deterministic validator checks attribution, verification label, named entities,
and unsupported certainty. Any failed or unsafe generated field is replaced by
deterministic source-grounded copy. Provider failure never drops an otherwise
valid candidate.

## Telegram Messages

The first message is the price snapshot and contains:

1. title and collection time in `Asia/Ho_Chi_Minh`;
2. SJC, DOJI, and PNJ buy/sell values and spread;
3. XAU/USD spot value;
4. movement from the previous successful same-instrument quote;
5. freshness or unavailable markers per provider;
6. source links and a short “not investment advice” notice.

Each subsequent news message contains:

1. category and geographic label;
2. verification badge before the neutral Vietnamese title;
3. publication or discovery time;
4. attributed summary;
5. why the event matters;
6. corroboration/conflict note;
7. original source/account and discovery channel;
8. an inline `Xem nguồn gốc` button.

Existing Telegram splitting, photo fallback, HTML escaping, and sequential-send
behavior are reused. A news URL is marked in sent history only after its message
succeeds. A failed text send stops the run and leaves that URL and subsequent
URLs unseen for retry.

## API Contract and Concurrency

Register:

```http
POST /telegram/send-gold-politics
```

The route owns an in-process lock independent from gadget and health locks.
Concurrent calls to this route return HTTP 409. Other flows may run at the same
time.

A successful response includes:

- `sent`;
- `channel: "telegram-gold-politics"`;
- `priceMessageCount` (`1` when Telegram delivery starts);
- `newsMessageCount`;
- `collectedCount`;
- `eligibleCount`;
- `skippedSeenCount`;
- `partial`;
- `failedSources` as stable source keys;
- `language: "vi"`.

Failure behavior is:

- Partial source failures return HTTP 200 and `partial: true` after sending
  available content.
- If valid prices exist but no unseen news is selected, send only the price
  snapshot and return HTTP 200 with `newsMessageCount: 0`.
- If all price providers fail but news succeeds, send an unavailable-price
  status message followed by news and return HTTP 200 with `partial: true`.
- If news collection entirely fails but at least one price provider succeeds,
  send the price snapshot and return HTTP 200 with `partial: true`.
- If all price providers and all enabled news sources fail, return HTTP 503 and
  send nothing.
- Telegram delivery errors propagate to the existing error middleware; per-item
  history retains only sends completed before the error.

## Configuration and Storage

Add:

```env
GOLD_POLITICS_TELEGRAM_BOT_TOKEN=replace_me
GOLD_POLITICS_TELEGRAM_CHAT_ID=replace_me
GOLD_POLITICS_MAX_ARTICLES=15
GOLD_POLITICS_MAX_GOLD_NEWS=3
GOLD_POLITICS_MAX_AGE_HOURS=72
GOLD_POLITICS_MAX_PRICE_AGE_MINUTES=60
GOLD_POLITICS_HISTORY_RETENTION_DAYS=7
GOLD_POLITICS_HISTORY_PATH=data/gold-politics-sent-history.json
GOLD_PRICE_HISTORY_PATH=data/gold-price-history.json
GOLD_POLITICS_WEB_SEARCH_MAX_QUERIES=8
BRAVE_SEARCH_API_KEY=
GOLD_SPOT_API_URL=https://api.gold-api.com/price/XAU
```

Real Telegram and provider credentials remain in ignored runtime configuration.
The two JSON stores use the existing same-directory atomic-rename and corrupt-
file quarantine pattern. Docker deployments persist `/app/data`.

## Testing Strategy

Implementation follows test-driven development:

1. Add parser contract tests using saved SJC, DOJI, PNJ, and XAU/USD fixtures.
   Cover units, timestamps, stale values, missing fields, provider failure, and
   previous-snapshot deltas.
2. Test the RSS, X, Reddit, and Brave adapters with injected HTTP clients. Cover
   Vietnamese/English query generation, per-domain searches, query caps, empty
   credentials, rate limits, and isolated failures.
3. Test URL retrieval controls for private addresses, DNS resolution, redirects,
   response size, timeout, and content type.
4. Test category and geographic classification, leader scope, 72-hour freshness,
   canonical URL deduplication, and event-level repost clustering.
5. Test all verification-state transitions, including copied rumors, conflicting
   sources, and the rule that silence is not confirmation.
6. Test selection determinism, Vietnamese/international coverage anchors, the
   three-gold-news cap, three-items-per-source cap, backfill, 15-item maximum,
   and seven-day seen-history suppression.
7. Test message HTML escaping, price order, unavailable/stale price markers,
   unverified labels, attributed headlines, conflict notes, source buttons,
   length handling, and image fallback.
8. Test orchestration for price-only runs, news with unavailable prices, partial
   failures, total failure, sequential delivery, and per-news-message history
   callbacks.
9. Test the route's HTTP 200, 409, and 503 behavior without live Telegram or
   provider calls.
10. Run the complete Vitest suite, ESLint, TypeScript build, diff checks, and a
    tracked-secret scan to prove existing flows remain unchanged.

A live provider smoke check may read public data after configuration. A live
Telegram send occurs only after the dedicated bot token/chat ID are configured
and the user explicitly authorizes delivery.

## Out of Scope

- An in-process scheduler or Kubernetes CronJob manifest.
- Login automation, CAPTCHA bypass, private groups, private accounts, or private
  messages.
- Treating a social rumor as fact or using rumor volume as corroboration.
- Investment recommendations, price forecasts, or automated trading.
- Distributed locking or exactly-once delivery across multiple replicas.
- Refactoring the existing tech, gadget, health, or jobs flows onto this
  orchestrator.

## References Validated During Design

- SJC public price page: <https://www.sjc.com.vn/bieu-do-gia-vang>
- DOJI public price site: <https://banggia.doji.vn/>
- PNJ public price page: <https://www.pnj.com.vn/site/gia-vang>
- Brave Search API: <https://api-dashboard.search.brave.com/app/documentation/web-search/get-started>
- X recent search: <https://docs.x.com/x-api/posts/search/integrate/overview>
- Telegram public-post search limitations: <https://core.telegram.org/method/channels.searchPosts>
- TikTok Research API access model: <https://developers.tiktok.com/doc/research-api-get-started/>
