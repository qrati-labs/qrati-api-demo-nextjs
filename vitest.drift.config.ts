import { defineConfig } from "vitest/config";

// Network test against the live OpenAPI spec; kept out of the default `pnpm test` run.
export default defineConfig({ test: { include: ["drift/**/*.test.ts"], environment: "node" } });
