import type {
  SourceSpan,
  FunctionComplexity,
  FunctionCoverage,
  MatchResult,
  MatchFunctions,
} from "./types.js";

// ── Span Utilities ─────────────────────────────────────────────────

/**
 * Returns true when two half-open spans overlap (share at least one line).
 * Both spans use exclusive endLine (half-open convention).
 */
export function spansOverlap(a: SourceSpan, b: SourceSpan): boolean {
  return a.startLine < b.endLine && b.startLine < a.endLine;
}

/**
 * Returns true when `outer` fully contains `inner`.
 */
export function spanContains(outer: SourceSpan, inner: SourceSpan): boolean {
  return outer.startLine <= inner.startLine && inner.endLine <= outer.endLine;
}

/**
 * Returns the fraction of `a` that overlaps with `b`, in [0, 1].
 * If `a` has zero length, returns 0.
 */
export function overlapRatio(a: SourceSpan, b: SourceSpan): number {
  const aLen = a.endLine - a.startLine;
  if (aLen <= 0) return 0;

  const overlapStart = Math.max(a.startLine, b.startLine);
  const overlapEnd = Math.min(a.endLine, b.endLine);
  const overlap = Math.max(0, overlapEnd - overlapStart);

  return overlap / aLen;
}

// ── Default Span Matcher ───────────────────────────────────────────

/**
 * Groups items by a key function into a Map of arrays.
 */
function groupBy<T>(items: ReadonlyArray<T>, key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    let group = map.get(k);
    if (!group) {
      group = [];
      map.set(k, group);
    }
    group.push(item);
  }
  return map;
}

/**
 * Matches complexity entries to coverage entries by file and span overlap.
 *
 * Algorithm:
 * 1. Group both inputs by filePath.
 * 2. Within each file, for each FunctionComplexity:
 *    - Find FunctionCoverage candidates with overlap ratio >= 0.8
 *    - Prefer containment (coverage span fully contains complexity span)
 *    - Use name as tiebreaker when overlap is equal
 *    - Enforce 1:1 constraint (each coverage matched at most once)
 * 3. Collect unmatched entries.
 */
export const defaultSpanMatcher: MatchFunctions = (
  complexities: ReadonlyArray<FunctionComplexity>,
  coverages: ReadonlyArray<FunctionCoverage>,
): MatchResult => {
  const OVERLAP_THRESHOLD = 0.8;

  const complexityByFile = groupBy(complexities, (c) => c.identity.filePath);
  const coverageByFile = groupBy(coverages, (c) => c.filePath);

  const matched: Array<{ complexity: FunctionComplexity; coverage: FunctionCoverage }> = [];
  const unmatchedComplexity: FunctionComplexity[] = [];
  const unmatchedCoverage: FunctionCoverage[] = [];

  // Track which coverage entries have been claimed (by file + index).
  const usedCoverage = new Set<FunctionCoverage>();

  // Collect all file paths from both sides.
  const allFiles = new Set([...complexityByFile.keys(), ...coverageByFile.keys()]);

  for (const file of allFiles) {
    const fileComplexities = complexityByFile.get(file) ?? [];
    const fileCoverages = coverageByFile.get(file) ?? [];

    for (const comp of fileComplexities) {
      const compSpan = comp.identity.span;
      const compName = comp.identity.qualifiedName;

      // Find eligible candidates: overlap >= threshold and not already used.
      type Candidate = {
        cov: FunctionCoverage;
        ratio: number;
        contains: boolean;
        nameMatch: boolean;
      };

      const candidates: Candidate[] = [];
      for (const cov of fileCoverages) {
        if (usedCoverage.has(cov)) continue;

        const ratio = overlapRatio(compSpan, cov.span);
        if (ratio < OVERLAP_THRESHOLD) continue;

        candidates.push({
          cov,
          ratio,
          contains: spanContains(cov.span, compSpan),
          nameMatch: cov.name === compName,
        });
      }

      if (candidates.length === 0) {
        unmatchedComplexity.push(comp);
        continue;
      }

      // Sort candidates: containment first, then ratio desc, then name match.
      candidates.sort((a, b) => {
        // Prefer containment.
        if (a.contains !== b.contains) return a.contains ? -1 : 1;
        // Then higher overlap ratio.
        if (a.ratio !== b.ratio) return b.ratio - a.ratio;
        // Then name match as tiebreaker.
        if (a.nameMatch !== b.nameMatch) return a.nameMatch ? -1 : 1;
        return 0;
      });

      const best = candidates[0];
      matched.push({ complexity: comp, coverage: best.cov });
      usedCoverage.add(best.cov);
    }

    // Collect unmatched coverage for this file.
    for (const cov of fileCoverages) {
      if (!usedCoverage.has(cov)) {
        unmatchedCoverage.push(cov);
      }
    }
  }

  return { matched, unmatchedComplexity, unmatchedCoverage };
};
