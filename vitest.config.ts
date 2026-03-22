import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/.claude/**"],
    coverage: {
      provider: "v8",
      reporter: ["json", "text"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/index.ts", "src/cli/**"],
    },
  },
});
