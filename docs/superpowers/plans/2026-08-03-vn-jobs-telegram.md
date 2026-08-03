# Vietnam Jobs Telegram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /telegram/send-jobs` that crawls TopCV, ITviec, and VietnamWorks for `english-teacher` or `devops` roles (optional experience bucket) and sends results through the existing article Telegram pipeline.

**Architecture:** Standalone `VnJobsCrawler` called from a new Telegram controller handler — not registered in tech `sources`. Three board adapters return normalized jobs; orchestrator filters experience, maps to `Article`, then reuses digest → editorial → Telegram. Add topic `jobs-english`.

**Tech Stack:** TypeScript, Express, Axios, Cheerio, Zod, Vitest, Telegraf (existing TelegramService).

## Global Constraints

- Endpoint: `POST /telegram/send-jobs`
- `role` required: `english-teacher` | `devops`
- `experienceYears` optional: `0` | `1-2` | `3-5` | `5+`
- Boards: TopCV (HTML), ITviec (HTML), VietnamWorks (JSON search API)
- Do not extend tech `SourceKind` / default `sources`
- Empty results: `200`, no Telegram send
- Spec: `docs/superpowers/specs/2026-08-03-vn-jobs-telegram-design.md`

---

## File Structure

- Create: `src/crawlers/vn-jobs/types.ts` — role, experience, job record types
- Create: `src/crawlers/vn-jobs/experience.ts` — experience filter helpers
- Create: `src/crawlers/vn-jobs/role-queries.ts` — search query strings per role
- Create: `src/crawlers/vn-jobs/itviec.adapter.ts`
- Create: `src/crawlers/vn-jobs/topcv.adapter.ts`
- Create: `src/crawlers/vn-jobs/vietnamworks.adapter.ts`
- Create: `src/crawlers/vn-jobs.crawler.ts` — orchestration + Article mapping
- Create: `src/crawlers/vn-jobs/params.ts` — parse/validate query params
- Modify: `src/types/topic.ts`, `src/config/topics.ts`, `src/config/topic-images.ts`
- Modify: `src/config/env.ts`, `.env.example`
- Modify: `src/services/article-editorial.service.ts` — fallbackWhyImportant for `jobs-english`
- Modify: `src/controllers/telegram.controller.ts`, `src/routes/telegram.routes.ts`
- Modify: `README.md`
- Test: `tests/crawlers/vn-jobs.*.test.ts`, `tests/routes/telegram-jobs.routes.test.ts`

---

### Task 1: Topic, env, and param validation

**Files:**
- Modify: `src/types/topic.ts`
- Modify: `src/config/topics.ts`
- Modify: `src/config/topic-images.ts`
- Modify: `src/config/env.ts`
- Modify: `.env.example`
- Modify: `src/services/article-editorial.service.ts`
- Create: `src/crawlers/vn-jobs/types.ts`
- Create: `src/crawlers/vn-jobs/params.ts`
- Create: `tests/crawlers/vn-jobs-params.test.ts`

**Interfaces:**
- Produces: `JobRole`, `ExperienceYears`, `VnJobListing`, `parseJobSendParams(query) => { role, experienceYears? } | throws`

- [ ] **Step 1: Extend TopicKey and configs**

```ts
// topic.ts
export type TopicKey = 'ai' | 'k8s' | 'security' | 'devops' | 'cloud' | 'jobs-english';

// topics.ts — add:
{
  key: 'jobs-english',
  label: 'Jobs · English Teacher',
  keywords: ['english teacher', 'giáo viên tiếng anh', 'trợ giảng tiếng anh', 'teaching assistant'],
}

// topic-images.ts — add:
jobs-english: 'https://placehold.co/1200x630/9a3412/ffffff.png?text=English+Jobs',

// env.ts — add:
MAX_JOBS_PER_DIGEST: z.coerce.number().int().positive().default(10),

// article-editorial fallbackWhyImportant — add:
'jobs-english': 'Tin tuyển dụng này có thể phù hợp nếu bạn đang tìm vị trí giáo viên hoặc trợ giảng tiếng Anh mầm non / tiểu học.',
```

- [ ] **Step 2: Add types + parseJobSendParams**

```ts
export type JobRole = 'english-teacher' | 'devops';
export type ExperienceYears = '0' | '1-2' | '3-5' | '5+';

export interface VnJobListing {
  title: string;
  url: string;
  company?: string;
  location?: string;
  salaryText?: string;
  experienceText?: string;
  summary?: string;
  imageUrl?: string;
  publishedAt?: string;
  sourceId: 'topcv' | 'itviec' | 'vietnamworks';
  sourceName: 'TopCV' | 'ITviec' | 'VietnamWorks';
}

export function parseJobSendParams(query: Record<string, unknown>): {
  role: JobRole;
  experienceYears?: ExperienceYears;
}
```

