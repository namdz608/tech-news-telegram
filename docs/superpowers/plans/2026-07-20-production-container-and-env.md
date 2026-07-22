# Production Container and Environment Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe source-control exclusions, synchronize `.env.example` with `.env`, and provide a minimal production Docker image.

**Architecture:** Root-level policy files define what Git and Docker may include. A two-stage Node.js Alpine image compiles TypeScript with development dependencies, prunes them, and copies only production runtime files into a non-root final image.

**Tech Stack:** Node.js 22 Alpine, npm, TypeScript, Docker, POSIX shell

---

## File Structure

- Create `.gitignore`: source-control exclusions for secrets, dependencies, build output, caches, logs, and local editor files.
- Modify `.env.example`: safe template with exactly the same ordered keys as `.env`.
- Create `.dockerignore`: exclusions that keep secrets and local/generated artifacts out of the Docker build context.
- Create `Dockerfile`: multi-stage production build and non-root runtime.
- Verify existing `src/server.ts` behavior through the compiled `dist/server.js` entrypoint and `/health` endpoint; no application source changes are required.

### Task 1: Add the Git ignore policy

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Run the precondition check**

Run:

```bash
test -f .gitignore
```

Expected: exit status `1`, because the file does not exist yet.

- [ ] **Step 2: Create `.gitignore`**

Create the file with this exact content:

```gitignore
# Environment and secrets
.env
.env.*
!.env.example

# Dependencies and generated output
node_modules/
dist/
coverage/

# Logs and caches
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
.cache/
.tmp/

# Editor and operating-system files
.vscode/
.idea/
.cursor/
.DS_Store
Thumbs.db
```

- [ ] **Step 3: Verify required patterns and exception ordering**

Run:

```bash
node - <<'NODE'
const fs = require('fs');
const lines = fs.readFileSync('.gitignore', 'utf8').split(/\r?\n/);
for (const pattern of ['.env', '.env.*', '!.env.example', 'node_modules/', 'dist/', 'coverage/']) {
  if (!lines.includes(pattern)) throw new Error(`missing ${pattern}`);
}
if (lines.indexOf('!.env.example') < lines.indexOf('.env.*')) {
  throw new Error('.env.example exception must follow .env.*');
}
console.log('gitignore policy: OK');
NODE
```

Expected: `gitignore policy: OK`.

- [ ] **Step 4: Record the Git limitation**

Run:

```bash
git rev-parse --is-inside-work-tree
```

Expected: failure with `not a git repository`; no commit is possible until Git metadata is initialized or restored.

### Task 2: Synchronize the safe environment template

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Run the ordered-key comparison and verify it fails**

Run:

```bash
diff -u \
  <(sed -n 's/^\([A-Z][A-Z0-9_]*\)=.*/\1/p' .env) \
  <(sed -n 's/^\([A-Z][A-Z0-9_]*\)=.*/\1/p' .env.example)
```

Expected: non-zero exit status showing that the old example contains keys that are absent from `.env`.

- [ ] **Step 2: Replace `.env.example` with the approved ordered schema**

Use this exact content:

```dotenv
NODE_ENV=development
PORT=3000

TELEGRAM_BOT_TOKEN=replace_me
TELEGRAM_CHAT_ID=replace_me

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
TRANSLATION_TARGET_LANGUAGE=vi

NEWS_CRON=0 */6 * * *
MAX_ARTICLES_PER_DIGEST=20
REQUEST_TIMEOUT_MS=12000
USER_AGENT=TechNewsTelegramBot/1.0

# Supported providers: openai, codex, google, none
TRANSLATION_PROVIDER=google
CODEX_TRANSLATION_TIMEOUT_MS=60000
CODEX_TRANSLATION_CHUNK_CHARS=1800
CODEX_TRANSLATION_CONCURRENCY=2
MAX_ARTICLES_PER_TOPIC=2
GITHUB_TOKEN=
```

- [ ] **Step 3: Verify exact key names and ordering**

Run the comparison from Step 1 again.

Expected: exit status `0` with no output.

- [ ] **Step 4: Verify secret fields were not copied**

Run:

