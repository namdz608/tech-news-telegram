import { describe, expect, it } from "vitest";
import vitestConfig from "../../vitest.config";

describe("Vitest config", () => {
  it("does not discover tests from local Git worktrees", () => {
    expect(vitestConfig.test?.exclude).toContain(".worktrees/**");
  });
});
