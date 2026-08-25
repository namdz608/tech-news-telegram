# Politics Codex Editorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gold/politics items are edited into Vietnamese by Codex while tech/gadget/health keep global Google editorial, so politics no longer depends on unofficial Google Translate on the happy path.

**Architecture:** Add `GOLD_POLITICS_EDITORIAL_PROVIDER` (default `codex`) independent of `EDITORIAL_PROVIDER`. The gold-politics factory wires `ArticleEditorialService(CodexArticleEditorialGenerator)` and `nativeVietnameseEditor: true`. Successful Codex JSON with Vietnamese letters skips `translateDigestVerified`; failures keep the existing gtx then `createTranslationFallbackEditorial` path. Runtime image becomes `node:22-bookworm-slim` with `@openai/codex` on `PATH`.

**Tech Stack:** TypeScript, Vitest, Codex CLI (`@openai/codex`), Helm GitOps chart

## Global Constraints

- Do not change tech, gadget, or health editorial/translation behavior.
- Do not call official Google Cloud Translation API.
- Do not resend items already in `gold-politics-sent-history.json`.
- Do not run parallel Codex processes.
- Do not trust a Codex/OpenAI JSON `languageVerified` flag.
- Do not run `source-facts` validation on native Vietnamese Codex output (that compares Vietnamese to the English corpus).
- `EDITORIAL_PROVIDER` remains `google` in `.env.example`, README, and Helm.
- `GOLD_POLITICS_EDITORIAL_PROVIDER` default is `codex`; enum is `openai | codex | google | none`.
- Native Vietnamese means title or summary contains at least one character matching `/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/iu` after NFC.
- Helm `stringData` key count moves from 54 to 56 (`GOLD_POLITICS_EDITORIAL_PROVIDER` + `CODEX_API_KEY`).
- Dockerfile keeps writable `/app/data` owned by `node`.
- New app git branch is already `feat/politics-codex-editorial` from `origin/main`. Helm chart is a separate repo at `/root/helm`; create its branch from that repo's `origin/main`.

## File structure

- `src/config/env.ts` — parse `GOLD_POLITICS_EDITORIAL_PROVIDER`
- `src/services/politics-editorial.service.ts` — options, Vietnamese heuristic, skip gtx
- `src/services/gold-politics-flow.service.ts` — wire Codex/OpenAI/Google from politics env
- `Dockerfile` — bookworm-slim + Codex CLI
- `.env.example`, `README.md`, `tests/config/*` — contract
- `/root/helm/tech-news-telegram/values.yaml` and `tests/render-test.sh` — GitOps env

---

### Task 1: Politics editorial env and docs

**Files:**
- Modify: `src/config/env.ts`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `tests/config/env.test.ts`
- Modify: `tests/config/gold-politics-runtime.test.ts`

**Interfaces:**
- Consumes: existing `EDITORIAL_PROVIDER` enum `'openai' | 'codex' | 'google' | 'none'`
- Produces: `env.GOLD_POLITICS_EDITORIAL_PROVIDER` with the same enum, default `'codex'`

- [ ] **Step 1: Write the failing env and contract tests**

In `tests/config/env.test.ts`, add:

```ts
  it('defaults gold-politics editorial to codex independently of the global provider', () => {
    expect(
      readEnvValues(['EDITORIAL_PROVIDER', 'GOLD_POLITICS_EDITORIAL_PROVIDER']),
    ).toEqual({
      EDITORIAL_PROVIDER: 'google',
      GOLD_POLITICS_EDITORIAL_PROVIDER: 'codex',
    });
  });

  it.each(['openai', 'codex', 'google', 'none'] as const)(
    'accepts gold-politics editorial provider %s',
    (value) => {
      const result = runEnv(
        { GOLD_POLITICS_EDITORIAL_PROVIDER: value },
        ['GOLD_POLITICS_EDITORIAL_PROVIDER'],
      );
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        GOLD_POLITICS_EDITORIAL_PROVIDER: value,
      });
    },
  );
```

In `tests/config/gold-politics-runtime.test.ts`, add this exact line to `GOLD_POLITICS_ENV_LINES` after `GOLD_POLITICS_WEB_SEARCH_MAX_QUERIES=8`:

```ts
  'GOLD_POLITICS_EDITORIAL_PROVIDER=codex',
```

Rename the “twelve gold-politics env variables” test to say thirteen. In the README gold-politics section test, add:

