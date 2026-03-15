import { computeCrap } from "../domain/crap.js";
import {
  createThresholdConfig,
  resolveThreshold,
} from "../domain/threshold.js";
import type { GlobMatcher } from "../domain/threshold.js";
import type {
  FunctionComplexity,
  FunctionCoverage,
  FunctionVerdict,
  ThresholdConfig,
} from "../domain/types.js";
import { extractCoveragePercent, flattenCoverages } from "./analyze.js";
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
  const opts = options ?? {};
  const coverageMetric = opts.coverageMetric ?? "line";
  const thresholdConfig = createThresholdConfig({ preset: opts.threshold });

  const source = await resolvedDeps.readFile(filePath);
  const complexities = resolvedDeps.complexityPort.extract(source, filePath);
  if (complexities.length === 0) return [];

  const allCoverages = await loadFileCoverages(resolvedDeps, opts.coverage);
  const matchResult = resolvedDeps.matcher(complexities, allCoverages);

  const verdicts: FunctionVerdict[] = matchResult.matched.map(({ complexity, coverage }) =>
    scoreMatchedFunction(complexity, coverage, coverageMetric, thresholdConfig, resolvedDeps.globMatcher),
  );

  for (const complexity of matchResult.unmatchedComplexity) {
    verdicts.push(scoreUnmatchedFunction(complexity, thresholdConfig, resolvedDeps.globMatcher));
  }

  return verdicts;
}

// ── Internal Helpers ──────────────────────────────────────────────

function scoreMatchedFunction(
  complexity: FunctionComplexity,
  coverage: FunctionCoverage,
  coverageMetric: "line" | "branch",
  thresholdConfig: ThresholdConfig,
  globMatcher: GlobMatcher,
): FunctionVerdict {
  const coveragePercent = extractCoveragePercent(coverage, coverageMetric);
  const crap = computeCrap(complexity.cyclomaticComplexity, coveragePercent);
  const threshold = resolveThreshold(thresholdConfig, complexity.identity.filePath, globMatcher);

  return {
    scored: {
      identity: complexity.identity,
      cyclomaticComplexity: complexity.cyclomaticComplexity,
      coveragePercent,
      crap,
    },
    threshold,
    exceeds: crap.value > threshold,
  };
}

function scoreUnmatchedFunction(
  complexity: FunctionComplexity,
  thresholdConfig: ThresholdConfig,
  globMatcher: GlobMatcher,
): FunctionVerdict {
  const crap = computeCrap(complexity.cyclomaticComplexity, 0);
  const threshold = resolveThreshold(thresholdConfig, complexity.identity.filePath, globMatcher);

  return {
    scored: {
      identity: complexity.identity,
      cyclomaticComplexity: complexity.cyclomaticComplexity,
      coveragePercent: 0,
      crap,
    },
    threshold,
    exceeds: crap.value > threshold,
  };
}

async function loadFileCoverages(
  deps: AnalyzeDeps,
  coveragePath?: string,
): Promise<FunctionCoverage[]> {
  if (!coveragePath) return [];
  const rawData = await deps.readJson(coveragePath);
  const coverageMap = deps.coveragePort.parse(rawData);
  return flattenCoverages(coverageMap);
}

async function loadDefaults(): Promise<AnalyzeDeps> {
  const { createDefaultDeps } = await import("./defaults.js");
  return createDefaultDeps();
}
