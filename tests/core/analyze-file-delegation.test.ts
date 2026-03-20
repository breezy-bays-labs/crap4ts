import { describe, it, expect } from "vitest";
import { analyzeFile } from "../../src/core/analyze-file.js";
import { extractComplexity } from "../../src/adapters/complexity/facade.js";
import { parseCoverage } from "../../src/adapters/coverage/facade.js";
import type {
  CoverageRatio,
  FunctionCoverage,
  MatchResult,
} from "../../src/domain/types.js";
import type { AnalyzeDeps } from "../../src/core/deps.js";

// ── Test Helpers ──────────────────────────────────────────────────

function ratio(covered: number, total: number): CoverageRatio {
  return { covered, total, percent: total > 0 ? (covered / total) * 100 : 0 };
}

// ── Tests ─────────────────────────────────────────────────────────

describe("analyzeFile uses the same logic as facades", () => {
  it("extractComplexity produces the same results that analyzeFile consumes", () => {
    const source = `
      function greet() { return "hello"; }
      function process(x: number) {
        if (x > 0) { return x; }
        return 0;
      }
    `;

    const complexities = extractComplexity(source, "src/app.ts");

    expect(complexities).toHaveLength(2);
    expect(complexities[0]!.identity.qualifiedName).toBe("greet");
    expect(complexities[0]!.cyclomaticComplexity).toBe(1);
    expect(complexities[1]!.identity.qualifiedName).toBe("process");
    expect(complexities[1]!.cyclomaticComplexity).toBe(2);

    // These results are the same shape that analyzeFile receives from deps.complexityPort.extract()
    expect(complexities[0]).toHaveProperty("identity.filePath", "src/app.ts");
    expect(complexities[0]).toHaveProperty("identity.span");
  });

  it("analyzeFile delegates through ports, not directly to facades", async () => {
    // Wire up DI deps using facade-produced data to verify consistency
    const source = "function add(a: number, b: number) { return a + b; }";
    const complexities = extractComplexity(source, "src/math.ts");

    const cov: FunctionCoverage = {
      filePath: "src/math.ts",
      name: "add",
      span: complexities[0]!.identity.span,
      lineCoverage: ratio(10, 10),
      branchCoverage: null,
    };

    const deps: AnalyzeDeps = {
      complexityPort: { extract: () => complexities },
      coveragePort: {
        parse: () => ({
          coverage: new Map([["src/math.ts", [cov]]]),
          warnings: [],
        }),
      },
      matcher: (cx, cv): MatchResult => ({
        matched: cx.map((c, i) => ({ complexity: c, coverage: cv[i]! })),
        unmatchedComplexity: [],
        unmatchedCoverage: [],
      }),
      globMatcher: () => false,
      readFile: async () => source,
      readJson: async () => ({}),
      findFiles: async () => [],
    };

    const result = await analyzeFile("src/math.ts", { coverage: "cov.json" }, deps);

    expect(result.verdicts).toHaveLength(1);
    expect(result.verdicts[0]!.scored.identity.qualifiedName).toBe("add");
    expect(result.verdicts[0]!.scored.coveragePercent).toBe(100);
    // CRAP(1, 100%) = 1
    expect(result.verdicts[0]!.scored.crap.value).toBe(1);
  });

  it("parseCoverage result shape is compatible with CoveragePort.parse()", () => {
    // Istanbul fixture data
    const istanbulData = {
      "src/math.ts": {
        path: "src/math.ts",
        fnMap: {
          "0": {
            name: "add",
            decl: { start: { line: 1, column: 16 }, end: { line: 1, column: 19 } },
            loc: { start: { line: 1, column: 0 }, end: { line: 3, column: 1 } },
          },
        },
        f: { "0": 10 },
        statementMap: {
          "0": { start: { line: 2, column: 2 }, end: { line: 2, column: 16 } },
        },
        s: { "0": 10 },
        branchMap: {},
        b: {},
      },
    };

    const result = parseCoverage(istanbulData);

    // The shape matches what CoveragePort.parse() returns
    expect(result.coverage).toBeInstanceOf(Map);
    expect(result.warnings).toBeInstanceOf(Array);

    // Key may vary based on cwd normalization — check any entry
    const entries = [...result.coverage.values()];
    expect(entries.length).toBeGreaterThan(0);
    const fns = entries[0]!;
    expect(fns.length).toBeGreaterThan(0);
    expect(fns[0]).toHaveProperty("filePath");
    expect(fns[0]).toHaveProperty("name");
    expect(fns[0]).toHaveProperty("span");
    expect(fns[0]).toHaveProperty("lineCoverage");
    expect(fns[0]).toHaveProperty("branchCoverage");
  });
});