```ts
    expect(goldSection).toMatch(/GOLD_POLITICS_EDITORIAL_PROVIDER/u);
    expect(goldSection).toMatch(/Codex/u);
    expect(goldSection).toMatch(/EDITORIAL_PROVIDER/u);
    expect(goldSection).toMatch(/last-resort|phương án cuối|gtx/iu);
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/config/env.test.ts tests/config/gold-politics-runtime.test.ts
```

Expected: FAIL — `GOLD_POLITICS_EDITORIAL_PROVIDER` missing from env and `.env.example`.

- [ ] **Step 3: Add env, example, and README**

In `src/config/env.ts`, immediately after `GOLD_POLITICS_WEB_SEARCH_MAX_QUERIES`, add:

```ts
  GOLD_POLITICS_EDITORIAL_PROVIDER: z.enum(['openai', 'codex', 'google', 'none']).default('codex'),
```

In `.env.example`, immediately after `GOLD_POLITICS_WEB_SEARCH_MAX_QUERIES=8`, add:

```
GOLD_POLITICS_EDITORIAL_PROVIDER=codex
```

Keep `EDITORIAL_PROVIDER=google` unchanged.

In `README.md`, after the paragraph that starts `X and Brave are optional`, insert:

```
Politics editorial uses `GOLD_POLITICS_EDITORIAL_PROVIDER` (default Codex).
Global `EDITORIAL_PROVIDER` still selects tech/gadget/health editorial (google).
Unofficial Google Translate (`gtx`) is last-resort only when Codex fails.
```

- [ ] **Step 4: Re-run tests to verify they pass**

Run:

```bash
npm test -- tests/config/env.test.ts tests/config/gold-politics-runtime.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/env.ts .env.example README.md tests/config/env.test.ts tests/config/gold-politics-runtime.test.ts
git commit -m "$(cat <<'EOF'
feat: add gold-politics Codex editorial env

Keep politics editorial selectable without changing the global Google provider.
EOF
)"
```

---

### Task 2: Native Vietnamese Codex editorial path

**Files:**
- Modify: `src/services/politics-editorial.service.ts`
- Modify: `tests/services/politics-editorial.service.test.ts`

**Interfaces:**
- Consumes: `PoliticsEditorialServiceOptions.skipModelEditor?: boolean`
- Produces:
  - `export function hasVietnameseEditorialText(editorial: { title: string; summary: string }): boolean`
  - `export function politicsEditorialServiceOptions(provider: string): PoliticsEditorialServiceOptions`
  - `PoliticsEditorialServiceOptions.nativeVietnameseEditor?: boolean`
  - Constructor default skip uses `env.GOLD_POLITICS_EDITORIAL_PROVIDER`, not `EDITORIAL_PROVIDER`

- [ ] **Step 1: Write the failing tests**

Append to `tests/services/politics-editorial.service.test.ts` (reuse existing `candidate` / `assertion` helpers):

