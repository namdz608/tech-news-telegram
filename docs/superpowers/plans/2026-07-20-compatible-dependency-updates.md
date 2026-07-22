# Compatible Dependency Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade every outdated direct dependency within its current major version and resolve all vulnerabilities reported by npm audit.

**Architecture:** npm updates `package.json` and regenerates `package-lock.json` using compatible semver ranges. Existing tests, TypeScript compilation, and the production Docker image provide regression coverage without adding application code or dependency overrides.

**Tech Stack:** npm, Node.js 22, TypeScript, Vitest, Docker

---

## File Structure

- Modify `package.json`: raise direct dependency ranges to the approved compatible releases.
- Modify `package-lock.json`: resolve direct and transitive packages, including the three security fixes.
- Verify existing `src/`, `tests/`, and `Dockerfile`; no changes are expected unless a verified compatibility failure requires a targeted adjustment.

### Task 1: Capture the failing security baseline

**Files:**
- Inspect: `package.json`
- Inspect: `package-lock.json`

- [ ] **Step 1: Run the audit that currently fails**

Run:

```bash
npm audit --audit-level=low
```

Expected: exit status `1`, reporting three vulnerable packages: `form-data@4.0.5`, `undici@7.27.2`, and `esbuild@0.28.0`.

- [ ] **Step 2: Confirm the vulnerable dependency paths**

Run:

```bash
npm ls form-data undici esbuild --all
```

Expected dependency paths:

```text
axios -> form-data@4.0.5
cheerio -> undici@7.27.2
tsx/vite -> esbuild@0.28.0
```

- [ ] **Step 3: Confirm there is no Git workspace for commits**

Run:

```bash
git rev-parse --is-inside-work-tree
```

Expected: failure with `not a git repository`; do not claim commits during this plan.

### Task 2: Update compatible direct and transitive dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Update production dependencies within their current majors**

Run:

```bash
npm install "axios@^1.18.1" "node-cron@^4.6.0" "openai@^6.48.0"
```

Expected: npm updates `package.json`, `package-lock.json`, and installed production packages without a major-version change.

- [ ] **Step 2: Update development dependencies within their current majors**

Run:

```bash
npm install --save-dev \
  "@types/node@^25.9.5" \
  "@types/supertest@^7.2.1" \
  "eslint@^10.7.0" \
  "prettier@^3.9.5" \
  "tsx@^4.23.1" \
  "vitest@^4.1.10"
```

Expected: npm updates the declared dev dependency ranges while keeping TypeScript on `6.0.3`.

- [ ] **Step 3: Refresh compatible transitive resolutions**

Run:

```bash
npm update
```

Expected: the lockfile selects patched transitive versions allowed by parent dependency ranges.

- [ ] **Step 4: Verify exact direct dependency ranges**

Run:

```bash
node - <<'NODE'
const pkg = require('./package.json');
const expected = {
  dependencies: {
    axios: '^1.18.1',
    'node-cron': '^4.6.0',
    openai: '^6.48.0',
  },
  devDependencies: {
    '@types/node': '^25.9.5',
    '@types/supertest': '^7.2.1',
    eslint: '^10.7.0',
    prettier: '^3.9.5',
    tsx: '^4.23.1',
    vitest: '^4.1.10',
    typescript: '^6.0.3',
  },
};
for (const [section, values] of Object.entries(expected)) {
  for (const [name, version] of Object.entries(values)) {
    if (pkg[section]?.[name] !== version) {
      throw new Error(`${section}.${name}: expected ${version}, got ${pkg[section]?.[name]}`);
    }
  }
}
console.log('direct dependency ranges: OK');
NODE
```

Expected: `direct dependency ranges: OK`.

- [ ] **Step 5: Verify patched installed versions**

Run:

```bash
npm ls \
  axios@1.18.1 node-cron@4.6.0 openai@6.48.0 \
  form-data@4.0.6 undici@7.28.0 esbuild@0.28.1 \
  --all
```

Expected: exit status `0`; every named version is present and npm reports no invalid dependency tree.

- [ ] **Step 6: Verify the audit is clean**

Run:

```bash
npm audit --audit-level=low
```

Expected: exit status `0` with `found 0 vulnerabilities`.

### Task 3: Run application regression checks

**Files:**
- Verify: `src/**/*.ts`
- Verify: `tests/**/*.test.ts`
- Verify: `tsconfig.json`

- [ ] **Step 1: Run the complete test suite**

Run:

```bash
npm test
```

Expected: 21 test files and 84 tests pass with zero failures.

- [ ] **Step 2: Compile the application**

Run:

```bash
npm run build
```

Expected: TypeScript exits successfully and writes `dist/`.

- [ ] **Step 3: Confirm compatible updates are exhausted**

Run:

```bash
npm outdated --json > /tmp/tech-news-telegram-outdated.json || true
node - <<'NODE'
const fs = require('fs');
const report = JSON.parse(fs.readFileSync('/tmp/tech-news-telegram-outdated.json', 'utf8') || '{}');
const incompatibleOnly = Object.entries(report).filter(([, item]) => item.current !== item.wanted);
if (incompatibleOnly.length > 0) {
  throw new Error(`compatible updates remain: ${incompatibleOnly.map(([name]) => name).join(', ')}`);
}
console.log('compatible direct dependencies: current');
NODE
```

Expected: `compatible direct dependencies: current`; entries may remain only where npm's latest release requires a new major version.

### Task 4: Verify the production container

**Files:**
- Verify: `Dockerfile`
- Verify: `.dockerignore`
- Verify: `package-lock.json`

- [ ] **Step 1: Build the image using the updated lockfile**

Run:

```bash
docker build --no-cache -t tech-news-telegram:local .
```

Expected: npm installs from the updated lockfile, TypeScript compiles, and Docker tags `tech-news-telegram:local`.

- [ ] **Step 2: Confirm the production dependency audit**

Run:

```bash
docker run --rm tech-news-telegram:local npm audit --omit=dev --audit-level=low
```

Expected: `found 0 vulnerabilities`.

- [ ] **Step 3: Confirm non-root runtime and minimal image contents**

Run:

```bash
docker run --rm tech-news-telegram:local id -u
docker run --rm tech-news-telegram:local sh -c \
  'test -d /app/dist && test -d /app/node_modules && test ! -e /app/src && test ! -e /app/.env && echo "runtime image contents: OK"'
```

Expected: UID `1000` and `runtime image contents: OK`.

- [ ] **Step 4: Start a temporary container and test `/health`**

Run:

```bash
docker run -d --rm --name tech-news-telegram-dependency-check -p 13000:3000 tech-news-telegram:local
node -e "fetch('http://127.0.0.1:13000/health').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); console.log('container health: OK'); }).catch(e => { console.error(e); process.exit(1); })"
docker stop tech-news-telegram-dependency-check
```

Expected: `container health: OK`; the temporary container stops cleanly.

### Task 5: Final dependency verification

**Files:**
- Verify: `package.json`
- Verify: `package-lock.json`

- [ ] **Step 1: Re-run audit, tests, and build together**

Run:

```bash
npm audit --audit-level=low
npm test
npm run build
```

Expected: zero vulnerabilities, 84 tests pass, and TypeScript compilation succeeds.

- [ ] **Step 2: Re-run the installed-version check**

Run the `npm ls` command from Task 2 Step 5.

Expected: exit status `0` with the approved direct and patched transitive versions.

- [ ] **Step 3: Report files without claiming a commit**

Run:

```bash
git status --short
```

Expected: failure with `not a git repository`; report `package.json`, `package-lock.json`, the design spec, and this plan directly.
