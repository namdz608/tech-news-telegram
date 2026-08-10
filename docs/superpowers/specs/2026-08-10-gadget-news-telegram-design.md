# Gadget News Telegram Flow Design

## Goal

Add an isolated consumer-gadget news flow to the existing application. A caller triggers `POST /telegram/send-gadgets`; the flow collects Vietnamese and international device news, selects at most 12 fresh articles, translates and edits them in Vietnamese, sends them through a second Telegram bot to its own chat, and remembers successfully sent URLs for 30 days.

## Scope

In scope:

- New endpoint `POST /telegram/send-gadgets`.
- Separate Telegram credentials and destination for the gadget flow.
- RSS sources covering Vietnamese and international consumer-device news.
- Gadget-specific relevance filtering, classification, scoring, and balanced selection.
- At most 12 articles per request and at most two selected articles from one source.
- Cross-run URL history persisted to a JSON file for 30 days.
- Existing Vietnamese translation, editorial enrichment, image, and Telegram fallback behavior where applicable.
- Documentation for an external caller to trigger the endpoint.

Out of scope:

- Any in-process cron or scheduler.
- Configuring an external scheduling platform.
- A database or distributed lock.
- Scraping full article bodies.
- Adding gadget sources or topics to the existing tech digest.
- Changing the existing jobs-to-email flow.

## Architecture

The gadget flow is a separate composition root that reuses stable application primitives rather than turning the whole application into a generic multi-flow framework.

```text
External caller
  -> POST /telegram/send-gadgets
  -> GadgetSourceService.collectLatest()
  -> GadgetSelectionService.select()
       -> reject non-device articles
       -> canonical-URL dedupe
       -> remove URLs present in 30-day history
       -> classify and score
       -> balance categories and sources
       -> return at most 12 articles
  -> build and edit Vietnamese messages
  -> GadgetDeliveryService sends with the second bot/chat
  -> SentHistoryStore records each successfully delivered URL
  -> JSON response
```

The existing `/telegram/send-digest` continues to instantiate the default `SourceService`, `DigestService`, and `TelegramService`. Gadget modules receive their own sources, topics, credentials, chat destination, maximum article count, and history store. Gadget configuration must not be imported by the default tech source list.

## Telegram Destination and Secrets

The gadget bot has already been verified through Telegram `getMe`. Its private destination chat ID is:

```text
1290050401
```

Runtime configuration:

```env
GADGET_TELEGRAM_BOT_TOKEN=replace_me
GADGET_TELEGRAM_CHAT_ID=1290050401
GADGET_MAX_ARTICLES=12
GADGET_HISTORY_RETENTION_DAYS=30
GADGET_HISTORY_PATH=data/gadget-sent-history.json
```

The real token is written only to the ignored local `.env` or the deployment secret store. `.env.example`, source code, tests, documentation, and Git history contain placeholders only. The existing `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` remain unchanged.

## Sources

The initial source set uses RSS only so it can reuse the current RSS crawler and avoid brittle HTML selectors.

Vietnamese sources:

| ID | Name | Feed |
| --- | --- | --- |
| `vnexpress-tech` | VnExpress Khoa học Công nghệ | `https://vnexpress.net/rss/khoa-hoc-cong-nghe.rss` |
| `thanhnien-products` | Thanh Niên Sản phẩm Công nghệ | `https://thanhnien.vn/rss/cong-nghe/san-pham.rss` |
| `tuoitre-tech` | Tuổi Trẻ Công nghệ | `https://tuoitre.vn/rss/cong-nghe.rss` |

International sources:

| ID | Name | Feed |
| --- | --- | --- |
| `ars-gadgets` | Ars Technica Gear & Gadgets | `https://feeds.arstechnica.com/arstechnica/gadgets` |
| `macrumors-all` | MacRumors | `https://feeds.macrumors.com/MacRumors-All` |
| `tomshardware-all` | Tom's Hardware | `https://www.tomshardware.com/feeds/all` |
| `engadget-all` | Engadget | `https://www.engadget.com/rss.xml` |