```ts
  it('maps politics providers to skip vs native Vietnamese options', () => {
    expect(politicsEditorialServiceOptions('codex')).toEqual({
      skipModelEditor: false,
      nativeVietnameseEditor: true,
    });
    expect(politicsEditorialServiceOptions('openai')).toEqual({
      skipModelEditor: false,
      nativeVietnameseEditor: true,
    });
    expect(politicsEditorialServiceOptions('google')).toEqual({
      skipModelEditor: true,
      nativeVietnameseEditor: false,
    });
    expect(politicsEditorialServiceOptions('none')).toEqual({
      skipModelEditor: true,
      nativeVietnameseEditor: false,
    });
  });

  it('treats Codex Vietnamese JSON as native and does not call Google Translate', async () => {
    const input = candidate({
      sourceName: 'The Guardian Politics',
      title: "PM Mark Carney says ‘we got attacked’ as tariffs come into force on items from hockey sticks to tongue depressors",
      summary:
        "The lesson from Canada’s collapsed trade talks with the US: negotiation may be futile Donald Trump has hit back at Canada after a breakdown in negotiations plunged the two countries into a trade war.",
      originalAccount: 'Lauren Almeida',
      originAttribution: {
        url: 'https://www.theguardian.com/world/lauren-almeida-canada-tariffs',
        account: 'Lauren Almeida',
        publishedAt: '2026-08-25T00:00:00.000Z',
        discoveredAt: '2026-08-25T02:00:00.000Z',
      },
      claimModality: 'reported',
      evidentiaryEffect: 'mentions',
      evidenceAssertions: [assertion({
        semanticClaimKey: 'carney|tariffs',
        claimText: 'Mark Carney said Canada got attacked as US tariffs came into force',
        modality: 'reported',
        effect: 'mentions',
      })],
      semanticClaimKey: 'carney|tariffs',
      claimEntities: ['mark-carney', 'canada'],
      verificationState: 'reported',
    });
    const editorial = {
      editArticle: vi.fn().mockResolvedValue({
        title: 'Theo The Guardian, thủ tướng Mark Carney cho rằng Canada bị tấn công khi thuế quan có hiệu lực',
        summary:
          'Tài khoản Lauren Almeida cho rằng đàm phán thương mại Canada–Mỹ sụp đổ và Donald Trump đáp trả. Đây là thông tin đang được đưa tin, chưa phải kết luận cuối.',
        whyImportant:
          'Theo The Guardian, sự việc đang được đưa tin, chưa phải kết luận cuối.',
        actionLevel: 'monitor' as const,
        actionText: 'Theo dõi nguồn gốc và các tường thuật độc lập; không đưa lời khuyên.',
        languageVerified: true,
      }),
    };
    const translator = {
      translateDigestVerified: vi.fn(async (text: string) => ({ text, succeeded: true })),
    };

    const result = await new PoliticsEditorialService(
      editorial,
      translator,
      new PoliticsEditorialValidator(),
      politicsEditorialServiceOptions('codex'),
    ).edit(input);

    expect(editorial.editArticle).toHaveBeenCalledOnce();
    expect(translator.translateDigestVerified).not.toHaveBeenCalled();
    expect(result.title).toContain('Mark Carney');
    expect(result.summary).toContain('cho rằng');
    expect(result.title).not.toMatch(/chưa dịch|Chưa có bản dịch/iu);
    expect(result.summary).not.toContain('Chưa có bản dịch tiếng Việt đã xác minh');
  });

  it('falls through to translation when Codex returns English-only ASCII', async () => {
    const input = candidate({
      sourceName: 'The Guardian Politics',
      title: 'PM Mark Carney says we got attacked as tariffs come into force',
      summary: 'Donald Trump has hit back at Canada after talks collapsed.',
      originalAccount: 'Lauren Almeida',
      originAttribution: {
        url: 'https://www.theguardian.com/world/lauren-almeida-canada-tariffs',
        account: 'Lauren Almeida',
        publishedAt: '2026-08-25T00:00:00.000Z',
        discoveredAt: '2026-08-25T02:00:00.000Z',
      },
      claimModality: 'reported',
      evidentiaryEffect: 'mentions',
      evidenceAssertions: [assertion({
        semanticClaimKey: 'carney|tariffs',
        claimText: 'Mark Carney said Canada got attacked',
        modality: 'reported',
        effect: 'mentions',
      })],
      semanticClaimKey: 'carney|tariffs',
      claimEntities: ['mark-carney'],
      verificationState: 'reported',
    });
    const editorial = {
      editArticle: vi.fn().mockResolvedValue({
        title: 'PM Mark Carney says we got attacked as tariffs come into force',
        summary: 'Donald Trump has hit back at Canada after talks collapsed.',
        whyImportant: 'The story is being reported.',
        actionLevel: 'monitor' as const,
        actionText: 'Follow independent sources.',
      }),
    };
    const translator = {
      translateDigestVerified: vi.fn(async (text: string) => ({
        text: 'Thủ tướng Mark Carney cho rằng Canada bị tấn công khi thuế quan có hiệu lực',
        succeeded: true,
      })),
    };

    const result = await new PoliticsEditorialService(
      editorial,
      translator,
      new PoliticsEditorialValidator(),
      politicsEditorialServiceOptions('codex'),
    ).edit(input);

    expect(translator.translateDigestVerified).toHaveBeenCalled();
    expect(result.summary).not.toContain('Chưa có bản dịch tiếng Việt đã xác minh');
  });
```

Import `politicsEditorialServiceOptions` from `../../src/services/politics-editorial.service`.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/services/politics-editorial.service.test.ts
```

Expected: FAIL — `politicsEditorialServiceOptions` is not exported.

- [ ] **Step 3: Implement options, heuristic, and native path**

In `src/services/politics-editorial.service.ts`:

```ts
const VIETNAMESE_CHAR =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/iu;

export function hasVietnameseEditorialText(editorial: {
  title: string;
  summary: string;
}): boolean {
  return VIETNAMESE_CHAR.test(`${editorial.title}\n${editorial.summary}`.normalize('NFC'));
}

