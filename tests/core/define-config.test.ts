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

  it("accepts new config fields: format, src, breakdown, sort, top, summary", () => {
    const config = defineConfig({
      format: "json",
      src: ["src", "lib"],
      breakdown: "all",
      sort: "crap",
      top: 10,
      summary: true,
    });

    expect(config.format).toBe("json");
    expect(config.src).toEqual(["src", "lib"]);
    expect(config.breakdown).toBe("all");
    expect(config.sort).toBe("crap");
    expect(config.top).toBe(10);
    expect(config.summary).toBe(true);
  });

  it("accepts src as a single string", () => {
    const config = defineConfig({ src: "src" });
    expect(config.src).toBe("src");
  });

  it("accepts all valid format values", () => {
    expect(defineConfig({ format: "table" }).format).toBe("table");
    expect(defineConfig({ format: "json" }).format).toBe("json");
    expect(defineConfig({ format: "markdown" }).format).toBe("markdown");
  });

  it("rejects invalid format", () => {
    // @ts-expect-error — testing runtime validation
    expect(() => defineConfig({ format: "xml" })).toThrow();
  });

  it("rejects invalid breakdown", () => {
    // @ts-expect-error — testing runtime validation
    expect(() => defineConfig({ breakdown: "none" })).toThrow();
  });

  it("rejects invalid sort", () => {
    // @ts-expect-error — testing runtime validation
    expect(() => defineConfig({ sort: "date" })).toThrow();
  });

  it("rejects non-positive top", () => {
    expect(() => defineConfig({ top: 0 })).toThrow();
    expect(() => defineConfig({ top: -1 })).toThrow();
  });

  it("rejects non-integer top", () => {
    expect(() => defineConfig({ top: 2.5 })).toThrow();
  });

  it("accepts summary as boolean", () => {
    expect(defineConfig({ summary: false }).summary).toBe(false);
    expect(defineConfig({ summary: true }).summary).toBe(true);
  });
});
