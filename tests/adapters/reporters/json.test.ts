import { describe, it, expect, beforeEach, vi } from "vitest";
import { JsonReporter } from "../../../src/adapters/reporters/json.js";
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

describe("JsonReporter", () => {
  let reporter: JsonReporter;

  beforeEach(() => {
    reporter = new JsonReporter();
  });

  describe("format", () => {
    it("returns valid JSON (JSON.parse does not throw)", () => {
      const result = makeResult([], makeSummary(), true);
      const output = reporter.format(result);
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it("uses 2-space indentation", () => {
      const result = makeResult([], makeSummary(), true);
      const output = reporter.format(result);
      // 2-space indent means lines start with "  " (two spaces), not tabs or 4 spaces
      const lines = output.split("\n");
      const indentedLines = lines.filter((l) => l.startsWith(" "));
      expect(indentedLines.length).toBeGreaterThan(0);
      // All indented lines should use multiples of 2 spaces
      for (const line of indentedLines) {
        const leadingSpaces = line.match(/^( +)/)?.[1].length ?? 0;
        expect(leadingSpaces % 2).toBe(0);
      }
    });

    it("includes $schema field", () => {
      const result = makeResult([], makeSummary(), true);
      const output = reporter.format(result);
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("$schema");
      expect(typeof parsed.$schema).toBe("string");
    });

    it("includes version field matching package version", () => {
      const result = makeResult([], makeSummary(), true);
      const output = reporter.format(result);
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("version");
      expect(parsed.version).toBe("0.0.1");
    });

    it("includes timestamp as ISO 8601 string", () => {
      const result = makeResult([], makeSummary(), true);
      const output = reporter.format(result);
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("timestamp");
      expect(typeof parsed.timestamp).toBe("string");
      // ISO 8601 format check: should parse back to a valid Date
      const date = new Date(parsed.timestamp);
      expect(date.toISOString()).toBe(parsed.timestamp);
    });

    it("includes config field with threshold info", () => {
      const result = makeResult([], makeSummary(), true, 15);
      const output = reporter.format(result);
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("config");
      expect(parsed.config).toEqual({
        defaultThreshold: 15,
        overrides: [],
      });
    });

    it("includes config with overrides when present", () => {
      const analysisResult: AnalysisResult = {
        files: [],
        summary: makeSummary(),
        thresholdConfig: {
          defaultThreshold: 12,
          overrides: [{ glob: "src/legacy/**", threshold: 30 }],
        },
        passed: true,
      };
      const output = reporter.format(analysisResult);
      const parsed = JSON.parse(output);
      expect(parsed.config).toEqual({
        defaultThreshold: 12,
        overrides: [{ glob: "src/legacy/**", threshold: 30 }],
      });
    });

    it("includes summary from AnalysisResult.summary", () => {
      const summary = makeSummary({
        totalFunctions: 42,
        totalFiles: 8,
        exceedingThreshold: 3,
        exceedingPercent: 7.14,
        averageCrap: 6.5,
        medianCrap: 4.0,
        maxCrap: makeScore(97.3),
        worstFunction: makeIdentity("src/pricing.ts", "calculateTotal"),
        distribution: makeDistribution(30, 5, 4, 3),
        crapLoad: 150.2,
      });
      const result = makeResult([], summary, false);
      const output = reporter.format(result);
      const parsed = JSON.parse(output);

      expect(parsed.summary).toEqual(summary);
    });

    it("includes files array from AnalysisResult.files", () => {
      const v1 = makeVerdict("src/pricing.ts", "calculateTotal", 12, 45.0, 97.3, 12);
      const v2 = makeVerdict("src/utils.ts", "add", 1, 100.0, 1.0, 12);

      const file1: FileResult = {
        filePath: "src/pricing.ts",
        functions: [v1],
        unmatched: [],
        summary: {
          totalFunctions: 1,
          exceedingThreshold: 1,
          maxCrap: makeScore(97.3),
          averageCrap: 97.3,
        },
      };
      const file2: FileResult = {
        filePath: "src/utils.ts",
        functions: [v2],
        unmatched: [],
        summary: {
          totalFunctions: 1,
          exceedingThreshold: 0,
          maxCrap: makeScore(1.0),
          averageCrap: 1.0,
        },
      };

      const result = makeResult(
        [file1, file2],
        makeSummary({ totalFunctions: 2, totalFiles: 2, maxCrap: makeScore(97.3) }),
        false,
      );
      const output = reporter.format(result);
      const parsed = JSON.parse(output);

      expect(parsed.files).toHaveLength(2);
      expect(parsed.files[0].filePath).toBe("src/pricing.ts");
      expect(parsed.files[1].filePath).toBe("src/utils.ts");
      expect(parsed.files[0].functions).toHaveLength(1);
      expect(parsed.files[0].functions[0].scored.identity.qualifiedName).toBe("calculateTotal");
    });

    it("includes passed boolean from AnalysisResult.passed", () => {
      const passingResult = makeResult([], makeSummary(), true);
      const failingResult = makeResult([], makeSummary(), false);

      const passOutput = JSON.parse(reporter.format(passingResult));
      const failOutput = JSON.parse(reporter.format(failingResult));

      expect(passOutput.passed).toBe(true);
      expect(failOutput.passed).toBe(false);
    });

    it("preserves all AnalysisResult data through serialization", () => {
      const v1 = makeVerdict("src/a.ts", "fnA", 5, 80.0, 6.25, 12);
      const file: FileResult = {
        filePath: "src/a.ts",
        functions: [v1],
        unmatched: [
          {
            kind: "no-coverage",
            complexity: {
              identity: makeIdentity("src/a.ts", "uncoveredFn"),
              cyclomaticComplexity: 3,
            },
            worstCaseCrap: makeScore(12),
          },
        ],
        summary: {
          totalFunctions: 2,
          exceedingThreshold: 0,
          maxCrap: makeScore(12),
          averageCrap: 9.125,
        },
      };

      const summary = makeSummary({
        totalFunctions: 2,
        totalFiles: 1,
        exceedingThreshold: 0,
        averageCrap: 9.125,
        medianCrap: 9.125,
        maxCrap: makeScore(12),
        worstFunction: makeIdentity("src/a.ts", "uncoveredFn"),
        distribution: makeDistribution(0, 1, 1, 0),
        crapLoad: 0,
      });

      const result = makeResult([file], summary, true);
      const output = reporter.format(result);
      const parsed = JSON.parse(output);

      // Verify files, summary, passed are all preserved exactly
      expect(parsed.files).toEqual(result.files);
      expect(parsed.summary).toEqual(result.summary);
      expect(parsed.passed).toEqual(result.passed);
      expect(parsed.config).toEqual(result.thresholdConfig);
    });

    it("handles empty results", () => {
      const result = makeResult([], makeSummary(), true);
      const output = reporter.format(result);
      const parsed = JSON.parse(output);

      expect(parsed.files).toEqual([]);
      expect(parsed.summary.totalFunctions).toBe(0);
      expect(parsed.passed).toBe(true);
    });

    it("has all expected top-level envelope keys", () => {
      const result = makeResult([], makeSummary(), true);
      const output = reporter.format(result);
      const parsed = JSON.parse(output);

      const keys = Object.keys(parsed);
      expect(keys).toContain("$schema");
      expect(keys).toContain("version");
      expect(keys).toContain("timestamp");
      expect(keys).toContain("config");
      expect(keys).toContain("summary");
      expect(keys).toContain("files");
      expect(keys).toContain("passed");
    });

    it("uses a stable timestamp within a single call", () => {
      // Freeze time to ensure timestamp is consistent
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-06-15T12:00:00.000Z"));

      const result = makeResult([], makeSummary(), true);
      const output = reporter.format(result);
      const parsed = JSON.parse(output);

      expect(parsed.timestamp).toBe("2025-06-15T12:00:00.000Z");

      vi.useRealTimers();
    });
  });

  describe("implements ReporterPort", () => {
    it("has a format method returning string", () => {
      const result = makeResult([], makeSummary(), true);
      const output = reporter.format(result);
      expect(typeof output).toBe("string");
    });
  });
});
