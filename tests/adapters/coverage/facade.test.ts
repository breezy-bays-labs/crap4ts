import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import {
  parseCoverage,
  parseCoverageFile,
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

// ── parseCoverage (sync, data-only) ──────────────────────────────

describe("parseCoverage", () => {
  // --- Data input ---

  it("parses Istanbul coverage from a data object", () => {
    const result = parseCoverage(istanbulData);

    expect(result.coverage).toBeInstanceOf(Map);
    expect(result.coverage.size).toBeGreaterThan(0);
    for (const [, functions] of result.coverage) {
      expect(functions.length).toBeGreaterThan(0);
      expect(functions[0]).toHaveProperty("filePath");
      expect(functions[0]).toHaveProperty("lineCoverage");
    }
    expect(result.warnings).toEqual([]);
  });

  it("parses V8 coverage from a data object", () => {
    const result = parseCoverage(v8Data);

    expect(result.coverage).toBeInstanceOf(Map);
    expect(result.coverage.size).toBeGreaterThan(0);
  });

  // --- Format detection ---

  it("auto-detects format when not specified", () => {
    const result = parseCoverage(istanbulData);
    const keys = [...result.coverage.keys()];
    expect(keys.some((k) => k.includes("math.ts"))).toBe(true);
  });

  it("explicit format overrides detection", () => {
    const result = parseCoverage(istanbulData, { format: "istanbul" });
    expect(result.coverage.size).toBeGreaterThan(0);
  });

  // --- Sources option ---

  it("V8 coverage with sources suppresses approximate-span warnings", () => {
    const initial = parseCoverage(v8Data);
    const fileKeys = [...initial.coverage.keys()];

    const sources = new Map<string, string>();
    const dummySource = Array.from({ length: 500 }, (_, i) =>
      `line ${i + 1}: ${"x".repeat(40)}`,
    ).join("\n");
    for (const key of fileKeys) {
      sources.set(key, dummySource);
    }

    const result = parseCoverage(v8Data, { sources });
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

  // --- cwd option ---

  it("cwd option uses deterministic path resolution", () => {
    // Istanbul fixture has absolute paths like /projects/my-app/src/math.ts
    const result = parseCoverage(istanbulData, { cwd: "/projects/my-app" });
    const keys = [...result.coverage.keys()];
    // Paths should be relative to the cwd
    expect(keys.some((k) => k === "src/math.ts")).toBe(true);
  });

  // --- Warnings ---

  it("passes through warnings from the coverage adapter", () => {
    const result = parseCoverage(v8Data);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  // --- Error handling (sync) ---

  it("throws UnsupportedFormatError for unknown format", () => {
    expect(() => parseCoverage({ someRandomKey: 42 })).toThrow(
      UnsupportedFormatError,
    );
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

  it("throws CoverageParseError for format mismatch with cause", () => {
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

  // --- cwd heuristic ---

  it("without cwd uses heuristic path resolution", () => {
    // Without cwd, adapter uses longest common prefix heuristic
    const result = parseCoverage(istanbulData);
    const keys = [...result.coverage.keys()];
    // Paths should still be resolved (not raw absolute paths)
    expect(keys.every((k) => !k.startsWith("/"))).toBe(true);
  });

  // --- Edge cases ---

  it("empty Istanbul coverage data returns empty map", () => {
    const emptyData = {};
    const result = parseCoverage(emptyData, { format: "istanbul" });
    expect(result.coverage.size).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it("single-file Istanbul coverage data parses correctly", () => {
    // Extract just one file entry from Istanbul fixture
    const firstKey = Object.keys(istanbulData)[0]!;
    const singleFile = { [firstKey]: istanbulData[firstKey] };
    const result = parseCoverage(singleFile);
    expect(result.coverage.size).toBe(1);
  });

  it("V8 result-wrapped object parses correctly", () => {
    // v8Data is already { result: [...] } format
    expect(v8Data).toHaveProperty("result");
    const result = parseCoverage(v8Data);
    expect(result.coverage).toBeInstanceOf(Map);
    expect(result.coverage.size).toBeGreaterThan(0);
  });

  it("sources are forwarded uniformly to both formats", () => {
    const sources = new Map<string, string>([["test.ts", "const x = 1;"]]);
    // Istanbul — should accept without error
    const istanbulResult = parseCoverage(istanbulData, { sources });
    expect(istanbulResult.coverage.size).toBeGreaterThan(0);
    // V8 — should accept and use sources
    const v8Result = parseCoverage(v8Data, { sources });
    expect(v8Result.coverage.size).toBeGreaterThan(0);
  });
});

// ── parseCoverageFile (async, file path) ─────────────────────────

describe("parseCoverageFile", () => {
  it("parses Istanbul coverage from a file path", async () => {
    const filePath = join(FIXTURES_DIR, "istanbul-coverage.json");
    const result = await parseCoverageFile(filePath);

    expect(result.coverage).toBeInstanceOf(Map);
    expect(result.coverage.size).toBeGreaterThan(0);
    for (const [, functions] of result.coverage) {
      expect(functions.length).toBeGreaterThan(0);
      expect(functions[0]).toHaveProperty("filePath");
      expect(functions[0]).toHaveProperty("lineCoverage");
    }
    expect(result.warnings).toEqual([]);
  });

  it("parses V8 coverage from a file path", async () => {
    const filePath = join(FIXTURES_DIR, "v8-coverage.json");
    const result = await parseCoverageFile(filePath);

    expect(result.coverage).toBeInstanceOf(Map);
    expect(result.coverage.size).toBeGreaterThan(0);
  });

  it("delegates to sync parseCoverage — results match", async () => {
    const filePath = join(FIXTURES_DIR, "istanbul-coverage.json");
    const asyncResult = await parseCoverageFile(filePath);
    const syncResult = parseCoverage(istanbulData);

    expect([...asyncResult.coverage.keys()]).toEqual([...syncResult.coverage.keys()]);
    expect(asyncResult.warnings).toEqual(syncResult.warnings);
  });

  // --- Error handling (async) ---

  it("throws CoverageParseError for non-existent file", async () => {
    const badPath = "/nonexistent/path/coverage.json";
    try {
      await parseCoverageFile(badPath);
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

  it("throws CoverageParseError for invalid JSON file", async () => {
    const badFile = join(TMP_DIR, "bad.json");
    writeFileSync(badFile, "not valid json {{{");

    try {
      await parseCoverageFile(badFile);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(CoverageParseError);
      expect((error as CoverageParseError).name).toBe("CoverageParseError");
      expect((error as CoverageParseError).message).toContain("invalid JSON");
      expect((error as CoverageParseError).message).toContain(badFile);
      expect((error as CoverageParseError).filePath).toBe(badFile);
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
    const typed: CoveragePort = port;
    expect(typed).toBe(port);
  });

  it("accepts cwd parameter for path resolution", () => {
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

    const withoutSources = port.parse(v8Data);
    const approxWithout = withoutSources.warnings.filter(
      (w) => w.code === "approximate-span",
    );
    expect(approxWithout.length).toBeGreaterThan(0);

    const fileKeys = [...withoutSources.coverage.keys()];
    const sources = new Map<string, string>();
    const dummySource = Array.from({ length: 500 }, (_, i) =>
      `line ${i + 1}: ${"x".repeat(40)}`,
    ).join("\n");
    for (const key of fileKeys) {
      sources.set(key, dummySource);
    }

    const withSources = port.parse(v8Data, sources);
    const approxWith = withSources.warnings.filter(
      (w) => w.code === "approximate-span",
    );
    expect(approxWith).toHaveLength(0);
  });

  it("forwards sources to Istanbul adapter without error", () => {
    const port = createAutoDetectCoveragePort();
    const sources = new Map<string, string>([["test.ts", "const x = 1;"]]);

    const result = port.parse(istanbulData, sources);
    expect(result.coverage).toBeInstanceOf(Map);
    expect(result.coverage.size).toBeGreaterThan(0);
  });
});
