import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    hookTimeout: 30000,
    // Generous enough to absorb Next dev's on-demand route compilation on
    // the first request to a not-yet-hit route within the spawned E2E
    // servers, which can occasionally push a single HTTP round-trip past a
    // tight timeout under load.
    testTimeout: 30000,
    // Two test files (tests/http-e2e.test.ts, tests/phase2-http-e2e.test.ts)
    // each spawn a real `next dev` process against the same dev database.
    // Running test files in parallel let those spawned servers contend for
    // CPU/DB connections and produced spurious 404/500s — sequential file
    // execution makes the full E2E suite deterministic at a small time cost.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
