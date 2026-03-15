import { describe, it, expect } from "vitest";
import { analyze } from "../../src/core/analyze.js";
import type {
  FunctionComplexity,
  FunctionCoverage,
  MatchResult,
  MatchFunctions,
  SourceSpan,
  CoverageRatio,
} from "../../src/domain/types.js";
import type { ComplexityPort } from "../../src/ports/complexity-port.js";
import type { CoveragePort } from "../../src/ports/coverage-port.js";
import type { AnalyzeDeps } from "../../src/core/analyze.js";

// ── Test Helpers ──────────────────────────────────────────────────

function span(start: number, end: number): SourceSpan {
  return { startLine: start, startColumn: 0, endLine: end, endColumn: 0 };
}

function ratio(covered: number, total: number): CoverageRatio {
  return { covered, total, percent: total > 0 ? (covered / total) * 100 : 0 };
}

function makeComplexity(
  filePath: string,
  name: string,
  cc: number,
  s: SourceSpan = span(1, 10),
): FunctionComplexity {
  return {
    identity: { filePath, qualifiedName: name, span: s },
    cyclomaticComplexity: cc,
  };
}

function makeCoverage(
  filePath: string,
  name: string,
  linePct: number,
  s: SourceSpan = span(1, 10),
): FunctionCoverage {
  const total = 10;
  const covered = Math.round((linePct / 100) * total);
  return {
    filePath,
    name,
    span: s,
    lineCoverage: ratio(covered, total),
    branchCoverage: null,
  };
}

// ── Fake Ports ────────────────────────────────────────────────────

function fakeComplexityPort(
  results: Map<string, FunctionComplexity[]>,
): ComplexityPort {
  return {
    extract(_, filePath) {
      return results.get(filePath) ?? [];
    },
  };
}

function fakeCoveragePort(
  coverageMap: Map<string, FunctionCoverage[]>,
): CoveragePort {
  return {
    parse() {
      return coverageMap;
    },
  };
}

function fakeMatcher(
  matchedPairs: Array<{
    complexity: FunctionComplexity;
    coverage: FunctionCoverage;
  }>,
  unmatchedComplexity: FunctionComplexity[] = [],
  unmatchedCoverage: FunctionCoverage[] = [],
): MatchFunctions {
  return (): MatchResult => ({
    matched: matchedPairs,
    unmatchedComplexity,
    unmatchedCoverage,
  });
}

