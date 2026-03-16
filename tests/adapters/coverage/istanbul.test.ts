import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { IstanbulCoverageAdapter } from "../../../src/adapters/coverage/istanbul.js";

function loadFixture(): unknown {
  return JSON.parse(
    readFileSync("tests/fixtures/istanbul-coverage.json", "utf-8"),
  );
}

describe("IstanbulCoverageAdapter", () => {
  const adapter = new IstanbulCoverageAdapter("/projects/my-app");

  describe("parse()", () => {
    it("returns a Map keyed by project-relative forward-slash paths", () => {
      const result = adapter.parse(loadFixture()).coverage;
      expect(result).toBeInstanceOf(Map);
      expect([...result.keys()]).toEqual(
        expect.arrayContaining(["src/math.ts", "src/utils/format.ts"]),
      );
    });

    it("groups functions by file", () => {
      const result = adapter.parse(loadFixture()).coverage;
      expect(result.get("src/math.ts")).toHaveLength(3);
      expect(result.get("src/utils/format.ts")).toHaveLength(1);
    });
  });

  describe("fnMap → FunctionCoverage[]", () => {
    it("extracts function names from fnMap", () => {
      const result = adapter.parse(loadFixture()).coverage;
      const names = result.get("src/math.ts")!.map((f) => f.name);
      expect(names).toEqual(["add", "divide", "neverCalled"]);
    });

    it("converts inclusive endLine to exclusive (domainEndLine = sourceEndLine + 1)", () => {
      const result = adapter.parse(loadFixture()).coverage;
      const add = result.get("src/math.ts")!.find((f) => f.name === "add")!;
      // source loc.end.line = 3 → domain endLine = 4
      expect(add.span.endLine).toBe(4);
      expect(add.span.startLine).toBe(1);
    });

    it("sets filePath to project-relative forward-slash path", () => {
      const result = adapter.parse(loadFixture()).coverage;
      const fns = result.get("src/math.ts")!;
      for (const fn of fns) {
        expect(fn.filePath).toBe("src/math.ts");
      }
    });
  });

  describe("line coverage (statementMap + s)", () => {
    it("computes 100% line coverage for fully-covered function", () => {
      const result = adapter.parse(loadFixture()).coverage;
      const add = result.get("src/math.ts")!.find((f) => f.name === "add")!;
      // statement 0 (line 2) is within add (lines 1–3), s["0"] = 10
      expect(add.lineCoverage).toEqual({
        covered: 1,
        total: 1,
        percent: 100,
      });
    });

    it("computes correct line coverage for partially-covered function", () => {
      const result = adapter.parse(loadFixture()).coverage;
      const divide = result
        .get("src/math.ts")!
        .find((f) => f.name === "divide")!;
      // statements within divide (lines 5–10): s1 (line 6)=5, s2 (line 7)=3, s3 (line 9)=5
      // All 3 are covered (count > 0)
      expect(divide.lineCoverage).toEqual({
        covered: 3,
        total: 3,
        percent: 100,
      });
    });

    it("computes 0% line coverage for uncovered function", () => {
      const result = adapter.parse(loadFixture()).coverage;
      const neverCalled = result
        .get("src/math.ts")!
        .find((f) => f.name === "neverCalled")!;
      // statement 4 (line 13) is within neverCalled (lines 12–14), s["4"] = 0
      expect(neverCalled.lineCoverage).toEqual({
        covered: 0,
        total: 1,
        percent: 0,
      });
    });
  });

  describe("branch coverage (branchMap + b)", () => {
    it("computes branch coverage for function with if-branch", () => {
      const result = adapter.parse(loadFixture()).coverage;
      const divide = result
        .get("src/math.ts")!
        .find((f) => f.name === "divide")!;
      // branchMap "0" (line 6–8) is within divide (lines 5–10)
      // b["0"] = [3, 2] → 2 branches total, both covered (>0)
      expect(divide.branchCoverage).toEqual({
        covered: 2,
        total: 2,
        percent: 100,
      });
    });

    it("returns null branchCoverage when function has no branches", () => {
      const result = adapter.parse(loadFixture()).coverage;
      const add = result.get("src/math.ts")!.find((f) => f.name === "add")!;
      expect(add.branchCoverage).toBeNull();
    });

    it("returns null branchCoverage for file with no branches at all", () => {
      const result = adapter.parse(loadFixture()).coverage;
      const formatName = result
        .get("src/utils/format.ts")!
        .find((f) => f.name === "formatName")!;
      expect(formatName.branchCoverage).toBeNull();
    });
  });

  describe("path normalization", () => {
    it("strips cwd prefix and produces forward-slash paths", () => {
      const result = adapter.parse(loadFixture()).coverage;
      const keys = [...result.keys()];
      for (const key of keys) {
        expect(key).not.toMatch(/^\//);
        expect(key).not.toContain("\\");
      }
    });

    it("auto-detects common prefix when no cwd provided", () => {
      const autoAdapter = new IstanbulCoverageAdapter();
      const result = autoAdapter.parse(loadFixture()).coverage;
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

    it("returns empty Map for empty object", () => {
      const result = adapter.parse({}).coverage;
      expect(result.size).toBe(0);
    });

    it("handles function with zero statements gracefully", () => {
      const data = {
        "/projects/my-app/src/empty.ts": {
          path: "/projects/my-app/src/empty.ts",
          fnMap: {
            "0": {
              name: "noop",
              decl: {
                start: { line: 1, column: 16 },
                end: { line: 1, column: 20 },
              },
              loc: {
                start: { line: 1, column: 0 },
                end: { line: 2, column: 1 },
              },
            },
          },
          f: { "0": 0 },
          statementMap: {},
          s: {},
          branchMap: {},
          b: {},
        },
      };
      const result = adapter.parse(data).coverage;
      const noop = result.get("src/empty.ts")!.find((f) => f.name === "noop")!;
      expect(noop.lineCoverage).toEqual({
        covered: 0,
        total: 0,
        percent: 100,
      });
      expect(noop.branchCoverage).toBeNull();
    });
  });

  describe("warnings", () => {
    it("always returns empty warnings array", () => {
      const { warnings } = adapter.parse(loadFixture());
      expect(warnings).toEqual([]);
    });
  });
});
