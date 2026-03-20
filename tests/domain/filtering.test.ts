import { describe, it, expect } from "vitest";
import { spansOverlap, shouldInclude } from "../../src/domain/filtering.js";
import type {
  SourceSpan,
  FunctionFilter,
  FunctionIdentity,
} from "../../src/domain/types.js";

// ── Helpers ──────────────────────────────────────────────────────────

function span(start: number, end: number): SourceSpan {
  return { startLine: start, startColumn: 0, endLine: end, endColumn: 0 };
}

function identity(filePath: string, s: SourceSpan): FunctionIdentity {
  return { filePath, qualifiedName: "fn", span: s };
}

function filter(
  entries: [string, ReadonlyArray<SourceSpan> | null][],
): FunctionFilter {
  return {
    description: "test filter",
    changedFiles: new Map(entries),
  };
}

// ── spansOverlap ─────────────────────────────────────────────────────

describe("spansOverlap", () => {
  it("returns true when spans share lines", () => {
    expect(spansOverlap(span(5, 15), span(10, 20))).toBe(true);
  });

  it("returns false when spans are separated", () => {
    expect(spansOverlap(span(5, 10), span(15, 20))).toBe(false);
  });

  it("returns false for adjacent spans under half-open convention", () => {
    // [5, 10) and [10, 15) — endLine 10 is exclusive, so no overlap
    expect(spansOverlap(span(5, 10), span(10, 15))).toBe(false);
  });

  it("returns false for reverse-adjacent spans under half-open convention", () => {
    // [10, 15) and [5, 10) — tests the other boundary direction
    expect(spansOverlap(span(10, 15), span(5, 10))).toBe(false);
  });

  it("returns true for single-line change inside a function", () => {
    expect(spansOverlap(span(1, 50), span(25, 26))).toBe(true);
  });
});

// ── shouldInclude ────────────────────────────────────────────────────

describe("shouldInclude", () => {
  it("excludes functions in files not in the filter", () => {
    const f = filter([["other.ts", null]]);
    expect(shouldInclude(f, identity("utils.ts", span(1, 10)))).toBe(false);
  });

  it("includes all functions when file maps to null (whole-file)", () => {
    const f = filter([["utils.ts", null]]);
    expect(shouldInclude(f, identity("utils.ts", span(1, 10)))).toBe(true);
  });

  it("includes functions with changed lines inside them", () => {
    const f = filter([["service.ts", [span(10, 15)]]]);
    expect(shouldInclude(f, identity("service.ts", span(5, 20)))).toBe(true);
  });

  it("excludes functions with no changed lines inside them", () => {
    const f = filter([["service.ts", [span(10, 15)]]]);
    expect(shouldInclude(f, identity("service.ts", span(50, 60)))).toBe(false);
  });

  it("excludes functions when file has empty change list (deletion-only)", () => {
    const f = filter([["cleanup.ts", []]]);
    expect(shouldInclude(f, identity("cleanup.ts", span(1, 30)))).toBe(false);
  });

  it("includes function when it overlaps one of multiple changed spans", () => {
    // File has changes at lines 10-15 and 50-55; function spans 45-60
    const f = filter([["service.ts", [span(10, 15), span(50, 55)]]]);
    expect(shouldInclude(f, identity("service.ts", span(45, 60)))).toBe(true);
  });
});