All seven feed URLs returned HTTP 200 with RSS XML during design validation on 2026-08-10. Every source has a gadget-category affinity used as a scoring hint, but affinity never bypasses relevance filtering. If a feed fails, the collector logs that source and continues with the others.

## Gadget Categories

Each relevant article receives exactly one primary category so it can be selected and sent only once:

| Key | Label | Representative terms |
| --- | --- | --- |
| `mobile` | Điện thoại & Máy tính bảng | smartphone, phone, Android, Galaxy, Pixel, tablet, điện thoại, máy tính bảng |
| `apple` | Apple | Apple, iPhone, iPad, MacBook, Mac, AirPods, Apple Watch |
| `computers` | Laptop & Máy tính | laptop, notebook, desktop, PC, workstation, máy tính |
| `components` | Linh kiện | CPU, GPU, chip, processor, graphics card, RAM, memory, SSD, storage, Intel, AMD, Nvidia, Qualcomm |
| `av-accessories` | Màn hình, Âm thanh & Phụ kiện | monitor, display, TV, screen, headphones, earbuds, speaker, keyboard, mouse, dock, charger |
| `smart-devices` | Thiết bị thông minh | smartwatch, wearable, smart home, camera, router, console, VR, AR, gadget |

Category order is also the deterministic tie-break order when an article matches several categories. Apple product terms take precedence over generic mobile or computer terms so, for example, an iPhone article belongs to `apple`, not `mobile`.

An article is rejected unless its normalized title and summary contain at least one strong device/product term. Generic AI, software, corporate, finance, policy, social-network, or digital-transformation news is rejected unless it directly concerns a named consumer device or hardware component.

## Selection Rules

Selection is deterministic for the same input and current time:

1. Reject articles older than the existing maximum article age.
2. Normalize URLs by removing fragments and tracking parameters, then deduplicate within the current collection.
3. Remove URLs still present in the 30-day sent history.
4. Classify every remaining relevant article into one primary gadget category.
5. Score by freshness, strong title match, category/source affinity, and available article metadata.
6. Fill up to two slots per category in the category order above, while enforcing at most two selected articles from one source.
7. If category slots remain empty, backfill with the highest-scoring remaining articles while preserving the per-source cap.
8. Stop at `GADGET_MAX_ARTICLES`, default 12.

Vietnamese and international sources participate in the same ranking. The source cap and category balancing prevent one high-volume feed from dominating; no hard locale quota is required because it could force low-relevance articles into the digest.

## Message Construction and Delivery

Selected articles reuse the existing structured editorial and translation behavior. International content is translated to Vietnamese; Vietnamese content still passes through the same editorial contract and fallback renderer. Each message includes the gadget category, title, publication date when available, concise summary, significance/action level, source, image or category fallback image, and the original-article button.

The gadget flow creates its Telegram client from `GADGET_TELEGRAM_BOT_TOKEN` and targets `GADGET_TELEGRAM_CHAT_ID`. It must never reuse the default bot implicitly.

Delivery sends one separator followed by messages in selection order. After each article message succeeds, its canonical URL is immediately recorded in the history store. If a later message fails, delivery stops and propagates the error; already delivered URLs remain recorded and unsent URLs are eligible on the next call.

## Sent History

The JSON history file stores versioned data:

```json
{
  "version": 1,
  "sent": {
    "https://example.com/device-news": "2026-08-10T01:00:00.000Z"
  }
}
```

Rules:

- A missing file represents empty history.
- Loading removes entries older than `GADGET_HISTORY_RETENTION_DAYS`, default 30.
- Saving writes a temporary file in the same directory and renames it over the target so readers never observe a partial JSON document.
- A malformed or schema-invalid file is renamed to `<original>.corrupt-<timestamp>`, a warning is logged, and the request continues with empty history.
- The directory is created when absent.
- The Docker deployment must mount the configured path or its parent directory as persistent storage if history must survive container replacement.

