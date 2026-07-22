# Reddit DNS Fallback Design

**Date:** 2026-07-20

## Goal

Restore all outbound Reddit requests from `tech-news-telegram` without changing the VPS DNS configuration, hard-coding a Fastly IP address, or routing non-Reddit traffic differently.

## Problem

The VPS receives CMC Telecom resolvers `183.91.10.1` and `183.91.10.2` through DHCP. Those resolvers return `NXDOMAIN` for `reddit.com` and `*.reddit.com`, although Reddit's authoritative DNS returns `www.reddit.com` as a CNAME of `reddit.map.fastly.net`.

The same CMC resolvers successfully resolve the Fastly aliases to the reachable regional address `151.101.77.140`. HTTPS requests to that address succeed when the original Reddit hostname remains in the HTTP `Host` header and TLS SNI. Therefore the application can recover by resolving the CDN alias only when ordinary lookup of a Reddit-owned hostname fails.

## Scope

The fallback applies to every HTTP client in the application that can request a Reddit-owned hostname:

- the `rss-parser` client used by `RssCrawler` to load Reddit feeds;
- the Axios client used by `RssCrawler` to inspect article pages for images;
- the Axios client used by `TelegramService` to download Reddit-hosted images.

The recognized hostname families are:

- `reddit.com` and subdomains of `reddit.com`;
- `redd.it` and subdomains of `redd.it`;
- `redditstatic.com` and subdomains of `redditstatic.com`.

Requests to all other hostnames retain the operating system's normal DNS behavior.

OAuth, Reddit API integration, source selection, digest scoring, Telegram message formatting, and system network configuration are outside this change.

## Architecture

Add a focused utility responsible for Reddit-aware hostname lookup and HTTPS agent construction. The utility exposes a reusable HTTPS agent configured with a custom Node lookup function.

The lookup behavior is:

1. Resolve the requested hostname through the normal operating-system lookup.
2. Return that result immediately when it succeeds.
3. If it fails with `ENOTFOUND` and the hostname belongs to a recognized Reddit family, resolve the corresponding Fastly alias through the normal operating-system lookup.
4. Return the alias addresses while preserving the original request hostname. Node continues to use the original hostname for HTTP `Host` and TLS SNI.
5. For non-`ENOTFOUND` errors, non-Reddit hostnames, or failure of the alias lookup, propagate the error without inventing or caching an address.

Alias mapping:

| Original hostname family | Fallback alias |
| --- | --- |
| `reddit.com`, `*.reddit.com` | `reddit.map.fastly.net` |
| `redd.it`, `*.redd.it` | `dualstack.reddit.map.fastly.net` |
| `redditstatic.com`, `*.redditstatic.com` | `dualstack.reddit.map.fastly.net` |

The lookup implementation must preserve Node's `dns.lookup` contract for both single-address and `all: true` calls, including requested address family options.

## Integration

`RssCrawler` keeps its current public constructor and dependency-injection pattern. Its default `rss-parser` instance receives the shared Reddit-aware HTTPS agent through `requestOptions.agent`. Its default Axios instance receives the same agent through `httpsAgent`.

`TelegramService` keeps its current constructor API. Its default Axios instance also receives the shared agent through `httpsAgent`.

Injected parser, HTTP client, and Telegram client test doubles remain unchanged. No source configuration or environment variable is required because the fallback is automatic, narrow, and activated only after a normal lookup returns `ENOTFOUND`.

## Error Handling

The resolver does not silently fall back for timeouts, connection failures, certificate failures, or arbitrary DNS errors. This prevents an unrelated network failure from being disguised as the known CMC DNS condition.

If Fastly alias lookup fails, the error propagates to the existing boundary:

- feed failures are logged per source by `SourceService`, and other sources continue;
- article-image lookup failures remain non-fatal in `RssCrawler`;
- Telegram image download failures retain the existing text-message fallback.

No fixed IP address is retained in code, configuration, or cache.

## Testing

Unit tests for the DNS utility cover:

- successful normal lookup without invoking the alias;
- `reddit.com` and subdomain fallback to `reddit.map.fastly.net` after `ENOTFOUND`;
- `redd.it` and `redditstatic.com` family fallback to `dualstack.reddit.map.fastly.net`;
- no fallback for non-Reddit hostnames;
- no fallback for DNS errors other than `ENOTFOUND`;
- propagation of alias lookup failure;
- correct single-address and `all: true` callback shapes.

Crawler and Telegram tests verify their default clients receive the Reddit-aware agent while preserving existing constructor injection behavior.

After unit, type-check, and full-suite verification, an integration check calls `GET /news/latest` on the running service and confirms that at least one returned article has a `sourceId` beginning with `reddit-`. The check must also confirm that existing non-Reddit sources continue returning articles.

## Success Criteria

- Reddit RSS feeds resolve and return articles on the current CMC-hosted VPS.
- `/news/latest` contains at least one Reddit article and at least one non-Reddit article.
- Selected Telegram messages can include Reddit sources and download Reddit-hosted images when present.
- No `/etc/hosts`, `systemd-resolved`, DHCP, proxy, or global DNS setting is changed.
- No Fastly IP address is hard-coded.
- All automated tests and the TypeScript build pass.
- `npm run lint` is attempted and its pre-existing missing ESLint 10 flat-config failure is reported separately; configuring ESLint is outside this DNS change.