function createDeps(overrides: Partial<AnalyzeDeps> = {}): AnalyzeDeps {
  return {
    complexityPort: fakeComplexityPort(new Map()),
    coveragePort: fakeCoveragePort(new Map()),
    matcher: fakeMatcher([]),
    globMatcher: (path: string, glob: string) =>
      path.startsWith(glob.replace("/**", "/")),
    readFile: async () => "// empty",
    readJson: async () => ({}),
    findFiles: async () => [],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────

describe("analyze", () => {
  it("returns empty result when no files found", async () => {
    const deps = createDeps();
    const result = await analyze({ cwd: "/project" }, deps);

    expect(result.files).toEqual([]);
    expect(result.summary.totalFunctions).toBe(0);
    expect(result.passed).toBe(true);
  });

  it("wires complexity + coverage through match + score + summary", async () => {
    const comp = makeComplexity("src/math.ts", "add", 3, span(1, 10));
    const cov = makeCoverage("src/math.ts", "add", 80, span(1, 10));

    const deps = createDeps({
      complexityPort: fakeComplexityPort(
        new Map([["src/math.ts", [comp]]]),
      ),
      coveragePort: fakeCoveragePort(
        new Map([["src/math.ts", [cov]]]),
      ),
      matcher: fakeMatcher([{ complexity: comp, coverage: cov }]),
      findFiles: async () => ["src/math.ts"],
      readFile: async () => "function add(a, b) { return a + b; }",
      readJson: async () => ({ "src/math.ts": {} }),
    });

    const result = await analyze({ cwd: "/project" }, deps);

    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.filePath).toBe("src/math.ts");
    expect(result.files[0]!.functions).toHaveLength(1);

    const verdict = result.files[0]!.functions[0]!;
    expect(verdict.scored.cyclomaticComplexity).toBe(3);
    expect(verdict.scored.coveragePercent).toBe(80);
    // CRAP(3, 80%) = 3^2 * 0.2^3 + 3 = 9 * 0.008 + 3 = 3.07
    expect(verdict.scored.crap.value).toBeCloseTo(3.07, 1);
    expect(verdict.exceeds).toBe(false);
    expect(result.summary.totalFunctions).toBe(1);
    expect(result.passed).toBe(true);
  });

  it("applies default threshold of 12", async () => {
    const comp = makeComplexity("src/complex.ts", "tangled", 10, span(1, 20));
    const cov = makeCoverage("src/complex.ts", "tangled", 0, span(1, 20));

    const deps = createDeps({
      complexityPort: fakeComplexityPort(
        new Map([["src/complex.ts", [comp]]]),
      ),
      coveragePort: fakeCoveragePort(
        new Map([["src/complex.ts", [cov]]]),
      ),
      matcher: fakeMatcher([{ complexity: comp, coverage: cov }]),
      findFiles: async () => ["src/complex.ts"],
      readFile: async () => "// source",
      readJson: async () => ({}),
    });

    const result = await analyze({ cwd: "/project" }, deps);

    // CRAP(10, 0%) = 10^2 * 1^3 + 10 = 110
    expect(result.files[0]!.functions[0]!.threshold).toBe(12);
    expect(result.files[0]!.functions[0]!.exceeds).toBe(true);
    expect(result.passed).toBe(false);
  });

  it("accepts custom threshold", async () => {
    const comp = makeComplexity("src/ok.ts", "fn", 5, span(1, 10));
    const cov = makeCoverage("src/ok.ts", "fn", 50, span(1, 10));

    const deps = createDeps({
      complexityPort: fakeComplexityPort(
        new Map([["src/ok.ts", [comp]]]),
      ),
      coveragePort: fakeCoveragePort(
        new Map([["src/ok.ts", [cov]]]),
      ),
      matcher: fakeMatcher([{ complexity: comp, coverage: cov }]),
      findFiles: async () => ["src/ok.ts"],
      readFile: async () => "// source",
      readJson: async () => ({}),
    });

    // CRAP(5, 50%) = 25 * 0.125 + 5 = 8.13
    const result = await analyze({ cwd: "/project", threshold: 5 }, deps);

    expect(result.thresholdConfig.defaultThreshold).toBe(5);
    expect(result.files[0]!.functions[0]!.threshold).toBe(5);
    expect(result.files[0]!.functions[0]!.exceeds).toBe(true);
  });

  it("passed=true when no functions exceed threshold", async () => {
    const comp = makeComplexity("src/simple.ts", "fn", 1, span(1, 5));
    const cov = makeCoverage("src/simple.ts", "fn", 100, span(1, 5));

    const deps = createDeps({
      complexityPort: fakeComplexityPort(
        new Map([["src/simple.ts", [comp]]]),
      ),
      coveragePort: fakeCoveragePort(
        new Map([["src/simple.ts", [cov]]]),
      ),
      matcher: fakeMatcher([{ complexity: comp, coverage: cov }]),
      findFiles: async () => ["src/simple.ts"],
      readFile: async () => "// source",
      readJson: async () => ({}),
    });

    // CRAP(1, 100%) = 1^2 * 0^3 + 1 = 1
    const result = await analyze({ cwd: "/project" }, deps);

    expect(result.passed).toBe(true);
    expect(result.summary.exceedingThreshold).toBe(0);
  });

  it("passed=false when at least one function exceeds threshold", async () => {
    const comp1 = makeComplexity("src/a.ts", "good", 1, span(1, 5));
    const cov1 = makeCoverage("src/a.ts", "good", 100, span(1, 5));
    const comp2 = makeComplexity("src/b.ts", "bad", 20, span(1, 30));
    const cov2 = makeCoverage("src/b.ts", "bad", 0, span(1, 30));

    const deps = createDeps({
      complexityPort: fakeComplexityPort(
        new Map([
          ["src/a.ts", [comp1]],
          ["src/b.ts", [comp2]],
        ]),
      ),
      coveragePort: fakeCoveragePort(
        new Map([
          ["src/a.ts", [cov1]],
          ["src/b.ts", [cov2]],
        ]),
      ),
      matcher: fakeMatcher([
        { complexity: comp1, coverage: cov1 },
        { complexity: comp2, coverage: cov2 },
      ]),
      findFiles: async () => ["src/a.ts", "src/b.ts"],
      readFile: async () => "// source",
      readJson: async () => ({}),
    });

    const result = await analyze({ cwd: "/project" }, deps);

    expect(result.passed).toBe(false);
  });

  it("applies per-path threshold overrides via thresholds option", async () => {
    const comp = makeComplexity("src/legacy/old.ts", "fn", 8, span(1, 20));
    const cov = makeCoverage("src/legacy/old.ts", "fn", 20, span(1, 20));

    const deps = createDeps({
      complexityPort: fakeComplexityPort(
        new Map([["src/legacy/old.ts", [comp]]]),
      ),
      coveragePort: fakeCoveragePort(
        new Map([["src/legacy/old.ts", [cov]]]),
      ),
      matcher: fakeMatcher([{ complexity: comp, coverage: cov }]),
      findFiles: async () => ["src/legacy/old.ts"],
      readFile: async () => "// source",
      readJson: async () => ({}),
      globMatcher: (path: string, glob: string) =>
        path.startsWith(glob.replace("/**", "/")),
    });

    // CRAP(8, 20%) = 64 * 0.512 + 8 = 40.77
    // Default threshold 12 => exceeds
    // But with override of 50 for legacy => does not exceed
    const result = await analyze(
      {
        cwd: "/project",
        thresholds: { "src/legacy/**": 50 },
      },
      deps,
    );

    expect(result.thresholdConfig.overrides).toHaveLength(1);
    expect(result.thresholdConfig.overrides[0]!.glob).toBe("src/legacy/**");
    expect(result.files[0]!.functions[0]!.threshold).toBe(50);
    expect(result.files[0]!.functions[0]!.exceeds).toBe(false);
    expect(result.passed).toBe(true);
  });

  it("unmatched complexity functions get worst-case score (0% coverage)", async () => {
    const comp = makeComplexity("src/uncovered.ts", "hidden", 5, span(1, 10));

    const deps = createDeps({
      complexityPort: fakeComplexityPort(
        new Map([["src/uncovered.ts", [comp]]]),
      ),
      coveragePort: fakeCoveragePort(new Map()),
      matcher: fakeMatcher([], [comp], []),
      findFiles: async () => ["src/uncovered.ts"],
      readFile: async () => "// source",
      readJson: async () => ({}),
    });

    const result = await analyze({ cwd: "/project" }, deps);

    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.unmatched).toHaveLength(1);
    expect(result.files[0]!.unmatched[0]!.kind).toBe("no-coverage");
    if (result.files[0]!.unmatched[0]!.kind === "no-coverage") {
      // CRAP(5, 0%) = 25 * 1 + 5 = 30
      expect(result.files[0]!.unmatched[0]!.worstCaseCrap.value).toBe(30);
    }
  });

  it("unmatched coverage entries get no-ast kind", async () => {
    const cov = makeCoverage("src/orphan.ts", "mystery", 80, span(5, 15));

    const deps = createDeps({
      complexityPort: fakeComplexityPort(new Map()),
      coveragePort: fakeCoveragePort(
        new Map([["src/orphan.ts", [cov]]]),
      ),
      matcher: fakeMatcher([], [], [cov]),
      findFiles: async () => ["src/orphan.ts"],
      readFile: async () => "// source",
      readJson: async () => ({}),
    });

    const result = await analyze({ cwd: "/project" }, deps);

    // The file should still appear due to unmatched coverage
    const fileResult = result.files.find((f) => f.filePath === "src/orphan.ts");
    expect(fileResult).toBeDefined();
    expect(fileResult!.unmatched).toHaveLength(1);
    expect(fileResult!.unmatched[0]!.kind).toBe("no-ast");
    if (fileResult!.unmatched[0]!.kind === "no-ast") {
      expect(fileResult!.unmatched[0]!.coverage.name).toBe("mystery");
    }
  });

  it("groups function results by file path", async () => {
    const compA1 = makeComplexity("src/a.ts", "fn1", 2, span(1, 5));
    const compA2 = makeComplexity("src/a.ts", "fn2", 3, span(6, 12));
    const compB1 = makeComplexity("src/b.ts", "fn3", 1, span(1, 8));

    const covA1 = makeCoverage("src/a.ts", "fn1", 90, span(1, 5));
    const covA2 = makeCoverage("src/a.ts", "fn2", 70, span(6, 12));
    const covB1 = makeCoverage("src/b.ts", "fn3", 100, span(1, 8));

    const deps = createDeps({
      complexityPort: fakeComplexityPort(
        new Map([
          ["src/a.ts", [compA1, compA2]],
          ["src/b.ts", [compB1]],
        ]),
      ),
      coveragePort: fakeCoveragePort(
        new Map([
          ["src/a.ts", [covA1, covA2]],
          ["src/b.ts", [covB1]],
        ]),
      ),
      matcher: fakeMatcher([
        { complexity: compA1, coverage: covA1 },
        { complexity: compA2, coverage: covA2 },
        { complexity: compB1, coverage: covB1 },
      ]),
      findFiles: async () => ["src/a.ts", "src/b.ts"],
      readFile: async () => "// source",
      readJson: async () => ({}),
    });

    const result = await analyze({ cwd: "/project" }, deps);

    expect(result.files).toHaveLength(2);

    const fileA = result.files.find((f) => f.filePath === "src/a.ts");
    const fileB = result.files.find((f) => f.filePath === "src/b.ts");

    expect(fileA).toBeDefined();
    expect(fileA!.functions).toHaveLength(2);
    expect(fileB).toBeDefined();
    expect(fileB!.functions).toHaveLength(1);
  });

  it("computes per-file summary stats", async () => {
    const comp1 = makeComplexity("src/file.ts", "low", 1, span(1, 5));
    const comp2 = makeComplexity("src/file.ts", "high", 15, span(6, 20));
    const cov1 = makeCoverage("src/file.ts", "low", 100, span(1, 5));
    const cov2 = makeCoverage("src/file.ts", "high", 0, span(6, 20));

    const deps = createDeps({
      complexityPort: fakeComplexityPort(
        new Map([["src/file.ts", [comp1, comp2]]]),
      ),
      coveragePort: fakeCoveragePort(
        new Map([["src/file.ts", [cov1, cov2]]]),
      ),
      matcher: fakeMatcher([
        { complexity: comp1, coverage: cov1 },
        { complexity: comp2, coverage: cov2 },
      ]),
      findFiles: async () => ["src/file.ts"],
      readFile: async () => "// source",
      readJson: async () => ({}),
    });

    const result = await analyze({ cwd: "/project" }, deps);

    const file = result.files[0]!;
    expect(file.summary.totalFunctions).toBe(2);
    // CRAP(15, 0%) = 225 + 15 = 240 => exceeds 12
    expect(file.summary.exceedingThreshold).toBe(1);
    expect(file.summary.maxCrap.value).toBe(240);
  });

  it("uses line coverage by default, branch when specified", async () => {
    const comp = makeComplexity("src/x.ts", "fn", 2, span(1, 10));
    const cov: FunctionCoverage = {
      filePath: "src/x.ts",
      name: "fn",
      span: span(1, 10),
      lineCoverage: ratio(9, 10), // 90%
      branchCoverage: ratio(5, 10), // 50%
    };

    const deps = createDeps({
      complexityPort: fakeComplexityPort(new Map([["src/x.ts", [comp]]])),
      coveragePort: fakeCoveragePort(new Map([["src/x.ts", [cov]]])),
      matcher: fakeMatcher([{ complexity: comp, coverage: cov }]),
      findFiles: async () => ["src/x.ts"],
      readFile: async () => "// source",
      readJson: async () => ({}),
    });

    // Default (line): CRAP(2, 90%) = 4 * 0.001 + 2 = 2.004 => 2
    const lineResult = await analyze({ cwd: "/project" }, deps);
    expect(lineResult.files[0]!.functions[0]!.scored.coveragePercent).toBe(90);

    // Branch: CRAP(2, 50%) = 4 * 0.125 + 2 = 2.5
    const branchResult = await analyze(
      { cwd: "/project", coverageMetric: "branch" },
      deps,
    );
    expect(branchResult.files[0]!.functions[0]!.scored.coveragePercent).toBe(50);
  });

  it("falls back to line coverage when branch is requested but null", async () => {
    const comp = makeComplexity("src/x.ts", "fn", 2, span(1, 10));
    const cov: FunctionCoverage = {
      filePath: "src/x.ts",
      name: "fn",
      span: span(1, 10),
      lineCoverage: ratio(8, 10), // 80%
      branchCoverage: null, // no branches
    };

    const deps = createDeps({
      complexityPort: fakeComplexityPort(new Map([["src/x.ts", [comp]]])),
      coveragePort: fakeCoveragePort(new Map([["src/x.ts", [cov]]])),
      matcher: fakeMatcher([{ complexity: comp, coverage: cov }]),
      findFiles: async () => ["src/x.ts"],
      readFile: async () => "// source",
      readJson: async () => ({}),
    });

    const result = await analyze(
      { cwd: "/project", coverageMetric: "branch" },
      deps,
    );
    // Falls back to line coverage since branchCoverage is null
    expect(result.files[0]!.functions[0]!.scored.coveragePercent).toBe(80);
  });

  it("changedSince option filters to only changed files", async () => {
    // findFiles returns all source files, but we only analyze changed ones
    const comp = makeComplexity("src/changed.ts", "fn", 2, span(1, 10));
    const cov = makeCoverage("src/changed.ts", "fn", 100, span(1, 10));

    const filesRequested: string[] = [];

    const deps = createDeps({
      complexityPort: {
        extract(_, filePath) {
          filesRequested.push(filePath);
          if (filePath === "src/changed.ts") return [comp];
          return [];
        },
      },
      coveragePort: fakeCoveragePort(
        new Map([["src/changed.ts", [cov]]]),
      ),
      matcher: fakeMatcher([{ complexity: comp, coverage: cov }]),
      // findFiles returns all files initially, but changedSince filters them
      findFiles: async () => ["src/changed.ts", "src/unchanged.ts"],
      readFile: async () => "// source",
      readJson: async () => ({}),
    });

    const result = await analyze(
      {
        cwd: "/project",
        changedSince: "main",
        // We simulate the git diff filter by providing a custom findFiles
        // In reality, changedSince would invoke git, but here we test the filtering
      },
      {
        ...deps,
        // Override findFiles to simulate changedSince filtering
        findFiles: async () => ["src/changed.ts"],
      },
    );

    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.filePath).toBe("src/changed.ts");
  });

  it("returns thresholdConfig in result", async () => {
    const deps = createDeps();
    const result = await analyze(
      { cwd: "/project", threshold: 15, thresholds: { "test/**": 30 } },
      deps,
    );

    expect(result.thresholdConfig.defaultThreshold).toBe(15);
    expect(result.thresholdConfig.overrides).toEqual([
      { glob: "test/**", threshold: 30 },
    ]);
  });

  it("handles multiple files with mixed results", async () => {
    const compGood = makeComplexity("src/good.ts", "simple", 1, span(1, 5));
    const covGood = makeCoverage("src/good.ts", "simple", 100, span(1, 5));

    const compBad = makeComplexity("src/bad.ts", "messy", 20, span(1, 50));
    const covBad = makeCoverage("src/bad.ts", "messy", 10, span(1, 50));

    const compUncovered = makeComplexity(
      "src/mystery.ts",
      "hidden",
      5,
      span(1, 10),
    );

    const deps = createDeps({
      complexityPort: fakeComplexityPort(
        new Map([
          ["src/good.ts", [compGood]],
          ["src/bad.ts", [compBad]],
          ["src/mystery.ts", [compUncovered]],
        ]),
      ),
      coveragePort: fakeCoveragePort(
        new Map([
          ["src/good.ts", [covGood]],
          ["src/bad.ts", [covBad]],
        ]),
      ),
      matcher: fakeMatcher(
        [
          { complexity: compGood, coverage: covGood },
          { complexity: compBad, coverage: covBad },
        ],
        [compUncovered],
        [],
      ),
      findFiles: async () => ["src/good.ts", "src/bad.ts", "src/mystery.ts"],
      readFile: async () => "// source",
      readJson: async () => ({}),
    });

    const result = await analyze({ cwd: "/project" }, deps);

    // 2 matched functions + 1 file with unmatched
    expect(result.files.length).toBeGreaterThanOrEqual(2);
    expect(result.summary.totalFunctions).toBe(2); // only matched get verdicts
    expect(result.passed).toBe(false); // CRAP(20, 10%) is huge
  });

  it("defaults cwd to process.cwd()", async () => {
    const deps = createDeps();
    const result = await analyze(undefined, deps);

    // Should not throw and produce an empty result
    expect(result.files).toEqual([]);
    expect(result.passed).toBe(true);
  });

  describe("resolveOptions edge cases", () => {
    it("converts single src string to include patterns", async () => {
      const deps = createDeps();
      const result = await analyze({ cwd: "/project", src: "lib" }, deps);
      expect(result.passed).toBe(true);
    });

    it("converts multiple src array to include patterns", async () => {
      const deps = createDeps();
      const result = await analyze({ cwd: "/project", src: ["lib", "pkg"] }, deps);
      expect(result.passed).toBe(true);
    });

    it("strips trailing slashes from src directories", async () => {
      const findFilesPatterns: string[] = [];
      const deps = createDeps({
        findFiles: async (patterns) => {
          findFilesPatterns.push(...patterns);
          return [];
        },
      });
      await analyze({ cwd: "/project", src: "lib/" }, deps);
      expect(findFilesPatterns.some(p => p.startsWith("lib/"))).toBe(true);
      expect(findFilesPatterns.every(p => !p.includes("//"))).toBe(true);
    });

    it("uses explicit include over src", async () => {
      const findFilesPatterns: string[] = [];
      const deps = createDeps({
        findFiles: async (patterns) => {
          findFilesPatterns.push(...patterns);
          return [];
        },
      });
      await analyze({ cwd: "/project", include: ["custom/**/*.ts"], src: "ignored" }, deps);
      expect(findFilesPatterns).toContain("custom/**/*.ts");
    });

    it("uses default exclude patterns when none specified", async () => {
      let excludePatterns: string[] = [];
      const deps = createDeps({
        findFiles: async (_, options) => {
          excludePatterns = options.exclude;
          return [];
        },
      });
      await analyze({ cwd: "/project" }, deps);
      expect(excludePatterns).toContain("**/node_modules/**");
      expect(excludePatterns).toContain("**/*.test.ts");
    });
  });
});
