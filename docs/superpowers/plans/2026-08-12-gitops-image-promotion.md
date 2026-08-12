# GitOps Image Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish an immutable commit-SHA Docker tag and automatically record that tag in the `tech-news-telegram` Helm values repository after a successful main-branch build.

**Architecture:** GitHub Actions remains responsible for testing/building and publishing the image. A dependent GitOps job checks out `namdz608/helm-chart` with a narrowly scoped repository token, calls a tested shell helper that changes only the top-level `image.tag`, then commits and pushes the desired-state change for Argo CD to reconcile.

**Tech Stack:** GitHub Actions, Docker metadata/build actions, Bash/AWK, Vitest, Helm values YAML.

---

### Task 1: Add a safe Helm image-tag updater

**Files:**

- Create: `.github/scripts/update-gitops-image.sh`
- Create: `tests/config/update-gitops-image.test.ts`

- [x] **Step 1: Write the failing tests**

  Add Vitest cases that run the helper against a temporary Helm values file and assert that it replaces exactly the top-level `image.tag`, preserves `cronjob.image.tag`, and rejects a tag that is not a full 40-character lowercase Git SHA.

- [x] **Step 2: Verify the tests fail for the missing helper**

  Run: `npx vitest run tests/config/update-gitops-image.test.ts`

  Expected: FAIL because `.github/scripts/update-gitops-image.sh` does not exist.

- [x] **Step 3: Implement the minimal helper**

  Create a strict Bash script accepting `<values-file> <image-tag>`. Validate the file and tag, use AWK to replace exactly one `tag` entry inside the root `image:` mapping, fail unless exactly one entry was changed, and atomically move the generated file over the input.

- [x] **Step 4: Verify the helper tests pass**

  Run: `npx vitest run tests/config/update-gitops-image.test.ts`

  Expected: both cases PASS.

### Task 2: Connect image publishing to the GitOps repository

**Files:**

- Modify: `.github/workflows/docker-publish.yml`
- Create: `tests/config/docker-publish-workflow.test.ts`
- Modify: `README.md`

- [x] **Step 1: Write the failing workflow contract test**

  Assert that the workflow publishes `${{ github.sha }}` on `main`, runs a `gitops` job only after `publish`, checks out `namdz608/helm-chart` using `GITOPS_REPO_TOKEN`, invokes the tested helper for `gitops/tech-news-telegram/values.yaml`, and pushes a bot-authored commit.

- [x] **Step 2: Verify the workflow contract test fails**

  Run: `npx vitest run tests/config/docker-publish-workflow.test.ts`

  Expected: FAIL because the SHA metadata and GitOps job are absent.

- [x] **Step 3: Implement the workflow integration**

  Add the raw full-SHA Docker tag for main builds. Add a dependent `gitops` job for `main` that checks out the Helm repository, runs `.github/scripts/update-gitops-image.sh`, commits only when the staged values file changed, and pushes with the checkout credential.

- [x] **Step 4: Document the required credential**

  Add a README deployment section stating that `GITOPS_REPO_TOKEN` must be a fine-grained token or GitHub App token with Contents read/write access only to `namdz608/helm-chart`, and describe the resulting CI-to-Argo-CD flow.

- [x] **Step 5: Verify the focused tests and repository quality gates**

  Run:

  ```bash
  npx vitest run tests/config/update-gitops-image.test.ts tests/config/docker-publish-workflow.test.ts
  npm test
  npm run lint
  npm run build
  ```

  Expected: every command exits 0 with no test failures, lint errors, or TypeScript build errors.
