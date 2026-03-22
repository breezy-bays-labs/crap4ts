import { describe, it, expect } from "vitest";
import { selectContributors } from "../../src/domain/contributors.js";
import type {
  ComplexityContributor,
  FunctionVerdict,
} from "../../src/domain/types.js";

function makeVerdict(
  exceeds: boolean,
  contributors: ComplexityContributor[],
): FunctionVerdict {
  return {
    scored: {
      identity: {
        filePath: "test.ts",
        qualifiedName: "fn",
        span: { startLine: 1, startColumn: 0, endLine: 10, endColumn: 0 },
      },
      cyclomaticComplexity: contributors.length + 1,
      coveragePercent: 50,
      crap: { value: exceeds ? 20 : 2, riskLevel: "low" as const },
      contributors,
    },
    threshold: 12,
    exceeds,
  };
}

const threeContributors: ComplexityContributor[] = [
  { kind: "if-branch", line: 2, column: 4 },
  { kind: "for-loop", line: 5, column: 2 },
  { kind: "logical-operator", line: 8, column: 10, operator: "&&" },
];

describe("selectContributors", () => {
  it("returns contributors for exceeding function in exceeding mode", () => {
    const verdict = makeVerdict(true, threeContributors);
    expect(selectContributors(verdict, "exceeding")).toEqual(threeContributors);
  });

  it("returns empty for non-exceeding function in exceeding mode", () => {
    const verdict = makeVerdict(false, threeContributors);
    expect(selectContributors(verdict, "exceeding")).toEqual([]);
  });

  it("returns contributors for any function in all mode", () => {
    const verdict = makeVerdict(false, threeContributors);
    expect(selectContributors(verdict, "all")).toEqual(threeContributors);
  });

  it("returns empty for any function in off mode", () => {
    const verdict = makeVerdict(true, threeContributors);
    expect(selectContributors(verdict, "off")).toEqual([]);
  });
});