export function politicsEditorialServiceOptions(
  provider: string,
): PoliticsEditorialServiceOptions {
  const nativeVietnameseEditor = provider === 'codex' || provider === 'openai';
  return {
    skipModelEditor: !nativeVietnameseEditor,
    nativeVietnameseEditor,
  };
}
```

Extend the options interface:

```ts
export interface PoliticsEditorialServiceOptions {
  skipModelEditor?: boolean;
  nativeVietnameseEditor?: boolean;
}
```

In the constructor, store `nativeVietnameseEditor` and stop reading global `EDITORIAL_PROVIDER`:

```ts
  private readonly skipModelEditor: boolean;
  private readonly nativeVietnameseEditor: boolean;

  constructor(
    private readonly editorial: PoliticsArticleEditor = new ArticleEditorialService(),
    private readonly translator: VerifiedPoliticsTranslator = new GoogleTranslationService(),
    private readonly validator: PoliticsEditorialValidatorLike = new PoliticsEditorialValidator(),
    options: PoliticsEditorialServiceOptions = {},
  ) {
    this.skipModelEditor = options.skipModelEditor
      ?? shouldSkipPoliticsModelEditor(editorial, env.GOLD_POLITICS_EDITORIAL_PROVIDER);
    this.nativeVietnameseEditor = options.nativeVietnameseEditor ?? false;
  }
```

In `edit`, after the grounded-dump check on `generated` and **before** the `source-facts` block, add:

```ts
    if (this.nativeVietnameseEditor) {
      const plain = {
        title: toPlainEditorial(generated.title),
        summary: toPlainEditorial(generated.summary),
        whyImportant: toPlainEditorial(generated.whyImportant),
      };
      if (isGroundedDump(plain, article.summary ?? '') || !hasVietnameseEditorialText(plain)) {
        return this.translateFallback(candidate, createProviderFallbackEditorial);
      }
      return this.validator.validate(
        candidate,
        plain,
        createTranslationFallbackEditorial(candidate),
        'translated',
      );
    }
```

Leave the Google `source-facts` → `toVietnameseFields` path unchanged for `nativeVietnameseEditor === false`.

- [ ] **Step 4: Re-run tests to verify they pass**

Run:

```bash
npm test -- tests/services/politics-editorial.service.test.ts
```

Expected: PASS, including the existing skip-Google-dump and translation-notice tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/politics-editorial.service.ts tests/services/politics-editorial.service.test.ts
git commit -m "$(cat <<'EOF'
feat: skip gtx when politics Codex returns Vietnamese

Treat Codex/OpenAI politics JSON with Vietnamese letters as native editorial so rate-limited unofficial Translate is not required.
EOF
)"
```

---

### Task 3: Wire Codex in the gold-politics factory

**Files:**
- Modify: `src/services/gold-politics-flow.service.ts`
- Modify: `tests/services/gold-politics-flow.factory.test.ts`

**Interfaces:**
- Consumes: `env.GOLD_POLITICS_EDITORIAL_PROVIDER`, `politicsEditorialServiceOptions(provider)`
- Produces: `createGoldPoliticsFlowService()` constructs `new PoliticsEditorialService(editor, defaultTranslator, defaultValidator, politicsEditorialServiceOptions(provider))` where `editor` is `new ArticleEditorialService(new CodexArticleEditorialGenerator())` when provider is `codex`

- [ ] **Step 1: Write the failing factory assertions**

In `tests/services/gold-politics-flow.factory.test.ts` hoisted mocks, add:

```ts
  ArticleEditorialService: mockCtor('article-editorial'),
  CodexArticleEditorialGenerator: mockCtor('codex-generator'),
  OpenAIArticleEditorialGenerator: mockCtor('openai-generator'),
```

Export them from the hoisted object, add to `compositionMocks`, and add:

```ts
vi.mock('../../src/services/article-editorial.service', () => ({ ArticleEditorialService }));
vi.mock('../../src/services/codex-article-editorial.generator', () => ({ CodexArticleEditorialGenerator }));
vi.mock('../../src/services/openai-article-editorial.generator', () => ({ OpenAIArticleEditorialGenerator }));
```

In `envState` / `resetEnv`, add `GOLD_POLITICS_EDITORIAL_PROVIDER: 'codex'`.

In the existing compose test, after `GoldPoliticsMessageService` assertion, add:

