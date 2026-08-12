import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const scriptPath = join(
  process.cwd(),
  ".github/scripts/update-gitops-image.sh",
);
const temporaryDirectories: string[] = [];

function createValuesFile(contents: string): string {
  const directory = mkdtempSync(join(tmpdir(), "gitops-image-"));
  temporaryDirectories.push(directory);

  const valuesPath = join(directory, "values.yaml");
  writeFileSync(valuesPath, contents);
  return valuesPath;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("update-gitops-image.sh", () => {
  it("updates only the root application image tag", () => {
    const valuesPath = createValuesFile(`image:
  repository: example/tech-news-telegram
  tag: latest
  pullPolicy: Always

cronjob:
  image:
    repository: curlimages/curl
    tag: 8.10.1
`);
    const imageTag = "0123456789abcdef0123456789abcdef01234567";

    const result = spawnSync("bash", [scriptPath, valuesPath, imageTag], {
      encoding: "utf8",
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(readFileSync(valuesPath, "utf8")).toBe(`image:
  repository: example/tech-news-telegram
  tag: ${imageTag}
  pullPolicy: Always

cronjob:
  image:
    repository: curlimages/curl
    tag: 8.10.1
`);
  });

  it("rejects a mutable or malformed image tag without modifying the file", () => {
    const originalValues = `image:
  repository: example/tech-news-telegram
  tag: latest
`;
    const valuesPath = createValuesFile(originalValues);

    const result = spawnSync("bash", [scriptPath, valuesPath, "latest"], {
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(readFileSync(valuesPath, "utf8")).toBe(originalValues);
  });
});
