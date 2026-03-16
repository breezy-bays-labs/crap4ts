import { resolve } from "node:path";
import { computeCrap } from "../domain/crap.js";
import {
  createThresholdConfig,
  resolveThreshold,
} from "../domain/threshold.js";
import { computeSummary } from "../domain/summary.js";
import type {
  AnalyzeOptions,
  AnalysisResult,
  FunctionVerdict,
  UnmatchedFunction,
  Warning,
  FunctionComplexity,
  FunctionCoverage,
  MatchFunctions,
  ThresholdConfig,
  ScoredFunction,
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

  // 3. Read source files (used for both complexity extraction and accurate coverage mapping)
  const sourceContents = new Map<string, string>();
  const allComplexities: FunctionComplexity[] = [];
  for (const filePath of sourceFiles) {
    const absolutePath = resolve(opts.cwd, filePath);
    const source = await resolvedDeps.readFile(absolutePath);
    sourceContents.set(filePath, source);
    const fileComplexities = resolvedDeps.complexityPort.extract(
      source,
      filePath,
    );
    allComplexities.push(...fileComplexities);
  }

  // 4. Read coverage data (pass source content for accurate line mapping)
  const { coverage: coverageData, warnings: coverageWarnings } =
    await loadCoverageData(resolvedDeps, opts.coveragePath, sourceContents);

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

  // 10. Collect warnings from coverage parsing and unmatched
  const warnings: Warning[] = [...coverageWarnings];
  for (const u of allUnmatched) {
    if (u.kind === "no-coverage") {
      warnings.push({
        code: "unmatched-no-coverage",
        message: `No coverage data found for function "${u.complexity.identity.qualifiedName}"`,
        file: u.complexity.identity.filePath,
        function: u.complexity.identity.qualifiedName,
      });
    } else {
      warnings.push({
        code: "unmatched-no-ast",
        message: `No AST match found for coverage entry "${u.coverage.name}"`,
        file: u.coverage.filePath,
        function: u.coverage.name,
      });
    }
  }

  // 11. Compute overall summary
  const summary = computeSummary(allVerdicts);

  // 12. Determine pass/fail
  const passed = allVerdicts.every((v) => !v.exceeds);

  return { functions: allVerdicts, unmatched: allUnmatched, warnings, summary, thresholdConfig, passed };
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
  sources?: ReadonlyMap<string, string>,
): Promise<{ coverage: ReadonlyMap<string, ReadonlyArray<FunctionCoverage>>; warnings: Warning[] }> {
  if (!coveragePath) {
    return { coverage: new Map(), warnings: [] };
  }

  const rawData = await deps.readJson(coveragePath);
  const result = deps.coveragePort.parse(rawData, sources);
  return { coverage: result.coverage, warnings: [...result.warnings] };
}

export function flattenCoverages(
  coverageData: ReadonlyMap<string, ReadonlyArray<FunctionCoverage>>,
): FunctionCoverage[] {
  return Array.from(coverageData.values()).flat();
}

export function extractCoveragePercent(
  coverage: FunctionCoverage,
  metric: "line" | "branch",
): number {
  if (metric === "branch" && coverage.branchCoverage !== null) {
    return coverage.branchCoverage.percent;
  }
  return coverage.lineCoverage.percent;
}

function emptyResult(thresholdConfig: ThresholdConfig): AnalysisResult {
  return {
    functions: [],
    unmatched: [],
    warnings: [],
    summary: computeSummary([]),
    thresholdConfig,
    passed: true,
  };
}

async function loadDefaults(cwd?: string): Promise<AnalyzeDeps> {
  const { createDefaultDeps } = await import("./defaults.js");
  return createDefaultDeps(cwd);
}
