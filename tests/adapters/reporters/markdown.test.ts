import { describe, it, expect } from "vitest";
import { MarkdownReporter } from "../../../src/adapters/reporters/markdown.js";
import { RiskLevel } from "../../../src/domain/types.js";
import type {
  AnalysisResult,
  FileResult,
  FunctionVerdict,
  FunctionIdentity,
  CrapScore,
  AnalysisSummary,
  RiskDistribution,
  ThresholdConfig,
} from "../../../src/domain/types.js";

// ── Test Helpers ──────────────────────────────────────────────────────

function makeIdentity(
  filePath: string,
  name: string,
  startLine = 1,
): FunctionIdentity {
  return {
    filePath,
    qualifiedName: name,
    span: { startLine, startColumn: 0, endLine: startLine + 9, endColumn: 0 },
  };
}

function makeScore(value: number): CrapScore {
  let riskLevel: RiskLevel;
  if (value <= 5) riskLevel = RiskLevel.Low;
  else if (value <= 8) riskLevel = RiskLevel.Acceptable;
  else if (value <= 30) riskLevel = RiskLevel.Moderate;
  else riskLevel = RiskLevel.High;
  return { value, riskLevel };
}

function makeVerdict(
  filePath: string,
  name: string,
  cc: number,
  covPct: number,
  crapValue: number,
  threshold: number,
  startLine = 1,
): FunctionVerdict {
  return {
    scored: {
      identity: makeIdentity(filePath, name, startLine),
      cyclomaticComplexity: cc,
      coveragePercent: covPct,
      crap: makeScore(crapValue),
    },
    threshold,
    exceeds: crapValue > threshold,
  };
}

function makeDistribution(
  low = 0,
  acceptable = 0,
  moderate = 0,
  high = 0,
): RiskDistribution {
  return {
    [RiskLevel.Low]: low,
    [RiskLevel.Acceptable]: acceptable,
    [RiskLevel.Moderate]: moderate,
    [RiskLevel.High]: high,
  };
}

function makeSummary(
  overrides: Partial<AnalysisSummary> = {},
): AnalysisSummary {
  return {
    totalFunctions: 0,
    totalFiles: 0,
    exceedingThreshold: 0,
    exceedingPercent: 0,
    averageCrap: 0,
    medianCrap: 0,
    maxCrap: makeScore(0),
    worstFunction: null,
    distribution: makeDistribution(),
    crapLoad: 0,
    ...overrides,
  };
}

function makeResult(
  files: FileResult[],
  summary: AnalysisSummary,
  passed: boolean,
  threshold = 12,
): AnalysisResult {
  return {
    files,
    summary,
    thresholdConfig: {
      defaultThreshold: threshold,
      overrides: [],
    } satisfies ThresholdConfig,
    passed,
  };
}

