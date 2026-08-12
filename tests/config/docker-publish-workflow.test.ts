import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  join(process.cwd(), ".github/workflows/docker-publish.yml"),
  "utf8",
);

describe("Docker publish workflow", () => {
  it("does not cancel an image promotion after publishing has started", () => {
    expect(workflow).toContain("cancel-in-progress: false");
  });

  it("publishes the main commit as an immutable image tag", () => {
    expect(workflow).toContain(
      "type=raw,value=${{ github.sha }},enable=${{ github.ref == 'refs/heads/main' }}",
    );
  });

  it("records a successful main image in the GitOps repository", () => {
    expect(workflow).toMatch(/\n {2}gitops:\n/);
    expect(workflow).toMatch(/gitops:\n[\s\S]*?needs: publish/);
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(workflow).toContain("repository: namdz608/helm-chart");
    expect(workflow).toContain("token: ${{ secrets.GITOPS_REPO_TOKEN }}");
    expect(workflow).toContain("path: gitops");
    expect(workflow).toContain(
      './.github/scripts/update-gitops-image.sh gitops/tech-news-telegram/values.yaml "$GITHUB_SHA"',
    );
    expect(workflow).toContain("git diff --cached --quiet");
    expect(workflow).toContain("for attempt in 1 2 3; do");
    expect(workflow).toContain('git pull --rebase origin "$GITOPS_BRANCH"');
    expect(workflow).toContain("git push");
  });
});
