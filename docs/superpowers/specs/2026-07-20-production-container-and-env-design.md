# Production Container and Environment Files Design

## Goal

Prepare the project for safe source control and production container deployment without committing local secrets.

## Scope

This change adds or updates four root-level files:

- `.gitignore`
- `.env.example`
- `.dockerignore`
- `Dockerfile`

Application source code and runtime behavior remain unchanged.

## `.gitignore`

Use a standard Node.js ignore policy covering:

- Local environment files: `.env` and `.env.*`
- Explicit exception: `.env.example` remains trackable
- Installed dependencies: `node_modules/`
- Generated output: `dist/`, `coverage/`
- Logs, caches, temporary files, OS metadata, and local IDE metadata

The existing `.codegraph/.gitignore` remains responsible for CodeGraph's generated database and transient files.

## `.env.example`

The example file must have exactly the same variable names and ordering as the current `.env` file. Variables that exist only in the old example file are removed so the two files have matching schemas.

Secret values are never copied from `.env`. Telegram tokens, chat identifiers, OpenAI keys, and GitHub tokens use clearly non-secret placeholders or empty values. Non-secret operational defaults may mirror the current local configuration where doing so helps the example remain runnable and understandable.

Comments may explain valid options, but they must not alter the exact ordered list of environment variable keys.

## Production `Dockerfile`

Use a multi-stage Node.js Alpine build:

1. Install all locked dependencies with `npm ci`.
2. Copy TypeScript source and build it with `npm run build`.
3. Remove development-only dependencies after the build.
4. Copy `dist`, production dependencies, and package metadata into a clean runtime stage.
5. Set `NODE_ENV=production`, expose port `3000`, run as the built-in non-root `node` user, and start with `node dist/server.js`.

The container receives secrets only at runtime through environment variables or an env file supplied by the operator. The image does not copy `.env`.

## `.dockerignore`

Exclude files that are unnecessary or unsafe in the Docker build context:

- `.env` and other local environment variants while retaining `.env.example`
- `node_modules/` and `dist/`
- Tests, coverage, logs, caches, documentation, editor metadata, CodeGraph data, and local Git metadata

Required build inputs remain available: package manifests, TypeScript configuration, and `src/`.

## Failure Handling and Security

- Docker build fails immediately if dependency installation or TypeScript compilation fails.
- Missing required runtime credentials are handled by the application's existing environment validation and service behavior.
- No real secret may appear in `.env.example`, `Dockerfile`, `.dockerignore`, `.gitignore`, or the design documentation.
- The runtime process does not run as root.

## Verification

The completed change is accepted when:

1. `.env` and `.env.example` contain identical ordered key lists.
2. `.env.example` contains no values copied from secret fields in `.env`.
3. `.gitignore` ignores `.env`, dependencies, and generated output while allowing `.env.example`.
4. `npm test` passes.
5. `npm run build` passes.
6. The production Docker image builds successfully.
7. A container started with runtime environment variables responds successfully on `/health`.
