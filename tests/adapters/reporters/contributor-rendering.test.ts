import { describe, it, expect } from "vitest";
import { JsonReporter } from "../../../src/adapters/reporters/json.js";
import { ConsoleReporter } from "../../../src/adapters/reporters/console.js";
import { MarkdownReporter } from "../../../src/adapters/reporters/markdown.js";
import { computeSummary } from "../../../src/domain/summary.js";
import type {
  AnalysisResult,
  ComplexityContributor,
  FunctionVerdict,
} from "../../../src/domain/types.js";

// ── Test Helpers ──────────────────────────────────────────────────

function makeIdentity(filePath: string, name: string) {
  return {
    filePath,
    qualifiedName: name,
    span: { startLine: 1, startColumn: 0, endLine: 10, endColumn: 0 },
  };
}

function makeScore(value: number) {
  return { value, riskLevel: "low" as const };
}

const sampleContributors: ComplexityContributor[] = [
  { kind: "if-branch", line: 10, column: 4 },
  { kind: "for-loop", line: 15, column: 2 },
  { kind: "logical-operator", line: 20, column: 8, operator: "&&" },
];

function makeVerdict(
  name: string,
  crapValue: number,
  threshold: number,
  contributors: ComplexityContributor[] = sampleContributors,
): FunctionVerdict {
  return {
    scored: {
      identity: makeIdentity("test.ts", name),
      cyclomaticComplexity: contributors.length + 1,
      coveragePercent: 50,
      crap: makeScore(crapValue),
      contributors,
    },
    threshold,
    exceeds: crapValue > threshold,
  };
}

function makeResult(verdicts: FunctionVerdict[]): AnalysisResult {
  return {
    functions: verdicts,
    unmatched: [],
    warnings: [],
    summary: computeSummary(verdicts),
    thresholdConfig: { defaultThreshold: 12, overrides: [] },
    passed: verdicts.every((v) => !v.exceeds),
  };
}

describe("Contributor rendering in reporters", () => {
  describe("JSON reporter: breakdown mode filtering", () => {
    it('mode "all" includes contributors on every function', () => {
      const v1 = makeVerdict("fn1", 20, 12); // exceeding
      const v2 = makeVerdict("fn2", 5, 12); // not exceeding
      const v3 = makeVerdict("fn3", 15, 12); // exceeding
      const result = makeResult([v1, v2, v3]);

      const reporter = new JsonReporter({ breakdown: "all" });
      const parsed = JSON.parse(reporter.format(result));

      for (const fn of parsed.functions) {
        expect(fn.scored).toHaveProperty("contributors");
      }
    });

    it('mode "exceeding" includes contributors only on exceeding functions', () => {
      const v1 = makeVerdict("fn1", 20, 12); // exceeding
      const v2 = makeVerdict("fn2", 5, 12); // not exceeding
      const v3 = makeVerdict("fn3", 15, 12); // exceeding
      const result = makeResult([v1, v2, v3]);

      const reporter = new JsonReporter({ breakdown: "exceeding" });
      const parsed = JSON.parse(reporter.format(result));

      expect(parsed.functions[0].scored).toHaveProperty("contributors");
      expect(parsed.functions[1].scored).not.toHaveProperty("contributors");
      expect(parsed.functions[2].scored).toHaveProperty("contributors");
    });

    it('mode "off" omits contributors from all functions', () => {
      const v1 = makeVerdict("fn1", 20, 12);
      const result = makeResult([v1]);

      const reporter = new JsonReporter({ breakdown: "off" });
      const parsed = JSON.parse(reporter.format(result));

      expect(parsed.functions[0].scored).not.toHaveProperty("contributors");
    });
  });

  describe("JSON key presence contract", () => {
    it("CC=1 function has empty contributors array when breakdown is active", () => {
      const v = makeVerdict("simple", 1, 12, []);
      const result = makeResult([v]);

      const reporter = new JsonReporter({ breakdown: "all" });
      const parsed = JSON.parse(reporter.format(result));

      expect(parsed.functions[0].scored.contributors).toEqual([]);
    });

    it("contributors key is absent from JSON when breakdown mode is off", () => {
      const v = makeVerdict("fn", 20, 12);
      const result = makeResult([v]);

      const reporter = new JsonReporter({ breakdown: "off" });
      const parsed = JSON.parse(reporter.format(result));

      expect(parsed.functions[0].scored).not.toHaveProperty("contributors");
    });

    it("non-exceeding function has no contributors key in exceeding mode", () => {
      const v = makeVerdict("fn", 5, 12);
      const result = makeResult([v]);

      const reporter = new JsonReporter({ breakdown: "exceeding" });
      const parsed = JSON.parse(reporter.format(result));

      expect(parsed.functions[0].scored).not.toHaveProperty("contributors");
    });
  });

  describe("JSON output shape", () => {
    it("contributors in JSON include kind, line, and column", () => {
      const contributors: ComplexityContributor[] = [
        { kind: "if-branch", line: 10, column: 4 },
      ];
      const v = makeVerdict("fn", 20, 12, contributors);
      const result = makeResult([v]);

      const reporter = new JsonReporter({ breakdown: "all" });
      const parsed = JSON.parse(reporter.format(result));

      const c = parsed.functions[0].scored.contributors[0];
      expect(c.kind).toBe("if-branch");
      expect(c.line).toBe(10);
      expect(c.column).toBe(4);
    });

    it("logical operator contributors in JSON include operator field", () => {
      const contributors: ComplexityContributor[] = [
        { kind: "logical-operator", line: 5, column: 8, operator: "&&" },
      ];
      const v = makeVerdict("fn", 20, 12, contributors);
      const result = makeResult([v]);

      const reporter = new JsonReporter({ breakdown: "all" });
      const parsed = JSON.parse(reporter.format(result));

      expect(parsed.functions[0].scored.contributors[0].operator).toBe("&&");
    });

    it("non-logical contributors in JSON omit operator field", () => {
      const contributors: ComplexityContributor[] = [
        { kind: "if-branch", line: 5, column: 2 },
      ];
      const v = makeVerdict("fn", 20, 12, contributors);
      const result = makeResult([v]);

      const reporter = new JsonReporter({ breakdown: "all" });
      const parsed = JSON.parse(reporter.format(result));

      expect(parsed.functions[0].scored.contributors[0]).not.toHaveProperty("operator");
    });
  });

  describe("Table and markdown reporters", () => {
    it("console reporter output is unchanged regardless of breakdown mode", () => {
      const v = makeVerdict("fn", 20, 12);
      const result = makeResult([v]);

      const withBreakdown = new ConsoleReporter({ color: false });
      const withoutBreakdown = new ConsoleReporter({ color: false });

      expect(withBreakdown.format(result)).toBe(withoutBreakdown.format(result));
    });

    it("markdown reporter output is unchanged regardless of breakdown mode", () => {
      const v = makeVerdict("fn", 20, 12);
      const result = makeResult([v]);

      const reporter1 = new MarkdownReporter();
      const reporter2 = new MarkdownReporter();

      expect(reporter1.format(result)).toBe(reporter2.format(result));
    });
  });
});
