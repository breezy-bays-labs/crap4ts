import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  V8CoverageAdapter,
  buildLineOffsetTable,
  byteOffsetToLineFromTable,
} from "../../../src/adapters/coverage/v8.js";

function loadFixture(): unknown {
  return JSON.parse(
    readFileSync("tests/fixtures/v8-coverage.json", "utf-8"),
  );
}

describe("V8CoverageAdapter", () => {
  const adapter = new V8CoverageAdapter("/projects/my-app");

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

  describe("function extraction", () => {
    it("extracts function names from V8 functions array", () => {
      const result = adapter.parse(loadFixture()).coverage;
      const names = result.get("src/math.ts")!.map((f) => f.name);
      expect(names).toEqual(["add", "divide", "neverCalled"]);
    });

    it("sets filePath to project-relative forward-slash path on each function", () => {
      const result = adapter.parse(loadFixture()).coverage;
      const fns = result.get("src/math.ts")!;
      for (const fn of fns) {
        expect(fn.filePath).toBe("src/math.ts");
      }
    });

    it("computes approximate spans from byte offsets (~40 chars/line)", () => {
      const result = adapter.parse(loadFixture()).coverage;
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
      const result = adapter.parse(loadFixture()).coverage;
      const add = result.get("src/math.ts")!.find((f) => f.name === "add")!;
      // outer range {0,120,10}, sub-range {20,80,10} — no count=0 ranges
      expect(add.lineCoverage).toEqual({
        covered: 120,
        total: 120,
        percent: 100,
      });
    });

    it("computes partial coverage when sub-ranges have count=0", () => {
      const result = adapter.parse(loadFixture()).coverage;
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
      const result = adapter.parse(loadFixture()).coverage;
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
      const result = adapter.parse(loadFixture()).coverage;
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
      const result = adapter.parse(loadFixture()).coverage;
      const divide = result
        .get("src/math.ts")!
        .find((f) => f.name === "divide")!;
      expect(divide.branchCoverage).toBeNull();
    });
  });

  describe("path normalization", () => {
    it("strips file:// prefix and cwd to produce forward-slash relative paths", () => {
      const result = adapter.parse(loadFixture()).coverage;
      const keys = [...result.keys()];
      for (const key of keys) {
        expect(key).not.toMatch(/^file:/);
        expect(key).not.toMatch(/^\//);
        expect(key).not.toContain("\\");
      }
    });

    it("auto-detects common prefix when no cwd provided", () => {
      const autoAdapter = new V8CoverageAdapter();
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

    it("throws when result array is missing", () => {
      expect(() => adapter.parse({})).toThrow();
      expect(() => adapter.parse({ result: "bad" })).toThrow();
    });

    it("returns empty Map for empty result array", () => {
      const result = adapter.parse({ result: [] }).coverage;
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
      const result = adapter.parse(data).coverage;
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
      const result = adapter.parse(data).coverage;
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
      const result = winAdapter.parse(data).coverage;
      expect([...result.keys()]).toContain("src/mod.ts");
    });
  });

  describe("three-tier line mapping", () => {
    const sourceContent = "function add(a, b) {\n  return a + b;\n}\n\nfunction sub(a, b) {\n  return a - b;\n}\n";
    // Line offsets: [0, 21, 37, 39, 40, 61, 77, 79]
    // Line 1: bytes 0-20   "function add(a, b) {"
    // Line 2: bytes 21-36  "  return a + b;"
    // Line 3: bytes 37-38  "}"
    // Line 4: bytes 39     ""
    // Line 5: bytes 40-60  "function sub(a, b) {"
    // Line 6: bytes 61-76  "  return a - b;"
    // Line 7: bytes 77-78  "}"

    it("uses line offset table (Tier 2) when source content is provided", () => {
      const data = {
        result: [
          {
            scriptId: "1",
            url: "file:///projects/my-app/src/math.ts",
            functions: [
              {
                functionName: "add",
                ranges: [{ startOffset: 0, endOffset: 38, count: 1 }],
                isBlockCoverage: true,
              },
              {
                functionName: "sub",
                ranges: [{ startOffset: 40, endOffset: 78, count: 1 }],
                isBlockCoverage: true,
              },
            ],
          },
        ],
      };

      const sources = new Map([["src/math.ts", sourceContent]]);
      const { coverage, warnings } = adapter.parse(data, sources);
      const fns = coverage.get("src/math.ts")!;

      // With source content, "add" starts at byte 0 → line 1, ends at byte 38 → line 3
      expect(fns[0]!.span.startLine).toBe(1);
      expect(fns[0]!.span.endLine).toBe(4); // exclusive

      // "sub" starts at byte 40 → line 5, ends at byte 78 → line 7
      expect(fns[1]!.span.startLine).toBe(5);
      expect(fns[1]!.span.endLine).toBe(8); // exclusive

      // No warnings since source was available
      expect(warnings).toHaveLength(0);
    });

    it("falls back to approximation (Tier 3) when no source content", () => {
      const data = {
        result: [
          {
            scriptId: "1",
            url: "file:///projects/my-app/src/unknown.ts",
            functions: [
              {
                functionName: "fn",
                ranges: [{ startOffset: 0, endOffset: 120, count: 1 }],
                isBlockCoverage: true,
              },
            ],
          },
        ],
      };

      const { coverage, warnings } = adapter.parse(data);
      const fns = coverage.get("src/unknown.ts")!;

      // Tier 3: startOffset=0 → line 1, endOffset=120 → ceil(120/40)+1=4
      expect(fns[0]!.span.startLine).toBe(1);
      expect(fns[0]!.span.endLine).toBe(4);

      // Warning emitted for approximate span
      expect(warnings).toHaveLength(1);
      expect(warnings[0]!.code).toBe("approximate-span");
      expect(warnings[0]!.file).toBe("src/unknown.ts");
    });

    it("emits one warning per file, not per function", () => {
      const data = {
        result: [
          {
            scriptId: "1",
            url: "file:///projects/my-app/src/multi.ts",
            functions: [
              {
                functionName: "fn1",
                ranges: [{ startOffset: 0, endOffset: 80, count: 1 }],
                isBlockCoverage: true,
              },
              {
                functionName: "fn2",
                ranges: [{ startOffset: 81, endOffset: 160, count: 1 }],
                isBlockCoverage: true,
              },
            ],
          },
        ],
      };

      const { warnings } = adapter.parse(data);
      expect(warnings).toHaveLength(1);
    });

    it("does not emit warning for files with source content", () => {
      const data = {
        result: [
          {
            scriptId: "1",
            url: "file:///projects/my-app/src/known.ts",
            functions: [
              {
                functionName: "fn",
                ranges: [{ startOffset: 0, endOffset: 20, count: 1 }],
                isBlockCoverage: true,
              },
            ],
          },
          {
            scriptId: "2",
            url: "file:///projects/my-app/src/unknown.ts",
            functions: [
              {
                functionName: "fn2",
                ranges: [{ startOffset: 0, endOffset: 20, count: 1 }],
                isBlockCoverage: true,
              },
            ],
          },
        ],
      };

      const sources = new Map([["src/known.ts", "const x = 1;\nconst y = 2;\n"]]);
      const { warnings } = adapter.parse(data, sources);

      // Only one warning for the file without source content
      expect(warnings).toHaveLength(1);
      expect(warnings[0]!.file).toBe("src/unknown.ts");
    });
  });
});

describe("buildLineOffsetTable", () => {
  it("returns [0] for empty source", () => {
    expect(buildLineOffsetTable("")).toEqual([0]);
  });

  it("returns correct offsets for multi-line source", () => {
    const source = "abc\ndef\nghi\n";
    // Line 1: bytes 0-3  "abc"
    // Line 2: bytes 4-7  "def"
    // Line 3: bytes 8-11 "ghi"
    // Line 4: byte 12    ""
    const table = buildLineOffsetTable(source);
    expect(table).toEqual([0, 4, 8, 12]);
  });

  it("handles source without trailing newline", () => {
    const source = "ab\ncd";
    expect(buildLineOffsetTable(source)).toEqual([0, 3]);
  });
});

describe("byteOffsetToLineFromTable", () => {
  const table = [0, 4, 8, 12]; // Lines at bytes 0, 4, 8, 12

  it("maps offset 0 to line 1", () => {
    expect(byteOffsetToLineFromTable(0, table)).toBe(1);
  });

  it("maps offset within first line to line 1", () => {
    expect(byteOffsetToLineFromTable(3, table)).toBe(1);
  });

  it("maps offset at line boundary to next line", () => {
    expect(byteOffsetToLineFromTable(4, table)).toBe(2);
  });

  it("maps offset within second line to line 2", () => {
    expect(byteOffsetToLineFromTable(6, table)).toBe(2);
  });

  it("maps offset past last line start to last line", () => {
    expect(byteOffsetToLineFromTable(15, table)).toBe(4);
  });
});
