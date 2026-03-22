import { describe, it, expect } from "vitest";
import { analyze } from "../../src/core/analyze.js";
import { analyzeFile } from "../../src/core/analyze-file.js";
import type {
  FunctionComplexity,
  FunctionCoverage,
  MatchResult,
  SourceSpan,
  CoverageRatio,
  ComplexityContributor,
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

const threeContributors: ComplexityContributor[] = [
  { kind: "if-branch", line: 2, column: 2 },
  { kind: "for-loop", line: 4, column: 4 },
  { kind: "logical-operator", line: 6, column: 8, operator: "&&" },
];

function makeComplexity(
  filePath: string,
  name: string,
  cc: number,
  contributors: ComplexityContributor[] = [],
  s: SourceSpan = span(1, 10),
): FunctionComplexity {
  return {
    identity: { filePath, qualifiedName: name, span: s },
    cyclomaticComplexity: cc,
    contributors,
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

function fakeComplexityPort(results: Map<string, FunctionComplexity[]>): ComplexityPort {
  return { extract(_, filePath) { return results.get(filePath) ?? []; } };
}

function fakeCoveragePort(coverageMap: Map<string, FunctionCoverage[]>): CoveragePort {
  return { parse() { return { coverage: coverageMap, warnings: [] }; } };
}

function fakeMatcher(
  matchedPairs: Array<{ complexity: FunctionComplexity; coverage: FunctionCoverage }>,
  unmatchedComplexity: FunctionComplexity[] = [],
  unmatchedCoverage: FunctionCoverage[] = [],
) {
  return (): MatchResult => ({
    matched: matchedPairs,
    unmatchedComplexity,
    unmatchedCoverage,
  });
}

function makeDeps(
  complexities: Map<string, FunctionComplexity[]>,
  coverages: Map<string, FunctionCoverage[]>,
  matchedPairs: Array<{ complexity: FunctionComplexity; coverage: FunctionCoverage }>,
  unmatchedComplexity: FunctionComplexity[] = [],
): AnalyzeDeps {
  return {
    complexityPort: fakeComplexityPort(complexities),
    coveragePort: fakeCoveragePort(coverages),
    matcher: fakeMatcher(matchedPairs, unmatchedComplexity),
    findFiles: async () => [...complexities.keys()],
    readFile: async () => "// source",
    readJson: async () => ({}),
    globMatcher: () => false,
  };
}

describe("Contributor pipeline carry", () => {
  describe("analyze() path", () => {
    it("contributors appear on scored functions in analysis result", async () => {
      const c1 = makeComplexity("a.ts", "fn1", 4, threeContributors);
      const cov1 = makeCoverage("a.ts", "fn1", 80);

      const deps = makeDeps(
        new Map([["a.ts", [c1]]]),
        new Map([["a.ts", [cov1]]]),
        [{ complexity: c1, coverage: cov1 }],
      );

      const result = await analyze(
        { src: ["."], coverage: "cov.json", threshold: 30 },
        deps,
      );

      expect(result.functions).toHaveLength(1);
      expect(result.functions[0].scored.contributors).toEqual(threeContributors);
    });

    it("contributors are carried from complexity to scored function", async () => {
      const contributors: ComplexityContributor[] = [
        { kind: "if-branch", line: 2, column: 0 },
        { kind: "for-loop", line: 5, column: 0 },
        { kind: "catch", line: 8, column: 0 },
      ];
      const c1 = makeComplexity("a.ts", "fn1", 4, contributors);
      const cov1 = makeCoverage("a.ts", "fn1", 50);

      const deps = makeDeps(
        new Map([["a.ts", [c1]]]),
        new Map([["a.ts", [cov1]]]),
        [{ complexity: c1, coverage: cov1 }],
      );

      const result = await analyze(
        { src: ["."], coverage: "cov.json", threshold: 30 },
        deps,
      );

      expect(result.functions[0].scored.contributors).toEqual(contributors);
    });

    it("simple function carries empty contributors through pipeline", async () => {
      const c1 = makeComplexity("a.ts", "fn1", 1, []);
      const cov1 = makeCoverage("a.ts", "fn1", 100);

      const deps = makeDeps(
        new Map([["a.ts", [c1]]]),
        new Map([["a.ts", [cov1]]]),
        [{ complexity: c1, coverage: cov1 }],
      );

      const result = await analyze(
        { src: ["."], coverage: "cov.json", threshold: 30 },
        deps,
      );

      expect(result.functions[0].scored.contributors).toEqual([]);
    });
  });

  describe("analyzeFile() path", () => {
    it("contributors appear on scored functions via file analysis", async () => {
      const c1 = makeComplexity("a.ts", "fn1", 3, [
        { kind: "if-branch", line: 2, column: 0 },
        { kind: "for-loop", line: 5, column: 0 },
      ]);
      const cov1 = makeCoverage("a.ts", "fn1", 80);

      const deps = makeDeps(
        new Map([["a.ts", [c1]]]),
        new Map([["a.ts", [cov1]]]),
        [{ complexity: c1, coverage: cov1 }],
      );

      const result = await analyzeFile("a.ts", { coverage: "cov.json" }, deps);

      expect(result.verdicts).toHaveLength(1);
      expect(result.verdicts[0].scored.contributors).toHaveLength(2);
    });
  });

  describe("unmatched functions", () => {
    it("unmatched complexity functions retain contributors", async () => {
      const contributors: ComplexityContributor[] = [
        { kind: "if-branch", line: 2, column: 0 },
      ];
      const c1 = makeComplexity("a.ts", "fn1", 2, contributors);

      const deps = makeDeps(
        new Map([["a.ts", [c1]]]),
        new Map(),
        [],
        [c1], // unmatched complexity
      );

      const result = await analyze(
        { src: ["."], coverage: "cov.json", threshold: 30 },
        deps,
      );

      const unmatched = result.unmatched.find((u) => u.kind === "no-coverage");
      expect(unmatched).toBeDefined();
      if (unmatched?.kind === "no-coverage") {
        expect(unmatched.complexity.contributors).toEqual(contributors);
      }
    });
  });

  describe("invariant preserved through pipeline", () => {
    it("contributor count invariant holds after scoring", async () => {
      const contributors: ComplexityContributor[] = [
        { kind: "if-branch", line: 2, column: 0 },
        { kind: "for-loop", line: 3, column: 0 },
        { kind: "catch", line: 5, column: 0 },
        { kind: "logical-operator", line: 7, column: 0, operator: "&&" },
        { kind: "ternary", line: 9, column: 0 },
      ];
      const c1 = makeComplexity("a.ts", "fn1", 6, contributors);
      const cov1 = makeCoverage("a.ts", "fn1", 50);

      const deps = makeDeps(
        new Map([["a.ts", [c1]]]),
        new Map([["a.ts", [cov1]]]),
        [{ complexity: c1, coverage: cov1 }],
      );

      const result = await analyze(
        { src: ["."], coverage: "cov.json", threshold: 30 },
        deps,
      );

      const scored = result.functions[0].scored;
      expect(scored.contributors).toHaveLength(scored.cyclomaticComplexity - 1);
    });
  });
});