```ts
    expect(CodexArticleEditorialGenerator).toHaveBeenCalledOnce();
    expect(ArticleEditorialService).toHaveBeenCalledWith(
      CodexArticleEditorialGenerator.mock.results[0]?.value,
    );
    expect(PoliticsEditorialService).toHaveBeenCalledWith(
      ArticleEditorialService.mock.results[0]?.value,
      undefined,
      undefined,
      { skipModelEditor: false, nativeVietnameseEditor: true },
    );
    expect(OpenAIArticleEditorialGenerator).not.toHaveBeenCalled();
```

Add a second test:

```ts
  it('skips the model editor when gold-politics editorial is google', async () => {
    useLiveCredentials();
    envState.GOLD_POLITICS_EDITORIAL_PROVIDER = 'google';
    const module = await loadFlowModule();
    module.createGoldPoliticsFlowService();

    expect(CodexArticleEditorialGenerator).not.toHaveBeenCalled();
    expect(ArticleEditorialService).toHaveBeenCalledWith();
    expect(PoliticsEditorialService).toHaveBeenCalledWith(
      ArticleEditorialService.mock.results[0]?.value,
      undefined,
      undefined,
      { skipModelEditor: true, nativeVietnameseEditor: false },
    );
  });
```

If TypeScript optional arguments make `toHaveBeenCalledWith()` too strict, assert `mock.calls[0]?.[3]` equals the options object instead.

- [ ] **Step 2: Run the factory test to verify it fails**

Run:

```bash
npm test -- tests/services/gold-politics-flow.factory.test.ts
```

Expected: FAIL — factory still calls `new PoliticsEditorialService()` with no arguments.

- [ ] **Step 3: Wire the factory**

In `src/services/gold-politics-flow.service.ts` add imports:

```ts
import { ArticleEditorialService } from './article-editorial.service';
import { CodexArticleEditorialGenerator } from './codex-article-editorial.generator';
import { OpenAIArticleEditorialGenerator } from './openai-article-editorial.generator';
import {
  PoliticsEditorialService,
  politicsEditorialServiceOptions,
} from './politics-editorial.service';
```

Replace `const messages = new GoldPoliticsMessageService(new PoliticsEditorialService());` with:

```ts
  const provider = env.GOLD_POLITICS_EDITORIAL_PROVIDER;
  const politicsEditor = provider === 'codex'
    ? new ArticleEditorialService(new CodexArticleEditorialGenerator())
    : provider === 'openai'
      ? new ArticleEditorialService(new OpenAIArticleEditorialGenerator())
      : new ArticleEditorialService();
  const messages = new GoldPoliticsMessageService(
    new PoliticsEditorialService(
      politicsEditor,
      undefined,
      undefined,
      politicsEditorialServiceOptions(provider),
    ),
  );
```

Passing `undefined` for translator and validator keeps `GoogleTranslationService` / `PoliticsEditorialValidator` as constructor defaults **inside the real class**. Factory tests mock `PoliticsEditorialService`, so those defaults are not constructed during the factory test.

- [ ] **Step 4: Re-run factory tests**

Run:

```bash
npm test -- tests/services/gold-politics-flow.factory.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/gold-politics-flow.service.ts tests/services/gold-politics-flow.factory.test.ts
git commit -m "$(cat <<'EOF'
feat: wire Codex editorial into gold-politics factory

Use GOLD_POLITICS_EDITORIAL_PROVIDER so politics can run Codex while other digest flows stay on Google.
EOF
)"
```

---

### Task 4: Install Codex CLI on a glibc runtime image

**Files:**
- Modify: `Dockerfile`
- Modify: `tests/config/gold-politics-runtime.test.ts`

**Interfaces:**
- Consumes: existing `mkdir -p /app/data` contract
- Produces: both Docker stages use `node:22-bookworm-slim`; runtime installs `@openai/codex` globally before `USER node`

- [ ] **Step 1: Extend the Dockerfile contract test**

In `tests/config/gold-politics-runtime.test.ts` `keeps writable /app/data` test, add:

```ts
    expect(dockerfile).toContain('FROM node:22-bookworm-slim AS build');
    expect(dockerfile).toContain('FROM node:22-bookworm-slim AS runtime');
    expect(dockerfile).not.toContain('node:22-alpine');
    expect(dockerfile).toContain('@openai/codex');
    expect(dockerfile).toMatch(/USER node/);
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/config/gold-politics-runtime.test.ts
```

Expected: FAIL — Dockerfile still uses `node:22-alpine` and has no Codex install.

- [ ] **Step 3: Update the Dockerfile**

Replace the file with:

```dockerfile
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN npm install -g @openai/codex \
  && mkdir -p /app/data \
  && chown node:node /app/data

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node assets ./assets

USER node
EXPOSE 3000

CMD ["node", "dist/server.js"]
```

