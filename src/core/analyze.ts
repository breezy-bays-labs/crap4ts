import { resolve } from "node:path";
import { computeCrap } from "../domain/crap.js";
import {
  createThresholdConfig,
  resolveThreshold,
} from "../domain/threshold.js";
import { computeSummary } from "../domain/summary.js";
import {
  RiskLevel,
} from "../domain/types.js";
import type {
  AnalyzeOptions,
  AnalysisResult,
  FunctionVerdict,
  FileResult,
  UnmatchedFunction,
  FunctionComplexity,
  FunctionCoverage,
  MatchFunctions,
  ThresholdConfig,
  ScoredFunction,
  CrapScore,
} from "../domain/types.js";
import type { ComplexityPort } from "../ports/complexity-port.js";
import type { CoveragePort } from "../ports/coverage-port.js";
import type { GlobMatcher } from "../domain/threshold.js";

// ── Dependency Injection Interface ────────────────────────────────

export interface AnalyzeDeps {
  complexityPort: ComplexityPort;
  coveragePort: CoveragePort;
  matcher: MatchFunctions;
  globMatcher: GlobMatcher;
  readFile: (path: string) => Promise<string>;
  readJson: (path: string) => Promise<unknown>;
  findFiles: (
    patterns: string[],
    options: { cwd: string; exclude: string[] },
  ) => Promise<string[]>;
}

// ── Main Entry Point ──────────────────────────────────────────────

export async function analyze(
  options?: AnalyzeOptions,
  deps?: AnalyzeDeps,
): Promise<AnalysisResult> {
  const opts = resolveOptions(options);
  const resolvedDeps = deps ?? (await loadDefaults(opts.cwd));

  // 1. Build threshold config
  const thresholdConfig = buildThresholdConfig(opts);

  // 2. Find source files
  const sourceFiles = await resolvedDeps.findFiles(
    opts.include,
    { cwd: opts.cwd, exclude: opts.exclude },
  );

  if (sourceFiles.length === 0) {
    return emptyResult(thresholdConfig);
  }

  // 3. Read coverage data
  const coverageData = await loadCoverageData(resolvedDeps, opts.coveragePath);

  // 4. Extract complexity for each source file
  const allComplexities: FunctionComplexity[] = [];
  for (const filePath of sourceFiles) {
    const absolutePath = resolve(opts.cwd, filePath);
    const source = await resolvedDeps.readFile(absolutePath);
    const fileComplexities = resolvedDeps.complexityPort.extract(
      source,
      filePath,
    );
    allComplexities.push(...fileComplexities);
  }

  // 5. Flatten all coverage data
  const allCoverages = flattenCoverages(coverageData);

  // 6. Match complexity with coverage
  const matchResult = resolvedDeps.matcher(allComplexities, allCoverages);

  // 7. Score each matched pair and create verdicts
  const allVerdicts: FunctionVerdict[] = [];
  const allUnmatched: UnmatchedFunction[] = [];

  for (const { complexity, coverage } of matchResult.matched) {
    const coveragePercent = extractCoveragePercent(coverage, opts.coverageMetric);
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

    allVerdicts.push({
      scored,
      threshold,
      exceeds: crap.value > threshold,
    });
  }

  // 8. Handle unmatched complexity (no-coverage: worst-case 0%)
  for (const complexity of matchResult.unmatchedComplexity) {
    const worstCaseCrap = computeCrap(complexity.cyclomaticComplexity, 0);
    allUnmatched.push({
      kind: "no-coverage",
      complexity,
      worstCaseCrap,
    });
  }

  // 9. Handle unmatched coverage (no-ast: informational)
  for (const coverage of matchResult.unmatchedCoverage) {
    allUnmatched.push({
      kind: "no-ast",
      coverage,
    });
  }

  // 10. Group by file
  const files = buildFileResults(allVerdicts, allUnmatched);

  // 11. Compute overall summary
  const summary = computeSummary(allVerdicts);

  // 12. Determine pass/fail
  const passed = allVerdicts.every((v) => !v.exceeds);

  return { files, summary, thresholdConfig, passed };
}

// ── Internal Helpers ──────────────────────────────────────────────

const DEFAULT_EXCLUDE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/*.d.ts",
  "**/*.test.ts",
  "**/*.spec.ts",
];

interface ResolvedOptions {
  cwd: string;
  coveragePath: string | undefined;
  threshold: number | undefined;
  thresholds: Record<string, number> | undefined;
  coverageMetric: "line" | "branch";
  include: string[];
  exclude: string[];
}