```bash
node - <<'NODE'
const fs = require('fs');
function parse(path) {
  return Object.fromEntries(fs.readFileSync(path, 'utf8').split(/\r?\n/)
    .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
    .map((line) => {
      const at = line.indexOf('=');
      return [line.slice(0, at), line.slice(at + 1)];
    }));
}
const actual = parse('.env');
const example = parse('.env.example');
for (const key of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'OPENAI_API_KEY', 'GITHUB_TOKEN']) {
  if (actual[key] && example[key] === actual[key]) throw new Error(`${key} copied from .env`);
}
console.log('env example schema and secrets: OK');
NODE
```

Expected: `env example schema and secrets: OK`; the command never prints secret values.

### Task 3: Protect the Docker build context

**Files:**
- Create: `.dockerignore`

- [ ] **Step 1: Run the precondition check**

Run:

```bash
test -f .dockerignore
```

Expected: exit status `1`, because the file does not exist yet.

- [ ] **Step 2: Create `.dockerignore`**

Create the file with this exact content:

```dockerignore
# Secrets and local environment files
.env
.env.*
!.env.example

# Installed and generated files
node_modules/
dist/
coverage/
*.log
.cache/
.tmp/

# Development-only content
tests/
docs/
.git/
.codegraph/
.cursor/
.vscode/
.idea/
.DS_Store
Thumbs.db
```

- [ ] **Step 3: Verify secret and artifact exclusions**

Run:

```bash
node - <<'NODE'
const fs = require('fs');
const lines = fs.readFileSync('.dockerignore', 'utf8').split(/\r?\n/);
for (const pattern of ['.env', '.env.*', '!.env.example', 'node_modules/', 'dist/', 'tests/', 'docs/']) {
  if (!lines.includes(pattern)) throw new Error(`missing ${pattern}`);
}
if (lines.includes('src/') || lines.includes('package-lock.json') || lines.includes('tsconfig.json')) {
  throw new Error('required build input is excluded');
}
console.log('dockerignore policy: OK');
NODE
```

Expected: `dockerignore policy: OK`.

### Task 4: Add the production multi-stage image

**Files:**
- Create: `Dockerfile`

- [ ] **Step 1: Run the precondition check**

Run:

```bash
test -f Dockerfile
```

Expected: exit status `1`, because the file does not exist yet.

- [ ] **Step 2: Create `Dockerfile`**

Create the file with this exact content:

```dockerfile
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

USER node
EXPOSE 3000

CMD ["node", "dist/server.js"]
```

- [ ] **Step 3: Verify the local TypeScript build before Docker**

Run:

```bash
npm run build
```

Expected: `tsc` exits successfully.

- [ ] **Step 4: Build the production image**

Run:

```bash
docker build -t tech-news-telegram:local .
```

Expected: exit status `0` and a successfully tagged `tech-news-telegram:local` image.

- [ ] **Step 5: Verify the runtime user and health endpoint**

Run:

```bash
docker run --rm tech-news-telegram:local id -u
docker run -d --rm --name tech-news-telegram-check -p 13000:3000 tech-news-telegram:local
node -e "fetch('http://127.0.0.1:13000/health').then(async r => { if (!r.ok) throw new Error(await r.text()); console.log('container health: OK'); }).catch(e => { console.error(e); process.exit(1); })"
docker stop tech-news-telegram-check
```

Expected: the UID is not `0`, then `container health: OK`, and the temporary container stops cleanly.

### Task 5: Run the complete regression verification

**Files:**
- Verify: `.gitignore`
- Verify: `.env.example`
- Verify: `.dockerignore`
- Verify: `Dockerfile`

- [ ] **Step 1: Run the test suite**

Run:

```bash
npm test
```

Expected: all Vitest files and tests pass.

- [ ] **Step 2: Run a clean build**

Run:

```bash
npm run build
```

Expected: `tsc` exits successfully.

- [ ] **Step 3: Re-run the safe environment checks**

Run the ordered-key comparison and secret-field script from Task 2.

Expected: no key diff and `env example schema and secrets: OK`.

- [ ] **Step 4: Inspect the final image contents**

Run:

```bash
docker run --rm tech-news-telegram:local sh -c 'test -d /app/dist && test -d /app/node_modules && test ! -e /app/src && test ! -e /app/.env && echo "runtime image contents: OK"'
```

Expected: `runtime image contents: OK`.

- [ ] **Step 5: Record the final Git limitation**

Run:

```bash
git status --short
```

Expected: failure with `not a git repository`; report the four changed root files and the two documentation files directly instead of claiming a commit.
