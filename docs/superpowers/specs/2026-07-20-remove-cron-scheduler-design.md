# Remove Cron Scheduler Design

## Goal

Remove automatic cron-based Telegram digest delivery and all cron-specific code, configuration, dependencies, and generated artifacts while preserving manual delivery through the HTTP API.

## Runtime Behavior

The HTTP server starts normally and listens on `env.PORT`. It no longer creates or starts a scheduler when the listen callback runs.

Digest collection, editorial processing, and Telegram delivery remain available through:

```text
POST /telegram/send-digest
```

No replacement timer, background worker, or external scheduling integration is added.

## Source and Generated Files

- Delete `src/services/scheduler.service.ts`.
- Remove the `SchedulerService` import, instance, and `start()` call from `src/server.ts`.
- Delete the stale ignored build artifact `dist/services/scheduler.service.js` so the local workspace contains no executable cron implementation.
- A subsequent TypeScript build rewrites `dist/server.js` and `dist/config/env.js` without scheduler or cron configuration references.

## Dependencies

Remove both cron-specific packages with npm so `package.json`, `package-lock.json`, and installed modules remain synchronized:

- Production dependency: `node-cron`
- Development dependency: `@types/node-cron`

No replacement package is introduced.

## Environment and Documentation

Remove `NEWS_CRON` from:

- `src/config/env.ts`
- `.env`
- `.env.example`
- `README.md`

After removal, `.env` and `.env.example` must still contain identical ordered key lists. Secret values in `.env.example` remain placeholders and are not copied from `.env`.

Historical design and implementation documents under `docs/superpowers/` remain unchanged because they record earlier project decisions rather than active runtime configuration.

## Error Handling

The scheduler-specific `try/catch` and `Scheduled digest failed` log disappear with the scheduler. Error behavior for the manual API remains unchanged and continues through the existing controller and Express error middleware.

## Verification

The removal is accepted when:

1. Active source, runtime configuration, package manifests, README, and generated JavaScript contain no `NEWS_CRON`, `node-cron`, `SchedulerService`, or `scheduler.start` references.
2. `.env` and `.env.example` have identical ordered key lists and the example contains no copied secrets.
3. `node-cron` and `@types/node-cron` are absent from the npm dependency tree.
4. `npm audit --audit-level=low` reports zero vulnerabilities.
5. All existing tests pass and `npm run build` succeeds.
6. The manual `POST /telegram/send-digest` route remains registered.
7. The production Docker image builds, runs as a non-root user, and responds successfully on `/health`.

The workspace has no Git metadata, so the changes and this design document cannot be committed here.
