# Politics RSS Text and Images Design

## Goal

Gold/Politics Telegram news must display decoded Vietnamese text and include an image consistently.

## Design

- Decode HTML character references in RSS title and summary at the crawler boundary, before topic matching or downstream editorial work.
- Preserve the RSS article `imageUrl` when mapping an `Article` into a `PoliticsSourceItem`, `PoliticsCandidate`, and `PoliticsMessage`.
- Choose the message image in this order: valid HTTPS article image, then a valid HTTPS fallback for the politics category.
- Pass the selected image through `GoldPoliticsDeliveryService` to the existing `TelegramService.sendDigest` photo path.
- Keep bounded politics feed fetching and `enrichArticlePage: false`; Thanh Nien already supplies item images in RSS descriptions, so no extra article-page requests are needed.

## Failure Handling

- Invalid or missing article images use the category fallback.
- If Telegram rejects an image, the existing `TelegramService` behavior falls back to sending the text message.
- HTML decoding happens before Telegram HTML escaping, preventing both literal entities and unsafe markup.

## Tests

- RSS crawler decodes named and numeric entities in titles and summaries.
- Politics RSS adapter preserves `imageUrl`.
- Message builder prefers the article image and otherwise selects the category fallback.
- Delivery passes the selected image to Telegram.
- Existing Gold/Politics and Telegram tests remain green.
