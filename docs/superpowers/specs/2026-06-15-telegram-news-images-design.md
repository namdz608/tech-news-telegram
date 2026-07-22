# Telegram News Images Design

## Goal

Each per-article Telegram message should include an illustrative image. Prefer an image from the article or source data when available. If no source image exists, use a stable fallback image for the assigned topic.

## Scope

This feature changes the per-article message flow used by `POST /telegram/send-digest`. It does not change the old combined digest text format beyond carrying image data through the same selection pipeline.

The first version uses existing public image URLs. It does not download, resize, cache, generate, or upload images.

## Data Model

Add optional image fields:

- `Article.imageUrl?: string`
- `DigestMessage.imageUrl?: string`

Crawler implementations can populate `Article.imageUrl`. `DigestService` decides the final `DigestMessage.imageUrl` by preferring the article image and falling back to a topic image.

## Source Images

Initial source image extraction:

- RSS: read `enclosure.url`, common media fields, or the first image in RSS content when available.
- HTML: support an optional `image` selector in `HtmlSourceSelectors`.
- GitHub AI Repos: use `owner.avatar_url` from GitHub Search API.
- X Search: leave source image empty for now and rely on topic fallback.

Invalid or empty image URLs are ignored.

## Topic Fallback Images

Add a small topic image mapping in code:

- `ai`
- `k8s`
- `security`
- `devops`
- `cloud`

The URLs should be stable public HTTPS images. The mapping is used only when `article.imageUrl` is missing.

## Telegram Sending

Extend `TelegramService` so a `DigestMessage` with `imageUrl` uses:

```text
sendPhoto(chatId, imageUrl, { caption, parse_mode: 'HTML', reply_markup })
```

Keep the existing inline `Đọc chi tiết` button.

Fallback behavior:

- If `imageUrl` is missing, use the existing `sendMessage` path.
- If `sendPhoto` fails, send the same content as text with `sendMessage`.
- If a message must be split because it is too long, use the image only on the final chunk that carries the article URL button. Earlier chunks stay text-only.

Telegram photo captions have a shorter length limit than text messages. Set a conservative caption limit for photo messages and keep the existing text split behavior for plain text.

## Error Handling

Image failures must not stop the digest. Log a short warning and continue with text fallback. Do not log sensitive headers or tokens.

Crawler image extraction should be best effort. A malformed image URL should be ignored rather than failing the source.

## Tests

Add or update tests for:

- `DigestService` preserves article image URLs in `DigestMessage`.
- `DigestService` supplies a fallback image URL by topic when the article has no image.
- `TelegramService` calls `sendPhoto` when `imageUrl` is present.
- `TelegramService` falls back to `sendMessage` when `sendPhoto` fails.
- `GitHubReposCrawler` maps `owner.avatar_url` to `Article.imageUrl`.
- RSS or HTML image extraction where practical with existing crawler tests.

## Operational Notes

No new API keys are required. The feature depends on Telegram being able to fetch public HTTPS image URLs. If an image host blocks Telegram, the message will still be sent as text.
