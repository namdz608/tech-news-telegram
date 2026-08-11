# Health and Lifestyle Telegram Service Design

**Date:** 2026-08-11  
**Status:** Approved for implementation planning

## Goal

Add a health and lifestyle news service to the existing Express application. The service collects trusted Vietnamese and international health content, translates and edits it into Vietnamese, balances up to 12 articles across six health categories, and sends each article to a dedicated Telegram bot and chat.

The service includes daily habits, disease information, medicine safety, and medical research. Its output is informational only: it must not diagnose, prescribe, recommend dosages, or tell readers to start, stop, or change treatment.

## Approved Product Decisions

- Use a Telegram bot and chat dedicated to health content.
- Combine Vietnamese and international sources; all output is Vietnamese.
- Send at most 12 articles per API call.
- Keep sent-URL history for 7 days.
- Expose an API trigger only; do not add an in-code scheduler.
- Refactor gadget and health onto a shared curated Telegram engine.
- Preserve the existing gadget API and behavior.
- Do not add an API for discovering a Telegram chat ID.

## Shared Architecture

Create a generic `CuratedTelegramFlow` that owns orchestration but receives domain behavior through typed interfaces:

- `collector.collectLatest()` returns articles plus successful and failed source counts.
- `selector.select(articles, seenUrls)` applies domain relevance, classification, scoring, balancing, and limits.
- `messageBuilder.buildMessages(entries)` creates domain-specific Vietnamese messages.
- `history.seenUrls()` and `history.mark(url)` provide per-flow URL suppression.
- `delivery.send(messages)` sends messages sequentially and marks a URL only after its message succeeds.

The shared flow executes:

1. Collect all enabled sources independently.
2. Return an all-sources-failed error when no source succeeds.
3. Load the flow's sent history.
4. Select eligible unseen articles.
5. Return a successful no-new-articles response when selection is empty.
6. Build messages and deliver them sequentially.
7. Return collection, selection, skip, and delivery counts.

Thin composition factories preserve domain separation:

- `createGadgetFlowService()` composes gadget sources, policy, 30-day history, messages, and gadget Telegram credentials.
- `createHealthFlowService()` composes health sources, policy, 7-day history, safety-aware messages, and health Telegram credentials.

The shared engine must not contain gadget or health keywords. Domain policies remain separate and injectable. Shared helpers may cover RSS collection, canonical URL handling, balanced picking, tracked Telegram delivery, and common response types.

## Backward Compatibility

- `POST /telegram/send-gadgets` retains its current request and response behavior.
- Gadget category order, per-category cap, per-source cap, 12-article limit, bot/chat, and 30-day history remain unchanged.
- Existing digest and jobs flows remain outside the new curated engine unless a small compatibility adapter is required.
- Characterization tests must capture gadget behavior before the refactor and remain green afterward.

## Health Sources

Use these seven allowlisted RSS feeds. Each returned HTTP 200 with XML during design validation on 2026-08-11:

| Key | Source | Feed |
| --- | --- | --- |
| `vnexpress-health` | VnExpress Sức khỏe | `https://vnexpress.net/rss/suc-khoe.rss` |
| `tuoitre-health` | Tuổi Trẻ Sức khỏe | `https://tuoitre.vn/rss/suc-khoe.rss` |
| `thanhnien-health` | Thanh Niên Sức khỏe | `https://thanhnien.vn/rss/suc-khoe.rss` |
| `medlineplus-new` | MedlinePlus New Links | `https://medlineplus.gov/groupfeeds/new.xml` |
| `medlineplus-healthy-living` | MedlinePlus Healthy Living | `https://medlineplus.gov/feeds/topics/healthyliving.xml` |
| `fda-medwatch` | FDA MedWatch Safety Alerts | `https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml` |
| `niddk-news` | NIH/NIDDK News | `https://www.niddk.nih.gov/rss/news` |

Every source is fetched independently with `Promise.allSettled`. A failed source is logged and counted without suppressing successful sources. Source affinity may influence scoring but never bypass health relevance or safety filtering.

## Health Categories

Each eligible article receives exactly one primary category:

| Key | Vietnamese label | Coverage |
| --- | --- | --- |
| `sleep-recovery` | Giấc ngủ & Phục hồi | sleep, insomnia, circadian rhythm, fatigue, recovery |
| `nutrition-metabolism` | Dinh dưỡng & Chuyển hóa | diet, nutrients, food safety, obesity, diabetes, metabolism |
| `movement-musculoskeletal` | Vận động & Cơ xương khớp | exercise, fitness, mobility, posture, joints, muscles, injury prevention |
| `mental-wellbeing` | Sức khỏe tinh thần | stress, anxiety, depression, emotional wellbeing, addiction |
| `prevention-daily-life` | Phòng bệnh & Thói quen sinh hoạt | hygiene, screening, vaccination, healthy routines, public-health prevention |
| `conditions-medicine-research` | Bệnh lý, Thuốc & Nghiên cứu | disease, diagnosis research, treatment research, drug and device safety |

Selection is deterministic for the same input and time:

1. Reject stale, malformed, suspicious, advertorial, or irrelevant articles.
2. Canonicalize and deduplicate URLs.
3. Remove URLs present in the 7-day health history.
4. Classify eligible articles with Unicode-aware word and phrase matching.
5. Score strong title relevance, summary relevance, freshness, source authority/affinity, and metadata quality.
6. Select at most two articles per category and at most two per source.
7. Backfill from the remaining highest-scoring articles while preserving the source cap.
8. Stop at `HEALTH_MAX_ARTICLES`, default 12.

