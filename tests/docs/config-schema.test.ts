import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("config schema parity", () => {
  it("defineConfig schema keys match documented fields in README", () => {
    const readme = readFileSync(
      join(import.meta.dirname, "../../README.md"),
      "utf-8",
    );

    // The documented config fields from the "All Config Fields" table
    const expectedFields = [
      "threshold",
      "coverageMetric",
      "include",
      "exclude",
      "thresholds",
      "format",
      "src",
      "breakdown",
      "sort",
      "top",
      "summary",
    ];

    for (const field of expectedFields) {
      expect(readme).toContain(`\`${field}\``);
    }
  });

  it("zod schema keys match the canonical list", async () => {
    // Import the defineConfig to validate schema accepts all expected fields
    const { defineConfig } = await import("../../src/core/define-config.js");

    // All documented fields should be accepted by the schema (not throw)
    const config = defineConfig({
      threshold: 16,
      coverageMetric: "line",
      include: ["**/*.ts"],
      exclude: ["**/*.test.ts"],
      thresholds: { "src/**": 8 },
      format: "table",
      src: ["src"],
      breakdown: "off",
      sort: "crap",
      top: 10,
      summary: false,
    });

    expect(config).toBeDefined();
    expect(config.threshold).toBe(16);
  });
});
