import { describe, it, expect } from "vitest";

/**
 * Snapshot test for the public API surface.
 * If this test fails, a value export was added or removed from the main entry point.
 * Update the snapshot deliberately — accidental removal is a breaking change post-v1.
 */
describe("public API surface", () => {
  it("exports the expected value symbols from crap4ts", async () => {
    const mod = await import("../../src/core/index.js");
    const exports = Object.keys(mod).sort();

    expect(exports).toEqual([
      "PRESETS",
      "RiskLevel",
      "analyze",
      "analyzeFile",
      "createDefaultDeps",
      "createThresholdConfig",
      "defineConfig",
      "prepareForJsonOutput",
      "resolveThreshold",
      "selectContributors",
    ]);
  });
});
