import { computeCrap } from "../domain/crap.js";
import {
  createThresholdConfig,
  resolveThreshold,
} from "../domain/threshold.js";
import type {
  FunctionCoverage,
  FunctionVerdict,
  ScoredFunction,
} from "../domain/types.js";
import type { AnalyzeDeps } from "./analyze.js";

// ── Single-File Analysis ──────────────────────────────────────────

export interface AnalyzeFileOptions {
  coverage?: string;
  threshold?: number;
  coverageMetric?: "line" | "branch";
}

/**
 * Analyze a single file and return verdicts for every function found.
 *
 * - Reads the file and extracts cyclomatic complexity via the complexity adapter.
 * - If a `coverage` path is provided, parses it and matches functions.
 * - If no coverage data is available, scores every function at 0% (worst case).
 * - Applies the optional `threshold` (defaults to 12).
 */
export async function analyzeFile(
  filePath: string,
  options?: AnalyzeFileOptions,
  deps?: AnalyzeDeps,
): Promise<FunctionVerdict[]> {
  const resolvedDeps = deps ?? (await loadDefaults());
  const coverageMetric = options?.coverageMetric ?? "line";

  // 1. Build threshold config
  const thresholdConfig = createThresholdConfig({
    preset: options?.threshold,
  });

  // 2. Read source and extract complexity
  const source = await resolvedDeps.readFile(filePath);
  const complexities = resolvedDeps.complexityPort.extract(source, filePath);

  if (complexities.length === 0) {
    return [];
  }

  // 3. Load coverage data if a path was provided
  let coverageMap = new Map<string, FunctionCoverage[]>();
  if (options?.coverage) {
    try {
      const rawData = await resolvedDeps.readJson(options.coverage);
      coverageMap = resolvedDeps.coveragePort.parse(rawData);
    } catch {
      // Coverage unreadable — fall through to worst-case scoring
    }
  }

  // 4. Flatten coverage entries
  const allCoverages: FunctionCoverage[] = [];
  for (const coverages of coverageMap.values()) {
    allCoverages.push(...coverages);
  }

  // 5. Match complexity with coverage
  const matchResult = resolvedDeps.matcher(complexities, allCoverages);

  const verdicts: FunctionVerdict[] = [];

  // 6. Score matched functions
  for (const { complexity, coverage } of matchResult.matched) {
    const coveragePercent = extractCoveragePercent(coverage, coverageMetric);
    const crap = computeCrap(complexity.cyclomaticComplexity, coveragePercent);
    const threshold = resolveThreshold(
      thresholdConfig,
      complexity.identity.filePath,
      resolvedDeps.globMatcher,
    );

    const scored: ScoredFunction = {
      identity: complexity.identity,
      cyclomaticComplexity: complexity.cyclomaticComplexity,
      coveragePercent,
      crap,
    };

    verdicts.push({
      scored,
      threshold,
      exceeds: crap.value > threshold,
    });
  }

  // 7. Score unmatched complexity at worst case (0% coverage)
  for (const complexity of matchResult.unmatchedComplexity) {
    const crap = computeCrap(complexity.cyclomaticComplexity, 0);
    const threshold = resolveThreshold(
      thresholdConfig,
      complexity.identity.filePath,
      resolvedDeps.globMatcher,
    );

    const scored: ScoredFunction = {
      identity: complexity.identity,
      cyclomaticComplexity: complexity.cyclomaticComplexity,
      coveragePercent: 0,
      crap,
    };

    verdicts.push({
      scored,
      threshold,
      exceeds: crap.value > threshold,
    });
  }

  return verdicts;
}

// ── Internal Helpers ──────────────────────────────────────────────

function extractCoveragePercent(
  coverage: FunctionCoverage,
  metric: "line" | "branch",
): number {
  if (metric === "branch" && coverage.branchCoverage !== null) {
    return coverage.branchCoverage.percent;
  }
  return coverage.lineCoverage.percent;
}

async function loadDefaults(): Promise<AnalyzeDeps> {
  const { createDefaultDeps } = await import("./defaults.js");
  return createDefaultDeps();
}
