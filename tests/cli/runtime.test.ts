import { describe, expect, it } from "vitest";
import { RiskLevel, type AnalysisResult, type FunctionVerdict } from "../../src/domain/types.js";
import {
  applyFilters,
  CliOptionError,
  coerceArrayOption,
  createReporter,
  formatSummaryLine,
  parseBreakdownCliFlag,
  resolveThresholdFlag,
  sortVerdicts,
  validateMutualExclusions,
} from "../../src/cli/runtime.js";

function createVerdict(
  qualifiedName: string,
  crap: number,
  complexity: number,
  coveragePercent: number,
): FunctionVerdict {
  return {
    scored: {
      identity: {
        filePath: "src/example.ts",
        qualifiedName,
        span: {
          startLine: 1,
          startColumn: 0,
          endLine: 2,
          endColumn: 0,
        },
      },
      cyclomaticComplexity: complexity,
      coveragePercent,
      crap: {
        value: crap,
        riskLevel: RiskLevel.Acceptable,
      },
      contributors: [],
    },
    threshold: 12,
    exceeds: crap > 12,
  };
}

function createResult(functions: FunctionVerdict[]): AnalysisResult {
  return {
    functions,
    unmatched: [],
    warnings: [],
    summary: {
      totalFunctions: functions.length,
      totalFiles: 1,
      exceedingThreshold: functions.filter((fn) => fn.exceeds).length,
      exceedingPercent: 0,
      averageCrap: 16,
      medianCrap: 16,
      maxCrap: {
        value: 24,
        riskLevel: RiskLevel.Moderate,
      },
      worstFunction: functions[0]?.scored.identity ?? null,
      distribution: {
        [RiskLevel.Low]: 0,
        [RiskLevel.Acceptable]: functions.length,
        [RiskLevel.Moderate]: 0,
        [RiskLevel.High]: 0,
      },
      crapLoad: 48,
    },
    thresholdConfig: {
      defaultThreshold: 12,
      overrides: [],
    },
    passed: functions.every((fn) => !fn.exceeds),
  };
}

describe("validateMutualExclusions", () => {
  it("rejects conflicting threshold flags", () => {
    expect(() =>
      validateMutualExclusions({ strict: true, threshold: 15 }),
    ).toThrowError(CliOptionError);
  });

  it("rejects quiet and verbose together", () => {
    expect(() =>
      validateMutualExclusions({ quiet: true, verbose: true }),
    ).toThrowError(/--quiet, --verbose/);
  });

  it("accepts non-conflicting flags", () => {
    expect(() =>
      validateMutualExclusions({ strict: true, verbose: true }),
    ).not.toThrow();
  });
});

describe("resolveThresholdFlag", () => {
  it("maps strict and lenient presets", () => {
    expect(resolveThresholdFlag({ strict: true })).toBe(8);
    expect(resolveThresholdFlag({ lenient: true })).toBe(30);
  });

  it("falls back to explicit threshold", () => {
    expect(resolveThresholdFlag({ threshold: 21 })).toBe(21);
  });
});

describe("parseBreakdownCliFlag", () => {
  it("defaults bare --breakdown to exceeding", () => {
    expect(parseBreakdownCliFlag(true)).toBe("exceeding");
  });

  it("passes through supported values", () => {
    expect(parseBreakdownCliFlag("all")).toBe("all");
    expect(parseBreakdownCliFlag("exceeding")).toBe("exceeding");
    expect(parseBreakdownCliFlag("off")).toBe("off");
    expect(parseBreakdownCliFlag(undefined)).toBeUndefined();
  });

  it("rejects invalid values", () => {
    expect(() => parseBreakdownCliFlag("bad")).toThrowError(CliOptionError);
  });
});

describe("coerceArrayOption", () => {
  it("normalizes empty arrays to undefined", () => {
    expect(coerceArrayOption([])).toBeUndefined();
  });

  it("preserves populated arrays", () => {
    expect(coerceArrayOption(["src"])).toEqual(["src"]);
  });
});

describe("createReporter", () => {
  it("creates supported reporter implementations", () => {
    expect(createReporter({ noColor: false }).constructor.name).toBe("ConsoleReporter");
    expect(createReporter({ format: "json", noColor: false }).constructor.name).toBe("JsonReporter");
    expect(createReporter({ format: "markdown", noColor: false }).constructor.name).toBe("MarkdownReporter");
  });

  it("rejects unsupported formats", () => {
    expect(() =>
      createReporter({ format: "xml" as never, noColor: false }),
    ).toThrowError(CliOptionError);
  });
});

describe("sortVerdicts", () => {
  const verdicts = [
    createVerdict("charlie", 18, 3, 80),
    createVerdict("alpha", 24, 5, 20),
    createVerdict("bravo", 12, 4, 50),
  ];

  it("sorts by crap descending", () => {
    expect(sortVerdicts([...verdicts], "crap").map((fn) => fn.scored.identity.qualifiedName))
      .toEqual(["alpha", "charlie", "bravo"]);
  });

  it("sorts by complexity descending", () => {
    expect(sortVerdicts([...verdicts], "complexity").map((fn) => fn.scored.identity.qualifiedName))
      .toEqual(["alpha", "bravo", "charlie"]);
  });

  it("sorts by coverage ascending", () => {
    expect(sortVerdicts([...verdicts], "coverage").map((fn) => fn.scored.identity.qualifiedName))
      .toEqual(["alpha", "bravo", "charlie"]);
  });

  it("sorts by name ascending", () => {
    expect(sortVerdicts([...verdicts], "name").map((fn) => fn.scored.identity.qualifiedName))
      .toEqual(["alpha", "bravo", "charlie"]);
  });

  it("rejects invalid sort fields", () => {
    expect(() => sortVerdicts([...verdicts], "rank")).toThrowError(CliOptionError);
  });
});

describe("applyFilters", () => {
  const result = createResult([
    createVerdict("charlie", 18, 3, 80),
    createVerdict("alpha", 24, 5, 20),
    createVerdict("bravo", 12, 4, 50),
  ]);

  it("returns the original result when no filters are applied", () => {
    expect(applyFilters(result)).toBe(result);
  });

  it("defaults top-only views to crap ordering", () => {
    const filtered = applyFilters(result, undefined, 2);
    expect(filtered.functions.map((fn) => fn.scored.identity.qualifiedName))
      .toEqual(["alpha", "charlie"]);
  });

  it("applies explicit sorting before slicing", () => {
    const filtered = applyFilters(result, "coverage", 2);
    expect(filtered.functions.map((fn) => fn.scored.identity.qualifiedName))
      .toEqual(["alpha", "bravo"]);
  });
});

describe("formatSummaryLine", () => {
  it("formats the compact summary output", () => {
    const summary = formatSummaryLine(createResult([
      createVerdict("alpha", 24, 5, 20),
      createVerdict("bravo", 12, 4, 50),
    ]));

    expect(summary).toBe(
      "FAIL: 2 functions | 1 above threshold (12) | worst: 24.0 | avg: 16.0",
    );
  });
});
