import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/core/index.ts",
    formula: "src/domain/crap.ts",
    complexity: "src/adapters/complexity/facade.ts",
    coverage: "src/adapters/coverage/facade.ts",
    cli: "src/cli/cli.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: true,
  clean: true,
  target: "node18",
  shims: true,
});
