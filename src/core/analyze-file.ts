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
  Warning,
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

export interface AnalyzeFileResult {
  readonly verdicts: ReadonlyArray<FunctionVerdict>;
  readonly warnings: ReadonlyArray<Warning>;
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
): Promise<AnalyzeFileResult> {
  const resolvedDeps = deps ?? (await loadDefaults());
  const opts = options ?? {};
  const coverageMetric = opts.coverageMetric ?? "line";
  const thresholdConfig = createThresholdConfig({ preset: opts.threshold });

  const source = await resolvedDeps.readFile(filePath);
  const complexities = resolvedDeps.complexityPort.extract(source, filePath);
  if (complexities.length === 0) return { verdicts: [], warnings: [] };

  // Pass source content for accurate line mapping (Tier 2)
  const sourceContents = new Map([[filePath, source]]);
  const { coverages, warnings: coverageWarnings } =
    await loadFileCoverages(resolvedDeps, opts.coverage, sourceContents);

  const matchResult = resolvedDeps.matcher(complexities, coverages);

  const verdicts: FunctionVerdict[] = matchResult.matched.map(({ complexity, coverage }) =>
    scoreMatchedFunction(complexity, coverage, coverageMetric, thresholdConfig, resolvedDeps.globMatcher),
  );

  for (const complexity of matchResult.unmatchedComplexity) {
    verdicts.push(scoreUnmatchedFunction(complexity, thresholdConfig, resolvedDeps.globMatcher));
  }

  return { verdicts, warnings: coverageWarnings };
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
  sources?: ReadonlyMap<string, string>,
): Promise<{ coverages: FunctionCoverage[]; warnings: Warning[] }> {
  if (!coveragePath) return { coverages: [], warnings: [] };
  const rawData = await deps.readJson(coveragePath);
  const { coverage, warnings } = deps.coveragePort.parse(rawData, sources);
  return { coverages: flattenCoverages(coverage), warnings: [...warnings] };
}

async function loadDefaults(): Promise<AnalyzeDeps> {
  const { createDefaultDeps } = await import("./defaults.js");
  return createDefaultDeps();
}
