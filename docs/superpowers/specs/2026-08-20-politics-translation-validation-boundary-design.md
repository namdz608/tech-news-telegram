# Politics Translation Validation Boundary Design

## Goal

Prevent valid Vietnamese translations from falling back to raw English while retaining strict checks against invented facts and unsafe allegation framing.

## Root Cause

The current validator compares translated Vietnamese text directly with the English source corpus. Exact lexical checks therefore reject valid transformations such as `November` to `tháng 11` and split accented names such as `Trung Quốc` into a false invented name (`Trung Qu`). Adding aliases for every translation would remain incomplete.

## Approaches Considered

1. **Two-phase validation (selected):** validate source-grounded facts before translation, then validate only language-independent safety rules after translation. This preserves strict source checks without comparing different languages lexically.
2. **Translation alias tables:** map months, countries, currencies, and names between languages. This is small initially but cannot cover arbitrary entities reliably.
3. **Disable validation for translated text:** eliminates false positives but would also remove allegation, certainty, role, and negation safeguards.

## Design

Split `PoliticsEditorialValidator` into three explicit profiles across two validation phases:

- `source-grounded` remains the strict default and applies both lexical grounding and semantic safety checks.
- `source-facts` applies only source-language instruction and lexical grounding checks before translation.
- `translated` skips only cross-language lexical grounding checks and retains checks for invented motives, guilt/certainty, allegation modality, claimant roles, negation, and records-claim framing.

`PoliticsEditorialService` uses the modes at provenance boundaries:

- Non-verified editor output is validated as `source-facts` before translation. Rejected fields become deterministic source fallbacks before being translated; semantic checks run after translation so translated attribution wording is evaluated in its final form.
- Output verified as Vietnamese by the deterministic Google translation generator uses `translated` validation.
- The deterministic grounded/provider fallback translates source fields and uses `translated` validation, so valid localized names and dates are not compared byte-for-byte with English.
- Translation failure still returns the explicit `Chưa có bản dịch tiếng Việt đã xác minh` notice.

The default validator mode remains `source-grounded` so existing callers and direct tests retain the strict behavior unless they explicitly operate on verified translated text.

## Error Handling

- A source-grounding rejection is replaced before translation, preventing invented source facts from becoming trusted merely because they were translated.
- A translation provider failure keeps the current explicit conservative fallback.
- A post-translation semantic rejection keeps the explicit conservative fallback and never silently restores unlabelled English.

## Tests

- Reproduce the Alex Daniel/Guardian translation containing `Trung Quốc` and require Vietnamese output.
- Prove invented names and numbers are still rejected in `source-grounded` mode.
- Prove allegation and certainty violations are still rejected in `translated` mode.
- Keep the prior past-tense and translated-month regressions green.
- Run the complete test suite, lint, build, and the exact reported article through the live Google translation path.
