# Remove Cron Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove automatic cron scheduling and every active cron-specific dependency, configuration entry, source file, and generated artifact while retaining manual Telegram digest delivery.

**Architecture:** The Express server becomes the only startup responsibility in `src/server.ts`. Manual digest delivery continues through the existing `/telegram/send-digest` controller path; npm and environment schemas no longer include cron-specific state.

**Tech Stack:** Node.js 22, TypeScript, Express, npm, Vitest, Docker

---

## File Structure

- Modify `src/server.ts`: start only the Express server.
- Delete `src/services/scheduler.service.ts`: remove the cron orchestration unit.
- Modify `src/config/env.ts`: remove `NEWS_CRON` from runtime configuration.
- Modify `.env` and `.env.example`: remove the obsolete cron variable while preserving identical ordered keys and safe example secrets.
- Modify `README.md`: remove the obsolete environment example line.
- Modify `package.json` and `package-lock.json`: uninstall `node-cron` and `@types/node-cron`.
- Delete `dist/services/scheduler.service.js`: remove the stale ignored generated artifact; rebuild remaining JavaScript.

### Task 1: Capture the failing removal baseline

**Files:**
- Inspect: `src/server.ts`
- Inspect: `src/services/scheduler.service.ts`
- Inspect: `src/config/env.ts`
- Inspect: `.env`
- Inspect: `.env.example`
- Inspect: `README.md`
- Inspect: `package.json`
- Inspect: `package-lock.json`
- Inspect: `dist/services/scheduler.service.js`

- [ ] **Step 1: Run the forbidden-reference check**

Run:

```bash
rg -n "NEWS_CRON|node-cron|SchedulerService|scheduler\.start" \
  .env .env.example README.md src package.json package-lock.json dist \
  --glob '!dist/**/*.map'
```

Expected: exit status `0` with matches in the environment files, README, source, dependency manifests, and compiled JavaScript.

- [ ] **Step 2: Confirm both cron packages are installed**

Run:

```bash
npm ls node-cron @types/node-cron --all
```

Expected: `node-cron@4.6.0` and `@types/node-cron@3.0.11` appear in the dependency tree.

- [ ] **Step 3: Confirm the functional baseline**

Run:

```bash
npm test
npm run build
```

Expected: 21 test files and 84 tests pass; TypeScript compilation succeeds.

### Task 2: Remove scheduler startup and implementation

**Files:**
- Modify: `src/server.ts`
- Delete: `src/services/scheduler.service.ts`
- Delete: `dist/services/scheduler.service.js`

- [ ] **Step 1: Replace `src/server.ts` with HTTP-only startup**

Use this exact source:

```typescript
import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`Tech news service listening on port ${env.PORT}`);
});
```

- [ ] **Step 2: Delete the scheduler source file**

Delete:

```text
src/services/scheduler.service.ts
```

- [ ] **Step 3: Delete the stale compiled scheduler artifact**

Delete:

```text
dist/services/scheduler.service.js
```

- [ ] **Step 4: Verify scheduler code is gone from source startup**

Run:

```bash
test ! -e src/services/scheduler.service.ts
test ! -e dist/services/scheduler.service.js
if rg -n "SchedulerService|scheduler\.start" src; then
  exit 1
fi
echo 'scheduler source references: absent'
```

Expected: `scheduler source references: absent`.

### Task 3: Remove cron environment configuration and documentation

**Files:**
- Modify: `src/config/env.ts`
- Modify: `.env`
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Remove `NEWS_CRON` from the runtime schema**

Delete this line from `src/config/env.ts`:

```typescript
NEWS_CRON: z.string().default('0 */6 * * *'),
```

- [ ] **Step 2: Remove `NEWS_CRON` from both environment files**

Delete this exact line from `.env` and `.env.example`:

```dotenv
NEWS_CRON=0 */6 * * *
```

- [ ] **Step 3: Remove the README environment example**

Delete this exact line from `README.md`:

```dotenv
NEWS_CRON=0 */6 * * *
```

- [ ] **Step 4: Verify environment schemas remain synchronized and safe**

Run:

```bash
node - <<'NODE'
const fs = require('fs');
const lines = (path) => fs.readFileSync(path, 'utf8').split(/\r?\n/);
const keys = (path) => lines(path)
  .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
  .map((line) => line.slice(0, line.indexOf('=')));
const parse = (path) => Object.fromEntries(lines(path)
  .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
  .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
const actualKeys = keys('.env');
const exampleKeys = keys('.env.example');
if (JSON.stringify(actualKeys) !== JSON.stringify(exampleKeys)) throw new Error('ordered env keys differ');
if (actualKeys.includes('NEWS_CRON')) throw new Error('NEWS_CRON remains');
const actual = parse('.env');
const example = parse('.env.example');
for (const key of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'OPENAI_API_KEY', 'GITHUB_TOKEN']) {
  if (actual[key] && example[key] === actual[key]) throw new Error(`${key} copied from .env`);
}
console.log(`environment schema: OK (${actualKeys.length} keys)`);
NODE
```

Expected: `environment schema: OK (16 keys)`.

### Task 4: Remove cron dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Uninstall the production package**

Run:

```bash
npm uninstall node-cron
```

Expected: `node-cron` is removed from dependencies and the lockfile.

