import { describe, it, expect } from "vitest";
import { computeSummary } from "../../src/domain/summary.js";
import { classifyRisk } from "../../src/domain/crap.js";
import { RiskLevel } from "../../src/domain/types.js";
import type { FunctionVerdict, FunctionIdentity, CrapScore } from "../../src/domain/types.js";

function makeVerdict(name: string, crapValue: number, threshold: number): FunctionVerdict {
  const identity: FunctionIdentity = {
    filePath: "test.ts", qualifiedName: name,
    span: { startLine: 1, startColumn: 0, endLine: 10, endColumn: 0 },
  };
  const crap: CrapScore = { value: crapValue, riskLevel: classifyRisk(crapValue) };
  return {
    scored: { identity, cyclomaticComplexity: 1, coveragePercent: 100, crap },
    threshold,
    exceeds: crapValue > threshold,
  };
}

describe("computeSummary", () => {
  it("returns zeros for empty input", () => {
    const summary = computeSummary([]);
    expect(summary.totalFunctions).toBe(0);
    expect(summary.exceedingThreshold).toBe(0);
    expect(summary.crapLoad).toBe(0);
    expect(summary.worstFunction).toBeNull();
  });

  it("all below threshold => crapLoad=0, exceedingThreshold=0", () => {
    const verdicts = [makeVerdict("a", 5.0, 12), makeVerdict("b", 8.0, 12)];
    const summary = computeSummary(verdicts);
    expect(summary.exceedingThreshold).toBe(0);
    expect(summary.crapLoad).toBe(0);
  });

  it("computes CRAP load as sum of excess (spec example)", () => {
    const verdicts = [
      makeVerdict("a", 50, 12), makeVerdict("b", 15, 12),
      makeVerdict("c", 15, 12), makeVerdict("d", 5, 12),
    ];
    const summary = computeSummary(verdicts);
    expect(summary.crapLoad).toBe(44);
    expect(summary.exceedingThreshold).toBe(3);
    expect(summary.exceedingPercent).toBe(75);
  });

  it("identifies worstFunction correctly", () => {
    const verdicts = [makeVerdict("low", 2, 12), makeVerdict("high", 50, 12)];
    const summary = computeSummary(verdicts);
    expect(summary.worstFunction?.qualifiedName).toBe("high");
    expect(summary.maxCrap.value).toBe(50);
  });

  it("computes median correctly (odd count)", () => {
    const verdicts = [makeVerdict("a", 2, 12), makeVerdict("b", 5, 12), makeVerdict("c", 10, 12)];
    const summary = computeSummary(verdicts);
    expect(summary.medianCrap).toBe(5);
  });

  it("computes median correctly (even count)", () => {
    const verdicts = [
      makeVerdict("a", 2, 12), makeVerdict("b", 4, 12),
      makeVerdict("c", 6, 12), makeVerdict("d", 8, 12),
    ];
    const summary = computeSummary(verdicts);
    expect(summary.medianCrap).toBe(5);
  });

  it("computes risk distribution counts", () => {
    const verdicts = [
      makeVerdict("low", 3, 12),
      makeVerdict("ok", 7, 12),
      makeVerdict("mod", 15, 12),
      makeVerdict("high", 50, 12),
    ];
    const summary = computeSummary(verdicts);
    expect(summary.distribution[RiskLevel.Low]).toBe(1);
    expect(summary.distribution[RiskLevel.Acceptable]).toBe(1);
    expect(summary.distribution[RiskLevel.Moderate]).toBe(1);
    expect(summary.distribution[RiskLevel.High]).toBe(1);
  });

  it("computes averageCrap", () => {
    const verdicts = [makeVerdict("a", 10, 12), makeVerdict("b", 20, 12)];
    const summary = computeSummary(verdicts);
    expect(summary.averageCrap).toBe(15);
  });

  it("computes correct median with unsorted input", () => {
    const verdicts = [
      makeVerdict("high", 10, 12),
      makeVerdict("low", 2, 12),
      makeVerdict("mid", 5, 12),
    ];
    const summary = computeSummary(verdicts);
    expect(summary.medianCrap).toBe(5);
  });

  it("identifies worstFunction regardless of input order", () => {
    const verdicts = [
      makeVerdict("worst", 50, 12),
      makeVerdict("ok", 2, 12),
    ];
    const summary = computeSummary(verdicts);
    expect(summary.worstFunction?.qualifiedName).toBe("worst");
  });

  it("counts totalFiles from unique filePaths", () => {
    const v1 = makeVerdict("a", 5, 12);
    const v2: FunctionVerdict = {
      scored: {
        identity: { filePath: "other.ts", qualifiedName: "b", span: { startLine: 1, startColumn: 0, endLine: 10, endColumn: 0 } },
        cyclomaticComplexity: 1, coveragePercent: 100,
        crap: { value: 3, riskLevel: RiskLevel.Low },
      },
      threshold: 12, exceeds: false,
    };
    const summary = computeSummary([v1, v2]);
    expect(summary.totalFiles).toBe(2);
  });
});
