import { defineConfig } from "vitest/config";

// Each flow test builds the full schema in PGlite (~2.5s), which brushes the
// default 5s timeout on a busy machine.
export default defineConfig({
  test: { testTimeout: 30_000, hookTimeout: 30_000 },
});
