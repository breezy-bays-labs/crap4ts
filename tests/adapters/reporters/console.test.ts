import { describe, it, expect } from "vitest";
import { ConsoleReporter } from "../../../src/adapters/reporters/console.js";
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

function makeIdentity(filePath: string, name: string): FunctionIdentity {
  return {
    filePath,
    qualifiedName: name,
    span: { startLine: 1, startColumn: 0, endLine: 10, endColumn: 0 },
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
): FunctionVerdict {
  return {
    scored: {
      identity: makeIdentity(filePath, name),
      cyclomaticComplexity: cc,
      coveragePercent: covPct,
      crap: makeScore(crapValue),
    },
    threshold,
    exceeds: crapValue > threshold,
  };
}

function makeDistribution(low = 0, acceptable = 0, moderate = 0, high = 0): RiskDistribution {
  return {
    [RiskLevel.Low]: low,
    [RiskLevel.Acceptable]: acceptable,
    [RiskLevel.Moderate]: moderate,
    [RiskLevel.High]: high,
  };
}

function makeSummary(overrides: Partial<AnalysisSummary> = {}): AnalysisSummary {
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
    thresholdConfig: { defaultThreshold: threshold, overrides: [] } satisfies ThresholdConfig,
    passed,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("ConsoleReporter", () => {
  describe("format", () => {
    it("produces table with file paths, function names, CC, Cov%, CRAP values", () => {
      const v1 = makeVerdict("src/domain/services/pricing.ts", "calculateLineTotal", 12, 45.0, 97.3, 12);
      const v2 = makeVerdict("src/domain/services/pricing.ts", "applyDiscountRules", 8, 62.5, 30.4, 12);
      const v3 = makeVerdict("src/domain/lib/money.ts", "roundCurrency", 2, 100.0, 2.0, 12);

      const file1: FileResult = {
        filePath: "src/domain/services/pricing.ts",
        functions: [v1, v2],
        unmatched: [],
        summary: {
          totalFunctions: 2,
          exceedingThreshold: 2,
          maxCrap: makeScore(97.3),
          averageCrap: 63.85,
        },
      };
      const file2: FileResult = {
        filePath: "src/domain/lib/money.ts",
        functions: [v3],
        unmatched: [],
        summary: {
          totalFunctions: 1,
          exceedingThreshold: 0,
          maxCrap: makeScore(2.0),
          averageCrap: 2.0,
        },
      };

      const result = makeResult(
        [file1, file2],
        makeSummary({
          totalFunctions: 47,
          totalFiles: 2,
          exceedingThreshold: 3,
          maxCrap: makeScore(97.3),
          worstFunction: makeIdentity("src/domain/services/pricing.ts", "calculateLineTotal"),
        }),
        false,
        12,
      );

      const reporter = new ConsoleReporter({ color: false });
      const output = reporter.format(result);

      // Header
      expect(output).toContain("crap4ts");
      expect(output).toContain("CRAP Score Analysis");

      // Column headers
      expect(output).toContain("File");
      expect(output).toContain("Function");
      expect(output).toContain("CC");
      expect(output).toContain("Cov%");
      expect(output).toContain("CRAP");

      // Data rows — file paths, function names, values
      expect(output).toContain("src/domain/services/pricing.ts");
      expect(output).toContain("calculateLineTotal");
      expect(output).toContain("12");
      expect(output).toContain("45.0");
      expect(output).toContain("97.3");

      expect(output).toContain("applyDiscountRules");
      expect(output).toContain("62.5");
      expect(output).toContain("30.4");

      expect(output).toContain("src/domain/lib/money.ts");
      expect(output).toContain("roundCurrency");
      expect(output).toContain("100.0");
      expect(output).toContain("2.0");

      // Summary line
      expect(output).toContain("47 functions");
      expect(output).toContain("3 above threshold");
      expect(output).toContain("worst: 97.3");
      expect(output).toContain("FAIL");
    });

    it("shows PASS in summary when all functions are below threshold", () => {
      const v1 = makeVerdict("src/utils.ts", "add", 1, 100.0, 1.0, 12);
      const v2 = makeVerdict("src/utils.ts", "subtract", 1, 100.0, 1.0, 12);

      const file: FileResult = {
        filePath: "src/utils.ts",
        functions: [v1, v2],
        unmatched: [],
        summary: {
          totalFunctions: 2,
          exceedingThreshold: 0,
          maxCrap: makeScore(1.0),
          averageCrap: 1.0,
        },
      };

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

      const reporter = new ConsoleReporter({ color: false });
      const output = reporter.format(result);

      expect(output).toContain("PASS");
      expect(output).not.toContain("FAIL");
    });

    it("shows FAIL in summary when functions exceed threshold", () => {
      const v1 = makeVerdict("src/complex.ts", "doEverything", 20, 10.0, 380.0, 12);

      const file: FileResult = {
        filePath: "src/complex.ts",
        functions: [v1],
        unmatched: [],
        summary: {
          totalFunctions: 1,
          exceedingThreshold: 1,
          maxCrap: makeScore(380.0),
          averageCrap: 380.0,
        },
      };

      const result = makeResult(
        [file],
        makeSummary({
          totalFunctions: 1,
          totalFiles: 1,
          exceedingThreshold: 1,
          maxCrap: makeScore(380.0),
        }),
        false,
        12,
      );

      const reporter = new ConsoleReporter({ color: false });
      const output = reporter.format(result);

      expect(output).toContain("FAIL");
      expect(output).not.toContain("PASS");
    });

    it("handles empty results gracefully", () => {
      const result = makeResult(
        [],
        makeSummary({ totalFunctions: 0, totalFiles: 0 }),
        true,
        12,
      );

      const reporter = new ConsoleReporter({ color: false });
      const output = reporter.format(result);

      // Should still produce header and summary
      expect(output).toContain("crap4ts");
      expect(output).toContain("0 functions");
      expect(output).toContain("PASS");
    });

    it("shows the threshold value in summary", () => {
      const result = makeResult(
        [],
        makeSummary({ totalFunctions: 5, exceedingThreshold: 2, maxCrap: makeScore(25) }),
        false,
        15,
      );

      const reporter = new ConsoleReporter({ color: false });
      const output = reporter.format(result);

      expect(output).toContain("15");
    });
  });

  describe("non-TTY mode (no ANSI codes)", () => {
    it("does not contain ANSI escape sequences when color is false", () => {
      const v1 = makeVerdict("src/foo.ts", "bar", 10, 30.0, 80.0, 12);

      const file: FileResult = {
        filePath: "src/foo.ts",
        functions: [v1],
        unmatched: [],
        summary: {
          totalFunctions: 1,
          exceedingThreshold: 1,
          maxCrap: makeScore(80.0),
          averageCrap: 80.0,
        },
      };

      const result = makeResult(
        [file],
        makeSummary({
          totalFunctions: 1,
          totalFiles: 1,
          exceedingThreshold: 1,
          maxCrap: makeScore(80.0),
        }),
        false,
        12,
      );

      const reporter = new ConsoleReporter({ color: false });
      const output = reporter.format(result);

      // ESC character = \x1b or \u001b — ANSI codes start with this
       
      expect(output).not.toMatch(/\x1b\[/);
    });

    it("contains ANSI codes when color is true", () => {
      const v1 = makeVerdict("src/foo.ts", "bar", 10, 30.0, 80.0, 12);

      const file: FileResult = {
        filePath: "src/foo.ts",
        functions: [v1],
        unmatched: [],
        summary: {
          totalFunctions: 1,
          exceedingThreshold: 1,
          maxCrap: makeScore(80.0),
          averageCrap: 80.0,
        },
      };

      const result = makeResult(
        [file],
        makeSummary({
          totalFunctions: 1,
          totalFiles: 1,
          exceedingThreshold: 1,
          maxCrap: makeScore(80.0),
        }),
        false,
        12,
      );

      const reporter = new ConsoleReporter({ color: true });
      const output = reporter.format(result);

       
      expect(output).toMatch(/\x1b\[/);
    });
  });

  describe("color rules", () => {
    it("colorizes coverage red when below 50%", () => {
      const v = makeVerdict("src/a.ts", "fn", 5, 30.0, 20.0, 12);
      const file: FileResult = {
        filePath: "src/a.ts",
        functions: [v],
        unmatched: [],
        summary: { totalFunctions: 1, exceedingThreshold: 1, maxCrap: makeScore(20.0), averageCrap: 20.0 },
      };
      const result = makeResult(
        [file],
        makeSummary({ totalFunctions: 1, totalFiles: 1, exceedingThreshold: 1, maxCrap: makeScore(20.0) }),
        false,
      );

      const reporter = new ConsoleReporter({ color: true });
      const output = reporter.format(result);

      // Red ANSI: \x1b[31m (or \x1b[91m for bright red)
       
      expect(output).toMatch(/\x1b\[3?1m.*30\.0/s);
    });

    it("colorizes coverage yellow when 50-79%", () => {
      const v = makeVerdict("src/a.ts", "fn", 5, 65.0, 10.0, 12);
      const file: FileResult = {
        filePath: "src/a.ts",
        functions: [v],
        unmatched: [],
        summary: { totalFunctions: 1, exceedingThreshold: 0, maxCrap: makeScore(10.0), averageCrap: 10.0 },
      };
      const result = makeResult(
        [file],
        makeSummary({ totalFunctions: 1, totalFiles: 1, maxCrap: makeScore(10.0) }),
        true,
      );

      const reporter = new ConsoleReporter({ color: true });
      const output = reporter.format(result);

      // Yellow ANSI: \x1b[33m
       
      expect(output).toMatch(/\x1b\[33m.*65\.0/s);
    });

    it("colorizes coverage green when 80%+", () => {
      const v = makeVerdict("src/a.ts", "fn", 2, 95.0, 2.0, 12);
      const file: FileResult = {
        filePath: "src/a.ts",
        functions: [v],
        unmatched: [],
        summary: { totalFunctions: 1, exceedingThreshold: 0, maxCrap: makeScore(2.0), averageCrap: 2.0 },
      };
      const result = makeResult(
        [file],
        makeSummary({ totalFunctions: 1, totalFiles: 1, maxCrap: makeScore(2.0) }),
        true,
      );

      const reporter = new ConsoleReporter({ color: true });
      const output = reporter.format(result);

      // Green ANSI: \x1b[32m
       
      expect(output).toMatch(/\x1b\[32m.*95\.0/s);
    });

    it("colorizes above-threshold CRAP scores red+bold", () => {
      const v = makeVerdict("src/a.ts", "fn", 10, 30.0, 80.0, 12);
      const file: FileResult = {
        filePath: "src/a.ts",
        functions: [v],
        unmatched: [],
        summary: { totalFunctions: 1, exceedingThreshold: 1, maxCrap: makeScore(80.0), averageCrap: 80.0 },
      };
      const result = makeResult(
        [file],
        makeSummary({ totalFunctions: 1, totalFiles: 1, exceedingThreshold: 1, maxCrap: makeScore(80.0) }),
        false,
      );

      const reporter = new ConsoleReporter({ color: true });
      const output = reporter.format(result);

      // Bold ANSI: \x1b[1m, Red: \x1b[31m — chalk combines them
       
      expect(output).toMatch(/\x1b\[1m/);
       
      expect(output).toMatch(/\x1b\[3?1m/);
    });
  });

  describe("implements ReporterPort", () => {
    it("has a format method returning string", () => {
      const reporter = new ConsoleReporter({ color: false });
      const result = makeResult([], makeSummary(), true);
      const output = reporter.format(result);
      expect(typeof output).toBe("string");
    });
  });

  describe("row ordering", () => {
    it("outputs functions grouped by file, preserving file order", () => {
      const v1 = makeVerdict("src/b.ts", "bFn", 1, 100.0, 1.0, 12);
      const v2 = makeVerdict("src/a.ts", "aFn", 1, 100.0, 1.0, 12);

      const file1: FileResult = {
        filePath: "src/b.ts",
        functions: [v1],
        unmatched: [],
        summary: { totalFunctions: 1, exceedingThreshold: 0, maxCrap: makeScore(1.0), averageCrap: 1.0 },
      };
      const file2: FileResult = {
        filePath: "src/a.ts",
        functions: [v2],
        unmatched: [],
        summary: { totalFunctions: 1, exceedingThreshold: 0, maxCrap: makeScore(1.0), averageCrap: 1.0 },
      };

      const result = makeResult(
        [file1, file2],
        makeSummary({ totalFunctions: 2, totalFiles: 2, maxCrap: makeScore(1.0) }),
        true,
      );

      const reporter = new ConsoleReporter({ color: false });
      const output = reporter.format(result);

      const bIdx = output.indexOf("src/b.ts");
      const aIdx = output.indexOf("src/a.ts");
      expect(bIdx).toBeLessThan(aIdx);
    });
  });

  describe("coverage formatting", () => {
    it("formats coverage with one decimal place", () => {
      const v = makeVerdict("src/x.ts", "fn", 1, 50.0, 1.0, 12);
      const file: FileResult = {
        filePath: "src/x.ts",
        functions: [v],
        unmatched: [],
        summary: { totalFunctions: 1, exceedingThreshold: 0, maxCrap: makeScore(1.0), averageCrap: 1.0 },
      };
      const result = makeResult(
        [file],
        makeSummary({ totalFunctions: 1, totalFiles: 1, maxCrap: makeScore(1.0) }),
        true,
      );

      const reporter = new ConsoleReporter({ color: false });
      const output = reporter.format(result);

      expect(output).toContain("50.0");
    });

    it("formats CRAP with one decimal place", () => {
      const v = makeVerdict("src/x.ts", "fn", 5, 34.5, 12.03, 12);
      const file: FileResult = {
        filePath: "src/x.ts",
        functions: [v],
        unmatched: [],
        summary: { totalFunctions: 1, exceedingThreshold: 1, maxCrap: makeScore(12.03), averageCrap: 12.03 },
      };
      const result = makeResult(
        [file],
        makeSummary({ totalFunctions: 1, totalFiles: 1, exceedingThreshold: 1, maxCrap: makeScore(12.03) }),
        false,
      );

      const reporter = new ConsoleReporter({ color: false });
      const output = reporter.format(result);

      // Should show 12.0 (one decimal) — spec example shows one decimal
      expect(output).toMatch(/12\.0/);
    });
  });
});
