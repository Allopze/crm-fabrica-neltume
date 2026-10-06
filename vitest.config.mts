import path from "node:path";
import { defineConfig } from "vitest/config";

// Capas de TESTING.md §1. `npm test` corre ambas, siempre completas.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["src/**/*.test.ts"], environment: "node" },
      },
      {
        extends: true,
        test: {
          name: "integracion",
          include: ["tests/integracion/**/*.test.ts"],
          environment: "node",
          fileParallelism: false,
          sequence: { concurrent: false },
          testTimeout: 20_000,
          hookTimeout: 60_000,
          globalSetup: ["tests/integracion/setup-global.ts"],
        },
      },
    ],
  },
});
