# Reddit Link Post Images Design

## Goal

When a Reddit RSS item is a link post to an external article, Telegram messages should use the external article image when Reddit itself does not provide a usable image.

## Scope

This changes RSS image enrichment for Reddit sources only. The Telegram message URL remains the Reddit post URL so readers can open the discussion and comments.

The feature does not bypass Cloudflare, CAPTCHA, paywalls, or bot protections. If the external article cannot be fetched, the existing topic fallback image behavior remains unchanged.

## Current Behavior

`RssCrawler` maps RSS items to `Article` objects. It first tries image data from RSS fields and RSS HTML content. If no image exists, it fetches `article.url` and extracts Open Graph or Twitter image metadata.

For Reddit RSS link posts, `article.url` is the Reddit comments/post URL. The external article URL may appear inside the RSS `content` HTML as the `[link]` anchor. The current fallback fetches the Reddit post, so it can miss the image from the external article.

## Proposed Behavior

For sources whose id starts with `reddit-`:

- Keep `Article.url` as the normalized Reddit post URL.
- Keep existing image extraction first, including Reddit-hosted media thumbnails and images.
- If no image has been found, parse the RSS `content` HTML and find a likely external link-post URL.
- Ignore Reddit internal links such as comments, users, subreddits, and relative paths.
- Fetch the external URL and run the existing page image extraction against that external page.
- If the external page fetch or image extraction fails, return the article unchanged.

For non-Reddit RSS sources, keep the existing behavior.

## Link Selection

The external URL parser should load the RSS item `content` with Cheerio and inspect anchors in order. It should return the first absolute HTTPS URL whose hostname is not `reddit.com`, `www.reddit.com`, `old.reddit.com`, `new.reddit.com`, `redd.it`, or `i.redd.it`.

This intentionally keeps the first implementation small. If Reddit feed formats change later, tests can be extended with additional real snippets.

## Error Handling

All external image enrichment remains best effort:

- Invalid URLs are ignored.
- Non-HTTPS image URLs are ignored.
- HTTP failures are swallowed by the existing crawler fallback.
- Telegram sending remains unchanged and still falls back to text if `sendPhoto` fails.

## Tests

Add focused tests in `tests/crawlers/rss.crawler.test.ts`:

- A Reddit RSS item with no direct image and an external article link in `content` fetches the external article page and uses its `og:image`.
- A Reddit RSS item with an existing image does not fetch the external article.
- A non-Reddit RSS item does not use Reddit-specific external link parsing.

## Out Of Scope

- Replacing Telegram detail links with external article URLs.
- Adding OAuth Reddit API access.
- Downloading and re-uploading images to Telegram.
- Retrying Cloudflare-protected pages through another service.
