import { describe, it, expect } from "vitest";
import { createThresholdConfig, resolveThreshold, PRESETS } from "../../src/domain/threshold.js";

describe("createThresholdConfig", () => {
  it("uses default threshold of 12 when no options", () => {
    const config = createThresholdConfig();
    expect(config.defaultThreshold).toBe(12);
    expect(config.overrides).toEqual([]);
  });

  it("accepts preset names", () => {
    expect(createThresholdConfig({ preset: "strict" }).defaultThreshold).toBe(8);
    expect(createThresholdConfig({ preset: "lenient" }).defaultThreshold).toBe(30);
  });

  it("accepts custom numeric threshold", () => {
    const config = createThresholdConfig({ preset: 15 });
    expect(config.defaultThreshold).toBe(15);
  });

  it("rejects threshold <= 0", () => {
    expect(() => createThresholdConfig({ preset: 0 })).toThrow();
    expect(() => createThresholdConfig({ preset: -5 })).toThrow();
  });

  it("preserves override order", () => {
    const config = createThresholdConfig({
      overrides: [
        { glob: "src/domain/**", threshold: 8 },
        { glob: "src/legacy/**", threshold: 30 },
      ],
    });
    expect(config.overrides).toHaveLength(2);
    expect(config.overrides[0].glob).toBe("src/domain/**");
  });
});

describe("resolveThreshold", () => {
  const matcher = (path: string, glob: string) => {
    if (glob === "**") return true;
    return path.startsWith(glob.replace("/**", "/"));
  };

  it("returns default when no overrides match", () => {
    const config = createThresholdConfig({ preset: 12 });
    expect(resolveThreshold(config, "src/utils/helper.ts", matcher)).toBe(12);
  });

  it("returns first matching override", () => {
    const config = createThresholdConfig({
      preset: 12,
      overrides: [
        { glob: "src/domain/**", threshold: 8 },
        { glob: "src/legacy/**", threshold: 30 },
      ],
    });
    expect(resolveThreshold(config, "src/domain/order.ts", matcher)).toBe(8);
    expect(resolveThreshold(config, "src/legacy/old.ts", matcher)).toBe(30);
  });

  it("first-match wins when multiple overrides match", () => {
    const config = createThresholdConfig({
      overrides: [
        { glob: "src/**", threshold: 10 },
        { glob: "src/domain/**", threshold: 8 },
      ],
    });
    expect(resolveThreshold(config, "src/domain/order.ts", matcher)).toBe(10);
  });
});
