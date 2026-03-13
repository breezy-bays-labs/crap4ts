import { describe, it, expect } from "vitest";
import { defineConfig } from "../../src/core/define-config.js";

describe("defineConfig", () => {
  it("returns a valid config with all optional fields omitted", () => {
    const config = defineConfig({});
    expect(config).toEqual({});
  });

  it("passes through valid config fields", () => {
    const config = defineConfig({
      threshold: 15,
      coverageMetric: "branch",
      include: ["src/**/*.ts"],
      exclude: ["**/*.test.ts"],
      thresholds: { "legacy/**": 30 },
    });

    expect(config.threshold).toBe(15);
    expect(config.coverageMetric).toBe("branch");
    expect(config.include).toEqual(["src/**/*.ts"]);
    expect(config.exclude).toEqual(["**/*.test.ts"]);
    expect(config.thresholds).toEqual({ "legacy/**": 30 });
  });

  it("rejects non-positive threshold", () => {
    expect(() => defineConfig({ threshold: 0 })).toThrow();
    expect(() => defineConfig({ threshold: -5 })).toThrow();
  });

  it("rejects invalid coverageMetric", () => {
    // @ts-expect-error — testing runtime validation
    expect(() => defineConfig({ coverageMetric: "statement" })).toThrow();
  });

  it("rejects non-positive per-path thresholds", () => {
    expect(() => defineConfig({ thresholds: { "src/**": 0 } })).toThrow();
    expect(() => defineConfig({ thresholds: { "src/**": -1 } })).toThrow();
  });

  it("accepts valid per-path thresholds", () => {
    const config = defineConfig({
      thresholds: { "src/**": 8, "legacy/**": 30 },
    });
    expect(config.thresholds).toEqual({ "src/**": 8, "legacy/**": 30 });
  });

  it("rejects include with non-string elements", () => {
    // @ts-expect-error — testing runtime validation
    expect(() => defineConfig({ include: [42] })).toThrow();
  });
});
