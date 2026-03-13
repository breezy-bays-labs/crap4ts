import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import {
  findConfigFile,
  loadConfigFile,
  resolveConfig,
  configToThresholdConfig,
} from "../../src/cli/config.js";

// ── findConfigFile ───────────────────────────────────────────────────

describe("findConfigFile", () => {
  it("returns null when no config file exists", () => {
    // Use a directory that definitely has no config files
    const result = findConfigFile("/tmp/nonexistent-crap4ts-dir");
    expect(result).toBeNull();
  });

  it("discovers crap4ts.config.ts first", () => {
    const fakeFs: Record<string, boolean> = {
      "crap4ts.config.ts": true,
      "crap4ts.config.js": true,
      "crap4ts.config.mjs": true,
    };
    const result = findConfigFile("/fake", {
      exists: (path: string) => {
        const basename = path.replace(/^.*\//, "");
        return fakeFs[basename] ?? false;
      },
    });
    expect(result).toBe(join("/fake", "crap4ts.config.ts"));
  });

  it("falls back to .js when .ts is missing", () => {
    const fakeFs: Record<string, boolean> = {
      "crap4ts.config.js": true,
      "crap4ts.config.mjs": true,
    };
    const result = findConfigFile("/fake", {
      exists: (path: string) => {
        const basename = path.replace(/^.*\//, "");
        return fakeFs[basename] ?? false;
      },
    });
    expect(result).toBe(join("/fake", "crap4ts.config.js"));
  });

  it("falls back to .mjs when .ts and .js are missing", () => {
    const result = findConfigFile("/fake", {
      exists: (path: string) => path.endsWith("crap4ts.config.mjs"),
    });
    expect(result).toBe(join("/fake", "crap4ts.config.mjs"));
  });

  it("falls back to package.json crap4ts field", () => {
    const result = findConfigFile("/fake", {
      exists: (path: string) => path.endsWith("package.json"),
      readPackageJson: (_path: string) => ({ crap4ts: { threshold: 20 } }),
    });
    expect(result).toBe(join("/fake", "package.json"));
  });

  it("skips package.json when it has no crap4ts field", () => {
    const result = findConfigFile("/fake", {
      exists: (path: string) => path.endsWith("package.json"),
      readPackageJson: (_path: string) => ({ name: "my-app" }),
    });
    expect(result).toBeNull();
  });
});

// ── loadConfigFile ───────────────────────────────────────────────────

describe("loadConfigFile", () => {
  it("loads and validates a TS config file via jiti", async () => {
    const fakePath = "/fake/crap4ts.config.ts";
    const config = await loadConfigFile(fakePath, {
      importFile: async (_path: string) => ({
        default: { threshold: 15, coverageMetric: "branch" },
      }),
    });
    expect(config.threshold).toBe(15);
    expect(config.coverageMetric).toBe("branch");
  });

  it("loads a JS config file with default export", async () => {
    const fakePath = "/fake/crap4ts.config.js";
    const config = await loadConfigFile(fakePath, {
      importFile: async (_path: string) => ({
        default: { threshold: 10 },
      }),
    });
    expect(config.threshold).toBe(10);
  });

  it("handles named export (no default)", async () => {
    const fakePath = "/fake/crap4ts.config.ts";
    const config = await loadConfigFile(fakePath, {
      importFile: async (_path: string) => ({
        threshold: 8,
        include: ["src/**"],
      }),
    });
    expect(config.threshold).toBe(8);
    expect(config.include).toEqual(["src/**"]);
  });

  it("extracts crap4ts field from package.json", async () => {
    const fakePath = "/fake/package.json";
    const config = await loadConfigFile(fakePath, {
      importFile: async (_path: string) => ({
        default: {
          name: "my-app",
          crap4ts: { threshold: 20, coverageMetric: "line" },
        },
      }),
    });
    expect(config.threshold).toBe(20);
    expect(config.coverageMetric).toBe("line");
  });

  it("throws on malformed config", async () => {
    const fakePath = "/fake/crap4ts.config.ts";
    await expect(
      loadConfigFile(fakePath, {
        importFile: async (_path: string) => ({
          default: { threshold: -5 },
        }),
      }),
    ).rejects.toThrow();
  });

  it("throws when package.json has no crap4ts field", async () => {
    const fakePath = "/fake/package.json";
    await expect(
      loadConfigFile(fakePath, {
        importFile: async (_path: string) => ({
          default: { name: "my-app" },
        }),
      }),
    ).rejects.toThrow(/no "crap4ts" field/i);
  });

  it("throws clear error when config file cannot be loaded", async () => {
    const fakePath = "/fake/crap4ts.config.ts";
    await expect(
      loadConfigFile(fakePath, {
        importFile: async (_path: string) => {
          throw new Error("Module not found");
        },
      }),
    ).rejects.toThrow(/failed to load config/i);
  });
});

// ── Environment Variables ────────────────────────────────────────────

describe("resolveConfig — environment variables", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("reads CRAP4TS_THRESHOLD from env", () => {
    process.env["CRAP4TS_THRESHOLD"] = "20";
    const config = resolveConfig({ env: process.env });
    expect(config.threshold).toBe(20);
  });

  it("reads CRAP4TS_COVERAGE from env", () => {
    process.env["CRAP4TS_COVERAGE"] = "/tmp/coverage.json";
    const config = resolveConfig({ env: process.env });
    expect(config.coverage).toBe("/tmp/coverage.json");
  });

  it("reads CRAP4TS_FORMAT from env", () => {
    process.env["CRAP4TS_FORMAT"] = "json";
    const config = resolveConfig({ env: process.env });
    expect(config.format).toBe("json");
  });

  it("reads NO_COLOR from env", () => {
    process.env["NO_COLOR"] = "1";
    const config = resolveConfig({ env: process.env });
    expect(config.noColor).toBe(true);
  });

  it("treats empty NO_COLOR as falsy", () => {
    process.env["NO_COLOR"] = "";
    const config = resolveConfig({ env: process.env });
    expect(config.noColor).toBe(false);
  });

  it("ignores non-numeric CRAP4TS_THRESHOLD", () => {
    process.env["CRAP4TS_THRESHOLD"] = "abc";
    const config = resolveConfig({ env: process.env });
    expect(config.threshold).toBeUndefined();
  });
});

// ── Priority Cascade ─────────────────────────────────────────────────

describe("resolveConfig — priority cascade", () => {
  it("uses defaults when nothing else is provided", () => {
    const config = resolveConfig({});
    expect(config.threshold).toBeUndefined();
    expect(config.coverage).toBeUndefined();
    expect(config.format).toBeUndefined();
    expect(config.noColor).toBe(false);
  });

  it("config file values override defaults", () => {
    const config = resolveConfig({
      fileConfig: { threshold: 15, coverageMetric: "branch" },
    });
    expect(config.threshold).toBe(15);
    expect(config.coverageMetric).toBe("branch");
  });

  it("env vars override config file values", () => {
    const config = resolveConfig({
      fileConfig: { threshold: 15 },
      env: { CRAP4TS_THRESHOLD: "20" },
    });
    expect(config.threshold).toBe(20);
  });

  it("CLI flags override env vars", () => {
    const config = resolveConfig({
      fileConfig: { threshold: 15 },
      env: { CRAP4TS_THRESHOLD: "20" },
      cliFlags: { threshold: 25 },
    });
    expect(config.threshold).toBe(25);
  });

  it("CLI flags override everything", () => {
    const config = resolveConfig({
      fileConfig: {
        threshold: 10,
        coverageMetric: "branch",
        include: ["legacy/**"],
        exclude: ["tmp/**"],
        thresholds: { "old/**": 30 },
      },
      env: {
        CRAP4TS_THRESHOLD: "20",
        CRAP4TS_FORMAT: "json",
        CRAP4TS_COVERAGE: "/env/coverage.json",
      },
      cliFlags: {
        threshold: 25,
        coverage: "/cli/coverage.json",
        format: "markdown",
      },
    });
    expect(config.threshold).toBe(25);
    expect(config.coverage).toBe("/cli/coverage.json");
    expect(config.format).toBe("markdown");
    // File-only fields still come through
    expect(config.coverageMetric).toBe("branch");
    expect(config.include).toEqual(["legacy/**"]);
    expect(config.exclude).toEqual(["tmp/**"]);
    expect(config.thresholds).toEqual({ "old/**": 30 });
  });

  it("partial CLI flags don't wipe env/config values", () => {
    const config = resolveConfig({
      fileConfig: { threshold: 10, coverageMetric: "branch" },
      env: { CRAP4TS_FORMAT: "json" },
      cliFlags: { threshold: 25 },
    });
    expect(config.threshold).toBe(25);
    expect(config.coverageMetric).toBe("branch");
    expect(config.format).toBe("json");
  });
});

// ── configToThresholdConfig ──────────────────────────────────────────

describe("configToThresholdConfig", () => {
  it("converts simple threshold to ThresholdConfig", () => {
    const tc = configToThresholdConfig({ threshold: 15 });
    expect(tc.defaultThreshold).toBe(15);
    expect(tc.overrides).toEqual([]);
  });

  it("uses default threshold of 12 when none specified", () => {
    const tc = configToThresholdConfig({});
    expect(tc.defaultThreshold).toBe(12);
  });

  it("converts thresholds map to overrides", () => {
    const tc = configToThresholdConfig({
      threshold: 15,
      thresholds: { "src/domain/**": 8, "src/legacy/**": 30 },
    });
    expect(tc.defaultThreshold).toBe(15);
    expect(tc.overrides).toEqual([
      { glob: "src/domain/**", threshold: 8 },
      { glob: "src/legacy/**", threshold: 30 },
    ]);
  });

  it("works with only thresholds (no base threshold)", () => {
    const tc = configToThresholdConfig({
      thresholds: { "legacy/**": 30 },
    });
    expect(tc.defaultThreshold).toBe(12);
    expect(tc.overrides).toEqual([{ glob: "legacy/**", threshold: 30 }]);
  });
});
