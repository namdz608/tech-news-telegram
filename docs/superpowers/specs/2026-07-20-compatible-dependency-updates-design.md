# Compatible Dependency Updates Design

## Goal

Update project dependencies to the newest releases permitted within their current major versions and eliminate all vulnerabilities currently reported by `npm audit`.

## Scope

The change updates `package.json` and `package-lock.json`. Application source is changed only if a compatible dependency update exposes a real compilation or test incompatibility. No major-version migration or unrelated refactoring is included.

## Direct Dependencies

Update outdated direct dependencies to the newest compatible releases reported by the npm registry on 2026-07-20:

- `axios`: `1.18.1`
- `node-cron`: `4.6.0`
- `openai`: `6.48.0`
- `@types/node`: `25.9.5`
- `@types/supertest`: `7.2.1`
- `eslint`: `10.7.0`
- `prettier`: `3.9.5`
- `tsx`: `4.23.1`
- `vitest`: `4.1.10`

Keep the existing caret version style in `package.json`. Dependencies already at their newest compatible release remain unchanged.

## Major-Version Boundaries

Do not upgrade across these major boundaries:

- TypeScript stays on `6.0.3`, not `7.x`.
- `@types/node` stays on `25.x`, not `26.x`.
- Cheerio's transitive `undici` stays on the patched `7.x` line, not `8.x`.

## Vulnerability Remediation

Regenerate the dependency resolution so compatible transitive ranges select at least:

- `form-data@4.0.6` through `axios`
- `undici@7.28.0` through `cheerio`
- `esbuild@0.28.1` through `tsx` and Vite/Vitest

Do not add npm `overrides`; the parent packages already declare compatible ranges for these patched versions.

## Failure Handling

- Dependency installation must fail without leaving a claimed successful state.
- If tests or TypeScript compilation fail, diagnose whether the failure is caused by the compatible upgrades and make only the smallest related code/configuration adjustment.
- If `npm audit` still reports a vulnerability, inspect its dependency path before adding a targeted override or changing scope.
- Preserve the production Docker build and non-root runtime behavior.

## Verification

The update is accepted when:

1. Installed direct dependencies match the newest releases within their existing major versions.
2. `form-data`, `undici`, and `esbuild` resolve to patched versions.
3. `npm audit --audit-level=low` reports zero vulnerabilities.
4. `npm test` passes all existing tests.
5. `npm run build` succeeds.
6. The production Docker image builds successfully.
7. The production container runs as a non-root user and `/health` responds successfully.

The project has no Git metadata, so the dependency changes and this design document cannot be committed in the current workspace.
