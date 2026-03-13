import { describe, it, expect } from "vitest";
import { computeCrap, classifyRisk } from "../../src/domain/crap.js";
import { RiskLevel } from "../../src/domain/types.js";

describe("computeCrap", () => {
  it.each([
    { cc: 1, cov: 100, expected: 1.0 },
    { cc: 1, cov: 0, expected: 2.0 },
    { cc: 2, cov: 0, expected: 6.0 },
    { cc: 3, cov: 0, expected: 12.0 },
    { cc: 5, cov: 100, expected: 5.0 },
    { cc: 5, cov: 0, expected: 30.0 },
    { cc: 5, cov: 34.5, expected: 12.03 },
    { cc: 5, cov: 51, expected: 7.94 },
    { cc: 8, cov: 100, expected: 8.0 },
    { cc: 8, cov: 0, expected: 72.0 },
    { cc: 8, cov: 80, expected: 8.51 },
    { cc: 10, cov: 100, expected: 10.0 },
    { cc: 10, cov: 0, expected: 110.0 },
    { cc: 12, cov: 100, expected: 12.0 },
    { cc: 12.01, cov: 100, expected: 12.01 },
    { cc: 20, cov: 0, expected: 420.0 },
    { cc: 30, cov: 100, expected: 30.0 },
    { cc: 31, cov: 100, expected: 31.0 },
    { cc: 50, cov: 0, expected: 2550.0 },
  ])("CC=$cc, cov=$cov% => CRAP=$expected", ({ cc, cov, expected }) => {
    const result = computeCrap(cc, cov);
    expect(result.value).toBe(expected);
  });

  it("clamps coverage > 100 to 100", () => {
    const result = computeCrap(5, 105);
    expect(result.value).toBe(5.0);
  });

  it("clamps coverage < 0 to 0", () => {
    const result = computeCrap(5, -10);
    expect(result.value).toBe(30.0);
  });

  it("throws on CC < 1", () => {
    expect(() => computeCrap(0, 50)).toThrow();
  });

  it("throws on NaN coverage", () => {
    expect(() => computeCrap(5, NaN)).toThrow();
  });

  it("throws on Infinity coverage", () => {
    expect(() => computeCrap(5, Infinity)).toThrow();
  });
});

describe("classifyRisk", () => {
  it.each([
    { score: 1.0, expected: RiskLevel.Low },
    { score: 5.0, expected: RiskLevel.Low },
    { score: 5.5, expected: RiskLevel.Acceptable },
    { score: 8.0, expected: RiskLevel.Acceptable },
    { score: 8.1, expected: RiskLevel.Moderate },
    { score: 30.0, expected: RiskLevel.Moderate },
    { score: 30.1, expected: RiskLevel.High },
    { score: 100.0, expected: RiskLevel.High },
  ])("score=$score => $expected", ({ score, expected }) => {
    expect(classifyRisk(score)).toBe(expected);
  });
});

describe("threshold verdict (exceeds semantics)", () => {
  it.each([
    { cc: 3, cov: 0, threshold: 12, exceeds: false },
    { cc: 12, cov: 100, threshold: 12, exceeds: false },
    { cc: 12.01, cov: 100, threshold: 12, exceeds: true },
    { cc: 5, cov: 34.5, threshold: 12, exceeds: true },
    { cc: 5, cov: 51, threshold: 12, exceeds: false },
    { cc: 30, cov: 100, threshold: 12, exceeds: true },
  ])("CC=$cc cov=$cov% vs threshold=$threshold => exceeds=$exceeds",
    ({ cc, cov, threshold, exceeds }) => {
      const score = computeCrap(cc, cov);
      expect(score.value > threshold).toBe(exceeds);
    },
  );
});
