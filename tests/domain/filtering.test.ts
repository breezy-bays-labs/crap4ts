import { describe, it, expect } from "vitest";
import { shouldInclude } from "../../src/domain/filtering.js";
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
