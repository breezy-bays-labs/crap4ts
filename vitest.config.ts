import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["json", "text"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/index.ts", "src/cli/**"],
    },
  },
});
