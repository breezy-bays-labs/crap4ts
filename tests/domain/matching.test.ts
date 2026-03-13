import { describe, it, expect } from "vitest";
import { spansOverlap, spanContains, overlapRatio, defaultSpanMatcher } from "../../src/domain/matching.js";

describe("spansOverlap", () => {
  it("returns true for overlapping spans", () => {
    expect(spansOverlap(
      { startLine: 1, startColumn: 0, endLine: 10, endColumn: 0 },
      { startLine: 5, startColumn: 0, endLine: 15, endColumn: 0 },
    )).toBe(true);
  });

  it("returns false for non-overlapping spans", () => {
    expect(spansOverlap(
      { startLine: 1, startColumn: 0, endLine: 5, endColumn: 0 },
      { startLine: 5, startColumn: 0, endLine: 10, endColumn: 0 },
    )).toBe(false);
  });

  it("returns true when one contains the other", () => {
    expect(spansOverlap(
      { startLine: 1, startColumn: 0, endLine: 20, endColumn: 0 },
      { startLine: 5, startColumn: 0, endLine: 10, endColumn: 0 },
    )).toBe(true);
  });
});

describe("spanContains", () => {
  it("returns true when outer contains inner", () => {
    expect(spanContains(
      { startLine: 1, startColumn: 0, endLine: 20, endColumn: 0 },
      { startLine: 5, startColumn: 0, endLine: 10, endColumn: 0 },
    )).toBe(true);
  });

  it("returns false when inner extends beyond outer", () => {
    expect(spanContains(
      { startLine: 5, startColumn: 0, endLine: 10, endColumn: 0 },
      { startLine: 1, startColumn: 0, endLine: 20, endColumn: 0 },
    )).toBe(false);
  });
});

describe("overlapRatio", () => {
  it("returns 1.0 for identical spans", () => {
    const span = { startLine: 1, startColumn: 0, endLine: 11, endColumn: 0 };
    expect(overlapRatio(span, span)).toBe(1.0);
  });

  it("returns 0.5 for half overlap", () => {
    expect(overlapRatio(
      { startLine: 1, startColumn: 0, endLine: 11, endColumn: 0 },
      { startLine: 6, startColumn: 0, endLine: 16, endColumn: 0 },
    )).toBe(0.5);
  });

  it("returns 0 for no overlap", () => {
    expect(overlapRatio(
      { startLine: 1, startColumn: 0, endLine: 5, endColumn: 0 },
      { startLine: 10, startColumn: 0, endLine: 15, endColumn: 0 },
    )).toBe(0);
  });
});

describe("defaultSpanMatcher", () => {
  const makeComplexity = (file: string, name: string, start: number, end: number, cc = 1) => ({
    identity: { filePath: file, qualifiedName: name, span: { startLine: start, startColumn: 0, endLine: end, endColumn: 0 } },
    cyclomaticComplexity: cc,
  });
  const makeCoverage = (file: string, name: string, start: number, end: number) => ({
    filePath: file, name, span: { startLine: start, startColumn: 0, endLine: end, endColumn: 0 },
    lineCoverage: { covered: 5, total: 10, percent: 50 },
    branchCoverage: null,
  });

  it("matches functions by file and span overlap (1:1)", () => {
    const result = defaultSpanMatcher(
      [makeComplexity("a.ts", "foo", 1, 10)],
      [makeCoverage("a.ts", "foo", 1, 10)],
    );
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].complexity.identity.qualifiedName).toBe("foo");
    expect(result.unmatchedComplexity).toHaveLength(0);
    expect(result.unmatchedCoverage).toHaveLength(0);
  });

  it("rejects match below 0.8 overlap threshold", () => {
    const result = defaultSpanMatcher(
      [makeComplexity("a.ts", "foo", 1, 11)],
      [makeCoverage("a.ts", "foo", 8, 18)],
    );
    expect(result.matched).toHaveLength(0);
    expect(result.unmatchedComplexity).toHaveLength(1);
  });

  it("prefers containment over partial overlap", () => {
    const result = defaultSpanMatcher(
      [makeComplexity("a.ts", "inner", 5, 10)],
      [
        makeCoverage("a.ts", "inner", 4, 11),
        makeCoverage("a.ts", "inner", 5, 15),
      ],
    );
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].coverage.span.startLine).toBe(4);
  });

  it("enforces 1:1 constraint — each coverage matches at most one complexity", () => {
    const result = defaultSpanMatcher(
      [makeComplexity("a.ts", "foo", 1, 10), makeComplexity("a.ts", "bar", 1, 10)],
      [makeCoverage("a.ts", "foo", 1, 10)],
    );
    expect(result.matched).toHaveLength(1);
    expect(result.unmatchedComplexity).toHaveLength(1);
  });

  it("uses name as tiebreaker when overlap is equal", () => {
    const result = defaultSpanMatcher(
      [makeComplexity("a.ts", "foo", 1, 10)],
      [
        makeCoverage("a.ts", "bar", 1, 10),
        makeCoverage("a.ts", "foo", 1, 10),
      ],
    );
    expect(result.matched[0].coverage.name).toBe("foo");
  });

  it("groups by filePath — does not cross-match between files", () => {
    const result = defaultSpanMatcher(
      [makeComplexity("a.ts", "foo", 1, 10)],
      [makeCoverage("b.ts", "foo", 1, 10)],
    );
    expect(result.matched).toHaveLength(0);
    expect(result.unmatchedComplexity).toHaveLength(1);
    expect(result.unmatchedCoverage).toHaveLength(1);
  });

  it("reports unmatched complexity entries (no-coverage)", () => {
    const result = defaultSpanMatcher(
      [makeComplexity("a.ts", "foo", 1, 10)],
      [],
    );
    expect(result.unmatchedComplexity).toHaveLength(1);
  });

  it("reports unmatched coverage entries (no-ast)", () => {
    const result = defaultSpanMatcher(
      [],
      [makeCoverage("a.ts", "foo", 1, 10)],
    );
    expect(result.unmatchedCoverage).toHaveLength(1);
  });
});
