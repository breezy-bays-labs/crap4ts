import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import {
  parseCoverage,
  createAutoDetectCoveragePort,
  CoverageParseError,
  UnsupportedFormatError,
} from "../../../src/adapters/coverage/facade.js";
import type { CoveragePort } from "../../../src/ports/coverage-port.js";

const FIXTURES_DIR = join(__dirname, "../../fixtures");
const TMP_DIR = join(__dirname, "../../.tmp-facade");

// Load fixture data as objects for in-memory tests
const istanbulData = JSON.parse(
  readFileSync(join(FIXTURES_DIR, "istanbul-coverage.json"), "utf-8"),
);
const v8Data = JSON.parse(
  readFileSync(join(FIXTURES_DIR, "v8-coverage.json"), "utf-8"),
);

beforeAll(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe("parseCoverage", () => {
  // --- File path input ---

  it("parses Istanbul coverage from a file path", () => {
    const filePath = join(FIXTURES_DIR, "istanbul-coverage.json");
    const result = parseCoverage(filePath);

    expect(result.coverage).toBeInstanceOf(Map);
    expect(result.coverage.size).toBeGreaterThan(0);
    // Verify function entries are actually populated, not empty arrays
    for (const [, functions] of result.coverage) {
      expect(functions.length).toBeGreaterThan(0);
      expect(functions[0]).toHaveProperty("filePath");
      expect(functions[0]).toHaveProperty("lineCoverage");
    }
    expect(result.warnings).toEqual([]);
  });

  it("parses V8 coverage from a file path", () => {
    const filePath = join(FIXTURES_DIR, "v8-coverage.json");
    const result = parseCoverage(filePath);

    expect(result.coverage).toBeInstanceOf(Map);
    expect(result.coverage.size).toBeGreaterThan(0);
  });

  // --- Pre-loaded data input ---

  it("parses Istanbul coverage from a pre-loaded object", () => {
    const result = parseCoverage(istanbulData);

    expect(result.coverage).toBeInstanceOf(Map);
    expect(result.coverage.size).toBeGreaterThan(0);
  });

  it("parses V8 coverage from a pre-loaded object", () => {
    const result = parseCoverage(v8Data);

    expect(result.coverage).toBeInstanceOf(Map);
    expect(result.coverage.size).toBeGreaterThan(0);
  });

  // --- Format detection ---

  it("auto-detects format when not specified", () => {
    const result = parseCoverage(istanbulData);
    // Istanbul data has file paths as keys
    const keys = [...result.coverage.keys()];
    expect(keys.some((k) => k.includes("math.ts"))).toBe(true);
  });

  it("explicit format overrides detection", () => {
    // Force Istanbul parsing on Istanbul data (should work)
    const result = parseCoverage(istanbulData, { format: "istanbul" });
    expect(result.coverage.size).toBeGreaterThan(0);
  });

  // --- Sources option for V8 accuracy ---

  it("V8 coverage with sources option suppresses approximate-span warnings for matched files", () => {
    // First parse without sources to discover the relative file paths
    const initial = parseCoverage(v8Data);
    const fileKeys = [...initial.coverage.keys()];

    // Build sources map with matching keys and content long enough to cover the byte offsets
    const sources = new Map<string, string>();
    const dummySource = Array.from({ length: 500 }, (_, i) =>
      `line ${i + 1}: ${"x".repeat(40)}`,
    ).join("\n");
    for (const key of fileKeys) {
      sources.set(key, dummySource);
    }

    const result = parseCoverage(v8Data, { sources });

    // With sources provided for all files, approximate-span warnings should be gone
    const approxWarnings = result.warnings.filter(
      (w) => w.code === "approximate-span",
    );
    expect(approxWarnings).toHaveLength(0);
  });

  it("V8 coverage without sources emits approximate-span warning", () => {
    const result = parseCoverage(v8Data);

    const approxWarnings = result.warnings.filter(
      (w) => w.code === "approximate-span",
    );
    expect(approxWarnings.length).toBeGreaterThan(0);
  });

  // --- Warnings always returned ---

  it("passes through warnings from the coverage adapter", () => {
    // V8 without sources always emits approximate-span warnings
    const result = parseCoverage(v8Data);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  // --- Error handling ---

  it("throws UnsupportedFormatError for unknown format", () => {
    const unknownData = { someRandomKey: 42 };

    expect(() => parseCoverage(unknownData)).toThrow(UnsupportedFormatError);
  });

  it("UnsupportedFormatError message explains expected formats", () => {
    try {
      parseCoverage({ someRandomKey: 42 });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedFormatError);
      expect((error as UnsupportedFormatError).message).toMatch(/istanbul/i);
      expect((error as UnsupportedFormatError).message).toMatch(/v8/i);
    }
  });

  it("throws CoverageParseError for non-existent file with descriptive message", () => {
    const badPath = "/nonexistent/path/coverage.json";
    try {
      parseCoverage(badPath);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(CoverageParseError);
      expect((error as CoverageParseError).name).toBe("CoverageParseError");
      expect((error as CoverageParseError).message).toContain("Failed to read");
      expect((error as CoverageParseError).message).toContain(badPath);
      expect((error as CoverageParseError).filePath).toBe(badPath);
      expect((error as CoverageParseError).cause).toBeDefined();
    }
  });

  it("throws CoverageParseError for invalid JSON file with distinct message", () => {
    const badFile = join(TMP_DIR, "bad.json");
    writeFileSync(badFile, "not valid json {{{");

    try {
      parseCoverage(badFile);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(CoverageParseError);
      expect((error as CoverageParseError).name).toBe("CoverageParseError");
      // Must say "invalid JSON", not "Failed to read" — these are distinct failures
      expect((error as CoverageParseError).message).toContain("invalid JSON");
      expect((error as CoverageParseError).message).toContain(badFile);
      expect((error as CoverageParseError).filePath).toBe(badFile);
      expect((error as CoverageParseError).cause).toBeDefined();
    }
  });

  it("throws CoverageParseError for format mismatch with cause", () => {
    // Pass Istanbul data but force V8 format — V8 parser should fail
    try {
      parseCoverage(istanbulData, { format: "v8" });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(CoverageParseError);
      expect((error as CoverageParseError).name).toBe("CoverageParseError");
      expect((error as CoverageParseError).message).toContain("Failed to parse");
      expect((error as CoverageParseError).cause).toBeDefined();
    }
  });
});

// ── createAutoDetectCoveragePort (auto-detect-port.feature) ──────

describe("createAutoDetectCoveragePort", () => {
  // --- Factory creation (scenarios 1-2) ---

  it("creates a valid CoveragePort with parse method", () => {
    const port = createAutoDetectCoveragePort();
    expect(port).toBeDefined();
    expect(typeof port.parse).toBe("function");
    // Satisfies CoveragePort interface
    const typed: CoveragePort = port;
    expect(typed).toBe(port);
  });

  it("accepts cwd parameter for path resolution", () => {
    // Factory with cwd should create adapters that resolve paths relative to cwd
    const port = createAutoDetectCoveragePort("/some/project");
    expect(port).toBeDefined();
    expect(typeof port.parse).toBe("function");
  });

  // --- Format dispatch (scenarios 3-5) ---

  it("dispatches Istanbul data to Istanbul adapter", () => {
    const port = createAutoDetectCoveragePort();
    const result = port.parse(istanbulData);

    expect(result.coverage).toBeInstanceOf(Map);
    expect(result.coverage.size).toBeGreaterThan(0);
    // Istanbul data has file paths as keys
    const keys = [...result.coverage.keys()];
    expect(keys.some((k) => k.includes("math.ts"))).toBe(true);
  });

  it("dispatches V8 data to V8 adapter", () => {
    const port = createAutoDetectCoveragePort();
    const result = port.parse(v8Data);

    expect(result.coverage).toBeInstanceOf(Map);
    expect(result.coverage.size).toBeGreaterThan(0);
  });

  it("throws UnsupportedFormatError for unknown data", () => {
    const port = createAutoDetectCoveragePort();

    expect(() => port.parse({ someRandomKey: 42 })).toThrow(
      UnsupportedFormatError,
    );
  });

  // --- Sources forwarded uniformly (scenarios 6-7) ---

  it("forwards sources to V8 adapter", () => {
    const port = createAutoDetectCoveragePort();

    // Parse without sources — expect approximate-span warnings
    const withoutSources = port.parse(v8Data);
    const approxWithout = withoutSources.warnings.filter(
      (w) => w.code === "approximate-span",
    );
    expect(approxWithout.length).toBeGreaterThan(0);

    // Build sources map to suppress warnings
    const fileKeys = [...withoutSources.coverage.keys()];
    const sources = new Map<string, string>();
    const dummySource = Array.from({ length: 500 }, (_, i) =>
      `line ${i + 1}: ${"x".repeat(40)}`,
    ).join("\n");
    for (const key of fileKeys) {
      sources.set(key, dummySource);
    }

    // Parse with sources — approximate-span warnings should be suppressed
    const withSources = port.parse(v8Data, sources);
    const approxWith = withSources.warnings.filter(
      (w) => w.code === "approximate-span",
    );
    expect(approxWith).toHaveLength(0);
  });

  it("forwards sources to Istanbul adapter without error", () => {
    const port = createAutoDetectCoveragePort();
    const sources = new Map<string, string>([["test.ts", "const x = 1;"]]);

    // Istanbul currently ignores sources but should accept the parameter
    const result = port.parse(istanbulData, sources);
    expect(result.coverage).toBeInstanceOf(Map);
    expect(result.coverage.size).toBeGreaterThan(0);
  });
});