The file store and in-process request guard assume one running application instance. Multi-replica deployments require a shared database and distributed lock, which are outside this feature's scope.

## Concurrency

Only one gadget request may execute in a process at a time. A second request received while collection, editing, or delivery is active returns HTTP 409:

```json
{
  "error": "Gadget digest is already running"
}
```

The guard is released in a `finally` block after success or failure.

## API Contract

Request:

```http
POST /telegram/send-gadgets
```

Successful delivery:

```json
{
  "sent": true,
  "collectedCount": 64,
  "eligibleCount": 18,
  "skippedSeenCount": 7,
  "messageCount": 12,
  "language": "vi",
  "channel": "telegram-gadgets"
}
```

No new eligible articles:

```json
{
  "sent": false,
  "reason": "no_new_articles",
  "collectedCount": 41,
  "eligibleCount": 0,
  "skippedSeenCount": 16,
  "messageCount": 0,
  "language": "vi",
  "channel": "telegram-gadgets"
}
```

Status behavior:

| Case | Status and behavior |
| --- | --- |
| At least one source succeeds | Continue with the articles it returns |
| Every configured source fails | `503`; send nothing and do not mutate history |
| No new eligible articles | `200`; no Telegram separator or article message |
| Concurrent gadget request | `409` |
| Editorial provider fails | Use the existing fallback editorial behavior |
| Telegram fails | Propagate through the existing error middleware; keep history for messages already sent |

## Integration Points

Expected focused changes:

- `src/config/env.ts` and `.env.example`: gadget runtime configuration.
- `src/config/gadget-sources.ts`: isolated RSS source list and affinities.
- `src/config/gadget-topics.ts`: categories and relevance terms.
- `src/services/gadget-selection.service.ts`: classification, scoring, source balancing, and selection.
- `src/services/sent-history.store.ts`: versioned 30-day JSON persistence.
- `src/services/gadget-delivery.service.ts`: incremental Telegram delivery and history writes.
- `src/controllers/telegram.controller.ts`: gadget orchestration and in-process concurrency guard.
- `src/routes/telegram.routes.ts`: `POST /telegram/send-gadgets`.
- `README.md`: configuration, persistent volume note, response examples, and `curl` invocation.

Shared services may receive small backwards-compatible injection or callback extensions when required. Existing default constructors and behavior must remain unchanged.

## Tests

Automated tests cover:

- Env defaults, validation, and separation from the existing Telegram credentials.
- All gadget source configs are enabled RSS sources with unique IDs and HTTPS feed URLs.
- Classification for each of the six categories, Apple precedence, and rejection of unrelated software/AI/business content.
- Canonical URL dedupe, sent-history filtering, maximum 12 results, two slots per category, two results per source, deterministic scoring, and backfill.
- History missing-file behavior, 30-day expiry, atomic persistence, successful incremental marking, and corrupt-file preservation/recovery.
- One failed feed does not prevent successful feeds from contributing articles; all feeds failing produces the all-source failure result.
- Route success, no-new-article behavior, 409 concurrency, 503 all-source failure, incremental Telegram failure, and use of the gadget bot/chat.
- Regression that `/telegram/send-digest` still uses only the original tech sources and default Telegram configuration.
- Existing complete test suite, lint, and TypeScript build.

Network RSS calls and Telegram calls are mocked in automated tests. After automated verification, one live call to `POST /telegram/send-gadgets` verifies the configured bot and private destination end to end.

## Success Criteria

- A caller can trigger the gadget flow solely through `POST /telegram/send-gadgets`; the repository adds no scheduler.
- The flow combines the seven specified Vietnamese and international RSS feeds.
- Only consumer-device and hardware news is selected across the six approved categories.
- At most 12 Vietnamese messages are sent, with no more than two from one source.
- Successfully delivered canonical URLs are not resent for 30 days when persistent history storage is retained.
- The verified second bot sends only to chat `1290050401`.
- Existing tech digest and jobs email behavior remain unchanged.
- Tests, lint, and build pass, followed by one successful live endpoint call.