Invalid role/experience → throw Error with message starting `Invalid` (controller maps to 400).

- [ ] **Step 3: Tests for params + build**

Run: `npx vitest run tests/crawlers/vn-jobs-params.test.ts && npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/types/topic.ts src/config/topics.ts src/config/topic-images.ts src/config/env.ts .env.example src/services/article-editorial.service.ts src/crawlers/vn-jobs tests/crawlers/vn-jobs-params.test.ts
git commit -m "feat: add jobs-english topic and send-jobs param validation"
```

---

### Task 2: Experience filter + board adapters + crawler

**Files:**
- Create: `src/crawlers/vn-jobs/experience.ts`
- Create: `src/crawlers/vn-jobs/role-queries.ts`
- Create: `src/crawlers/vn-jobs/itviec.adapter.ts`
- Create: `src/crawlers/vn-jobs/topcv.adapter.ts`
- Create: `src/crawlers/vn-jobs/vietnamworks.adapter.ts`
- Create: `src/crawlers/vn-jobs.crawler.ts`
- Create: `tests/crawlers/vn-jobs-experience.test.ts`
- Create: `tests/crawlers/vn-jobs.crawler.test.ts` (fixtures + mocked HTTP)

**Interfaces:**
- Consumes: `JobRole`, `ExperienceYears`, `VnJobListing`
- Produces: `VnJobsCrawler.crawl(options): Promise<Article[]>`
- `matchesExperience(text, bucket): boolean` — missing/unparseable text → `true` (keep)

**Adapter notes:**
- ITviec: GET `https://itviec.com/it-jobs/{slug}` — devops → `devops`; english-teacher → search keyword URL `https://itviec.com/it-jobs?q=english+teacher`. Parse `.job-card`, title `h3 a`, company from logo title / company link, location from card text.
- TopCV: GET `https://www.topcv.vn/viec-lam?keyword={query}`. Parse `.job-item` / `.job-list-item` style cards when present; Cloudflare/block HTML → `[]`.
- VietnamWorks: POST `https://ms.vietnamworks.com/job-search/v1.0/search` with JSON body (`query`, `hitsPerPage`, `userId: 0`, retrieveFields including `jobTitle`, `jobUrl`, `companyName`, `prettySalary`, `jobLevel`, `workingLocations`, `companyLogo`). Map `jobLevel` into `experienceText`.

`VnJobsCrawler`:
1. Call three adapters in parallel (each try/catch → `[]`)
2. Optional experience filter
3. Map to Article with topics `jobs-english` or `devops`
4. Dedupe by URL, sort by publishedAt/collectedAt desc, slice `maxResults`

- [ ] **Step 1: Write failing adapter/crawler/experience tests with HTML/JSON fixtures**
- [ ] **Step 2: Implement experience + adapters + crawler**
- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/crawlers/vn-jobs-experience.test.ts tests/crawlers/vn-jobs.crawler.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add Vietnam job board crawler and adapters"
```

---

### Task 3: Telegram send-jobs endpoint + README

**Files:**
- Modify: `src/controllers/telegram.controller.ts`
- Modify: `src/routes/telegram.routes.ts`
- Modify: `README.md`
- Create: `tests/routes/telegram-jobs.routes.test.ts`

**Interfaces:**
- Consumes: `parseJobSendParams`, `VnJobsCrawler`, existing Digest/Editorial/Telegram services
- Produces: `sendJobs(req, res)`

Flow:
1. Parse params → 400 on error
2. `articles = await vnJobsCrawler.crawl({ role, experienceYears, maxResults: env.MAX_JOBS_PER_DIGEST })`
3. If `articles.length === 0` → JSON `{ sent: true, articleCount: 0, messageCount: 0, role, experienceYears: experienceYears ?? null, language: 'vi' }` without Telegram
4. Else build messages → edit → `telegramService.sendMessages` → success JSON

- [ ] **Step 1: Route/controller tests with mocked crawler/telegram**
- [ ] **Step 2: Implement sendJobs + route + README section**
- [ ] **Step 3: Full test + build**

Run: `npm test && npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add POST /telegram/send-jobs endpoint"
```

---

## Spec Coverage Check

| Spec requirement | Task |
| --- | --- |
| Separate endpoint + params | 1, 3 |
| TopCV / ITviec / VietnamWorks | 2 |
| Experience buckets + keep unknown | 2 |
| Map to Article + existing Telegram pipeline | 2, 3 |
| Topic `jobs-english` | 1 |
| `MAX_JOBS_PER_DIGEST` | 1, 2 |
| Empty → no Telegram send | 3 |
| Tech digest untouched | 2, 3 (no sources change) |
