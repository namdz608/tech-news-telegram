# Politics Translation Validation Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep valid Vietnamese Politics translations while preserving strict source-fact and allegation safety checks.

**Architecture:** Add explicit `source-grounded` and `translated` validation modes. Validate untrusted editorial facts against the source before translation, then validate translated output with language-independent semantic rules so legitimate localization does not look like invented data.

**Tech Stack:** TypeScript, Vitest, Google Translation service

---

### Task 1: Separate source-grounding from translated semantic validation

**Files:**
- Modify: `src/services/politics-editorial-validator.ts`
- Modify: `src/services/politics-editorial.service.ts`
- Test: `tests/services/politics-editorial.service.test.ts`

- [ ] **Step 1: Add failing validator and Guardian regressions**

Add a translated-mode validator test using the exact valid localized phrase that currently fails:

```ts
it('does not compare localized proper names lexically with English source text', () => {
  const input = candidate({
    sourceName: 'The Guardian World',
    title: 'Chinese carmaker plans further UK expansion',
    summary: 'The Chinese carmaker plans a major centre in England.',
    claimStance: 'neutral',
    claimModality: 'reported',
    evidentiaryEffect: 'mentions',
    evidenceAssertions: [assertion({ modality: 'reported', effect: 'mentions' })],
  });
  const translated = createProviderFallbackEditorial({
    ...input,
    title: 'Nhà sản xuất ô tô Trung Quốc lên kế hoạch mở rộng tại Anh',
    summary: 'Nhà sản xuất ô tô Trung Quốc lên kế hoạch mở một trung tâm lớn tại Anh.',
  });

  const result = new PoliticsEditorialValidator().validate(
    input,
    translated,
    createTranslationFallbackEditorial(input),
    'translated',
  );

  expect(result.summary).toContain('Trung Quốc');
});
```

Add a service regression for the Alex Daniel article. Its grounded editor returns the source dump, the translator returns the observed Vietnamese title and summary, and the assertion requires `Trung Quốc` with no `Chưa có bản dịch tiếng Việt đã xác minh`.

Keep the existing `rejects invented names, numbers, quotes, allegations, motives, certainty, and guilty language per field` test unchanged to prove default `source-grounded` behavior. Add this translated semantic-safety assertion:

```ts
it('retains certainty checks for translated text', () => {
  const input = candidate({ verificationState: 'reported' });
  const fallback = createTranslationFallbackEditorial(input);
  const result = new PoliticsEditorialValidator().validate(
    input,
    {
      title: 'Chắc chắn quan chức đã được xác nhận có tội',
      summary: 'Chắc chắn đây là kết luận chính thức.',
      whyImportant: 'Đã xác nhận thông tin.',
    },
    fallback,
    'translated',
  );
  expect(result).toEqual(fallback);
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- tests/services/politics-editorial.service.test.ts
```

Expected: FAIL because `validate` has no validation-mode argument and the Alex Daniel translation falls back to English.

- [ ] **Step 3: Add validation modes**

In `src/services/politics-editorial-validator.ts`, define and thread the mode through field validation:

```ts
export type PoliticsEditorialValidationMode = 'source-grounded' | 'translated';

function isFieldSafe(
  candidate: PoliticsCandidate,
  field: string,
  role: 'title' | 'summary' | 'whyImportant',
  corpus: string,
  mode: PoliticsEditorialValidationMode,
): boolean {
  const compact = compactText(field);
  if (!compact) return false;
  if (INSTRUCTION_FOLLOWED.test(compact)) return false;
  if (
    mode === 'source-grounded'
    && (inventedNumbers(compact, corpus)
      || inventedNames(compact, corpus)
      || inventedQuotes(compact, corpus))
  ) {
    return false;
  }
  if (MOTIVE.test(compact) || hasUnguardedGuiltyLanguage(compact) || restatedAllegationAsFact(compact, candidate)) {
    return false;
  }
  if (candidate.verificationState !== 'confirmed' && CERTAINTY.test(compact)) return false;
  if (swappedRoles(compact, candidate)) return false;
  if (lostNegation(compact, candidate, corpus)) return false;
  if (lostReportedFraming(compact, candidate)) return false;
  if (lostRecordsClaim(compact, candidate)) return false;
  return true;
}
```

Extend the public method without changing existing callers' strict default:

```ts
validate(
  candidate: PoliticsCandidate,
  editorial: PoliticsEditorial,
  fallbackOverride?: PoliticsEditorial,
  mode: PoliticsEditorialValidationMode = 'source-grounded',
): PoliticsEditorial
```

Pass `mode` from `validate` to `chooseSafeField` and from `chooseSafeField` to both `isFieldSafe` calls. Remove `ENGLISH_MONTHS` and `removeEquivalentTranslatedMonths`; translated month localization is now handled by the translated boundary instead of an alias exception.

- [ ] **Step 4: Validate at the correct service boundaries**

Import `PoliticsEditorialValidationMode` and update the injected validator contract:

```ts
validate(
  candidate: PoliticsCandidate,
  editorial: PoliticsEditorial,
  fallbackOverride?: PoliticsEditorial,
  mode?: PoliticsEditorialValidationMode,
): PoliticsEditorial;
```

Before translating non-verified editor output, apply strict source grounding and merge the safe fields back into the generated object:

```ts
let generatedForTranslation = generated;
if (generated[verifiedVietnameseEditorial] !== true) {
  const sourceGrounded = this.validator.validate(
    candidate,
    {
      title: toPlainEditorial(generated.title),
      summary: toPlainEditorial(generated.summary),
      whyImportant: toPlainEditorial(generated.whyImportant),
    },
    createProviderFallbackEditorial(candidate),
    'source-grounded',
  );
  generatedForTranslation = { ...generated, ...sourceGrounded };
}

const translated = await this.toVietnameseFields(candidate, generatedForTranslation);
```

Validate final verified translations and translated deterministic fallbacks with:

```ts
this.validator.validate(candidate, translated, conservative, 'translated')
```

Keep translation failures on the current explicit conservative fallback.

- [ ] **Step 5: Verify GREEN and remove obsolete exception behavior**

Run:

```bash
npm test -- tests/services/politics-editorial.service.test.ts
```

Expected: all Politics editorial tests pass, including the Alex Daniel, November, past-tense, source-invention, and translated-semantic cases.

- [ ] **Step 6: Verify the exact article and full repository**

Run the exact Alex Daniel title and summary through `PoliticsClassificationService`, live `GoogleTranslationService`, and `PoliticsEditorialService`; require Vietnamese output without the explicit translation-failure notice.

Then run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: all commands exit successfully.

- [ ] **Step 7: Commit**

```bash
git add src/services/politics-editorial-validator.ts src/services/politics-editorial.service.ts tests/services/politics-editorial.service.test.ts
git commit -m "fix: separate politics translation validation phases"
```