## Evidence and Safety Policy

Every selected article is assigned one evidence label:

- `guidance`: established lifestyle or prevention guidance.
- `public-health-alert`: official outbreak, recall, or prevention alert.
- `drug-safety`: official medicine or medical-device safety information.
- `research`: new observational, laboratory, animal, or clinical research.
- `medical-news`: other sourced disease or healthcare information.

Safety rules are deterministic and apply even when an AI editorial provider is enabled:

- Preserve uncertainty words such as “may,” “associated with,” and “early evidence.”
- Never rewrite association as causation.
- Never generate a diagnosis, personalized treatment, prescription, or dosage.
- Never tell a reader to start, stop, switch, or adjust medication.
- Drug-safety messages direct readers to a doctor or pharmacist before changing treatment.
- Research messages state important limitations available from the source, including animal-only work, small samples, observational design, or preliminary status.
- Articles centered on supplement advertising, miracle cures, detox claims, rapid weight loss, unsupported testimonials, or hidden promotional content are rejected.
- Articles whose titles center on self-medication or dosage instructions are rejected. Generated fields containing dosage patterns fall back to safe deterministic copy.
- Emergency-warning content may advise seeking urgent care or calling emergency services, but must not attempt diagnosis.

Every message ends with: `Thông tin tham khảo, không thay thế chẩn đoán hoặc điều trị y khoa.`

## Message Format

Each article is sent as a separate Telegram message with an optional image:

1. Category icon and Vietnamese category label.
2. Vietnamese title.
3. Evidence label.
4. Publication date.
5. Neutral summary.
6. `Điều có thể áp dụng an toàn` with non-personalized, low-risk guidance or a deterministic fallback.
7. `Giới hạn/Lưu ý` describing evidence limitations and higher-risk audiences when supported by the source.
8. The mandatory medical-information disclaimer.
9. Source name and an inline `Xem bài gốc` button.

HTML escaping and Telegram length handling reuse the existing common renderer and delivery service. If Telegram cannot fetch an image, delivery falls back to text without losing the article.

## API and Concurrency

Register:

```http
POST /telegram/send-health
```

The endpoint uses an in-process health-specific lock:

- Concurrent health calls return HTTP 409.
- Gadget and health calls may run at the same time because their locks, credentials, histories, and flow instances are independent.
- All health sources failing returns HTTP 503.
- Partial source failure still returns HTTP 200 after processing successful sources.
- No eligible unseen articles returns HTTP 200 with `sent: false`, `reason: "no_new_articles"`, and `messageCount: 0`.

Responses include:

- `sent`
- `messageCount`
- `collectedCount`
- `eligibleCount`
- `skippedSeenCount`
- `language: "vi"`
- `channel: "telegram-health"`

## Configuration and Storage

Add these environment variables:

```env
HEALTH_TELEGRAM_BOT_TOKEN=replace_me
HEALTH_TELEGRAM_CHAT_ID=replace_me
HEALTH_MAX_ARTICLES=12
HEALTH_HISTORY_RETENTION_DAYS=7
HEALTH_HISTORY_PATH=data/health-sent-history.json
```

The real bot token and chat ID exist only in ignored runtime configuration. The bot chat ID is discovered operationally through Telegram after the user sends a message to the bot; the application does not expose a chat-ID discovery route.

Health history uses the existing versioned JSON and same-directory atomic rename pattern. Corrupt files are quarantined. Docker persists `/app/data` so history survives restarts.

## Error and Delivery Semantics

- RSS parse/network failures are isolated per source and logged with source ID.
- Editorial provider failure falls back to deterministic Vietnamese-safe content.
- Invalid or unsafe generated editorial fields are replaced with deterministic safety copy.
- Telegram messages are sent sequentially.
- History is marked only after each message succeeds, yielding at-least-once delivery semantics if history persistence fails after Telegram accepts a message.
- A photo failure falls back to text. A text-send failure stops the run and leaves that URL unseen for a future retry.

## Testing Strategy

Implementation follows test-driven development:

1. Add gadget characterization tests before extracting the shared engine.
2. Add contract tests for collection failure, no-new response, selection handoff, sequential delivery, and per-message history callbacks in `CuratedTelegramFlow`.
3. Run the gadget test suite after each extraction step to prove behavior preservation.
4. Test all seven health source configurations and RSS opt-in behavior.
5. Test category classification, Unicode boundaries, deterministic ordering, per-category and per-source caps, 12-article maximum, canonical dedupe, and 7-day history suppression.
6. Test rejection of supplement promotion, miracle cures, detox/rapid-weight-loss claims, self-medication, and dosage-centered content.
7. Test evidence labeling and safe fallbacks for drug alerts and preliminary research.
8. Test message HTML escaping, required disclaimer, source attribution, link button, image fallback, and Telegram length limits.
9. Test `POST /telegram/send-health` responses for 200, 409, and 503 without sending real Telegram messages.
10. Run the complete Vitest suite, ESLint, TypeScript build, diff checks, and tracked-secret scan.

A live Telegram call occurs only after the dedicated health bot token and chat ID are configured and the user explicitly authorizes delivery.

## Out of Scope

- Diagnosing symptoms or personalizing medical advice.
- Prescribing medicine, supplements, or treatment plans.
- An in-code scheduler.
- A chat-ID discovery API.
- Distributed locks or multi-replica delivery guarantees.
- Scraping sources that do not provide an approved feed in this iteration.
- Refactoring jobs or the general tech digest onto the curated engine.