function makeFileResult(
  filePath: string,
  functions: FunctionVerdict[],
  overrides: Partial<FileResult["summary"]> = {},
): FileResult {
  const maxCrap =
    functions.length > 0
      ? makeScore(
          Math.max(...functions.map((f) => f.scored.crap.value)),
        )
      : makeScore(0);
  const avgCrap =
    functions.length > 0
      ? functions.reduce((s, f) => s + f.scored.crap.value, 0) /
        functions.length
      : 0;

  return {
    filePath,
    functions,
    unmatched: [],
    summary: {
      totalFunctions: functions.length,
      exceedingThreshold: functions.filter((f) => f.exceeds).length,
      maxCrap,
      averageCrap: avgCrap,
      ...overrides,
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("MarkdownReporter", () => {
  describe("heading", () => {
    it("starts with ## crap4ts Report", () => {
      const result = makeResult([], makeSummary(), true);
      const reporter = new MarkdownReporter();
      const output = reporter.format(result);

      expect(output).toMatch(/^## crap4ts Report/);
    });
  });

  describe("result line", () => {
    it("shows FAIL with exceeding count, total, and threshold", () => {
      const v1 = makeVerdict(
        "src/domain/services/pricing.ts",
        "calculateLineTotal",
        12, 45.0, 97.3, 12, 42,
      );
      const v2 = makeVerdict(
        "src/domain/services/pricing.ts",
        "applyDiscountRules",
        8, 62.5, 30.4, 12, 80,
      );
      const v3 = makeVerdict(
        "src/domain/services/pricing.ts",
        "formatInvoice",
        6, 50.0, 15.2, 12, 120,
      );

      const file = makeFileResult("src/domain/services/pricing.ts", [
        v1, v2, v3,
      ]);

      const result = makeResult(
        [file],
        makeSummary({
          totalFunctions: 47,
          totalFiles: 1,
          exceedingThreshold: 3,
          maxCrap: makeScore(97.3),
        }),
        false,
        12,
      );

      const reporter = new MarkdownReporter();
      const output = reporter.format(result);

      expect(output).toContain(
        "**Result: FAIL** | 3 of 47 functions above threshold (12)",
      );
    });

    it("shows PASS when no functions exceed threshold", () => {
      const v1 = makeVerdict("src/utils.ts", "add", 1, 100.0, 1.0, 12);
      const file = makeFileResult("src/utils.ts", [v1]);

      const result = makeResult(
        [file],
        makeSummary({
          totalFunctions: 2,
          totalFiles: 1,
          exceedingThreshold: 0,
          maxCrap: makeScore(1.0),
        }),
        true,
        12,
      );

      const reporter = new MarkdownReporter();
      const output = reporter.format(result);

      expect(output).toContain("**Result: PASS**");
      expect(output).not.toContain("FAIL");
    });
  });

  describe("table structure", () => {
    it("has columns: CRAP, CC, Cov%, Function, Location", () => {
      const v1 = makeVerdict("src/a.ts", "fn", 5, 80.0, 6.25, 12, 10);
      const file = makeFileResult("src/a.ts", [v1]);

      const result = makeResult(
        [file],
        makeSummary({
          totalFunctions: 1,
          totalFiles: 1,
          maxCrap: makeScore(6.25),
        }),
        true,
      );

      const reporter = new MarkdownReporter();
      const output = reporter.format(result);

      // Header row
      expect(output).toContain("| CRAP | CC | Cov% | Function | Location |");
      // Alignment row — CRAP, CC, Cov% are right-aligned
      expect(output).toContain("|-----:|---:|-----:|----------|----------|");
    });

    it("formats data rows with CRAP, CC, Cov%, backtick function, backtick location", () => {
      const v1 = makeVerdict(
        "src/domain/services/pricing.ts",
        "calculateLineTotal",
        12, 45.0, 97.3, 12, 42,
      );
      const file = makeFileResult("src/domain/services/pricing.ts", [v1]);

      const result = makeResult(
        [file],
        makeSummary({
          totalFunctions: 1,
          totalFiles: 1,
          exceedingThreshold: 1,
          maxCrap: makeScore(97.3),
        }),
        false,
      );

      const reporter = new MarkdownReporter();
      const output = reporter.format(result);

      // Data row
      expect(output).toContain("| 97.3 | 12 | 45.0% | `calculateLineTotal` | `src/domain/services/pricing.ts:42` |");
    });

    it("formats coverage with one decimal place and % suffix", () => {
      const v1 = makeVerdict("src/a.ts", "fn", 1, 100.0, 1.0, 12);
      const file = makeFileResult("src/a.ts", [v1]);

      const result = makeResult(
        [file],
        makeSummary({ totalFunctions: 1, totalFiles: 1, maxCrap: makeScore(1.0) }),
        true,
      );

      const reporter = new MarkdownReporter();
      const output = reporter.format(result);

      expect(output).toContain("100.0%");
    });

    it("formats CRAP with one decimal place", () => {
      const v1 = makeVerdict("src/a.ts", "fn", 5, 34.5, 12.03, 12);
      const file = makeFileResult("src/a.ts", [v1]);

      const result = makeResult(
        [file],
        makeSummary({ totalFunctions: 1, totalFiles: 1, exceedingThreshold: 1, maxCrap: makeScore(12.03) }),
        false,
      );

      const reporter = new MarkdownReporter();
      const output = reporter.format(result);

      // 12.03 formatted to one decimal = 12.0
      expect(output).toMatch(/\| 12\.0 \|/);
    });

    it("uses startLine from span in location format", () => {
      const v1 = makeVerdict("src/deep/nested/file.ts", "myFunc", 3, 70.0, 5.4, 12, 99);
      const file = makeFileResult("src/deep/nested/file.ts", [v1]);

      const result = makeResult(
        [file],
        makeSummary({ totalFunctions: 1, totalFiles: 1, maxCrap: makeScore(5.4) }),
        true,
      );

      const reporter = new MarkdownReporter();
      const output = reporter.format(result);

      expect(output).toContain("`src/deep/nested/file.ts:99`");
    });
  });

  describe("sort order", () => {
    it("sorts functions by CRAP score descending", () => {
      const v1 = makeVerdict("src/a.ts", "low", 1, 100.0, 1.0, 12, 1);
      const v2 = makeVerdict("src/b.ts", "high", 12, 45.0, 97.3, 12, 5);
      const v3 = makeVerdict("src/c.ts", "mid", 5, 60.0, 15.0, 12, 10);

      const files = [
        makeFileResult("src/a.ts", [v1]),
        makeFileResult("src/b.ts", [v2]),
        makeFileResult("src/c.ts", [v3]),
      ];

      const result = makeResult(
        files,
        makeSummary({
          totalFunctions: 3,
          totalFiles: 3,
          exceedingThreshold: 2,
          maxCrap: makeScore(97.3),
        }),
        false,
      );

      const reporter = new MarkdownReporter();
      const output = reporter.format(result);

      const highIdx = output.indexOf("`high`");
      const midIdx = output.indexOf("`mid`");
      const lowIdx = output.indexOf("`low`");

      expect(highIdx).toBeLessThan(midIdx);
      expect(midIdx).toBeLessThan(lowIdx);
    });
  });

  describe("<details> collapse", () => {
    it("wraps full results in <details> when there are passing functions beyond failures", () => {
      const failing1 = makeVerdict("src/a.ts", "badFn", 10, 20.0, 80.0, 12, 1);
      const passing1 = makeVerdict("src/b.ts", "goodFn", 1, 100.0, 1.0, 12, 5);
      const passing2 = makeVerdict("src/c.ts", "okFn", 2, 90.0, 2.1, 12, 10);

      const files = [
        makeFileResult("src/a.ts", [failing1]),
        makeFileResult("src/b.ts", [passing1]),
        makeFileResult("src/c.ts", [passing2]),
      ];

      const result = makeResult(
        files,
        makeSummary({
          totalFunctions: 3,
          totalFiles: 3,
          exceedingThreshold: 1,
          maxCrap: makeScore(80.0),
        }),
        false,
      );

      const reporter = new MarkdownReporter();
      const output = reporter.format(result);

      // The failing function should appear above the fold (outside <details>)
      const detailsStart = output.indexOf("<details>");
      const badFnIdx = output.indexOf("`badFn`");
      expect(badFnIdx).toBeLessThan(detailsStart);

      // The <details> block should contain all functions
      expect(output).toContain("<details><summary>Full results (3 functions)</summary>");
      expect(output).toContain("</details>");

      // Inside the <details> block, all functions should appear
      const detailsContent = output.slice(
        output.indexOf("<details>"),
        output.indexOf("</details>") + "</details>".length,
      );
      expect(detailsContent).toContain("`badFn`");
      expect(detailsContent).toContain("`goodFn`");
      expect(detailsContent).toContain("`okFn`");
    });

    it("does not add <details> when all functions exceed threshold", () => {
      const v1 = makeVerdict("src/a.ts", "bad1", 10, 20.0, 80.0, 12, 1);
      const v2 = makeVerdict("src/a.ts", "bad2", 8, 30.0, 50.0, 12, 20);

      const file = makeFileResult("src/a.ts", [v1, v2]);

      const result = makeResult(
        [file],
        makeSummary({
          totalFunctions: 2,
          totalFiles: 1,
          exceedingThreshold: 2,
          maxCrap: makeScore(80.0),
        }),
        false,
      );

      const reporter = new MarkdownReporter();
      const output = reporter.format(result);

      expect(output).not.toContain("<details>");
      expect(output).not.toContain("</details>");
    });

    it("does not add <details> when no functions exceed threshold", () => {
      const v1 = makeVerdict("src/a.ts", "good1", 1, 100.0, 1.0, 12, 1);
      const v2 = makeVerdict("src/a.ts", "good2", 2, 90.0, 2.1, 12, 20);

      const file = makeFileResult("src/a.ts", [v1, v2]);

      const result = makeResult(
        [file],
        makeSummary({
          totalFunctions: 2,
          totalFiles: 1,
          exceedingThreshold: 0,
          maxCrap: makeScore(2.1),
        }),
        true,
      );

      const reporter = new MarkdownReporter();
      const output = reporter.format(result);

      // All functions shown in a single table, no <details> needed
      expect(output).not.toContain("<details>");
    });

    it("includes correct function count in <details> summary", () => {
      const verdicts: FunctionVerdict[] = [];
      // 1 failing, 4 passing = 5 total
      verdicts.push(makeVerdict("src/a.ts", "fail1", 10, 10.0, 90.0, 12, 1));
      for (let i = 0; i < 4; i++) {
        verdicts.push(makeVerdict("src/b.ts", `pass${i}`, 1, 100.0, 1.0, 12, i * 10 + 1));
      }

      const files = [
        makeFileResult("src/a.ts", [verdicts[0]]),
        makeFileResult("src/b.ts", verdicts.slice(1)),
      ];

      const result = makeResult(
        files,
        makeSummary({
          totalFunctions: 5,
          totalFiles: 2,
          exceedingThreshold: 1,
          maxCrap: makeScore(90.0),
        }),
        false,
      );

      const reporter = new MarkdownReporter();
      const output = reporter.format(result);

      expect(output).toContain("<details><summary>Full results (5 functions)</summary>");
    });
  });

  describe("empty results", () => {
    it("handles zero functions gracefully", () => {
      const result = makeResult(
        [],
        makeSummary({ totalFunctions: 0, totalFiles: 0 }),
        true,
      );

      const reporter = new MarkdownReporter();
      const output = reporter.format(result);

      expect(output).toContain("## crap4ts Report");
      expect(output).toContain("**Result: PASS**");
      // No table or details block
      expect(output).not.toContain("| CRAP |");
      expect(output).not.toContain("<details>");
    });
  });

  describe("implements ReporterPort", () => {
    it("has a format method returning string", () => {
      const reporter = new MarkdownReporter();
      const result = makeResult([], makeSummary(), true);
      const output = reporter.format(result);
      expect(typeof output).toBe("string");
    });
  });

  describe("above-the-fold table", () => {
    it("only shows failing functions above the fold when details is present", () => {
      const failing = makeVerdict("src/a.ts", "badFn", 10, 20.0, 80.0, 12, 1);
      const passing = makeVerdict("src/b.ts", "goodFn", 1, 100.0, 1.0, 12, 5);

      const files = [
        makeFileResult("src/a.ts", [failing]),
        makeFileResult("src/b.ts", [passing]),
      ];

      const result = makeResult(
        files,
        makeSummary({
          totalFunctions: 2,
          totalFiles: 2,
          exceedingThreshold: 1,
          maxCrap: makeScore(80.0),
        }),
        false,
      );

      const reporter = new MarkdownReporter();
      const output = reporter.format(result);

      // Content before <details>
      const beforeDetails = output.slice(0, output.indexOf("<details>"));

      // The failing function should be in the above-fold table
      expect(beforeDetails).toContain("`badFn`");
      // The passing function should NOT be above the fold
      expect(beforeDetails).not.toContain("`goodFn`");
    });

    it("shows all functions in main table when no details block is needed", () => {
      const v1 = makeVerdict("src/a.ts", "fn1", 1, 100.0, 1.0, 12, 1);
      const v2 = makeVerdict("src/a.ts", "fn2", 2, 90.0, 2.1, 12, 20);

      const file = makeFileResult("src/a.ts", [v1, v2]);

      const result = makeResult(
        [file],
        makeSummary({
          totalFunctions: 2,
          totalFiles: 1,
          exceedingThreshold: 0,
          maxCrap: makeScore(2.1),
        }),
        true,
      );

      const reporter = new MarkdownReporter();
      const output = reporter.format(result);

      expect(output).toContain("`fn1`");
      expect(output).toContain("`fn2`");
    });
  });

  describe("multiple files", () => {
    it("combines functions from all files and sorts globally", () => {
      const v1 = makeVerdict("src/a.ts", "aFn", 5, 60.0, 15.0, 12, 10);
      const v2 = makeVerdict("src/b.ts", "bFn", 12, 45.0, 97.3, 12, 42);
      const v3 = makeVerdict("src/c.ts", "cFn", 1, 100.0, 1.0, 12, 5);

      const files = [
        makeFileResult("src/a.ts", [v1]),
        makeFileResult("src/b.ts", [v2]),
        makeFileResult("src/c.ts", [v3]),
      ];

      const result = makeResult(
        files,
        makeSummary({
          totalFunctions: 3,
          totalFiles: 3,
          exceedingThreshold: 2,
          maxCrap: makeScore(97.3),
        }),
        false,
      );

      const reporter = new MarkdownReporter();
      const output = reporter.format(result);

      // bFn (97.3) should come before aFn (15.0)
      const bIdx = output.indexOf("`bFn`");
      const aIdx = output.indexOf("`aFn`");
      expect(bIdx).toBeLessThan(aIdx);
    });
  });
});