- [ ] **Step 2: Uninstall the type package**

Run:

```bash
npm uninstall --save-dev @types/node-cron
```

Expected: `@types/node-cron` is removed from dev dependencies and the lockfile.

- [ ] **Step 3: Verify both packages are absent**

Run:

```bash
npm ls node-cron @types/node-cron --all --json > /tmp/tech-news-telegram-no-cron.json || true
node - <<'NODE'
const fs = require('fs');
const pkg = require('./package.json');
const lockText = fs.readFileSync('package-lock.json', 'utf8');
const tree = JSON.parse(fs.readFileSync('/tmp/tech-news-telegram-no-cron.json', 'utf8'));
for (const name of ['node-cron', '@types/node-cron']) {
  if (pkg.dependencies?.[name] || pkg.devDependencies?.[name]) throw new Error(`${name} remains in package.json`);
  if (tree.dependencies?.[name]) throw new Error(`${name} remains installed`);
}
if (lockText.includes('node-cron')) throw new Error('cron package remains in lockfile');
console.log('cron dependencies: absent');
NODE
```

Expected: `cron dependencies: absent`.

- [ ] **Step 4: Verify the dependency audit**

Run:

```bash
npm audit --audit-level=low
```

Expected: `found 0 vulnerabilities`.

### Task 5: Run source and application verification

**Files:**
- Verify: `src/**/*.ts`
- Verify: `tests/**/*.test.ts`
- Verify: `dist/**/*.js`
- Verify: `src/routes/telegram.routes.ts`

- [ ] **Step 1: Run tests and rebuild generated JavaScript**

Run:

```bash
npm test
npm run build
```

Expected: 21 test files and 84 tests pass; TypeScript compilation succeeds.

- [ ] **Step 2: Verify active files contain no cron references**

Run:

```bash
if rg -n "NEWS_CRON|node-cron|SchedulerService|scheduler\.start" \
  .env .env.example README.md src package.json package-lock.json dist \
  --glob '!dist/**/*.map'; then
  exit 1
fi
echo 'active cron references: absent'
```

Expected: `active cron references: absent`.

- [ ] **Step 3: Verify the manual Telegram route remains registered**

Run:

```bash
rg -n -F "telegramRoutes.post('/telegram/send-digest', sendDigest);" src/routes/telegram.routes.ts
```

Expected: one match in `src/routes/telegram.routes.ts`.

### Task 6: Verify the production container

**Files:**
- Verify: `Dockerfile`
- Verify: `.dockerignore`
- Verify: `package-lock.json`

- [ ] **Step 1: Build the production image without cache**

Run:

```bash
docker build --no-cache -t tech-news-telegram:local .
```

Expected: dependency installation and TypeScript compilation succeed with zero npm vulnerabilities.

- [ ] **Step 2: Confirm runtime dependency and artifact state**

Run:

```bash
docker run --rm tech-news-telegram:local npm audit --omit=dev --audit-level=low
docker run --rm tech-news-telegram:local sh -c \
  'test "$(id -u)" = "1000" && test ! -e /app/dist/services/scheduler.service.js && test ! -e /app/.env && echo "cron-free runtime image: OK"'
```

Expected: `found 0 vulnerabilities` and `cron-free runtime image: OK`.

- [ ] **Step 3: Start a temporary container and verify health**

Run:

```bash
docker run -d --rm --name tech-news-telegram-no-cron-check -p 13000:3000 tech-news-telegram:local
node -e "fetch('http://127.0.0.1:13000/health').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); console.log('container health: OK'); }).catch(e => { console.error(e); process.exit(1); })"
docker stop tech-news-telegram-no-cron-check
```

Expected: `container health: OK`; the temporary container stops cleanly.

### Task 7: Final verification and handoff

**Files:**
- Verify: all files listed above

- [ ] **Step 1: Re-run the full local gate**

Run:

```bash
npm audit --audit-level=low
npm test
npm run build
```

Expected: zero vulnerabilities, 84 tests pass, and TypeScript compilation succeeds.

- [ ] **Step 2: Re-run the cron absence checks**

Run:

```bash
if rg -n "NEWS_CRON|node-cron|SchedulerService|scheduler\.start" \
  .env .env.example README.md src package.json package-lock.json dist \
  --glob '!dist/**/*.map'; then
  exit 1
fi
npm ls node-cron @types/node-cron --all --json > /tmp/tech-news-telegram-no-cron.json || true
node - <<'NODE'
const fs = require('fs');
const pkg = require('./package.json');
const lockText = fs.readFileSync('package-lock.json', 'utf8');
const tree = JSON.parse(fs.readFileSync('/tmp/tech-news-telegram-no-cron.json', 'utf8'));
for (const name of ['node-cron', '@types/node-cron']) {
  if (pkg.dependencies?.[name] || pkg.devDependencies?.[name]) throw new Error(`${name} remains in package.json`);
  if (tree.dependencies?.[name]) throw new Error(`${name} remains installed`);
}
if (lockText.includes('node-cron')) throw new Error('cron package remains in lockfile');
console.log('cron removal verification: OK');
NODE
```

Expected: `cron removal verification: OK`.

- [ ] **Step 3: Record the Git limitation**

Run:

```bash
git status --short
```

Expected: failure with `not a git repository`; report the changed and deleted files directly instead of claiming a commit.
