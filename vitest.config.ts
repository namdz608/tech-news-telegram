import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Unit tests inject readers explicitly; never call external enrichment by default.
    env: { AGENT_REACH_ENABLED: 'false' },
    exclude: ["node_modules/**", "dist/**", ".cursor/**", ".worktrees/**"],
  },
});
