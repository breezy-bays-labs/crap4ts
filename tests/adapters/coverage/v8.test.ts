import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { V8CoverageAdapter } from "../../../src/adapters/coverage/v8.js";

function loadFixture(): unknown {
  return JSON.parse(
    readFileSync("tests/fixtures/v8-coverage.json", "utf-8"),
  );
}

describe("V8CoverageAdapter", () => {
  const adapter = new V8CoverageAdapter("/projects/my-app");

  describe("parse()", () => {
    it("returns a Map keyed by project-relative forward-slash paths", () => {
      const result = adapter.parse(loadFixture());
      expect(result).toBeInstanceOf(Map);
      expect([...result.keys()]).toEqual(
        expect.arrayContaining(["src/math.ts", "src/utils/format.ts"]),
      );
    });

    it("groups functions by file", () => {
      const result = adapter.parse(loadFixture());
      expect(result.get("src/math.ts")).toHaveLength(3);
      expect(result.get("src/utils/format.ts")).toHaveLength(1);
    });
  });

  describe("function extraction", () => {
    it("extracts function names from V8 functions array", () => {
      const result = adapter.parse(loadFixture());
      const names = result.get("src/math.ts")!.map((f) => f.name);
      expect(names).toEqual(["add", "divide", "neverCalled"]);
    });

    it("sets filePath to project-relative forward-slash path on each function", () => {
      const result = adapter.parse(loadFixture());
      const fns = result.get("src/math.ts")!;
      for (const fn of fns) {
        expect(fn.filePath).toBe("src/math.ts");
      }
    });

    it("computes approximate spans from byte offsets (~40 chars/line)", () => {
      const result = adapter.parse(loadFixture());
      const add = result.get("src/math.ts")!.find((f) => f.name === "add")!;
      // startOffset=0 → startLine=1, endOffset=120 → endLine=ceil(120/40)+1=4
      expect(add.span.startLine).toBe(1);
      expect(add.span.endLine).toBe(4);
      expect(add.span.startColumn).toBe(0);
      expect(add.span.endColumn).toBe(0);
    });
  });

  describe("line coverage (byte-based)", () => {
    it("computes 100% coverage for fully-covered function", () => {
      const result = adapter.parse(loadFixture());
      const add = result.get("src/math.ts")!.find((f) => f.name === "add")!;
      // outer range {0,120,10}, sub-range {20,80,10} — no count=0 ranges
      expect(add.lineCoverage).toEqual({
        covered: 120,
        total: 120,
        percent: 100,
      });
    });

    it("computes partial coverage when sub-ranges have count=0", () => {
      const result = adapter.parse(loadFixture());
      const divide = result
        .get("src/math.ts")!
        .find((f) => f.name === "divide")!;
      // outer {121,360,5}, subs {160,240,3}, {241,320,0}
      // total=239, uncovered=79 (320-241), covered=160
      expect(divide.lineCoverage.total).toBe(239);
      expect(divide.lineCoverage.covered).toBe(160);
      expect(divide.lineCoverage.percent).toBe(66.95);
    });

    it("computes 0% coverage for completely uncovered function", () => {
      const result = adapter.parse(loadFixture());
      const neverCalled = result
        .get("src/math.ts")!
        .find((f) => f.name === "neverCalled")!;
      // single range {361,480,0}
      expect(neverCalled.lineCoverage).toEqual({
        covered: 0,
        total: 119,
        percent: 0,
      });
    });

    it("computes 100% for function with only covered ranges", () => {
      const result = adapter.parse(loadFixture());
      const formatName = result
        .get("src/utils/format.ts")!
        .find((f) => f.name === "formatName")!;
      expect(formatName.lineCoverage).toEqual({
        covered: 100,
        total: 100,
        percent: 100,
      });
    });
  });

  describe("branch coverage", () => {
    it("returns null — raw V8 coverage lacks branch semantics", () => {
      const result = adapter.parse(loadFixture());
      const divide = result
        .get("src/math.ts")!
        .find((f) => f.name === "divide")!;
      expect(divide.branchCoverage).toBeNull();
    });
  });

  describe("path normalization", () => {
    it("strips file:// prefix and cwd to produce forward-slash relative paths", () => {
      const result = adapter.parse(loadFixture());
      const keys = [...result.keys()];
      for (const key of keys) {
        expect(key).not.toMatch(/^file:/);
        expect(key).not.toMatch(/^\//);
        expect(key).not.toContain("\\");
      }
    });

    it("auto-detects common prefix when no cwd provided", () => {
      const autoAdapter = new V8CoverageAdapter();
      const result = autoAdapter.parse(loadFixture());
      // Common prefix of /projects/my-app/src/math.ts and /projects/my-app/src/utils/format.ts
      // is /projects/my-app/src/ → relative paths are math.ts and utils/format.ts
      expect([...result.keys()]).toEqual(
        expect.arrayContaining(["math.ts", "utils/format.ts"]),
      );
    });
  });

  describe("edge cases", () => {
    it("throws on non-object input", () => {
      expect(() => adapter.parse("not-an-object")).toThrow();
      expect(() => adapter.parse(null)).toThrow();
      expect(() => adapter.parse(42)).toThrow();
    });

    it("throws when result array is missing", () => {
      expect(() => adapter.parse({})).toThrow();
      expect(() => adapter.parse({ result: "bad" })).toThrow();
    });

    it("returns empty Map for empty result array", () => {
      const result = adapter.parse({ result: [] });
      expect(result.size).toBe(0);
    });

    it("skips anonymous functions (empty functionName)", () => {
      const data = {
        result: [
          {
            scriptId: "1",
            url: "file:///projects/my-app/src/anon.ts",
            functions: [
              {
                functionName: "",
                ranges: [{ startOffset: 0, endOffset: 100, count: 1 }],
                isBlockCoverage: true,
              },
              {
                functionName: "named",
                ranges: [{ startOffset: 101, endOffset: 200, count: 1 }],
                isBlockCoverage: true,
              },
            ],
          },
        ],
      };
      const result = adapter.parse(data);
      const fns = result.get("src/anon.ts")!;
      expect(fns).toHaveLength(1);
      expect(fns[0]!.name).toBe("named");
    });

    it("handles function with empty ranges gracefully", () => {
      const data = {
        result: [
          {
            scriptId: "1",
            url: "file:///projects/my-app/src/empty.ts",
            functions: [
              {
                functionName: "emptyRanges",
                ranges: [],
                isBlockCoverage: true,
              },
            ],
          },
        ],
      };
      const result = adapter.parse(data);
      const fns = result.get("src/empty.ts")!;
      expect(fns).toHaveLength(0);
    });

    it("handles Windows-style file:/// URLs", () => {
      const winAdapter = new V8CoverageAdapter("C:/Users/dev/project");
      const data = {
        result: [
          {
            scriptId: "1",
            url: "file:///C:/Users/dev/project/src/mod.ts",
            functions: [
              {
                functionName: "winFn",
                ranges: [{ startOffset: 0, endOffset: 80, count: 1 }],
                isBlockCoverage: true,
              },
            ],
          },
        ],
      };
      const result = winAdapter.parse(data);
      expect([...result.keys()]).toContain("src/mod.ts");
    });
  });
});