Keep `HOME` as the image default `/home/node` so Codex can write cache as user `node`.

- [ ] **Step 4: Re-run runtime tests**

Run:

```bash
npm test -- tests/config/gold-politics-runtime.test.ts tests/config/gadget-runtime.test.ts tests/config/health-runtime.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add Dockerfile tests/config/gold-politics-runtime.test.ts
git commit -m "$(cat <<'EOF'
fix: ship Codex CLI on bookworm runtime image

Alpine cannot run the Codex native binary that politics editorial now spawns.
EOF
)"
```

---

### Task 5: Helm GitOps env for politics Codex

**Files:**
- Modify: `/root/helm/tech-news-telegram/values.yaml`
- Modify: `/root/helm/tech-news-telegram/tests/render-test.sh`

This is the GitOps chart repo (`namdz608/helm-chart`), not the app repo. From `/root/helm`:

```bash
git fetch origin main
git checkout -B feat/politics-codex-editorial origin/main
```

**Interfaces:**
- Consumes: existing `secretEnv.EDITORIAL_PROVIDER: "google"` and `secretEnv.OPENAI_API_KEY`
- Produces: `GOLD_POLITICS_EDITORIAL_PROVIDER: "codex"` and `CODEX_API_KEY` equal to current `OPENAI_API_KEY`; render-test `stringData` count 56

- [ ] **Step 1: Write the failing Helm render assertions**

In `/root/helm/tech-news-telegram/tests/render-test.sh`, add `CODEX_API_KEY` and `GOLD_POLITICS_EDITORIAL_PROVIDER` to the `for key in` list. Change:

```bash
test "$secret_env_count" -eq 54
```

to:

```bash
test "$secret_env_count" -eq 56
```

- [ ] **Step 2: Run Helm render test to verify it fails**

Run:

```bash
bash /root/helm/tech-news-telegram/tests/render-test.sh
```

Expected: FAIL — new keys missing and count still 54.

- [ ] **Step 3: Add Helm secretEnv values**

In `/root/helm/tech-news-telegram/values.yaml` `secretEnv`, immediately after `EDITORIAL_PROVIDER: "google"`, add:

```yaml
  GOLD_POLITICS_EDITORIAL_PROVIDER: "codex"
```

Immediately after `OPENAI_API_KEY: "sk-replace-me"` (use the same current `OPENAI_API_KEY` value already in that file), add:

```yaml
  CODEX_API_KEY: "sk-replace-me"
```

Do not change `EDITORIAL_PROVIDER: "google"`. Copy the exact current `OPENAI_API_KEY` string into `CODEX_API_KEY`; do not invent a new secret.

- [ ] **Step 4: Re-run Helm render test**

Run:

```bash
bash /root/helm/tech-news-telegram/tests/render-test.sh
```

Expected: PASS (`secret_env_count` 56, both new keys present).

- [ ] **Step 5: Commit in the Helm repo**

```bash
git add tech-news-telegram/values.yaml tech-news-telegram/tests/render-test.sh
git commit -m "$(cat <<'EOF'
feat: enable Codex for gold-politics editorial

Point politics at Codex while leaving the global Google editorial provider unchanged.
EOF
)"
```

Run this commit from `/root/helm` on `feat/politics-codex-editorial` created from `origin/main`.

---

### Task 6: Full verification

**Files:** none new

- [ ] **Step 1: Run app unit tests, lint, and build**

From `/root/tech-news-telegram`:

```bash
npm test && npm run lint && npm run build
```

Expected: all PASS, no lint errors, `tsc` succeeds.

- [ ] **Step 2: Commit only if Step 1 forced extra fixes**

If no extra files changed, skip. If fixes were required, commit them with a message that states why the suite was red.

---

## Spec coverage

- Provider split / default `codex` / global Google unchanged — Task 1, Task 3, Task 5
- Codex happy path skips gtx; `languageVerified` ignored; Vietnamese-letter gate — Task 2
- Failure path remains translateFallback — Task 2 English-ASCII test
- Google politics path still skips model editor — Task 2 options + Task 3 google factory test
- Unverified candidates unchanged — existing test in Task 2 file must stay green
- Dockerfile bookworm + Codex CLI + `/app/data` — Task 4
- Helm keys + count 56 + `CODEX_API_KEY` — Task 5
- README / `.env.example` thirteenth gold-politics key — Task 1
- Out of scope (other flows, official Translate, resend, parallel Codex) — no tasks touch those
