import { describe, it, expect } from "vitest";
import { analyzeFile } from "../../src/core/analyze-file.js";
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
  results: FunctionComplexity[],
): ComplexityPort {
  return {
    extract() {
      return results;
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
    complexityPort: fakeComplexityPort([]),
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

describe("analyzeFile", () => {
  it("returns correct verdicts for a single file with known complexity + coverage", async () => {
    const comp = makeComplexity("src/math.ts", "add", 3, span(1, 10));
    const cov = makeCoverage("src/math.ts", "add", 80, span(1, 10));

    const deps = createDeps({
      complexityPort: fakeComplexityPort([comp]),
      coveragePort: fakeCoveragePort(
        new Map([["src/math.ts", [cov]]]),
      ),
      matcher: fakeMatcher([{ complexity: comp, coverage: cov }]),
      readFile: async () => "function add(a, b) { return a + b; }",
      readJson: async () => ({ "src/math.ts": {} }),
    });

    const verdicts = await analyzeFile(
      "src/math.ts",
      { coverage: "/project/coverage.json" },
      deps,
    );

    expect(verdicts).toHaveLength(1);

    const verdict = verdicts[0]!;
    expect(verdict.scored.identity.qualifiedName).toBe("add");
    expect(verdict.scored.cyclomaticComplexity).toBe(3);
    expect(verdict.scored.coveragePercent).toBe(80);
    // CRAP(3, 80%) = 3^2 * 0.2^3 + 3 = 9 * 0.008 + 3 = 3.07
    expect(verdict.scored.crap.value).toBeCloseTo(3.07, 1);
    expect(verdict.threshold).toBe(12); // default
    expect(verdict.exceeds).toBe(false);
  });

  it("scores all functions at 0% coverage when no coverage data is provided", async () => {
    const comp1 = makeComplexity("src/utils.ts", "parse", 5, span(1, 10));
    const comp2 = makeComplexity("src/utils.ts", "format", 3, span(11, 20));

    const deps = createDeps({
      complexityPort: fakeComplexityPort([comp1, comp2]),
      // No coverage data — matcher will put everything in unmatchedComplexity
      matcher: fakeMatcher([], [comp1, comp2]),
      readFile: async () => "// source",
    });

    const verdicts = await analyzeFile("src/utils.ts", undefined, deps);

    expect(verdicts).toHaveLength(2);

    // CRAP(5, 0%) = 25 * 1 + 5 = 30
    const parseVerdict = verdicts.find(
      (v) => v.scored.identity.qualifiedName === "parse",
    )!;
    expect(parseVerdict.scored.coveragePercent).toBe(0);
    expect(parseVerdict.scored.crap.value).toBe(30);
    expect(parseVerdict.exceeds).toBe(true); // 30 > 12

    // CRAP(3, 0%) = 9 * 1 + 3 = 12
    const formatVerdict = verdicts.find(
      (v) => v.scored.identity.qualifiedName === "format",
    )!;
    expect(formatVerdict.scored.coveragePercent).toBe(0);
    expect(formatVerdict.scored.crap.value).toBe(12);
    expect(formatVerdict.exceeds).toBe(false); // 12 is not > 12
  });

  it("applies custom threshold correctly", async () => {
    const comp = makeComplexity("src/core.ts", "process", 4, span(1, 15));
    const cov = makeCoverage("src/core.ts", "process", 50, span(1, 15));

    const deps = createDeps({
      complexityPort: fakeComplexityPort([comp]),
      coveragePort: fakeCoveragePort(
        new Map([["src/core.ts", [cov]]]),
      ),
      matcher: fakeMatcher([{ complexity: comp, coverage: cov }]),
      readFile: async () => "// source",
      readJson: async () => ({}),
    });

    // CRAP(4, 50%) = 16 * 0.125 + 4 = 6
    // With threshold 5 => exceeds
    const verdicts = await analyzeFile(
      "src/core.ts",
      { coverage: "/project/coverage.json", threshold: 5 },
      deps,
    );

    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]!.threshold).toBe(5);
    expect(verdicts[0]!.scored.crap.value).toBe(6);
    expect(verdicts[0]!.exceeds).toBe(true);

    // With threshold 10 => does not exceed
    const lenientVerdicts = await analyzeFile(
      "src/core.ts",
      { coverage: "/project/coverage.json", threshold: 10 },
      deps,
    );

    expect(lenientVerdicts[0]!.threshold).toBe(10);
    expect(lenientVerdicts[0]!.exceeds).toBe(false);
  });

  it("returns empty array when file has no functions", async () => {
    const deps = createDeps({
      complexityPort: fakeComplexityPort([]),
      readFile: async () => "const x = 42;",
    });

    const verdicts = await analyzeFile("src/constants.ts", undefined, deps);
    expect(verdicts).toEqual([]);
  });

  it("propagates coverage file read failure as an error", async () => {
    const comp = makeComplexity("src/risky.ts", "fn", 4, span(1, 10));

    const deps = createDeps({
      complexityPort: fakeComplexityPort([comp]),
      readJson: async () => {
        throw new Error("File not found");
      },
      matcher: fakeMatcher([], [comp]),
      readFile: async () => "// source",
    });

    await expect(
      analyzeFile("src/risky.ts", { coverage: "/nonexistent/coverage.json" }, deps),
    ).rejects.toThrow("File not found");
  });

  it("handles multiple functions with mixed match/unmatch results", async () => {
    const compMatched = makeComplexity("src/mix.ts", "covered", 2, span(1, 8));
    const compUnmatched = makeComplexity("src/mix.ts", "uncovered", 6, span(9, 20));
    const cov = makeCoverage("src/mix.ts", "covered", 90, span(1, 8));

    const deps = createDeps({
      complexityPort: fakeComplexityPort([compMatched, compUnmatched]),
      coveragePort: fakeCoveragePort(
        new Map([["src/mix.ts", [cov]]]),
      ),
      matcher: fakeMatcher(
        [{ complexity: compMatched, coverage: cov }],
        [compUnmatched],
      ),
      readFile: async () => "// source",
      readJson: async () => ({}),
    });

    const verdicts = await analyzeFile(
      "src/mix.ts",
      { coverage: "/project/coverage.json" },
      deps,
    );

    expect(verdicts).toHaveLength(2);

    const coveredVerdict = verdicts.find(
      (v) => v.scored.identity.qualifiedName === "covered",
    )!;
    expect(coveredVerdict.scored.coveragePercent).toBe(90);

    const uncoveredVerdict = verdicts.find(
      (v) => v.scored.identity.qualifiedName === "uncovered",
    )!;
    expect(uncoveredVerdict.scored.coveragePercent).toBe(0);
    // CRAP(6, 0%) = 36 + 6 = 42
    expect(uncoveredVerdict.scored.crap.value).toBe(42);
    expect(uncoveredVerdict.exceeds).toBe(true);
  });
});
