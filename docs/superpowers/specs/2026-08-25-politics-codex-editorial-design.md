# Politics Codex Editorial Design

## Goal

Gold/politics Telegram items are edited into verified Vietnamese by Codex. Tech, gadget, and health flows keep the global Google editorial path. Politics no longer depends on unofficial Google Translate (`gtx`) on the happy path, which currently returns HTTP 429 and ships `Chưa có bản dịch tiếng Việt đã xác minh` plus raw English.

## Root Cause

`EDITORIAL_PROVIDER=google` is global. `PoliticsEditorialService` skips the model editor for that provider, then translates title/summary through `GoogleTranslationService` (`translate.googleapis.com`, `client=gtx`). When gtx is rate-limited, `translateDigestVerified` returns `succeeded: false` and `createTranslationFallbackEditorial` publishes the English source under an explicit “unverified translation” notice. Retrying gtx cannot recover a blocked IP.

The runtime image is `node:22-alpine` and does not contain the `codex` binary that `CodexExecRunner` spawns.

## Approaches Considered

1. **Politics-only Codex (selected):** `GOLD_POLITICS_EDITORIAL_PROVIDER` independent of `EDITORIAL_PROVIDER`. Factory wires Codex for gold-politics only. Successful Codex Vietnamese JSON skips gtx.
2. **Global `EDITORIAL_PROVIDER=codex`:** would also change tech/gadget/health editorial, which is out of scope.
3. **Codex as gtx fallback only:** still hits gtx first; 429 remains the common path and still delays every item.

## Design

### Provider split

Add `GOLD_POLITICS_EDITORIAL_PROVIDER` with the same enum as `EDITORIAL_PROVIDER`: `openai | codex | google | none`.

- Default in `src/config/env.ts` is `codex`.
- Global `EDITORIAL_PROVIDER` stays `google` (`.env.example`, Helm, tech/gadget/health).
- Helm `secretEnv` sets `GOLD_POLITICS_EDITORIAL_PROVIDER: "codex"`.

`createGoldPoliticsFlowService` constructs politics editorial from this env only:

- `codex` → `ArticleEditorialService(new CodexArticleEditorialGenerator())`
- `openai` → `ArticleEditorialService(new OpenAIArticleEditorialGenerator())`
- `google` / `none` → current `ArticleEditorialService()` default (Google generator when global provider is google)

`PoliticsEditorialService` must **not** read global `EDITORIAL_PROVIDER` to decide skip-vs-edit. Factory passes options derived from `GOLD_POLITICS_EDITORIAL_PROVIDER`:

- `google` or `none` → `skipModelEditor: true` (keep today’s gtx fallback path)
- `codex` or `openai` → `skipModelEditor: false` and `nativeVietnameseEditor: true`

`shouldSkipPoliticsModelEditor` stays a helper for the Google dump-avoidance rule; factory/options own the politics-provider decision.

### Happy path (codex)

1. Unverified candidates still use `createUnverifiedEditorial` with no Codex call.
2. Other candidates call the Codex-backed `editArticle` with existing grounded article serialization and `politicsEditorialInstructions` (Vietnamese, attribution, no invention).
3. Grounded-dump detection is unchanged. A dump is editor failure, not native Vietnamese.
4. Successful parsed Codex JSON is treated as native Vietnamese **only if** title or summary contains at least one Vietnamese character in the class `à-ỹ` / `đ` (NFC). Pure ASCII English is editor failure.
5. Native Vietnamese output skips `translateDigestVerified`. Validate with existing `translated` mode. Do not trust a Codex JSON `languageVerified` flag.
6. `ArticleEditorialService` verification rules for tech digest stay unchanged: only the Google translation generator may set `verifiedVietnameseEditorial` from a successful gtx call.

### Failure path

Codex throw, timeout, unparseable JSON, grounded dump, or missing Vietnamese characters → existing `translateFallback` (gtx, then `createTranslationFallbackEditorial` if gtx also fails). Do not invent a Vietnamese paraphrase.

### Runtime image

`CodexExecRunner` spawns `codex` with `--ephemeral --sandbox read-only --skip-git-repo-check`. The runtime image must provide that binary on `PATH` for user `node`.

Switch Dockerfile stages from `node:22-alpine` to `node:22-bookworm-slim` so the Codex native binary (glibc) can run and compiled `node_modules` match the runtime. Keep `mkdir -p /app/data` owned by `node`.

Install the official Codex CLI (`@openai/codex`) globally in the runtime image before dropping to `USER node`. `HOME` remains `/home/node` so Codex can write cache under the non-root user.

Auth: Codex CLI inherits `process.env`. Helm adds `CODEX_API_KEY` with the same value as existing `OPENAI_API_KEY` so either CLI env name works. No ChatGPT interactive login. A placeholder API key fails Codex at runtime and takes the conservative fallback; putting a real key in Helm is an ops step, not app logic.

Keep `CODEX_TRANSLATION_TIMEOUT_MS` (Helm already `120000`). Politics items are edited sequentially; slower cron is accepted. Cron `concurrencyPolicy: Forbid` is unchanged.

### Docs and config surface

- `.env.example`: `GOLD_POLITICS_EDITORIAL_PROVIDER=codex` next to the other gold-politics keys; the gold-politics runtime contract test currently pins twelve keys and must include this thirteenth exact line.
- README gold-politics section: politics editorial uses Codex; global `EDITORIAL_PROVIDER` still selects tech/gadget/health editorial; gtx is last-resort only for politics.
- Helm `secretEnv` also adds `CODEX_API_KEY` (same value as `OPENAI_API_KEY`).
- Helm `tests/render-test.sh`: assert both new keys and raise the `stringData` count from 54 to 56.

## Out of scope

- Changing tech, gadget, or health editorial/translation.
- Official Google Cloud Translation API.
- Re-sending items already in `gold-politics-sent-history.json`.
- Parallel Codex processes.

## Tests

- Env default for `GOLD_POLITICS_EDITORIAL_PROVIDER` is `codex`; independent of `EDITORIAL_PROVIDER=google`.
- Factory with politics provider `codex` constructs `PoliticsEditorialService` with a Codex-backed editor and `skipModelEditor: false`.
- Codex mock returning Vietnamese JSON for a Guardian/Carney-style English item yields Vietnamese fields, does not call `translateDigestVerified`, and does not contain `Chưa có bản dịch tiếng Việt đã xác minh`.
- Codex mock returning English-only ASCII JSON falls through to the existing translation/fallback path.
- Google politics provider still skips the model editor and uses gtx.
- Existing politics validator, skip-Google-dump, and translation-notice tests stay green.
- Dockerfile still prepares writable `/app/data`; image is bookworm-slim and installs `codex`.
- Helm render includes `GOLD_POLITICS_EDITORIAL_PROVIDER` and `CODEX_API_KEY`.
- Full unit suite, lint, and build.
