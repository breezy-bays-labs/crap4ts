/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  mutate: ["src/domain/**/*.ts", "!src/domain/types.ts", "!src/domain/index.ts"],
  thresholds: { high: 80, low: 60, break: 50 },
};