function resolveIncludePatterns(options?: AnalyzeOptions): string[] {
  if (options?.include) return options.include;

  const src = options?.src;
  if (src) {
    const dirs = Array.isArray(src) ? src : [src];
    return dirs.flatMap((dir) => {
      const normalized = dir.replace(/\/+$/, "");
      return [`${normalized}/**/*.ts`, `${normalized}/**/*.tsx`];
    });
  }

  return ["**/*.ts", "**/*.tsx"];
}

function resolveOptions(options?: AnalyzeOptions): ResolvedOptions {
  const opts = options ?? {};
  return {
    cwd: opts.cwd ?? process.cwd(),
    coveragePath: opts.coverage,
    threshold: opts.threshold,
    thresholds: opts.thresholds,
    coverageMetric: opts.coverageMetric ?? "line",
    include: resolveIncludePatterns(options),
    exclude: opts.exclude ?? DEFAULT_EXCLUDE,
  };
}

function buildThresholdConfig(opts: ResolvedOptions): ThresholdConfig {
  const overrides = opts.thresholds
    ? Object.entries(opts.thresholds).map(([glob, threshold]) => ({
        glob,
        threshold,
      }))
    : undefined;

  return createThresholdConfig({
    preset: opts.threshold,
    overrides,
  });
}

async function loadCoverageData(
  deps: AnalyzeDeps,
  coveragePath: string | undefined,
): Promise<Map<string, FunctionCoverage[]>> {
  if (!coveragePath) {
    return new Map();
  }

  const rawData = await deps.readJson(coveragePath);
  return deps.coveragePort.parse(rawData);
}

function flattenCoverages(
  coverageData: Map<string, FunctionCoverage[]>,
): FunctionCoverage[] {
  const result: FunctionCoverage[] = [];
  for (const coverages of coverageData.values()) {
    result.push(...coverages);
  }
  return result;
}

function extractCoveragePercent(
  coverage: FunctionCoverage,
  metric: "line" | "branch",
): number {
  if (metric === "branch" && coverage.branchCoverage !== null) {
    return coverage.branchCoverage.percent;
  }
  return coverage.lineCoverage.percent;
}

function groupByFile<T>(
  items: T[],
  getFile: (item: T) => string,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const file = getFile(item);
    let group = map.get(file);
    if (!group) {
      group = [];
      map.set(file, group);
    }
    group.push(item);
  }
  return map;
}

function getUnmatchedFilePath(u: UnmatchedFunction): string {
  return u.kind === "no-coverage"
    ? u.complexity.identity.filePath
    : u.coverage.filePath;
}

function buildFileResults(
  verdicts: FunctionVerdict[],
  unmatched: UnmatchedFunction[],
): FileResult[] {
  const verdictsByFile = groupByFile(verdicts, (v) => v.scored.identity.filePath);
  const unmatchedByFile = groupByFile(unmatched, getUnmatchedFilePath);

  const allFiles = new Set([...verdictsByFile.keys(), ...unmatchedByFile.keys()]);

  const results: FileResult[] = [];
  for (const filePath of allFiles) {
    const fileVerdicts = verdictsByFile.get(filePath) ?? [];
    const fileUnmatched = unmatchedByFile.get(filePath) ?? [];
    results.push(buildSingleFileResult(filePath, fileVerdicts, fileUnmatched));
  }

  return results;
}

function buildSingleFileResult(
  filePath: string,
  verdicts: FunctionVerdict[],
  unmatched: UnmatchedFunction[],
): FileResult {
  const totalFunctions = verdicts.length;
  const exceedingThreshold = verdicts.filter((v) => v.exceeds).length;

  let maxCrap: CrapScore = { value: 0, riskLevel: RiskLevel.Low };
  let averageCrap = 0;

  if (totalFunctions > 0) {
    const crapValues = verdicts.map((v) => v.scored.crap.value);
    averageCrap =
      Math.round(
        (crapValues.reduce((sum, v) => sum + v, 0) / totalFunctions +
          Number.EPSILON) *
          100,
      ) / 100;

    let maxVal = 0;
    for (const v of verdicts) {
      if (v.scored.crap.value > maxVal) {
        maxVal = v.scored.crap.value;
        maxCrap = v.scored.crap;
      }
    }
  }

  return {
    filePath,
    functions: verdicts,
    unmatched,
    summary: {
      totalFunctions,
      exceedingThreshold,
      maxCrap,
      averageCrap,
    },
  };
}

function emptyResult(thresholdConfig: ThresholdConfig): AnalysisResult {
  return {
    files: [],
    summary: computeSummary([]),
    thresholdConfig,
    passed: true,
  };
}

async function loadDefaults(cwd?: string): Promise<AnalyzeDeps> {
  const { createDefaultDeps } = await import("./defaults.js");
  return createDefaultDeps(cwd);
}
